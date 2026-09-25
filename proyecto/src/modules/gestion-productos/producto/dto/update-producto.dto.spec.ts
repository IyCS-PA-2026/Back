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
        precio: 150,
        stock: 0,
      }),
    ).toEqual([]);
  });

  it('acepta una modificación que no envía costo, precio ni stock', async () => {
    expect(await propiedadesConError({})).toEqual([]);
  });

  it.each([
    ['costo', 0],
    ['costo', -10],
    ['precio', 0],
    ['precio', -10],
  ])('CA1: rechaza %s = %p', async (campo, valor) => {
    expect(await propiedadesConError({ [campo]: valor })).toEqual([campo]);
  });

  it('rechaza stock negativo', async () => {
    expect(await propiedadesConError({ stock: -1 })).toEqual(['stock']);
  });

  it('CA3: rechaza denominacion vacía', async () => {
    expect(await propiedadesConError({ denominacion: '' })).toEqual([
      'denominacion',
    ]);
  });
});
