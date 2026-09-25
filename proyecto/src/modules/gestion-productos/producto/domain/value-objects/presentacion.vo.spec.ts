import { BadRequestException } from '@nestjs/common';
import { getMetadataArgsStorage, ValueTransformer } from 'typeorm';
import { Presentacion } from './presentacion.vo';

/*
  CR-002 — Reglas de negocio del Value Object Presentacion
  R1 cantidad obligatoria
  R2 cantidad > 0 (hasta 3 decimales, coherente con decimal(12,3))
  R3 unidadMedida obligatoria
  R4 unidadMedida no vacía (sin normalización)
*/
describe('Presentacion (Value Object)', () => {
  describe('creación válida', () => {
    it.each([
      [1, 'unidad'],
      [1.5, 'kg'],
      [0.001, 'kg'],
      [12, 'unidades'],
      [999999999.999, 'l'],
    ])('crea la presentación %p %p', (cantidad, unidadMedida) => {
      const presentacion = Presentacion.crear(cantidad, unidadMedida);

      expect(presentacion).toBeInstanceOf(Presentacion);
      expect(presentacion.cantidad).toBe(cantidad);
      expect(presentacion.unidadMedida).toBe(unidadMedida);
    });
  });

  describe('R1 - cantidad obligatoria', () => {
    it.each([undefined, null, NaN, Infinity, -Infinity, '5' as unknown as number])(
      'rechaza cantidad %p',
      (cantidad) => {
        expect(() => Presentacion.crear(cantidad, 'kg')).toThrow(
          BadRequestException,
        );
        expect(() => Presentacion.crear(cantidad, 'kg')).toThrow(
          /obligatoria y debe ser un número/,
        );
      },
    );
  });

  describe('R2 - cantidad mayor que 0', () => {
    it.each([0, -0, -1, -0.001])('rechaza cantidad %p', (cantidad) => {
      expect(() => Presentacion.crear(cantidad, 'kg')).toThrow(
        /debe ser mayor que 0/,
      );
    });

    it.each([0.0001, 1.2345, 2.0005])(
      'rechaza cantidad con más de 3 decimales: %p',
      (cantidad) => {
        expect(() => Presentacion.crear(cantidad, 'kg')).toThrow(
          /hasta 3 decimales/,
        );
      },
    );
  });

  describe('R3 - unidadMedida obligatoria', () => {
    it.each([undefined, null, 5 as unknown as string])(
      'rechaza unidadMedida %p',
      (unidadMedida) => {
        expect(() => Presentacion.crear(1, unidadMedida)).toThrow(
          /unidad de medida de la presentación es obligatoria/,
        );
      },
    );
  });

  describe('R4 - unidadMedida no vacía', () => {
    it.each(['', ' ', '   ', '\t', '\n'])('rechaza unidadMedida %p', (unidadMedida) => {
      expect(() => Presentacion.crear(1, unidadMedida)).toThrow(
        BadRequestException,
      );
    });

    it('conserva la unidad de medida tal como se ingresó (sin trim ni cambio de mayúsculas)', () => {
      const presentacion = Presentacion.crear(1, ' Kg ');

      expect(presentacion.unidadMedida).toBe(' Kg ');
    });
  });

  describe('igualdad por valor', () => {
    it('dos presentaciones con los mismos valores son iguales', () => {
      expect(
        Presentacion.crear(1.5, 'kg').equals(Presentacion.crear(1.5, 'kg')),
      ).toBe(true);
    });

    it.each([
      [Presentacion.crear(2, 'kg')],
      [Presentacion.crear(1.5, 'g')],
      [Presentacion.crear(1.5, 'KG')],
      [null],
      [undefined],
    ])('es distinta de %p', (otra) => {
      expect(Presentacion.crear(1.5, 'kg').equals(otra)).toBe(false);
    });
  });

  describe('persistencia (coherencia VO ↔ decimal(12,3))', () => {
    const transformerCantidad = () => {
      const columna = getMetadataArgsStorage().columns.find(
        (c) => c.target === Presentacion && c.propertyName === 'cantidad',
      );
      return columna!.options.transformer as ValueTransformer;
    };

    it('la cantidad se lee de MySQL (string decimal) como number', () => {
      expect(transformerCantidad().from('1.500')).toBe(1.5);
      expect(transformerCantidad().from(null)).toBeNull();
    });

    it('la cantidad se escribe como string decimal', () => {
      expect(transformerCantidad().to(1.5)).toBe('1.5');
      expect(transformerCantidad().to(undefined)).toBeUndefined();
    });
  });

  describe('inmutabilidad', () => {
    it('reemplazar la presentación implica crear una nueva instancia', () => {
      const original = Presentacion.crear(1, 'kg');
      const nueva = Presentacion.crear(2, 'kg');

      expect(nueva).not.toBe(original);
      expect(original.cantidad).toBe(1);
    });
  });
});
