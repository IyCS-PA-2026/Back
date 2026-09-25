# CR-005 - Denominacion automatica

## 1. Alcance y comportamiento implementado

La denominacion del producto puede generarse automaticamente durante el alta cuando el cliente no envia una denominacion manual, la envia vacia o solo con espacios.

Formato implementado:

```text
Marca + " " + Linea + " " + cantidad + " " + unidadMedida
```

Ejemplos aceptados:

| Presentacion | Denominacion sugerida |
|---|---|
| `{ cantidad: 1, unidadMedida: "L" }` | `Marca Linea 1 L` |
| `{ cantidad: 1, unidadMedida: "pack x6" }` | `Marca Linea 1 pack x6` |

Si se envia una denominacion manual valida al crear, se conserva. En actualizaciones no se regenera la denominacion al cambiar Marca, Linea o Presentacion; se conserva la existente salvo que el usuario envie una nueva denominacion valida. Una denominacion vacia en actualizacion se rechaza.

No se implemento vista previa ni autocompletado en vivo. El formulario informa que dejar vacia la denominacion durante el alta genera el nombre al guardar.

## 2. Decisiones de diseno y DDD

| Decision | Justificacion |
|---|---|
| La regla vive en `Producto.generarDenominacionSugerida()` | La composicion de la denominacion es una regla del agregado Producto, no del frontend ni del controller. Sigue el lineamiento de ubicar reglas de negocio en dominio. |
| `ProductoService.create` orquesta la generacion | La aplicacion obtiene Marca, Linea y Usuario, construye `Presentacion` y decide si debe pedir al dominio la denominacion sugerida. |
| Se reutiliza `Presentacion` de CR-002 sin cambios | CR-005 depende de CR-002, pero no agrega estructura, conversiones ni persistencia nueva para presentaciones. |
| Se valida longitud y unicidad sobre la denominacion final | La denominacion sugerida o manual pasa por las validaciones existentes antes de persistir. No se trunca. |
| No se guarda indicador automatico/manual | El alcance pidio no agregar columnas ni indicadores persistentes. Por eso no se puede distinguir historicamente si una denominacion fue personalizada. |
| El pipe de normalizacion solo normaliza | `NormalizeDenominacionPipe` ya no decide si una denominacion vacia es valida. Esa responsabilidad queda en DTO/servicio segun el caso: alta puede generar, update rechaza vacio. |

## 3. Cambios realizados

### Backend

| Archivo | Cambio |
|---|---|
| `producto/domain/entities/producto.entity.ts` | Nuevo metodo `Producto.generarDenominacionSugerida(marca, linea, presentacion)`. |
| `producto/application/services/producto.service.ts` | En alta, genera denominacion si falta o esta vacia; valida datos y unicidad sobre el valor final. En update, rechaza denominacion vacia enviada explicitamente y conserva si no se envia. |
| `producto/dto/create-producto.dto.ts` | `denominacion` pasa a ser opcional en alta; strings vacios se tratan como ausencia. |
| `producto/dto/update-producto.dto.ts` | Se reviso la herencia de `PartialType`; la actualizacion permite ausencia, pero el servicio rechaza valor vacio explicito. |
| `common/pipes/normalize-denominations.pipe.ts` | Normaliza strings presentes con `trim().toUpperCase()` y deja que DTO/servicio definan obligatoriedad. |
| Tests de Producto | Se agrego cobertura del metodo de dominio, alta automatica/manual, update manual, conservacion al cambiar presentacion y validacion HTTP de update vacio. |

### Frontend

| Archivo | Cambio |
|---|---|
| `interfaces-validaciones-producto.tsx` | `denominacion` es opcional en alta y obligatoria en edicion. El payload puede enviarse sin denominacion manual. |
| `registrar-actualizar-producto.tsx` | El formulario usa schema de alta/edicion y muestra ayuda en alta: si se deja vacio, se genera al guardar. |
| Tests de formulario/schema | Se cubre alta sin denominacion, edicion con denominacion obligatoria, ayuda visible solo en alta y payload sin denominacion manual. |

## 4. Pruebas y verificaciones

### Backend

Comando:

```bash
npx.cmd jest producto.entity.spec presentacion.vo.spec producto.service.spec producto-presentacion.http.spec --coverage=false
```

Resultado:

```text
Test Suites: 4 passed, 4 total
Tests: 82 passed, 82 total
```

Antes de la correccion final, la suite HTTP detecto que `PartialType` permitia `denominacion: ""` en update. Se agrego una guarda en `ProductoService.update` y se volvio a ejecutar la seleccion exitosamente.

Build:

```bash
npm.cmd run build
```

Resultado: exitoso (`nest build`).

### Frontend

El primer intento con `yarn` fallo por `ExecutionPolicy` de PowerShell. El primer intento con `npm.cmd` fallo por acceso denegado del sandbox al cargar `vitest.config.ts`. Se reejecuto fuera del sandbox.

Comando:

```bash
npm.cmd run test -- src/componentes/gestion-producto/producto/interfaces/interfaces-validaciones-producto.test.ts src/componentes/gestion-producto/producto/utils/registrar-actualizar-producto.test.tsx
```

Resultado:

```text
Test Files  2 passed (2)
Tests  32 passed (32)
```

Build:

```bash
npm.cmd run build
```

Resultado: exitoso (`vite build`). Advertencias no bloqueantes: Browserslist desactualizado y chunks mayores a 500 kB.

## 5. Mejoras de arquitectura

No se realizaron mejoras de arquitectura generales. El cambio se mantuvo acotado a la regla de dominio, su orquestacion en aplicacion, validaciones de entrada y formulario.

## 6. Deuda tecnica y limitaciones aceptadas

### Limitacion heredada de CR-002

`Presentacion.unidadMedida` es texto libre. Por eso `"pack x6"` se conserva como etiqueta textual, sin validacion estructural, conversiones ni calculos de packs. CR-005 reutiliza esa representacion y no redisenia Presentacion.

### Limitacion funcional aceptada de CR-005

La denominacion puede quedar desactualizada respecto de Marca, Linea o Presentacion porque no se regenera en actualizaciones. Esto cumple el criterio de conservacion definido para CR-005. Como mejora futura, se podria evaluar regenerarla mientras no haya sido personalizada por el usuario, pero no se implemento porque requeriria distinguir estado automatico/manual.

### Deuda tecnica observada

| Deuda | Tratamiento |
|---|---|
| `PartialType(CreateProductoDto)` hereda opcionalidad y puede debilitar reglas de update para `denominacion` | Se agrego guarda explicita en `ProductoService.update` para rechazar denominacion vacia enviada explicitamente. |
| `yarn.ps1` bloqueado por ExecutionPolicy en este entorno | Se usaron `npx.cmd`/`npm.cmd`. No es deuda del codigo de la aplicacion. |
| Vitest/Vite requirieron ejecucion fuera del sandbox por acceso denegado al cargar config | Verificacion ejecutada exitosamente con permisos elevados. |

## 7. Verificaciones pendientes

No se ejecutaron migraciones, seeds ni pruebas con base de datos real. No son necesarias para CR-005 porque no agrega columnas ni cambios de persistencia.
