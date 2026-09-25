import { ForbiddenException } from '@nestjs/common';
import { LineaService } from './linea.service';
import { EntityNotFoundException } from 'src/modules/common/exceptions/entity-notFound-exceptions';
import { SuperLineaService } from '../../../super-linea/application/services/super-linea.service';
import { PoliticaEliminacionLinea } from '../../domain/services/politica-eliminacion-linea.service';
import { UsuarioService } from 'src/modules/gestion-usuario/usuario/application/services/usuario.service';
import { ILineaRepository } from '../../domain/interfaces/linea.repository.interface';

/*
  CR-003 — LineaService valida la SuperLínea antes de agrupar.
  undefined / null: la línea queda sin agrupar y no se consulta SuperLínea.
  id: debe existir y estar activa; si no, se corta antes de persistir.
*/
describe('LineaService - agrupación en SuperLínea (CR-003)', () => {
  let service: LineaService;

  const repository = {
    create: jest.fn(),
    update: jest.fn(),
    findOne: jest.fn(),
    findByDenominacionWith: jest.fn(),
  };
  const superLineaService = { findEntityById: jest.fn() };

  const altaDto = (extra: object = {}) =>
    ({
      denominacion: 'GASEOSAS',
      utilizaStockMinimo: false,
      usuarioCreatedId: 7,
      ...extra,
    }) as any;

  const modificacionDto = (extra: object = {}) =>
    ({ utilizaStockMinimo: false, usuarioUpdatedId: 7, ...extra }) as any;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new LineaService(
      repository as unknown as ILineaRepository,
      {} as PoliticaEliminacionLinea,
      {} as UsuarioService,
      superLineaService as unknown as SuperLineaService,
    );

    repository.findByDenominacionWith.mockResolvedValue(null);
    repository.findOne.mockResolvedValue({ id: 5, denominacion: 'GASEOSAS', sistema: 0 });
    repository.create.mockResolvedValue({ id: 5, denominacion: 'GASEOSAS' });
    repository.update.mockResolvedValue({ id: 5, denominacion: 'GASEOSAS' });
    superLineaService.findEntityById.mockResolvedValue({ id: 3, denominacion: 'BEBIDAS' });
  });

  describe('create', () => {
    it('valida que la superlínea exista y crea la línea agrupada', async () => {
      const dto = altaDto({ superLineaId: 3 });

      await service.create(dto);

      expect(superLineaService.findEntityById).toHaveBeenCalledWith(3);
      expect(repository.create).toHaveBeenCalledWith(dto);
    });

    it('crea la línea sin agrupar cuando no se envía superLineaId', async () => {
      await service.create(altaDto());

      expect(superLineaService.findEntityById).not.toHaveBeenCalled();
      expect(repository.create).toHaveBeenCalled();
    });

    it('crea la línea sin agrupar cuando superLineaId es null', async () => {
      await service.create(altaDto({ superLineaId: null }));

      expect(superLineaService.findEntityById).not.toHaveBeenCalled();
      expect(repository.create).toHaveBeenCalled();
    });

    it('no crea la línea si la superlínea no existe o fue eliminada', async () => {
      superLineaService.findEntityById.mockRejectedValue(
        new EntityNotFoundException('Entidad no encontrada'),
      );

      await expect(
        service.create(altaDto({ superLineaId: 999 })),
      ).rejects.toThrow(EntityNotFoundException);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('valida la denominación antes que la superlínea', async () => {
      repository.findByDenominacionWith.mockResolvedValue({ id: 8 });

      await expect(
        service.create(altaDto({ superLineaId: 3 })),
      ).rejects.toThrow('Denominación ya en uso o esta eliminada.');
      expect(superLineaService.findEntityById).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('reasigna la línea a otra superlínea existente', async () => {
      const dto = modificacionDto({ superLineaId: 4 });

      await service.update(5, dto);

      expect(superLineaService.findEntityById).toHaveBeenCalledWith(4);
      expect(repository.update).toHaveBeenCalledWith(5, dto);
    });

    it('desagrupa con superLineaId null sin consultar SuperLínea', async () => {
      const dto = modificacionDto({ superLineaId: null });

      await service.update(5, dto);

      expect(superLineaService.findEntityById).not.toHaveBeenCalled();
      expect(repository.update).toHaveBeenCalledWith(5, dto);
    });

    it('no consulta SuperLínea si no se envía superLineaId', async () => {
      await service.update(5, modificacionDto());

      expect(superLineaService.findEntityById).not.toHaveBeenCalled();
      expect(repository.update).toHaveBeenCalled();
    });

    it('no modifica la línea si la superlínea no existe', async () => {
      superLineaService.findEntityById.mockRejectedValue(
        new EntityNotFoundException('Entidad no encontrada'),
      );

      await expect(
        service.update(5, modificacionDto({ superLineaId: 999 })),
      ).rejects.toThrow(EntityNotFoundException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('no permite agrupar una línea de sistema', async () => {
      repository.findOne.mockResolvedValue({ id: 5, denominacion: 'GENERAL', sistema: 1 });

      await expect(
        service.update(5, modificacionDto({ superLineaId: 3 })),
      ).rejects.toThrow(ForbiddenException);
      expect(superLineaService.findEntityById).not.toHaveBeenCalled();
      expect(repository.update).not.toHaveBeenCalled();
    });
  });
});
