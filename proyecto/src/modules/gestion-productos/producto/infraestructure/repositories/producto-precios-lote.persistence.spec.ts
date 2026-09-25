import { DataSource } from 'typeorm';
import { ProductoPersistenceAdapter } from './producto.persistence-adapters';
import { Producto } from '../../domain/entities/producto.entity';
import { IUnitOfWork } from 'src/modules/common/unit-of-work/iunit-of-work.';
import { Usuario } from 'src/modules/gestion-usuario/usuario/domain/entities/usuario.entity';

/*
  CR-006 — guardarPreciosEnLote corre en una única transacción:
  si falla la escritura de un producto se revierte todo el lote.
*/
describe('ProductoPersistenceAdapter.guardarPreciosEnLote (CR-006)', () => {
  const usuario = { id: 3 } as Usuario;
  const productos = [10, 11, 12].map((id) =>
    Object.assign(new Producto(), { id, porcentaje: 20, precio: 120 }),
  );

  const armar = (update: jest.Mock) => {
    const queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: { getRepository: () => ({ update }) },
    };
    const dataSource = { createQueryRunner: () => queryRunner } as unknown as DataSource;
    const adapter = new ProductoPersistenceAdapter(
      {} as any,
      dataSource,
      {} as IUnitOfWork,
    );
    return { adapter, queryRunner };
  };

  it('escribe solo costo, margen, precio y usuario de cada producto y confirma', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const { adapter, queryRunner } = armar(update);

    await adapter.guardarPreciosEnLote(productos, usuario);

    expect(update).toHaveBeenCalledTimes(3);
    expect(update).toHaveBeenCalledWith(10, { porcentaje: 20, precio: 120, usuarioUpdated: usuario });
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
  });

  it('si falla un producto, revierte toda la transacción', async () => {
    const update = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('fallo de base'));
    const { adapter, queryRunner } = armar(update);

    await expect(adapter.guardarPreciosEnLote(productos, usuario)).rejects.toThrow('fallo de base');

    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
  });
});
