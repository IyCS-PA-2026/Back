import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateSuperLineaDto } from './create-super-linea.dto';
import { UpdateSuperLineaDto } from './update-super-linea.dto';

/*
  CR-003 — Validación de entrada de SuperLinea.
  Se valida a través de un ValidationPipe con las mismas opciones que main.ts
  (transform, whitelist, forbidNonWhitelisted).
*/
describe('DTOs de SuperLinea (CR-003)', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  const validar = (metatype: any, value: any) =>
    pipe.transform(value, { type: 'body', metatype });

  describe('CreateSuperLineaDto', () => {
    const bodyValido = () => ({
      denominacion: 'Bebidas',
      observacion: 'agrupa gaseosas y aguas',
      usuarioCreatedId: 7,
    });

    it('acepta un alta válida y normaliza la denominación (trim + minúsculas)', async () => {
      const dto = await validar(CreateSuperLineaDto, {
        ...bodyValido(),
        denominacion: '  Bebidas Frias  ',
      });

      expect(dto).toBeInstanceOf(CreateSuperLineaDto);
      expect(dto.denominacion).toBe('bebidas frias');
      expect(dto.usuarioCreatedId).toBe(7);
    });

    it('acepta un alta sin observación', async () => {
      const { observacion, ...body } = bodyValido();
      await expect(validar(CreateSuperLineaDto, body)).resolves.toBeDefined();
    });

    it('acepta letras acentuadas, ñ y números', async () => {
      await expect(
        validar(CreateSuperLineaDto, {
          ...bodyValido(),
          denominacion: 'Almacén Ñandú 2',
        }),
      ).resolves.toBeDefined();
    });

    it.each([
      ['vacía', ''],
      ['solo espacios', '   '],
      ['con caracteres especiales', 'bebidas-frias!'],
      ['de más de 255 caracteres', 'a'.repeat(256)],
    ])('rechaza una denominación %s', async (_caso, denominacion) => {
      await expect(
        validar(CreateSuperLineaDto, { ...bodyValido(), denominacion }),
      ).rejects.toThrow(BadRequestException);
    });

    it('acepta una denominación de exactamente 255 caracteres', async () => {
      await expect(
        validar(CreateSuperLineaDto, {
          ...bodyValido(),
          denominacion: 'a'.repeat(255),
        }),
      ).resolves.toBeDefined();
    });

    it('rechaza un alta sin usuarioCreatedId', async () => {
      const { usuarioCreatedId, ...body } = bodyValido();
      await expect(validar(CreateSuperLineaDto, body)).rejects.toThrow(
        BadRequestException,
      );
    });

    it.each([
      ['string', '7'],
      ['decimal', 7.5],
    ])('rechaza un usuarioCreatedId %s', async (_caso, usuarioCreatedId) => {
      await expect(
        validar(CreateSuperLineaDto, { ...bodyValido(), usuarioCreatedId }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza una observación que no es texto', async () => {
      await expect(
        validar(CreateSuperLineaDto, { ...bodyValido(), observacion: 123 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza propiedades no declaradas (las líneas no se gestionan desde SuperLinea)', async () => {
      await expect(
        validar(CreateSuperLineaDto, { ...bodyValido(), lineas: [1, 2] }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('UpdateSuperLineaDto', () => {
    it('acepta un renombrado', async () => {
      const dto = await validar(UpdateSuperLineaDto, {
        denominacion: 'Bebidas Frias',
        usuarioUpdatedId: 7,
      });

      expect(dto).toBeInstanceOf(UpdateSuperLineaDto);
      expect(dto.denominacion).toBe('bebidas frias');
    });

    it('acepta una modificación solo de la observación', async () => {
      await expect(
        validar(UpdateSuperLineaDto, {
          observacion: 'nueva observación',
          usuarioUpdatedId: 7,
        }),
      ).resolves.toBeDefined();
    });

    it('rechaza una modificación sin usuarioUpdatedId', async () => {
      await expect(
        validar(UpdateSuperLineaDto, { denominacion: 'Bebidas' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('mantiene las reglas de la denominación del alta', async () => {
      await expect(
        validar(UpdateSuperLineaDto, {
          denominacion: 'bebidas@frias',
          usuarioUpdatedId: 7,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
