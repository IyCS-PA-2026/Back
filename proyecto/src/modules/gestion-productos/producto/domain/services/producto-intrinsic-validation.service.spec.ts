import { BadRequestException } from '@nestjs/common';
import { ProductoIntrinsicValidationService } from './producto-intrinsic-validation.service.ts';

type DatosBasicos = Parameters<
  ProductoIntrinsicValidationService['validarDatosBasicos']
>[0];

const buildDatos = (overrides: Partial<DatosBasicos> = {}): DatosBasicos => ({
  denominacion: 'Arroz largo fino',
  marcaId: 1,
  lineaId: 1,
  alicuotaIva: 21,
  utilizaStockMinimo: false,
  stockMinimo: undefined,
  ...overrides,
});

describe('ProductoIntrinsicValidationService', () => {
  let service: ProductoIntrinsicValidationService;

  beforeEach(() => {
    service = new ProductoIntrinsicValidationService();
  });

  it('CA7: acepta datos válidos con configuración de stock mínimo válida', () => {
    expect(() =>
      service.validarDatosBasicos(
        buildDatos({ utilizaStockMinimo: true, stockMinimo: 5 }),
      ),
    ).not.toThrow();
  });

  describe('stock mínimo condicionado por utilizaStockMinimo', () => {
    it('utilizaStockMinimo = true + stockMinimo válido → válido', () => {
      expect(() =>
        service.validarDatosBasicos(
          buildDatos({ utilizaStockMinimo: true, stockMinimo: 10 }),
        ),
      ).not.toThrow();
    });

    it('utilizaStockMinimo = true + stockMinimo = 0 → válido (0 se considera informado)', () => {
      expect(() =>
        service.validarDatosBasicos(
          buildDatos({ utilizaStockMinimo: true, stockMinimo: 0 }),
        ),
      ).not.toThrow();
    });

    it.each([undefined, null])(
      'CA5: utilizaStockMinimo = true + stockMinimo %p → inválido',
      (stockMinimo) => {
        const datos = buildDatos({
          utilizaStockMinimo: true,
          stockMinimo: stockMinimo as unknown as number,
        });
        expect(() => service.validarDatosBasicos(datos)).toThrow(
          BadRequestException,
        );
        expect(() => service.validarDatosBasicos(datos)).toThrow(
          'El stock mínimo es obligatorio cuando se utiliza stock mínimo',
        );
      },
    );

    it('CA6: utilizaStockMinimo = false + stockMinimo ausente → válido', () => {
      expect(() =>
        service.validarDatosBasicos(
          buildDatos({ utilizaStockMinimo: false, stockMinimo: undefined }),
        ),
      ).not.toThrow();
    });

    it('utilizaStockMinimo = false + stockMinimo informado → válido (se ignora)', () => {
      expect(() =>
        service.validarDatosBasicos(
          buildDatos({ utilizaStockMinimo: false, stockMinimo: 3 }),
        ),
      ).not.toThrow();
    });

    it('utilizaStockMinimo ausente + stockMinimo ausente → válido', () => {
      expect(() =>
        service.validarDatosBasicos(
          buildDatos({ utilizaStockMinimo: undefined, stockMinimo: undefined }),
        ),
      ).not.toThrow();
    });
  });

  describe('denominacion (CA3)', () => {
    it.each(['', '   ', undefined, null])(
      'rechaza denominacion %p',
      (denominacion) => {
        expect(() =>
          service.validarDatosBasicos(
            buildDatos({ denominacion: denominacion as unknown as string }),
          ),
        ).toThrow('La denominación es obligatoria');
      },
    );
  });
});
