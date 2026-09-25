# CR-007 — Historial de precios

## 1. Definición del cambio

Se crea la entidad **`HistorialPrecio`**:

| Atributo | Tipo | Observación |
|---|---|---|
| `id` | `number` | Identidad propia (la asigna la base) |
| `productoId` | `number` | Producto al que pertenece el cambio (FK `producto_id`) |
| `precioAnterior` | `number \| null` | `null` solo en el registro del alta del producto |
| `precioNuevo` | `number` | Siempre > 0 |
| `fecha` | `Date` | Momento del cambio (lo asigna el dominio) |
| `motivo` | `string` | Qué operación produjo el cambio |

El precio vigente **se sigue guardando en `Producto.precio`** (rendimiento en las consultas: listados, búsquedas y ventas leen un campo, no recorren el historial) y **cada cambio se registra en `HistorialPrecio`** (trazabilidad). Es el mismo trade-off que el análisis de dominio plantea para `stockActual` + `MovimientoStock` (sección 9, "¿Se guarda o se calcula el stock?").

Se agrega la regla de negocio **"precio > 0"**, validada en la creación de cada registro de historial.

**Sobre la rama:** CR-007 se construye sobre CR-006 (actualización masiva de precios). Toda operación que cambia el precio pasa ahora por el historial: alta, edición y actualización masiva.

## 2. Reglas de negocio

| Id | Regla | Dónde se garantiza |
|---|---|---|
| R1 | **Precio > 0** en cada registro de historial | `HistorialPrecio.registrar` (dominio) y `CHECK (precioNuevo > 0)` en la base |
| R2 | Todo cambio del precio de un producto queda registrado | `Producto.registrarCambioDePrecio`, invocado en los tres flujos que cambian el precio (alta, edición, actualización masiva) |
| R3 | El precio del producto y su historial son consistentes: se guardan los dos o ninguno | Misma transacción (`@Transactional`) en `create`, `update` y `guardarPreciosEnLote` |
| R4 | Si el precio no cambió, no se registra nada | `Producto.registrarCambioDePrecio` compara con la precisión con la que se guarda el precio (2 decimales) |
| R5 | El alta registra el precio inicial (`precioAnterior = null`) solo si el producto nace con precio > 0; un alta sin costo (precio 0) no registra ni se rechaza | `Producto.registrarCambioDePrecio(null, ...)` |
| R6 | Un cambio que deja el precio en 0 (o menos) se rechaza **antes** de escribir | R1 aplicado en edición (400) y en actualización masiva (se cancela todo el lote, igual que las reglas de CR-006) |
| R7 | Todo registro tiene motivo (no vacío, ≤ 255 caracteres), producto válido y fecha válida | `HistorialPrecio.registrar`, columnas `NOT NULL` |
| R8 | El historial no se carga a mano: solo lo genera un cambio de precio | No existe endpoint de escritura; la única fábrica es `HistorialPrecio.registrar` |

**Motivos registrados:**

| Operación | Motivo |
|---|---|
| Alta | `Alta de producto` |
| Edición (`PUT /producto/:id`) | `Edición de producto` |
| Actualización masiva (CR-006) | `Actualización masiva por porcentaje: margen 30% (línea 2)` / `Actualización masiva por monto: -10 al costo (global)` |
| Migración (productos existentes) | `Precio inicial (migración CR-007)` |

## 3. Decisiones de diseño

