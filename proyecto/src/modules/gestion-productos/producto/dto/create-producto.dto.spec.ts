import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateProductoDto } from './create-producto.dto';
import { AlicuotaIva } from 'src/modules/organizacion/enums/alicuota-iva.enum';

// Payload válido que recibiría el ValidationPipe global (transform: true)
const buildPayload = (overrides: Record<string, unknown> = {}) => ({
  denominacion: 'Arroz largo fino',
  utilizaStockMinimo: false,
  // CR-002: utilizaPack se reemplazó por la presentación
  presentacion: { cantidad: 1, unidadMedida: 'kg' },
  lineaId: 1,
  marcaId: 1,
  alicuotaIva: AlicuotaIva.ALICUOTA_21,
  usuarioCreatedId: 1,
  costo: 100,
  stock: 10,
  ...overrides,
});

const validar = async (payload: Record<string, unknown>) => {
  const dto = plainToInstance(CreateProductoDto, payload);
  return validate(dto);
};

const propiedadesConError = async (payload: Record<string, unknown>) =>
  (await validar(payload)).map((e) => e.property);

describe('CreateProductoDto - validaciones CR-001', () => {
  it('CA7: acepta un producto con datos correctos', async () => {
    expect(await validar(buildPayload())).toHaveLength(0);
  });

  describe('costo (CA1)', () => {
    it('acepta costo > 0', async () => {
      expect(await propiedadesConError(buildPayload({ costo: 0.01 }))).toEqual([]);
    });

    it.each([0, -1])('rechaza costo = %p', async (costo) => {
      const errores = await validar(buildPayload({ costo }));
      expect(errores).toHaveLength(1);
      expect(errores[0].property).toBe('costo');
      expect(errores[0].constraints).toHaveProperty(
        'isPositive',
        'El costo debe ser mayor que 0.',
      );
    });
  });

  // CA "Precio calculado" (US-001) con CR-006: el precio no es un campo del DTO.
  // Se deriva de costo y margen; "precio resultante > 0" lo valida HistorialPrecio
  // (CR-007). El rechazo del campo se prueba con el ValidationPipe más abajo.

  describe('stock (CA2)', () => {
    it.each([0, 5])('acepta stock = %p', async (stock) => {
      expect(await propiedadesConError(buildPayload({ stock }))).toEqual([]);
    });

    it('rechaza stock negativo', async () => {
      const errores = await validar(buildPayload({ stock: -1 }));
      expect(errores).toHaveLength(1);
      expect(errores[0].property).toBe('stock');
      expect(errores[0].constraints).toHaveProperty(
        'min',
        'El stock no puede ser negativo.',
      );
    });
  });

  // CR-005 (US-006): en el alta la denominación es opcional; si llega vacía,
  // ausente o solo con espacios, ProductoService la genera (Marca + Línea + Presentación).
  // El rechazo de denominación vacía en la edición se prueba en producto.service.spec.
  describe('denominacion / nombre (CA3, ajustado por CR-005)', () => {
    it.each(['', '   '])('denominacion vacía (%p) queda sin valor para generarse', async (denominacion) => {
      const dto = plainToInstance(CreateProductoDto, buildPayload({ denominacion }));
      expect(dto.denominacion).toBeUndefined();
      expect(await validate(dto)).toHaveLength(0);
    });

    it('acepta denominacion ausente', async () => {
      const { denominacion, ...sinDenominacion } = buildPayload();
      expect(await propiedadesConError(sinDenominacion)).toEqual([]);
    });

    it('con denominacion null, el @Transform ya no falla (lo protege CR-005)', () => {
      expect(() =>
        plainToInstance(CreateProductoDto, buildPayload({ denominacion: null })),
      ).not.toThrow();
    });
  });

  describe('utilizaStockMinimo / stockMinimo (formato)', () => {
    it('rechaza utilizaStockMinimo ausente (es obligatorio y booleano)', async () => {
      const { utilizaStockMinimo, ...payload } = buildPayload();
      expect(await propiedadesConError(payload)).toEqual(['utilizaStockMinimo']);
    });

    // A nivel DTO stockMinimo es opcional: la regla condicional vive en
    // ProductoIntrinsicValidationService (ver su spec).
    it('permite utilizaStockMinimo = true sin stockMinimo (lo resuelve el dominio)', async () => {
      expect(
        await propiedadesConError(buildPayload({ utilizaStockMinimo: true })),
      ).toEqual([]);
    });

    it('rechaza stockMinimo no entero', async () => {
      expect(
        await propiedadesConError(
          buildPayload({ utilizaStockMinimo: true, stockMinimo: 1.5 }),
        ),
      ).toEqual(['stockMinimo']);
    });
  });

  // Misma configuración que el ValidationPipe global de main.ts: si el body es
  // inválido se responde 400 y el controller/servicio nunca se ejecuta.
  describe('con el ValidationPipe global (CA1 / CA2)', () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    const metadata = { type: 'body' as const, metatype: CreateProductoDto };

    it.each([
      { costo: 0 },
      { costo: -5 },
      { stock: -1 },
      // CR-006: el precio no se carga a mano, cualquier valor se rechaza
      { precio: 150 },
      { precio: 0 },
    ])('rechaza el body %p con BadRequestException', async (override) => {
      await expect(
        pipe.transform(buildPayload(override), metadata),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('CA7: deja pasar un body válido', async () => {
      await expect(
        pipe.transform(buildPayload(), metadata),
      ).resolves.toBeInstanceOf(CreateProductoDto);
    });
  });
});
