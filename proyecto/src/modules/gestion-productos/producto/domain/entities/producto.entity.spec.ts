import { BadRequestException } from '@nestjs/common';
import { Producto } from './producto.entity';
import { HistorialPrecio } from './historial-precio.entity';
import { Presentacion } from '../value-objects/presentacion.vo';

/*
  CR-006 — Precio derivado: Precio = Costo × (1 + Margen / 100).
  El precio nunca se carga; lo recalcula el propio Producto.
*/
describe('Producto - precio derivado (CR-006)', () => {
  const producto = (costo: number | undefined, porcentaje: number | undefined) =>
    Object.assign(new Producto(), { denominacion: 'YERBA', costo, porcentaje });

  it('margen 20 es un 20 % de ganancia sobre el costo', () => {
    expect(producto(100, 20).calcularPrecio()).toBe(120);
  });

  it('sin costo ni margen el precio es 0', () => {
    expect(producto(undefined, undefined).calcularPrecio()).toBe(0);
  });

  it('recalcularPrecio pisa cualquier precio previo', () => {
    const p = Object.assign(producto(80, 25), { precio: 999 });
    p.recalcularPrecio();
    expect(p.precio).toBe(100);
  });

  it('aplicarMargen reemplaza el margen y deriva el precio', () => {
    const p = producto(200, 50);
    p.aplicarMargen(10);
    expect(p).toMatchObject({ porcentaje: 10, precio: 220 });
  });

  it('aplicarCosto conserva el margen y deriva el precio', () => {
    const p = producto(100, 20);
    p.aplicarCosto(150);
    expect(p).toMatchObject({ costo: 150, porcentaje: 20, precio: 180 });
    expect(p.fechaCosto).toBeInstanceOf(Date);
  });

  it.each([
    ['margen negativo', (p: Producto) => p.aplicarMargen(-1)],
    ['margen mayor al máximo', (p: Producto) => p.aplicarMargen(1000)],
    ['costo negativo', (p: Producto) => p.aplicarCosto(-1)],
  ])('rechaza %s sin modificar el producto', (_caso, aplicar) => {
    const p = Object.assign(producto(100, 20), { precio: 120 });
    expect(() => aplicar(p)).toThrow(BadRequestException);
    expect(p).toMatchObject({ costo: 100, porcentaje: 20, precio: 120 });
  });
});

/*
  CR-007 — Producto registra sus propios cambios de precio en HistorialPrecio.
*/
describe('Producto - historial de precios (CR-007)', () => {
  const producto = (costo: number, porcentaje: number) => {
    const p = Object.assign(new Producto(), { id: 7, denominacion: 'YERBA', costo, porcentaje });
    p.recalcularPrecio();
    return p;
  };

  it('si el precio cambió devuelve el registro con precio anterior, nuevo y motivo', () => {
    const p = producto(100, 20);
    p.aplicarMargen(30);

    const registro = p.registrarCambioDePrecio(120, 'Edición de producto');

    expect(registro).toBeInstanceOf(HistorialPrecio);
    expect(registro).toMatchObject({ productoId: 7, precioAnterior: 120, precioNuevo: 130, motivo: 'Edición de producto' });
    expect(registro!.fecha).toBeInstanceOf(Date);
  });

  it('si el precio no cambió no registra nada', () => {
    const p = producto(100, 20);
    p.aplicarMargen(20);
    expect(p.registrarCambioDePrecio(120, 'Edición de producto')).toBeNull();
  });

  it('compara con la precisión con la que se guarda el precio (2 decimales)', () => {
    const p = producto(100, 20);
    expect(p.registrarCambioDePrecio(120.001, 'Edición de producto')).toBeNull();
  });

  it('alta con precio: registro inicial sin precio anterior', () => {
    expect(producto(100, 20).registrarCambioDePrecio(null, 'Alta de producto')).toMatchObject({
      precioAnterior: null,
      precioNuevo: 120,
    });
  });

  it('alta sin precio (sin costo): no registra ni rechaza el alta', () => {
    expect(producto(0, 20).registrarCambioDePrecio(null, 'Alta de producto')).toBeNull();
  });

  it('producto sin precio que pasa a tener precio: registra desde 0', () => {
    const p = producto(0, 20);
    p.aplicarCosto(50);
    expect(p.registrarCambioDePrecio(0, 'Edición de producto')).toMatchObject({ precioAnterior: 0, precioNuevo: 60 });
  });

  it('regla precio > 0: un cambio que deja el precio en 0 se rechaza nombrando al producto', () => {
    const p = producto(100, 20);
    p.aplicarCosto(0);

    expect(() => p.registrarCambioDePrecio(120, 'Edición de producto')).toThrow(BadRequestException);
    expect(() => p.registrarCambioDePrecio(120, 'Edición de producto')).toThrow(
      'Producto "YERBA": El precio nuevo (0) debe ser mayor a 0.',
    );
  });

  it('no modifica el precio del producto (solo lo lee)', () => {
    const p = producto(100, 20);
    p.registrarCambioDePrecio(90, 'Edición de producto');
    expect(p.precio).toBe(120);
  });
});

describe('Producto - denominacion automatica (CR-005)', () => {
  it.each([
    [1, 'L', 'Natura Aceites 1 L'],
    [1, 'pack x6', 'Natura Aceites 1 pack x6'],
  ])(
    'genera la denominacion sugerida con presentacion %p %p',
    (cantidad, unidadMedida, esperada) => {
      const denominacion = Producto.generarDenominacionSugerida(
        { denominacion: 'Natura' },
        { denominacion: 'Aceites' },
        Presentacion.crear(cantidad, unidadMedida),
      );

      expect(denominacion).toBe(esperada);
    },
  );
});
