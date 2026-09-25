import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SuperLineaService } from './super-linea.service';
import { UsuarioService } from 'src/modules/gestion-usuario/usuario/application/services/usuario.service';
import { EntityNotFoundException } from 'src/modules/common/exceptions/entity-notFound-exceptions';
import { SuperLinea } from '../../domain/entities/super-linea.entity';

/*
  CR-003 — Casos de uso de SuperLinea.
  Se usa el servicio real; se reemplazan el repositorio y UsuarioService.
*/
describe('SuperLineaService (CR-003)', () => {
  let service: SuperLineaService;

  const repository = {
    create: jest.fn(),
    update: jest.fn(),
    findOne: jest.fn(),
    findByDenominacionWith: jest.fn(),
    findByDenominacionFiltered: jest.fn(),
    findByIdConAuditoria: jest.fn(),
    findAllListado: jest.fn(),
    remove: jest.fn(),
  };
  const usuarioService = { findOne: jest.fn() };

  const superLinea = (overrides: Partial<SuperLinea> = {}) =>
    ({ id: 1, denominacion: 'BEBIDAS', sistema: 0, ...overrides }) as SuperLinea;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        SuperLineaService,
        { provide: 'ISuperLineaRepository', useValue: repository },
        { provide: UsuarioService, useValue: usuarioService },
      ],
    }).compile();

    service = moduleRef.get(SuperLineaService);
  });

  describe('create', () => {
    const dto = { denominacion: 'BEBIDAS', usuarioCreatedId: 7 };

    it('crea la superlínea cuando la denominación está libre', async () => {
      repository.findByDenominacionWith.mockResolvedValue(null);
      repository.create.mockResolvedValue(superLinea());

      const resultado = await service.create(dto);

      expect(repository.findByDenominacionWith).toHaveBeenCalledWith('BEBIDAS');
      expect(repository.create).toHaveBeenCalledWith(dto);
      expect(resultado).toEqual({
        mensaje: 'SuperLinea creada con éxito con denominacion: BEBIDAS',
      });
    });

    it('rechaza una denominación en uso por otra superlínea activa', async () => {
      repository.findByDenominacionWith.mockResolvedValue(superLinea({ id: 5 }));

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('rechaza la denominación de una superlínea eliminada', async () => {
      repository.findByDenominacionWith.mockResolvedValue(
        superLinea({ id: 5, deletedAt: new Date() }),
      );

      await expect(service.create(dto)).rejects.toThrow(
        'Denominación ya en uso o esta eliminada.',
      );
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('renombra la superlínea', async () => {
      repository.findOne.mockResolvedValue(superLinea());
      repository.findByDenominacionWith.mockResolvedValue(null);
      repository.update.mockResolvedValue(
        superLinea({ denominacion: 'BEBIDAS FRIAS' }),
      );

      const dto = { denominacion: 'BEBIDAS FRIAS', usuarioUpdatedId: 7 } as any;
      const resultado = await service.update(1, dto);

      expect(repository.update).toHaveBeenCalledWith(1, dto);
      expect(resultado.mensaje).toBe(
        'SuperLinea editada con éxito con denominacion: BEBIDAS FRIAS',
      );
    });

    it('permite conservar su propia denominación', async () => {
      repository.findOne.mockResolvedValue(superLinea());
      repository.findByDenominacionWith.mockResolvedValue(superLinea());
      repository.update.mockResolvedValue(superLinea());

      await expect(
        service.update(1, { denominacion: 'BEBIDAS', usuarioUpdatedId: 7 } as any),
      ).resolves.toBeDefined();
    });

    it('no valida la denominación si no se modifica', async () => {
      repository.findOne.mockResolvedValue(superLinea());
      repository.update.mockResolvedValue(superLinea());

      await service.update(1, { observacion: 'nueva', usuarioUpdatedId: 7 } as any);

      expect(repository.findByDenominacionWith).not.toHaveBeenCalled();
      expect(repository.update).toHaveBeenCalled();
    });

    it('rechaza una denominación en uso por otra superlínea', async () => {
      repository.findOne.mockResolvedValue(superLinea());
      repository.findByDenominacionWith.mockResolvedValue(superLinea({ id: 2 }));

      await expect(
        service.update(1, { denominacion: 'SNACKS', usuarioUpdatedId: 7 } as any),
      ).rejects.toThrow(ConflictException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('rechaza modificar una superlínea de sistema', async () => {
      repository.findOne.mockResolvedValue(superLinea({ sistema: 1 }));

      await expect(
        service.update(1, { denominacion: 'OTRA', usuarioUpdatedId: 7 } as any),
      ).rejects.toThrow(ForbiddenException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('rechaza modificar una superlínea inexistente', async () => {
      repository.findOne.mockRejectedValue(
        new EntityNotFoundException('Entidad no encontrada'),
      );

      await expect(
        service.update(99, { usuarioUpdatedId: 7 } as any),
      ).rejects.toThrow(EntityNotFoundException);
      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('elimina la superlínea sin depender de las líneas que agrupe', async () => {
      const entity = superLinea();
      const usuario = { id: 7 };
      repository.findOne.mockResolvedValue(entity);
      usuarioService.findOne.mockResolvedValue(usuario);

      const resultado = await service.remove(1, 7);

      expect(repository.remove).toHaveBeenCalledWith(entity, usuario);
      expect(resultado.mensaje).toBe(
        'SuperLinea eliminada con éxito con denominacion: BEBIDAS',
      );
    });

    it('rechaza eliminar una superlínea de sistema', async () => {
      repository.findOne.mockResolvedValue(superLinea({ sistema: 1 }));

      await expect(service.remove(1, 7)).rejects.toThrow(ForbiddenException);
      expect(repository.remove).not.toHaveBeenCalled();
    });

    it('rechaza la baja si el usuario no existe', async () => {
      repository.findOne.mockResolvedValue(superLinea());
      usuarioService.findOne.mockResolvedValue(null);

      await expect(service.remove(1, 99)).rejects.toThrow(NotFoundException);
      expect(repository.remove).not.toHaveBeenCalled();
    });

    it('rechaza eliminar una superlínea inexistente', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.remove(99, 7)).rejects.toThrow(NotFoundException);
      expect(repository.remove).not.toHaveBeenCalled();
    });
  });

  describe('consultas', () => {
    it('busca por denominación con paginación y devuelve DTOs', async () => {
      repository.findByDenominacionFiltered.mockResolvedValue({
        data: [superLinea(), superLinea({ id: 2, denominacion: 'BEBIDAS FRIAS' })],
        total: 2,
      });

      const resultado = await service.findByDenominacionFiltered(
        'BEB',
        0,
        10,
        false,
      );

      expect(repository.findByDenominacionFiltered).toHaveBeenCalledWith(
        'BEB',
        0,
        10,
        false,
      );
      expect(resultado.total).toBe(2);
      expect(resultado.data.map((d) => d.denominacion)).toEqual([
        'BEBIDAS',
        'BEBIDAS FRIAS',
      ]);
    });

    it('devuelve el DTO de una superlínea por id', async () => {
      repository.findOne.mockResolvedValue(superLinea());

      await expect(service.findDtoById(1)).resolves.toEqual({
        id: 1,
        denominacion: 'BEBIDAS',
        observacion: '',
        sistema: 0,
        deletedAt: null,
      });
    });

    it('findEntityById lanza NotFound si no existe', async () => {
      repository.findOne.mockResolvedValue(null);
      await expect(service.findEntityById(99)).rejects.toThrow(NotFoundException);
    });

    it('devuelve la auditoría', async () => {
      const auditoria = { id: 1, detalle: 'superlínea BEBIDAS' };
      repository.findByIdConAuditoria.mockResolvedValue(auditoria);

      await expect(service.findByIdConAuditoria(1)).resolves.toBe(auditoria);
    });

    it('lanza NotFound si no hay auditoría', async () => {
      repository.findByIdConAuditoria.mockResolvedValue(null);
      await expect(service.findByIdConAuditoria(99)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
