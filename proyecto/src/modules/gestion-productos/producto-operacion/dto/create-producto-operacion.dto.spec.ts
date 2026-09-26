import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProductoOperacionDto } from './create-producto-operacion.dto';

const buildPayload = (overrides: Record<string, unknown> = {}) => ({
  cantidad: 5,
  motivo: 'Ajuste de inventario',
  ...overrides,
});

const erroresPorPropiedad = async (payload: Record<string, unknown>) => {
  const dto = plainToInstance(CreateProductoOperacionDto, payload);
  const errores = await validate(dto);
  return Object.fromEntries(
    errores.map((e) => [e.property, Object.keys(e.constraints ?? {}).sort()]),
  );
};

describe('CreateProductoOperacionDto - validaciones CR-001 (CA4)', () => {
  it('acepta cantidad y motivo informados correctamente', async () => {
    expect(await erroresPorPropiedad(buildPayload())).toEqual({});
  });

  describe('cantidad', () => {
    it('rechaza cantidad ausente', async () => {
      const { cantidad, ...payload } = buildPayload();
      expect(await erroresPorPropiedad(payload)).toEqual({
        cantidad: ['isNotEmpty', 'isNumber'],
      });
    });

    it('rechaza cantidad null', async () => {
      expect(await erroresPorPropiedad(buildPayload({ cantidad: null }))).toEqual({
        cantidad: ['isNotEmpty', 'isNumber'],
      });
    });

    it('rechaza cantidad no numérica', async () => {
      expect(await erroresPorPropiedad(buildPayload({ cantidad: '5' }))).toEqual({
        cantidad: ['isNumber'],
      });
    });
  });

  describe('motivo', () => {
    it('rechaza motivo ausente', async () => {
      const { motivo, ...payload } = buildPayload();
      expect(await erroresPorPropiedad(payload)).toEqual({
        motivo: ['isNotEmpty', 'isString'],
      });
    });

    it('rechaza motivo vacío', async () => {
      expect(await erroresPorPropiedad(buildPayload({ motivo: '' }))).toEqual({
        motivo: ['isNotEmpty'],
      });
    });

    it('rechaza motivo no string', async () => {
      expect(await erroresPorPropiedad(buildPayload({ motivo: 123 }))).toEqual({
        motivo: ['isString'],
      });
    });
  });

  it('rechaza cuando faltan ambos campos', async () => {
    expect(Object.keys(await erroresPorPropiedad({})).sort()).toEqual([
      'cantidad',
      'motivo',
    ]);
  });
});