| Decisión | Justificación |
|---|---|
| **Entidad y no Value Object** | Lo pide el CR y se justifica: dos cambios del mismo producto con los mismos valores en momentos distintos son **eventos distintos** (igual que dos `MovimientoStock` de "-2" en el análisis de dominio). Importa *cuál* cambio es, no solo sus valores. |
| **Fábrica `HistorialPrecio.registrar()` como única forma de crear un registro** | Aplica las reglas antes de que el registro exista: no puede haber un `HistorialPrecio` inválido en memoria. Mismo patrón que `Presentacion.crear()` (CR-002). |
| **`Producto.registrarCambioDePrecio(precioAnterior, motivo)`** | `Producto` es el Aggregate Root: conoce su precio y decide si hubo un cambio. Es análogo a `producto.ajustarStock(cantidad, motivo)` → `MovimientoStock` del análisis de dominio. Devuelve el registro sin persistir; guardarlo es responsabilidad de infraestructura. |
| **La regla precio > 0 vive en `HistorialPrecio`, no en `Producto`** | Es lo que define el CR ("se valida en la creación de cada registro de historial"). Como todo cambio de precio genera un registro, la regla termina protegiendo todos los cambios de precio sin modificar las reglas de `Producto` de CR-006 (que admiten costo 0). |
| **Mismo módulo y mismo repositorio que `Producto`** (`IProductoRepository`) | El historial es parte de la vida del agregado Producto (relación 1 a N, igual que `MovimientoStock`). Tener un repositorio propio permitiría guardar historial sin pasar por el cambio de precio, lo que rompe R2/R3. |
| **Persistencia en la misma transacción que el precio** | Guardar el precio en `Producto` y el historial por separado sin transacción común podría dejar un precio sin historial (o al revés). Se reutiliza `@Transactional` / Unit of Work que ya existía. |
| **En la actualización masiva, el historial se construye y valida en memoria junto al resto del lote** | CR-006 exige validar antes de ejecutar. El historial (y por lo tanto R1) se suma a esa validación previa: si un producto quedaría con precio 0 se cancela todo y no se escribe nada. |
| **Regla también como `CHECK` en la base** | Defensa en profundidad y coherencia Dominio–BD: ningún proceso externo al dominio (scripts, importaciones, consultas manuales) puede registrar un precio inválido. |
| **`fecha` la asigna el dominio** (no `CreateDateColumn`) | La fecha es un dato del negocio (cuándo cambió el precio), no de auditoría técnica. Además se puede testear. |
| **`motivo` como texto** (no enum) | Permite registrar el detalle de la operación (modalidad, valor, alcance). Los motivos fijos están centralizados en `MotivoHistorialPrecio`. Ver DT7-5. |
| **Precios `decimal(15,5)` con redondeo a 2 decimales** | Mismo tipo que `producto.precio` (`@MonetarioColumn`) y mismo redondeo que `Producto.calcularPrecio()`. La regla se valida sobre el valor ya redondeado, que es el que se persiste. |
| **Consulta de solo lectura** `GET /producto/:id/historial-precios` | Hace usable la trazabilidad. Devuelve un DTO propio (`HistorialPrecioDto`) para no exponer la entidad TypeORM ni su relación con Producto. |
| **FK sin borrado en cascada** | Los productos se eliminan de forma lógica (`deletedAt`), así que el historial no se pierde. Un borrado físico de un producto con historial queda bloqueado por la FK, que es lo deseado para auditoría. |

## 4. Desarrollo

### 4.1 Cambios en el backend

| Capa | Archivo | Cambio |
|---|---|---|
| Dominio | `producto/domain/entities/historial-precio.entity.ts` (**nuevo**) | Entidad `HistorialPrecio`, fábrica `registrar()` con las reglas R1 y R7, `MotivoHistorialPrecio` |
| Dominio | `producto/domain/entities/producto.entity.ts` | `registrarCambioDePrecio(precioAnterior, motivo)` (R2, R4, R5) |
| Dominio | `producto/domain/services/actualizacion-masiva-precios.service.ts` | Construye y valida el historial de cada producto dentro de la validación previa; arma el motivo; envía el historial junto con los precios |
| Dominio (puerto) | `producto/domain/interfaces/producto.repository-interface.ts` | `guardarPreciosEnLote(productos, usuario, historial)` y `findHistorialPrecios(productoId)` |
| Infraestructura | `producto/infraestructure/repositories/producto.persistence-adapters.ts` | `create`, `update` y `guardarPreciosEnLote` guardan el historial en la misma transacción; `findHistorialPrecios`; `update` deja pasar las excepciones HTTP en lugar de convertirlas en 500 |
| Infraestructura | `producto/infraestructure/repositories/producto.repository.ts` | Delegación de los dos métodos nuevos |
| Aplicación | `producto/application/services/producto.service.ts` | `findHistorialPrecios(id)`: verifica que el producto exista (404) y mapea a DTO |
| Aplicación | `producto/application/controllers/producto.controller.ts` | `GET /producto/:id/historial-precios` (roles Root, Administrador, Empleado, como `/audit`) |
| DTO / mapper | `producto/dto/historial-precio.dto.ts` (**nuevo**), `producto/mappers/producto.mapper.ts` | Respuesta del endpoint y `toHistorialPrecioDto` |
| Módulo | `producto/producto.module.ts` | Registra `HistorialPrecio` en `TypeOrmModule.forFeature` |
| Base de datos | `src/migrations/1790359925744-HistorialPrecio.ts` (**nuevo**) | Tabla, índice, FK, CHECK y registro inicial de los productos existentes |

