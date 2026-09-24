import { Producto } from '../domain/entities/producto.entity';
import { Presentacion } from '../domain/value-objects/presentacion.vo';
import { ProductoMapper } from './producto.mapper';

/*
  CR-002 — Coherencia Dominio ↔ DTO:
  la presentación se expone con la misma forma que recibe la API
  y ya no se exponen los campos de pack.
*/
describe('ProductoMapper - presentación (CR-002)', () => {
  const crearProducto = (): Producto =>
    Object.assign(new Producto(), {
      id: 1,
      denominacion: 'aceite girasol',
      codigoProveedor: 'A-1',
      stock: 10,
      alicuotaIva: 21,
      precio: 100,
      sistema: 0,
      linea: { id: 1, denominacion: 'aceites' },
      marca: { id: 2, denominacion: 'natura' },
      presentacion: Presentacion.crear(1.5, 'l'),
    });

  it('toDto expone la presentación del producto', () => {
    const dto = ProductoMapper.toDto(crearProducto());

    expect(dto.presentacion).toEqual({ cantidad: 1.5, unidadMedida: 'l' });
    expect(dto.presentacion).not.toBeInstanceOf(Presentacion);
    expect(dto).not.toHaveProperty('utilizaPack');
    expect(dto).not.toHaveProperty('cantidadPorPack');
  });

  it('toBusquedaDto expone la presentación del producto', () => {
    const dto = ProductoMapper.toBusquedaDto(crearProducto());

    expect(dto.presentacion).toEqual({ cantidad: 1.5, unidadMedida: 'l' });
    expect(dto).not.toHaveProperty('utilizaPack');
    expect(dto).not.toHaveProperty('cantidadPorPack');
  });
});
