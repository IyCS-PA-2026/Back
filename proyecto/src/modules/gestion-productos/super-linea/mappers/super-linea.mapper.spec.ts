import { SuperLineaMapper } from './super-linea.mapper';
import { SuperLinea } from '../domain/entities/super-linea.entity';
import { LineaMapper } from '../../linea/mappers/linea.mapper';
import { Linea } from '../../linea/domain/entities/linea.entity';

/*
  CR-003 — Mapeo de SuperLinea y de la referencia superLinea en LineaDto.
*/
describe('Mappers (CR-003)', () => {
  describe('SuperLineaMapper.toDto', () => {
    it('mapea una superlínea activa', () => {
      const entity = {
        id: 1,
        denominacion: 'BEBIDAS',
        observacion: 'gaseosas y aguas',
        sistema: 0,
        deletedAt: undefined,
      } as SuperLinea;

      expect(SuperLineaMapper.toDto(entity)).toEqual({
        id: 1,
        denominacion: 'BEBIDAS',
        observacion: 'gaseosas y aguas',
        sistema: 0,
        deletedAt: null,
      });
    });

    it('devuelve observación vacía cuando no tiene', () => {
      const entity = { id: 1, denominacion: 'BEBIDAS', sistema: 0 } as SuperLinea;
      expect(SuperLineaMapper.toDto(entity).observacion).toBe('');
    });

    it('expone la fecha de baja en formato ISO', () => {
      const deletedAt = new Date('2026-09-20T10:00:00.000Z');
      const entity = {
        id: 1,
        denominacion: 'BEBIDAS',
        sistema: 0,
        deletedAt,
      } as SuperLinea;

      expect(SuperLineaMapper.toDto(entity).deletedAt).toBe(
        '2026-09-20T10:00:00.000Z',
      );
    });

    it('no expone las líneas agrupadas', () => {
      const entity = {
        id: 1,
        denominacion: 'BEBIDAS',
        sistema: 0,
        lineas: [{ id: 5 }],
      } as unknown as SuperLinea;

      expect(SuperLineaMapper.toDto(entity)).not.toHaveProperty('lineas');
    });
  });

  describe('LineaMapper.toDto - referencia superLinea', () => {
    const lineaBase = () =>
      ({
        id: 5,
        denominacion: 'GASEOSAS',
        stockMinimo: 0,
        utilizaStockMinimo: false,
        sistema: 0,
      }) as Linea;

    it('incluye id y denominación de la superlínea que la agrupa', () => {
      const linea = {
        ...lineaBase(),
        superLineaId: 1,
        superLinea: { id: 1, denominacion: 'BEBIDAS' } as SuperLinea,
      } as Linea;

      expect(LineaMapper.toDto(linea).superLinea).toEqual({
        id: 1,
        denominacion: 'BEBIDAS',
      });
    });

    it('devuelve una referencia vacía (id 0) cuando la línea no está agrupada', () => {
      const linea = { ...lineaBase(), superLinea: null } as Linea;

      expect(LineaMapper.toDto(linea).superLinea).toEqual({
        id: 0,
        denominacion: '',
      });
    });

    it('devuelve una referencia vacía cuando la relación no fue cargada', () => {
      expect(LineaMapper.toDto(lineaBase()).superLinea).toEqual({
        id: 0,
        denominacion: '',
      });
    });
  });
});