### 4.2 Endpoint

`GET /api/producto/:id/historial-precios` → `200`

```json
[
  { "id": 2, "productoId": 10, "precioAnterior": 1200, "precioNuevo": 1300,
    "fecha": "2026-09-25T15:00:00.000Z", "motivo": "Actualización masiva por porcentaje: margen 30% (global)" },
  { "id": 1, "productoId": 10, "precioAnterior": null, "precioNuevo": 1200,
    "fecha": "2026-09-20T10:00:00.000Z", "motivo": "Alta de producto" }
]
```

Orden: del cambio más reciente al más antiguo (`fecha DESC, id DESC`). `404` si el producto no existe o está eliminado; `400` si el id no es numérico.

Cambios de comportamiento en endpoints existentes:
- `PUT /producto/:id`: si la edición deja el precio en 0 responde **400** (`Producto "X": El precio nuevo (0) debe ser mayor a 0.`) y no modifica nada.
- `POST /productos/actualizacion-masiva-precios`: si algún producto quedaría con precio 0 se cancela toda la operación con **400**, con el mismo formato de mensaje de CR-006.

### 4.3 Modelo de datos — migración `1790359925744-HistorialPrecio`

```sql
CREATE TABLE historial_precio (
  id             int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  producto_id    int NOT NULL,             -- FK_historial_precio_producto → producto(id)
  precioAnterior decimal(15,5) NULL,
  precioNuevo    decimal(15,5) NOT NULL,
  fecha          datetime NOT NULL,
  motivo         varchar(255) NOT NULL,
  INDEX IDX_historial_precio_producto_fecha (producto_id, fecha),
  CONSTRAINT CHK_historial_precio_precio_nuevo_positivo CHECK (precioNuevo > 0)
);
```

- **Productos existentes:** cada producto activo con precio > 0 recibe un registro `Precio inicial (migración CR-007)` con `precioAnterior NULL`. Así el historial arranca coherente con el precio guardado. Los productos con precio 0 no se registran (misma regla que el alta).
- El índice `(producto_id, fecha)` cubre la única consulta (historial de un producto ordenado por fecha).
- `down()` elimina la tabla (se pierde el historial registrado).
- **Verificado contra MySQL 8** en una base temporal: el backfill registra solo productos activos con precio, el CHECK rechaza `precioNuevo = 0`, la FK rechaza un producto inexistente y `down()` revierte.

### 4.4 Cambios en el frontend

El frontend **ya tenía un esqueleto de "Historial de precios" sin backend** (ver sección 5). Se completó:

| Archivo | Cambio |
|---|---|
| `producto/modales/historial-precios-modal.tsx` (**nuevo**) | Modal de solo lectura: fecha, precio anterior (— en el alta), precio nuevo con indicador de aumento/baja, motivo. Estados de carga, vacío y error (muestra el mensaje del backend) |
| `interfaces/gestion-producto/historial-precios/interfaces-historial-precios.tsx` | Se reemplazan las interfaces del sistema anterior por la del dominio actual |
| `producto/services/producto-service.tsx` | `obtenerHistorialPrecios(id)` |
| `producto/componentes/producto-action.tsx`, `datos-tabla.tsx` | Botón "Historial de precios" en cada fila (se quitaron íconos importados sin uso) |
| `producto/modales/producto-modales.tsx` | Renderiza el modal con el estado `mostrarHistorialPrecios` que ya existía |
| `producto/utils/consultar-producto.tsx` | Cerrar el historial ya no borra los filtros de búsqueda del usuario (el handler existente llamaba a `limpiarFiltros()`) |

## 5. Funcionalidades existentes no reflejadas en el dominio

