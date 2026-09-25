import { BadRequestException } from '@nestjs/common';
import { Producto } from './producto.entity';

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
