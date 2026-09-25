import { BadRequestException } from '@nestjs/common';
import { getMetadataArgsStorage, ValueTransformer } from 'typeorm';
import { HistorialPrecio, MOTIVO_MAXIMO } from './historial-precio.entity';
import { Producto } from './producto.entity';

/*
  CR-007 — HistorialPrecio.registrar es la única forma de crear un registro.
  Regla de negocio: precio > 0, validada en la creación de cada registro.
*/
describe('HistorialPrecio (CR-007)', () => {
  const fecha = new Date('2026-09-25T12:00:00Z');
  const datos = (parcial: Partial<Parameters<typeof HistorialPrecio.registrar>[0]> = {}) => ({
    productoId: 10,
    precioAnterior: 120,
    precioNuevo: 130,
    motivo: 'Edición de producto',
    fecha,
    ...parcial,
  });

  describe('registro válido', () => {
    it('crea el registro con los campos del CR: productoId, precioAnterior, precioNuevo, fecha y motivo', () => {
      const registro = HistorialPrecio.registrar(datos());

      expect(registro).toBeInstanceOf(HistorialPrecio);
      expect(registro).toMatchObject({
        productoId: 10,
        precioAnterior: 120,
        precioNuevo: 130,
        fecha,
        motivo: 'Edición de producto',
      });
      // El id lo asigna la base al persistir
      expect(registro.id).toBeUndefined();
    });

    it('en el alta no hay precio anterior (null)', () => {
      expect(HistorialPrecio.registrar(datos({ precioAnterior: null })).precioAnterior).toBeNull();
    });

    it('admite precio anterior 0 (producto que todavía no tenía precio)', () => {
      expect(HistorialPrecio.registrar(datos({ precioAnterior: 0 })).precioAnterior).toBe(0);
    });

    it('redondea los precios a 2 decimales, como Producto', () => {
      const registro = HistorialPrecio.registrar(datos({ precioAnterior: 10.004, precioNuevo: 12.345 }));
      expect(registro).toMatchObject({ precioAnterior: 10, precioNuevo: 12.35 });
    });

    it('recorta espacios del motivo', () => {
      expect(HistorialPrecio.registrar(datos({ motivo: '  Alta de producto  ' })).motivo).toBe('Alta de producto');
    });

    it('sin fecha usa el momento actual', () => {
      const antes = Date.now();
      const registro = HistorialPrecio.registrar(datos({ fecha: undefined }));
      expect(registro.fecha.getTime()).toBeGreaterThanOrEqual(antes);
      expect(registro.fecha.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('es una entidad: dos cambios con los mismos valores son dos registros distintos', () => {
      const a = HistorialPrecio.registrar(datos());
      const b = HistorialPrecio.registrar(datos());
      expect(a).not.toBe(b);
    });
  });

  describe('regla precio > 0', () => {
    it.each([
      ['0', 0],
      ['negativo', -1],
      ['que redondeado a 2 decimales queda en 0', 0.004],
      ['NaN', NaN],
      ['infinito', Infinity],
    ])('rechaza precio nuevo %s', (_caso, precioNuevo) => {
      expect(() => HistorialPrecio.registrar(datos({ precioNuevo }))).toThrow(BadRequestException);
      expect(() => HistorialPrecio.registrar(datos({ precioNuevo }))).toThrow('debe ser mayor a 0');
    });

    it('acepta el menor precio positivo representable (0,01)', () => {
      expect(HistorialPrecio.registrar(datos({ precioNuevo: 0.01 })).precioNuevo).toBe(0.01);
    });

    it.each([
      ['negativo', -5],
      ['NaN', NaN],
    ])('rechaza precio anterior %s', (_caso, precioAnterior) => {
      expect(() => HistorialPrecio.registrar(datos({ precioAnterior }))).toThrow('no puede ser negativo');
    });
  });

  describe('otras validaciones', () => {
    it.each([
      ['vacío', ''],
      ['solo espacios', '   '],
      ['ausente', undefined as unknown as string],
    ])('rechaza motivo %s', (_caso, motivo) => {
      expect(() => HistorialPrecio.registrar(datos({ motivo }))).toThrow('motivo');
    });

    it(`rechaza motivo de más de ${MOTIVO_MAXIMO} caracteres (límite de la columna)`, () => {
      expect(() => HistorialPrecio.registrar(datos({ motivo: 'x'.repeat(MOTIVO_MAXIMO + 1) }))).toThrow(
        `${MOTIVO_MAXIMO} caracteres`,
      );
      expect(HistorialPrecio.registrar(datos({ motivo: 'x'.repeat(MOTIVO_MAXIMO) })).motivo).toHaveLength(MOTIVO_MAXIMO);
    });

    it.each([
      ['0', 0],
      ['negativo', -1],
      ['no entero', 1.5],
      ['ausente', undefined as unknown as number],
    ])('rechaza productoId %s', (_caso, productoId) => {
      expect(() => HistorialPrecio.registrar(datos({ productoId }))).toThrow('producto válido');
    });

    it('rechaza una fecha inválida', () => {
      expect(() => HistorialPrecio.registrar(datos({ fecha: new Date('no es fecha') }))).toThrow('fecha');
    });
  });

  describe('coherencia con la base de datos', () => {
    const storage = getMetadataArgsStorage();

    it('se persiste en la tabla historial_precio', () => {
      expect(storage.tables.find((t) => t.target === HistorialPrecio)?.name).toBe('historial_precio');
    });

    it('la regla precio > 0 también es un CHECK de la tabla', () => {
      const check = storage.checks.find((c) => c.target === HistorialPrecio);
      expect(check).toMatchObject({
        name: 'CHK_historial_precio_precio_nuevo_positivo',
        expression: '`precioNuevo` > 0',
      });
    });

    it('precioAnterior es la única columna de precio que admite null', () => {
      const columnas = storage.columns.filter((c) => c.target === HistorialPrecio);
      const opciones = (nombre: string) => columnas.find((c) => c.propertyName === nombre)?.options;

      expect(opciones('precioAnterior')?.nullable).toBe(true);
      expect(opciones('precioNuevo')?.nullable).toBeFalsy();
    });

    it('los precios viajan como decimal y vuelven como número, respetando null', () => {
      const columna = storage.columns.find(
        (c) => c.target === HistorialPrecio && c.propertyName === 'precioAnterior',
      );
      const transformer = columna?.options.transformer as ValueTransformer;

      expect(transformer.to(120.5)).toBe('120.5');
      expect(transformer.to(null)).toBeNull();
      expect(transformer.from('120.50000')).toBe(120.5);
      expect(transformer.from(null)).toBeNull();
    });

    it('referencia al Producto por producto_id (FK)', () => {
      const relacion = storage.relations.find(
        (r) => r.target === HistorialPrecio && r.propertyName === 'producto',
      );
      expect((relacion?.type as () => unknown)()).toBe(Producto);
      expect(
        storage.joinColumns.find((j) => j.target === HistorialPrecio && j.propertyName === 'producto'),
      ).toMatchObject({ name: 'producto_id', foreignKeyConstraintName: 'FK_historial_precio_producto' });
    });
  });
});