| Funcionalidad encontrada | Decisión |
|---|---|
| **Historial de precios en el front sin backend**: estado `mostrarHistorialPrecios`, `handleMostrarHistorialPrecios`, `onCloseHistorialPrecios`, clave `"historial"` en `useProductoModales`, ícono `History` importado sin usar, e interfaces `HistorialPrecios` / `ConsultarHistorialPrecios` con precios cliente/mayorista/ocasional/oferta y documento de origen | **Incorporada al modelo** con CR-007. Las interfaces viejas se reemplazan porque describen un modelo de varias listas de precio que no existe en el dominio actual (Producto tiene un único precio derivado de costo + margen). |
| **`actualizarPrecio` / `UpdatePrecioDto` / `ProductoMapper.mapPrecios`** en el backend y `actualizarPreciosProducto` (`PATCH /producto/:id/precios`) en el front | **No se incorpora; se propone eliminarla** (DT7-1). El endpoint no existe (el front llama a una ruta que responde 404) y el método del repositorio no lo usa nadie. Además cambia el costo **sin recalcular el precio** y sin historial: si se conectara violaría "el precio siempre deriva de costo + margen" (CR-006) y R2/R3 de CR-007. La actualización de precios queda cubierta por la edición de producto y la actualización masiva. |

## 6. Mejora de arquitectura

| Mejora | Detalle |
|---|---|
| Consistencia precio–historial transaccional | El precio y su historial se escriben en la misma unidad de trabajo en los tres flujos. Los tests verifican el orden (updates → historial → commit) y la reversión si falla cualquiera de las dos escrituras. |
| Validación antes de persistir en todos los flujos | En la edición, el historial (R1) se construye antes del `save`; en la masiva, dentro de la validación previa de CR-006. |
| Errores de dominio con su código HTTP correcto en `update` | Antes el `catch` de `ProductoPersistenceAdapter.update` convertía **cualquier** error en `DatabaseConnectionException` (500), incluso un 404 o una regla de negocio. Ahora las `HttpException` pasan sin cambios; solo los errores de base se traducen. Resuelve parcialmente DT-10 de CR-002. |
| Regla replicada en la base | `CHECK (precioNuevo > 0)`: el dominio y la base expresan la misma regla. |
| Test inestable corregido | `consultar-producto.test.tsx` (CR-004) fallaba de forma intermitente con `window is not defined`: ag-grid deja un `window.setTimeout` de animación (400 ms) pendiente cuando Vitest cierra jsdom. Con el botón nuevo por fila aparecía con más frecuencia; se agrega una espera en `afterAll`. Verificado en 5 ejecuciones seguidas. |

## 7. Coherencia entre Dominio, Código y Base de Datos

| Concepto | Dominio | API (DTO) | Base de datos |
|---|---|---|---|
| Identidad | `id` (entidad) | `id` | `id int AUTO_INCREMENT PK` |
| Producto | `productoId` | `productoId` | `producto_id int NOT NULL` + FK a `producto(id)` |
| Precio anterior | `number \| null`, ≥ 0, 2 decimales | `number \| null` | `decimal(15,5) NULL` |
| Precio nuevo | `number` > 0 (R1), 2 decimales | `number` | `decimal(15,5) NOT NULL` + `CHECK (precioNuevo > 0)` |
| Fecha | `Date` asignada al registrar | ISO 8601 | `datetime NOT NULL` |
| Motivo | no vacío, ≤ 255 | `string` | `varchar(255) NOT NULL` |
| Lenguaje ubicuo | `HistorialPrecio`, `registrarCambioDePrecio`, `precioAnterior`, `precioNuevo`, `motivo` | igual | `historial_precio`, mismas columnas |

Los nombres de la tabla, la FK, el índice y el CHECK son explícitos en la entidad y en la migración, así que coinciden aunque la base se genere con `synchronize` o con migraciones. Un test verifica esta metadata.

## 8. Testing

### 8.1 Estrategia

Se priorizan las **reglas de negocio** y se testean en tres niveles:
1. **Dominio puro** (sin Nest ni base): la regla precio > 0 y el resto de las validaciones.
2. **Servicio de dominio y persistencia** (con dobles de prueba): que cada flujo genera el historial correcto y que la escritura es atómica.
3. **HTTP con Supertest**: el contrato del endpoint.

