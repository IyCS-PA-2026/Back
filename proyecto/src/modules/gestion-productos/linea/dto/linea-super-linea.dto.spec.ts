import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateLineaDto } from './create-linea.dto';
import { UpdateLineaDto } from './update-linea.dto';

/*
  CR-003 — Campo superLineaId en los DTOs de Línea.
  La relación Línea → SuperLínea se gestiona desde Línea: el campo es opcional,
  entero, y admite null para desagrupar.
*/
describe('DTOs de Línea - superLineaId (CR-003)', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  const validar = (metatype: any, value: any) =>
    pipe.transform(value, { type: 'body', metatype });

  const altaValida = () => ({
    denominacion: 'Gaseosas',
    utilizaStockMinimo: false,
    usuarioCreatedId: 7,
  });

  const modificacionValida = () => ({
    utilizaStockMinimo: false,
    usuarioUpdatedId: 7,
  });

  describe('CreateLineaDto', () => {
    it('acepta un alta con superLineaId', async () => {
      const dto = await validar(CreateLineaDto, {
        ...altaValida(),
        superLineaId: 3,
      });
      expect(dto.superLineaId).toBe(3);
    });

    it('acepta un alta sin superLineaId (línea sin agrupar)', async () => {
      const dto = await validar(CreateLineaDto, altaValida());
      expect(dto.superLineaId).toBeUndefined();
    });

    it('acepta un alta con superLineaId null', async () => {
      const dto = await validar(CreateLineaDto, {
        ...altaValida(),
        superLineaId: null,
      });
      expect(dto.superLineaId).toBeNull();
    });

    it.each([
      ['string numérico', '3'],
      ['decimal', 3.5],
      ['booleano', true],
      ['objeto', { id: 3 }],
    ])('rechaza un superLineaId %s', async (_caso, superLineaId) => {
      await expect(
        validar(CreateLineaDto, { ...altaValida(), superLineaId }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza enviar el objeto superLinea en lugar del id', async () => {
      await expect(
        validar(CreateLineaDto, {
          ...altaValida(),
          superLinea: { id: 3, denominacion: 'BEBIDAS' },
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('UpdateLineaDto', () => {
    it('hereda superLineaId y acepta reasignar', async () => {
      const dto = await validar(UpdateLineaDto, {
        ...modificacionValida(),
        superLineaId: 4,
      });
      expect(dto).toBeInstanceOf(UpdateLineaDto);
      expect(dto.superLineaId).toBe(4);
    });

    it('acepta null para desagrupar', async () => {
      const dto = await validar(UpdateLineaDto, {
        ...modificacionValida(),
        superLineaId: null,
      });
      expect(dto.superLineaId).toBeNull();
    });

    it('acepta omitir superLineaId (se conserva la agrupación)', async () => {
      const dto = await validar(UpdateLineaDto, modificacionValida());
      expect('superLineaId' in dto).toBe(false);
    });

    it('rechaza un superLineaId que no es entero', async () => {
      await expect(
        validar(UpdateLineaDto, { ...modificacionValida(), superLineaId: 'x' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
