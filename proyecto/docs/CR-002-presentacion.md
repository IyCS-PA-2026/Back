# CR-002 — Presentación del producto

## 1. Definición del cambio

`Presentacion` es un **Value Object** compuesto por:

| Atributo | Tipo |
|---|---|
| `cantidad` | `number` |
| `unidadMedida` | `string` |

Reemplaza completamente a `utilizaPack` y `cantidadPorPack`. No se modelan packs, tipos de presentación, conversiones de unidades ni una lista cerrada (enum) de unidades.

## 2. Reglas de negocio

| Id | Regla | Dónde se garantiza |
|---|---|---|
| R1 | `cantidad` es obligatoria | VO (`Presentacion.crear`), DTO, columna `NOT NULL` |
| R2 | `cantidad` > 0, con hasta 3 decimales | VO, DTO (`@IsPositive`, `maxDecimalPlaces: 3`), columna `decimal(12,3)` |
| R3 | `unidadMedida` es obligatoria | VO, DTO (`@IsString`), columna `NOT NULL` |
| R4 | `unidadMedida` no puede estar vacía (una cadena de solo espacios se considera vacía); se guarda sin normalizar | VO, DTO (`@Matches(/\S/)`) |
| R5 | La presentación completa es obligatoria al crear un Producto | Tipo `presentacion: Presentacion` (no opcional), `ProductoService.create`, `@ValidateNested` en `CreateProductoDto`, `NOT NULL` en BD |
| R6 | La presentación se reemplaza completa, nunca parcialmente; si no se envía en una actualización, se conserva | VO inmutable, `ProductoService.update`, `@ValidateNested` en `UpdateProductoDto` |
| R7 | Los conceptos de pack desaparecen del modelo | Entidad, DTOs, mapper y migración |

**Máximo de 3 decimales:** no es una regla nueva del negocio sino una condición de coherencia con la base. Con `scale 3` MySQL redondearía, por ejemplo, `0.0004` a `0.000` y guardaría una cantidad que viola R2.

## 3. Decisiones técnicas y de DDD

| Decisión | Justificación |
|---|---|
| **Value Object** (sin identidad, inmutable, igualdad por valor con `equals`) | Dos presentaciones con igual cantidad y unidad son la misma. La presentación describe al producto; no tiene ciclo de vida propio. |
| **Constructor privado + fábrica `Presentacion.crear()`** | Es la única forma de obtener una presentación y siempre valida. El constructor tolera no recibir argumentos porque TypeORM lo invoca así al hidratar la entidad. |
| **Inmutabilidad con `readonly` (sin `Object.freeze`)** | TypeORM hace `merge` sobre la entidad después del `save`; con un objeto congelado fallaría en modo estricto. |
| **Reglas en el VO; el DTO solo valida formato** | La regla pertenece al dominio y aplica aunque no se pase por HTTP. El DTO responde 400 con mensajes claros y evita consultas a la base con datos inválidos. |
| **El VO se construye en la capa de aplicación** (`ProductoService`), **antes** de las validaciones con base de datos | Falla rápido. El repositorio recibe el VO ya validado y no decide reglas. |
| **El adapter excluye `presentacion` del DTO y asigna el VO explícitamente** | El adapter existente copia el DTO completo (`...data` / `Object.assign`); sin esta exclusión se persistiría el objeto plano del DTO en lugar del VO validado. |
| **Parámetro `presentacion` en `create`/`update` del repositorio** | Mismo patrón que ya usan `linea` y `marca`. Solo cambian esos dos métodos. |
| **Persistencia como embedded de TypeORM** (`@Column(() => Presentacion)`) | Es la forma estándar de persistir un VO dentro de su agregado: sin tabla propia ni id. |
| **Nombres de columna generados por TypeORM**: `presentacionCantidad`, `presentacionUnidadmedida` | Es la estrategia de nombres por defecto del proyecto para embedded (pone en minúsculas el resto del nombre de la propiedad). Se verificó construyendo la metadata de TypeORM. Forzar nombres propios en el VO lo acoplaría a la tabla de Producto. |
| **`cantidad` como `decimal(12,3)`** | Una unidad de medida libre admite cantidades fraccionarias (1.5 kg, 0.75 l). Es la misma precisión que ya usa el proyecto para cantidades (`stock`, `stockMinimo`). No se reutiliza `@CantidadColumn` porque impone `DEFAULT 0` (contradice R2) y su transformer convierte `null` en `0`. |
| **`unidadMedida` como `text`** | CR-002 no define un largo máximo; con `varchar(n)` habría que agregar una restricción que la CR no pide. Es el tipo que ya usa Producto para textos libres (`denominacion`, `observacion`, `ubicacion`). |
| **Errores como `BadRequestException`** | Sigue la convención existente de los servicios de dominio de Producto y no requiere cambiar el filtro global de excepciones. Ver deuda DT-3. |
| **Sin `@IsNotEmpty` sobre `presentacion`** | `@ValidateNested` ya rechaza un valor ausente o que no es un objeto; en `UpdateProductoDto`, `PartialType` agrega `@IsOptional`. |
| **Sin enum, conversiones ni lógica de packs** | Excluido explícitamente por CR-002. |

