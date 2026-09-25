# CR-004 — Búsqueda de Productos con coincidencias parciales

## 1. Objetivo

Permitir buscar productos con **un único texto de búsqueda** que se compara, por coincidencia parcial y **en OR**, con:

- la denominación del **Producto**,
- la denominación de su **Línea**,
- la denominación de la **SuperLínea** de su Línea.

Se implementa sobre el buscador paginado existente (`GET /producto/search-by`), usando su parámetro de texto `denominacion`. Es una funcionalidad de consulta: no agrega reglas de negocio, entidades, parámetros ni migraciones. Usa la relación `Linea → SuperLinea` de CR-003 (`linea.super_linea_id`).

> Aclaración de la cátedra: CR-004 tiene un único filtro de búsqueda. No son tres filtros independientes ni se combinan con AND.

## 2. User Story

**US-005 — Buscar Productos.** Como administrador, quiero poder buscar productos por denominación, Línea o SuperLínea, para poder encontrar rápidamente los productos que necesito.

| Criterio | Given | When | Then |
|---|---|---|---|
| CA1 — Denominación | Existen productos registrados | Se ingresa parte de la denominación de un producto | Se muestran los productos cuya denominación coincide parcialmente |
| CA2 — Línea | Existen productos en distintas Líneas | Se ingresa parte del nombre de una Línea | Se muestran los productos de las Líneas que coinciden |
| CA3 — SuperLínea | Existen productos en Líneas de distintas SuperLíneas | Se ingresa parte del nombre de una SuperLínea | Se muestran los productos de las Líneas de las SuperLíneas que coinciden |

Los tres criterios se cumplen con el mismo campo de búsqueda: el resultado es la unión de los productos que coinciden por cualquiera de los tres campos.

## 3. Endpoint

`GET /api/producto/search-by?denominacion=<texto>` — sin cambios de ruta, parámetros, roles ni forma de respuesta (`{ data: GetProductoDto[], total }`).

Condición generada cuando se envía `denominacion`:

```sql
FROM producto
LEFT JOIN linea       ON linea.id = producto.linea_id            AND linea.deletedAt IS NULL
LEFT JOIN super_linea ON super_linea.id = linea.super_linea_id   AND super_linea.deletedAt IS NULL
WHERE (    UPPER(producto.denominacion)    LIKE UPPER('%texto%')
        OR UPPER(linea.denominacion)       LIKE UPPER('%texto%')
        OR UPPER(super_linea.denominacion) LIKE UPPER('%texto%')
        [OR código de proveedor / referencia, si se envían — comportamiento existente] )
  AND [marcaId, lineaId, conStock — filtros existentes]
  AND producto.deletedAt IS NULL
ORDER BY producto.denominacion
```

- Sin distinguir mayúsculas (`UPPER ... LIKE UPPER`), como la búsqueda existente. El texto llega normalizado por `NormalizeDenominacionSearchPipe` (trim y mayúsculas); vacío no filtra.
- `LEFT JOIN`: un producto cuya Línea no tiene SuperLínea sigue apareciendo si coincide por su nombre o por su Línea.
- Líneas y SuperLíneas eliminadas lógicamente no participan (TypeORM agrega `deletedAt IS NULL` al JOIN).
- `codigoProveedor` y `codigoReferencia` ya formaban parte del mismo grupo OR y se mantienen.
- `marcaId`, `lineaId`, `conStock`, `skip` y `take` se aplican como antes (AND y paginación sobre el resultado filtrado).

Ejemplos: `?denominacion=leche` (producto), `?denominacion=limp` (Línea), `?denominacion=alim` (SuperLínea).

## 4. Cambios realizados

| Capa | Archivo | Cambio |
|---|---|---|
| Adapter | `producto/infraestructure/repositories/producto.persistence-adapters.ts` | En `findBy`, si hay `denominacion`: `LEFT JOIN linea.superLinea` y dos condiciones más en el grupo OR existente (`linea.denominacion`, `superLinea.denominacion`) |

No se modificaron DTOs, controller, servicio, puerto, repositorio, mapper, entidades ni migraciones.

**Decisiones:**
- Se reutiliza el parámetro de texto existente (`denominacion`) y su grupo OR: el contrato HTTP no cambia y el Front solo usa el campo de búsqueda que ya tenía.
- El filtrado se hace en la consulta (JOIN + WHERE), no en memoria; la paginación y el `total` se calculan sobre el resultado filtrado.
- Se reutiliza el JOIN existente con Línea; el JOIN a SuperLínea se agrega solo cuando hay texto de búsqueda.

**Compatibilidad:** `Presentacion` y su mapeo (CR-002) y `SuperLinea`/`Linea` con sus endpoints (CR-003) no se tocaron. Sin texto de búsqueda, la consulta es idéntica a la anterior.

## 5. Tests

| Archivo | Tipo | Qué cubre |
|---|---|---|
| `producto/infraestructure/repositories/producto-busqueda.persistence.spec.ts` | Unitario de persistencia (TypeORM real, driver MySQL, sin conexión) | SQL generado: OR entre producto, Línea y SuperLínea con el mismo `%texto%`; que no hay AND entre esos campos; JOIN Producto → Línea → SuperLínea (LEFT, reutilizando el de Línea, excluyendo eliminadas); códigos en el mismo OR; `marcaId`/`lineaId`/`conStock` en AND; paginación; sin texto la consulta no cambia; columnas de presentación |
| `producto/application/controllers/producto-busqueda.http.spec.ts` | Integración HTTP (Supertest) | Texto → pipes → controller → `ProductoService` real → repositorio; normalización (trim/mayúsculas); respuesta vacía; que no existen filtros independientes `linea`, `superLinea`, `superLineaId` (400); combinación con filtros existentes y paginación; `presentacion` en la respuesta, sin campos de pack |
| `producto/infraestructure/repositories/producto-busqueda.mysql.spec.ts` | Integración con MySQL real (**opcional**) | CA1–CA3 con datos reales; un mismo texto encuentra productos por producto, por Línea y por SuperLínea a la vez (OR); sin coincidencias; SuperLínea eliminada; Línea sin SuperLínea; AND con `lineaId`; paginación y `total`; `Presentacion` hidratada. Los datos se crean en una transacción que se revierte |

```
npx jest producto-busqueda --coverage=false
CR004_DB_TEST=1 npx jest producto-busqueda.mysql.spec --coverage=false   # requiere la base de .env
```

## 6. Observaciones preexistentes (no modificadas)

| Observación | Dónde |
|---|---|
| `proveedorId` se recibe y se pasa hasta el adapter, pero `findBy` no lo aplica en la consulta | `ProductoPersistenceAdapter.findBy` |
| `codReferenciaExacto` existe en el DTO pero el controller no lo usa | `ProductoController.search` |
| Los `%` y `_` que ingrese el usuario actúan como comodines de `LIKE` (no se escapan) | `ProductoPersistenceAdapter.findBy` |
