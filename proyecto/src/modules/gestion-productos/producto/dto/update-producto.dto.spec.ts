import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProductoDto } from './update-producto.dto';

// En modificación todos los campos heredados son opcionales (PartialType),
// pero las reglas de rango del CreateProductoDto deben seguir aplicándose.
const propiedadesConError = async (payload: Record<string, unknown>) => {
  const dto = plainToInstance(UpdateProductoDto, {
    usuarioUpdatedId: 1,
    ...payload,
  });
  return (await validate(dto)).map((e) => e.property);
};

describe('UpdateProductoDto - validaciones CR-001', () => {
  it('CA7: acepta una modificación parcial con valores válidos', async () => {
    expect(
      await propiedadesConError({
        denominacion: 'Arroz integral',
        costo: 100,
        stock: 0,
      }),
    ).toEqual([]);
  });

  it('acepta una modificación que no envía costo ni stock', async () => {
    expect(await propiedadesConError({})).toEqual([]);
  });

  // CR-006: precio ya no es editable (el ValidationPipe lo rechaza por no estar en el DTO)
  it.each([
    ['costo', 0],
    ['costo', -10],
  ])('CA1: rechaza %s = %p', async (campo, valor) => {
    expect(await propiedadesConError({ [campo]: valor })).toEqual([campo]);
  });

  it('rechaza stock negativo', async () => {
    expect(await propiedadesConError({ stock: -1 })).toEqual(['stock']);
  });

  // CR-005: el DTO deja pasar la denominación vacía y la rechaza ProductoService
  // ("La denominación no puede estar vacía."); ver producto.service.spec (CR-001 CA3).
  it('CA3 (ajustado por CR-005): la denominación vacía no se valida en el DTO', async () => {
    expect(await propiedadesConError({ denominacion: '' })).toEqual([]);
  });
});