## 4. Coherencia entre Dominio, Código y Base de Datos

| Concepto | Dominio (VO) | DTO (entrada y salida) | Base de datos |
|---|---|---|---|
| cantidad | `number` finito, > 0, ≤ 3 decimales | `@IsNumber({ maxDecimalPlaces: 3 })`, `@IsPositive` | `presentacionCantidad decimal(12,3) NOT NULL`, sin default |
| unidadMedida | `string` no vacío, sin normalizar | `@IsString`, `@Matches(/\S/)` | `presentacionUnidadmedida text NOT NULL` |
| Obligatoriedad al crear | `presentacion: Presentacion` | `@ValidateNested` en `CreateProductoDto` | `NOT NULL` |

**Contrato de la API** (entrada y salida): `"presentacion": { "cantidad": 1.5, "unidadMedida": "kg" }`.
Es un **cambio incompatible**: por `forbidNonWhitelisted`, un cliente que siga enviando `utilizaPack` o `cantidadPorPack` recibe 400. El frontend debe actualizarse en conjunto.

**Límite técnico no validado:** `decimal(12,3)` admite como máximo 999.999.999,999. Un valor mayor produce un error de MySQL (500). No se valida porque CR-002 no lo pide.

## 5. Migración `1790219621235-ProductoPresentacion`

**Se generó el archivo pero no se ejecutó.**

- `up()`: agrega `presentacionCantidad` y `presentacionUnidadmedida` (`NOT NULL`) y elimina `utilizaPack` y `cantidadPorPack`. Esas columnas no tienen índices ni claves foráneas.
- `down()`: restaura las columnas de pack como las define `Init1787269586538` y elimina las de presentación. **Se pierde la presentación** de los productos.

**Productos existentes:**
- El único camino de alta de productos es `POST /producto`: no hay seeds ni importadores de productos. Las filas existentes son las cargadas a mano en cada base local.
- La presentación **no puede deducirse** de los datos actuales: `utilizaPack` y `cantidadPorPack` no contienen ninguna unidad de medida.
- Si se agrega una columna `NOT NULL` a una tabla con filas, MySQL las completa con `0` y `''`, valores que violan R2 y R4, y TypeORM los hidrataría sin pasar por `Presentacion.crear()`.
- Por eso **la migración verifica primero si `producto` tiene filas** (incluidas las eliminadas lógicamente) y, si las hay, **lanza un error sin modificar nada**. El control va antes de cualquier `ALTER` porque en MySQL cada DDL confirma implícitamente.

**Cómo correrla:**
1. `SELECT COUNT(*) FROM producto;`
2. Si hay filas: en entornos de prueba, vaciar la tabla (o recrear la base); si hay datos a conservar, definir la presentación real de cada producto antes de migrar.
3. `npm run migration:run`

