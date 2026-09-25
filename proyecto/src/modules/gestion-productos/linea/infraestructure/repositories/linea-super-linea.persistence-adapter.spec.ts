import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { LineaPersistenceAdapter } from './linea.persistence-adapter';
import { Linea } from '../../domain/entities/linea.entity';

/*
  CR-003 — Persistencia de la agrupación en LineaPersistenceAdapter.
  - create guarda superLineaId (o null si no se envía).
  - update: undefined conserva, null desagrupa, número reasigna.
  - las lecturas hacen join con superLinea para exponer la referencia.
*/
describe('LineaPersistenceAdapter - superLineaId (CR-003)', () => {
  let adapter: LineaPersistenceAdapter;

  const lineaRepo = {
    create: jest.fn((data) => ({ ...data })),
    save: jest.fn(async (entity) => ({ id: 5, ...entity })),
    findOne: jest.fn(),
  };

  const queryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: { getRepository: jest.fn(() => lineaRepo) },
  };
  const dataSource = { createQueryRunner: jest.fn(() => queryRunner) };

  const queryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    withDeleted: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
    getMany: jest.fn(),
    getManyAndCount: jest.fn(),
  };
  const typeormRepository = {
    createQueryBuilder: jest.fn(() => queryBuilder),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        LineaPersistenceAdapter,
        { provide: getRepositoryToken(Linea), useValue: typeormRepository },
        { provide: DataSource, useValue: dataSource },
        { provide: 'UnitOfWork', useValue: {} },
      ],
    }).compile();

    adapter = moduleRef.get(LineaPersistenceAdapter);
  });

  const altaDto = (extra: object = {}) =>
    ({
      denominacion: 'GASEOSAS',
      utilizaStockMinimo: false,
      usuarioCreatedId: 7,
      ...extra,
    }) as any;

  describe('create', () => {
    it('guarda la línea con su superlínea', async () => {
      await adapter.create(altaDto({ superLineaId: 3 }));

      expect(lineaRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ denominacion: 'GASEOSAS', superLineaId: 3 }),
      );
      expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    });

    it('guarda superLineaId null cuando no se envía', async () => {
      await adapter.create(altaDto());

      expect(lineaRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ superLineaId: null }),
      );
    });
  });

  describe('update', () => {
    const lineaAgrupada = () => ({
      id: 5,
      denominacion: 'GASEOSAS',
      utilizaStockMinimo: false,
      stockMinimo: 0,
      superLineaId: 3,
    });

    const modificacionDto = (extra: object = {}) =>
      ({ utilizaStockMinimo: false, usuarioUpdatedId: 7, ...extra }) as any;

    it('conserva la superlínea si no se envía superLineaId', async () => {
      lineaRepo.findOne.mockResolvedValue(lineaAgrupada());

      const actualizada = await adapter.update(5, modificacionDto());

      expect(actualizada.superLineaId).toBe(3);
    });

    it('desagrupa la línea con superLineaId null', async () => {
      lineaRepo.findOne.mockResolvedValue(lineaAgrupada());

      const actualizada = await adapter.update(
        5,
        modificacionDto({ superLineaId: null }),
      );

      expect(actualizada.superLineaId).toBeNull();
    });

    it('reasigna la línea a otra superlínea', async () => {
      lineaRepo.findOne.mockResolvedValue(lineaAgrupada());

      const actualizada = await adapter.update(
        5,
        modificacionDto({ superLineaId: 4 }),
      );

      expect(actualizada.superLineaId).toBe(4);
      expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('lecturas', () => {
    it('findOne carga la superlínea asociada', async () => {
      queryBuilder.getOne.mockResolvedValue({ id: 5, denominacion: 'GASEOSAS' });

      await adapter.findOne(5);

      expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'linea.superLinea',
        'superLinea',
      );
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('linea.id = :id', {
        id: 5,
      });
    });

    it('la búsqueda paginada carga la superlínea asociada', async () => {
      queryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await adapter.findByDenominacionFiltered('GAS', 0, 10, false);

      expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'linea.superLinea',
        'superLinea',
      );
    });
  });
});
