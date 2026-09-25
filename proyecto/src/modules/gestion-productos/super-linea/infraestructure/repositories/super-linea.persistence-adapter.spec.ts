import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SuperLineaPersistenceAdapter } from './super-linea.persistence-adapter';
import { SuperLinea } from '../../domain/entities/super-linea.entity';
import { Linea } from '../../../linea/domain/entities/linea.entity';
import { Usuario } from 'src/modules/gestion-usuario/usuario/domain/entities/usuario.entity';

/*
  CR-003 — Operaciones transaccionales de SuperLinea.
  @Transactional() necesita this.dataSource: el adapter se resuelve con la
  inyección de Nest para verificar que DataSource llega al constructor.
  Si faltara, create / update / remove fallarían con
  "dataSource no definido en el servicio" antes de tocar la base.
*/
describe('SuperLineaPersistenceAdapter - operaciones transaccionales (CR-003)', () => {
  let adapter: SuperLineaPersistenceAdapter;

  const superLineaRepo = {
    create: jest.fn((data) => ({ ...data })),
    save: jest.fn(async (entity) => ({ id: 1, ...entity })),
    findOne: jest.fn(),
  };
  const lineaRepo = { update: jest.fn() };

  const queryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      getRepository: jest.fn((entity) =>
        entity === Linea ? lineaRepo : superLineaRepo,
      ),
    },
  };
  const dataSource = { createQueryRunner: jest.fn(() => queryRunner) };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        SuperLineaPersistenceAdapter,
        { provide: getRepositoryToken(SuperLinea), useValue: {} },
        { provide: DataSource, useValue: dataSource },
        { provide: 'UnitOfWork', useValue: {} },
      ],
    }).compile();

    adapter = moduleRef.get(SuperLineaPersistenceAdapter);
  });

  const expectTransaccionConfirmada = () => {
    expect(dataSource.createQueryRunner).toHaveBeenCalledTimes(1);
    expect(queryRunner.startTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  };

  it('create guarda la superlínea dentro de una transacción', async () => {
    const creada = await adapter.create({
      denominacion: 'BEBIDAS',
      usuarioCreatedId: 7,
    });

    expect(superLineaRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ denominacion: 'BEBIDAS', usuarioCreatedId: 7 }),
    );
    expect(creada).toMatchObject({ id: 1, denominacion: 'BEBIDAS' });
    expectTransaccionConfirmada();
  });

  it('update modifica la superlínea dentro de una transacción', async () => {
    superLineaRepo.findOne.mockResolvedValue({
      id: 1,
      denominacion: 'BEBIDAS',
      observacion: 'original',
    });

    const actualizada = await adapter.update(1, {
      denominacion: 'BEBIDAS FRIAS',
      usuarioUpdatedId: 7,
      updatedAt: new Date(),
    });

    expect(actualizada).toMatchObject({
      id: 1,
      denominacion: 'BEBIDAS FRIAS',
      observacion: 'original',
      usuarioUpdatedId: 7,
    });
    expectTransaccionConfirmada();
  });

  it('update de una superlínea inexistente revierte la transacción', async () => {
    superLineaRepo.findOne.mockResolvedValue(null);

    await expect(
      adapter.update(99, { usuarioUpdatedId: 7, updatedAt: new Date() }),
    ).rejects.toThrow(NotFoundException);

    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('remove desagrupa sus líneas y da de baja lógica en una transacción', async () => {
    const superLinea = { id: 1, denominacion: 'BEBIDAS' } as SuperLinea;

    const eliminada = await adapter.remove(superLinea, { id: 7 } as Usuario);

    expect(lineaRepo.update).toHaveBeenCalledWith(
      { superLineaId: 1 },
      { superLineaId: null },
    );
    expect(eliminada.deletedAt).toBeInstanceOf(Date);
    expect(eliminada.usuarioDeletedId).toBe(7);
    expect(superLineaRepo.save).toHaveBeenCalledWith(superLinea);
    expectTransaccionConfirmada();
  });
});