## 6. Funcionalidades existentes relacionadas

| Funcionalidad | Tratamiento |
|---|---|
| `utilizaPack` / `cantidadPorPack` | **Eliminadas.** Eran solo datos, sin reglas: se aceptaban combinaciones incoherentes (sin pack pero con cantidad, pack sin cantidad o con cantidad ≤ 0). CR-002 las reemplaza por Presentación. |
| `ConfiguracionSistema.unidadMedida` (boolean, *"Indica si producto posee unidad medida"*, `true` por defecto) | **Obsoleta**, no se modifica en esta CR. Con CR-002 todo producto tiene unidad de medida obligatoria, así que el flag ya no puede decidir si un producto la tiene. No lo usa ninguna lógica del backend (solo el ABM de configuración); probablemente lo lea el frontend. Su eliminación se deja pendiente de coordinar con el frontend (DT-9). |
| Unidad del `stock` | No está definido si el `stock` cuenta presentaciones o unidades de medida. CR-002 excluye conversiones, así que no se modela. Queda como pregunta abierta de dominio (DT-8). |

## 7. Deuda técnica

### Corregida en esta CR (afectaba directamente a Presentación)

| Id | Deuda | Corrección |
|---|---|---|
| — | El adapter copiaba el DTO completo sobre la entidad | Para `presentacion` se excluye del DTO y se asigna el VO validado. El resto de los campos queda como estaba (DT-1). |
| — | `producto.service.spec.ts` no podía correr (no mockeaba dependencias) | Reescrito con mocks para testear CR-002. |

### Documentada, no corregida (fuera del alcance de CR-002)

| Id | Deuda | Por qué no se corrige ahora |
|---|---|---|
| DT-1 | El puerto de dominio `IProductoRepository` recibe DTOs de aplicación (`CreateProductoDto`, `UpdateProductoDto`) y el adapter los copia sobre la entidad | Corregirlo cambia cómo se crean y actualizan todos los campos de Producto: es un refactor general. |
| DT-2 | `Producto` es un modelo anémico que además es la entidad TypeORM | Separar modelo de dominio y de persistencia es un refactor general. |
| DT-3 | El dominio lanza excepciones HTTP (`BadRequestException`) | Presentación sigue la convención existente; cambiarla requiere un error de dominio y modificar el filtro global, que usa toda la app. |
| DT-4 | `ProductoIntrinsicValidationService` valida precios mayorista, cliente y ocasional que no existen en `Producto` | Sin relación con CR-002. |
| DT-5 | Las reglas de `denominacion` están en los DTOs y se contradicen: Create acepta `_` y `%` y Update no; el DTO permite 255 caracteres y el dominio 200. Además el DTO pasa a minúsculas y `NormalizeDenominacionPipe` a mayúsculas | Sin relación con CR-002. |
| DT-6 | `stock` es decimal en la base pero `CreateProductoDto` le exige `@IsInt` | Sin relación con CR-002. |
| DT-7 | `domain/helpers/producto-validator.helper.ts` y `base-producto.interface.ts` son código muerto (no registrados ni importados), ubicados en dominio pero dependientes de servicios de aplicación | No afectan a CR-002; borrarlos es un refactor opcional. |
| DT-8 | La unidad del `stock` respecto de la presentación no está definida | Pregunta de dominio; CR-002 excluye conversiones. |
| DT-9 | `ConfiguracionSistema.unidadMedida` queda obsoleto | Otro módulo y lo usa el frontend. |
| DT-10 | `findOne` lanza excepción en lugar de devolver `null` (los `if (!entity)` del servicio nunca se ejecutan) y el `catch` de `update` convierte cualquier error en `DatabaseConnectionException` | Comportamiento existente que no afecta a Presentación. |
| DT-11 | `ProductoRepository.findByIds` lanza `'Method not implemented.'`, pero `ProductoService.findByIds` lo usa | Sin relación con CR-002. |
| DT-12 | La relación `productosOperacion` de `Producto` está mal declarada (`ManyToOne` hacia `Producto` con tipo `ProductoOperacion`) | Sin relación con CR-002. |
| DT-13 | Archivos con doble extensión `*.ts.ts` | Renombrarlos cambia imports de otros archivos. |
| DT-14 | `producto.controller.spec.ts` y otros specs del proyecto no corren; tres specs tienen imports rotos (`alicuota-iva`, `provincia`, `cliente` controllers) | Fuera del alcance; CR-002 se cubre con sus propios tests. |
| DT-15 | `test/jest-e2e.json` no tiene `moduleNameMapper` para los imports `src/...`, y el e2e existente requiere base de datos | El test de Supertest de CR-002 se ubicó en `src/` para usar la configuración de Jest existente. |
| DT-16 | El test de Supertest repite las opciones del `ValidationPipe` de `main.ts` | Se resolvería extrayendo la configuración de la app a una función compartida (refactor opcional). |