A esto se suma el test de componente del front.

### 8.2 Tests

| Archivo | Tipo | Qué cubre |
|---|---|---|
| `domain/entities/historial-precio.entity.spec.ts` (**nuevo**, 29 tests) | Unitario de dominio | Registro válido con los campos del CR; alta con `precioAnterior null`; precio anterior 0; redondeo; trim del motivo; fecha por defecto; identidad (dos registros iguales son distintos). **R1**: rechaza precio nuevo 0, negativo, 0,004 (redondea a 0), `NaN`, `Infinity`; acepta 0,01. Precio anterior negativo/`NaN`; motivo vacío, con solo espacios, ausente o > 255; `productoId` 0, negativo, decimal o ausente; fecha inválida. **Coherencia con la BD**: tabla, CHECK, nulabilidad, transformer `decimal` ↔ `number` con `null`, FK `producto_id` |
| `domain/entities/producto.entity.spec.ts` (+8 tests) | Unitario de dominio | `registrarCambioDePrecio`: registra si cambió; no registra si no cambió (incluso con diferencias por debajo de 2 decimales); alta con y sin precio; producto sin precio que pasa a tener precio; cambio a precio 0 rechazado con el nombre del producto; no modifica el precio |
| `domain/services/actualizacion-masiva-precios.service.spec.ts` (+5 tests) | Servicio de dominio (repositorio simulado) | Un historial por producto cuyo precio cambió, en la **misma llamada** que los precios; motivos por modalidad, valor y alcance; productos sin cambio de precio no generan historial; **R1 en lote**: un producto que quedaría con precio 0 cancela toda la operación y no se modifica nada; un producto sin precio que sigue sin precio no bloquea |
| `infraestructure/repositories/producto-precios-lote.persistence.spec.ts` (+11 tests) | Persistencia (transacción simulada) | Lote: historial dentro de la transacción y antes del commit; sin cambios no escribe historial; si falla un producto o el historial se revierte todo. Alta: registra el precio inicial; sin costo no registra y el alta se hace igual; si falla el historial se revierte el alta. Edición: registra precio anterior/nuevo; editar algo que no cambia el precio no registra; **R1**: precio 0 → 400, sin escribir y con rollback. Consulta: filtro por producto y orden; error de base → 500 |
| `application/controllers/historial-precios.http.spec.ts` (**nuevo**, 5 tests) | Integración HTTP (Supertest) | 200 con los campos del CR, sin exponer la relación; lista vacía; 404 producto inexistente sin consultar el historial; 400 id no numérico; no existe endpoint de escritura (R8) |
| Front: `producto/modales/historial-precios-modal.test.tsx` (**nuevo**, 5 tests) | Componente (Vitest + Testing Library) | Consulta por id y muestra los cambios en orden con formato de moneda, motivo e indicador de aumento; alta sin precio anterior (—); indicador de baja; mensaje sin cambios; mensaje de error del backend; cerrar |

Comandos (desde `Back/proyecto` y `Front`):

```
npx jest historial-precio producto.entity producto-precios-lote actualizacion-masiva-precios --coverage=false
npx vitest run src/componentes/gestion-producto/producto/modales
```

### 8.3 Cobertura definida y justificación

| Alcance | Umbral | Justificación |
|---|---|---|
| `historial-precio.entity.ts` | **100 %** de sentencias, ramas, funciones y líneas (`coverageThreshold` en `jest.config.js`) | Contiene la regla de negocio del CR (precio > 0) y todas las validaciones del registro. Es código chico y cada rama sin cubrir sería una regla sin probar. Mismo criterio que `Presentacion` en CR-002. Jest lo controla automáticamente. |
| Métodos tocados por CR-007 en `Producto`, el servicio de actualización masiva y el adapter | Sin umbral por archivo; cubiertos por los tests de la tabla anterior | Son archivos compartidos con funcionalidades de otros CR y con decoradores de TypeORM (funciones que Jest cuenta pero no son lógica). Un umbral por archivo mediría código ajeno a CR-007. |
| Sin umbral global | — | La suite tiene deuda preexistente (specs que no corren); un umbral global fallaría por causas ajenas a este CR. |