## 8. Testing y cobertura

### Tests

| Archivo | Tipo | Qué cubre |
|---|---|---|
| `producto/domain/value-objects/presentacion.vo.spec.ts` | Unitario puro (sin Nest ni base) | R1–R4: valores válidos y límites (`undefined`, `null`, `NaN`, `Infinity`, `0`, `-0`, negativos, más de 3 decimales, tipos incorrectos, `''`, solo espacios, tabs); que no se normaliza la unidad; igualdad por valor; inmutabilidad; transformer de la columna `decimal` (coherencia VO ↔ BD) |
| `producto/application/services/producto.service.spec.ts` | Unitario de aplicación (mocks) | R5: `create` persiste un `Presentacion` construido desde el DTO; con presentación ausente o inválida lanza error y no consulta la base ni persiste. R6: `update` sin presentación conserva la actual y con presentación la reemplaza; si es inválida no persiste |
| `producto/mappers/producto.mapper.spec.ts` | Unitario | R7 y coherencia Dominio ↔ DTO: `toDto` y `toBusquedaDto` exponen `presentacion` y no exponen campos de pack |
| `producto/application/controllers/producto-presentacion.http.spec.ts` | Integración HTTP con **Supertest** | HTTP → `ValidationPipe` → controller → `ProductoService` real → VO. Se reemplazan solo la persistencia, los validadores con base de datos y la autenticación. `POST`: 201 válido; 400 sin presentación, `null`, no objeto, parcial, cantidad 0, negativa, con 4 decimales o como texto, unidad vacía o con espacios, campo extra, `utilizaPack` o `cantidadPorPack`. `PUT`: 200 sin presentación (se conserva), 200 con presentación completa, 400 con presentación parcial o inválida. `GET`: la respuesta tiene `presentacion` y no campos de pack |

Para correrlos:

```
npx jest presentacion.vo.spec producto.mapper.spec "producto/application/services/producto.service.spec" producto-presentacion.http.spec
```

### Porcentaje de cobertura definido

| Alcance | Umbral (`coverageThreshold` en `jest.config.js`) | Justificación |
|---|---|---|
| `presentacion.vo.ts` | **100%** de sentencias, ramas, funciones y líneas | Contiene todas las reglas de negocio de CR-002. Es código chico y cualquier rama sin cubrir sería una regla sin probar. Lo controla Jest automáticamente. |
| Sin umbral global | — | El proyecto tiene 42 specs, casi todos del tipo "should be defined" y varios que no corren (DT-14). Un umbral global haría fallar la suite por deuda preexistente, no por CR-002. |

Resultado de la ejecución: `presentacion.vo.ts` y `presentacion.dto.ts` al 100%. En `producto.mapper.ts`, los métodos que tocó CR-002 (`toDto`, `toBusquedaDto`, `toPresentacionDto`) están cubiertos; queda sin cubrir `mapPrecios`, ajeno a CR-002, por lo que no se fijó umbral sobre ese archivo. En `producto.service.ts` se cubren `create` y `update`; el resto de sus métodos (búsquedas, stock, baja) no pertenecen a CR-002.