**Resultado:** `historial-precio.entity.ts` 100 % (34/34 líneas, 23/23 ramas, 4/4 funciones). Módulo producto: **173 tests pasan** (antes de CR-007: 115). Los 13 que fallan son los mismos que antes de CR-007 (ver DT7-9). Front: 10 archivos y 67 tests pasan.

## 9. Deuda técnica

### Corregida en esta CR

| Deuda | Corrección |
|---|---|
| `update` del adapter convertía reglas de negocio y 404 en 500 | Las `HttpException` se relanzan sin cambios |
| Cerrar un modal de solo lectura borraba los filtros del listado | `handleCerrarHistorialPrecios` solo cierra el modal |
| Test de CR-004 inestable por un timer de ag-grid | Espera en `afterAll` |
| Interfaces de historial del front sin respaldo en el dominio | Reemplazadas por la del dominio |

### Pendiente (el CR se cumple; queda como deuda)

| Id | Deuda | Por qué no se resolvió ahora |
|---|---|---|
| DT7-1 | Código muerto `actualizarPrecio` / `UpdatePrecioDto` / `mapPrecios` (back) y `actualizarPreciosProducto` (front) | Hay que borrar archivos y tocar otros módulos del front. Se documenta la decisión (sección 5) y se propone eliminarlo en un commit aparte. |
| DT7-2 | El historial no registra **qué usuario** hizo el cambio | El CR define los campos y no incluye usuario. `Producto.usuarioUpdated` solo guarda el último. Agregar `usuarioId` sería una evolución simple (columna + parámetro). |
| DT7-3 | `GET /producto/:id/historial-precios` sin paginación ni filtro por fechas | Con el volumen actual (un registro por cambio de precio) no hace falta. Si crece, se pagina con el patrón `skip/take` del proyecto. |
| DT7-4 | La construcción del historial en alta y edición ocurre en el adapter de persistencia, junto a `recalcularPrecio()` | Sigue el patrón existente (DT-1/DT-2 de CR-002: el adapter recibe DTOs y arma la entidad). Mover esa orquestación al servicio de aplicación requiere que la transacción la abra la aplicación y no el adapter: es un refactor general. |
| DT7-5 | `motivo` es texto libre: no se puede filtrar por tipo de operación de forma confiable | Para el CR alcanza con describir el cambio. Evolución: separar `tipo` (enum) y `detalle`. |
| DT7-6 | TypeORM ignora `@Check` en MySQL: con `synchronize: true` la tabla se crea **sin** el CHECK; solo la migración lo crea | Limitación de TypeORM. La regla la garantiza igual el dominio. Se recomienda usar migraciones (`synchronize: false`, como está en el repo). Si una base local ya se sincronizó, hay que borrar la tabla o marcar la migración antes de correr `migration:run`. |
| DT7-7 | `DatabaseConnectionException` descarta el mensaje recibido (salvo `ECONNREFUSED`) y siempre responde "Error inesperado en la base de datos." | Afecta a todo el proyecto; se detectó al testear `findHistorialPrecios`. |
| DT7-8 | No hay evento de dominio `PrecioActualizado` | El análisis de dominio propone eventos (sección 7) como evolución. El historial se registra de forma explícita y transaccional, que es lo que pide el CR. |
| DT7-9 | Tests preexistentes que fallan: `producto.controller.spec.ts` (scaffold de Nest sin mocks, DT-14 de CR-002) y `producto-busqueda.persistence.spec.ts` (pasa solo y falla corriendo en paralelo con el resto del módulo). En todo el back fallan 26 suites de scaffold | Mismos resultados antes y después de CR-007. |
| DT7-10 | En celulares las acciones de producto están ocultas (comentario existente en `datos-card.tsx`), así que el historial solo se ve en escritorio | Decisión de UI previa. |
| DT7-11 | El front tiene 121 errores de TypeScript preexistentes (por ejemplo `DatosTabla` no declara `onMovimientos`, `onCambioPrecios` ni `onNotificar`). Vite no chequea tipos al compilar. La imagen Docker del front no tiene las devDependencies de test (se construyó antes de que CR-006 las agregara) | Los archivos nuevos de CR-007 no agregan errores. Hay que reconstruir la imagen (`docker compose build`) para correr los tests del front dentro del contenedor. |
