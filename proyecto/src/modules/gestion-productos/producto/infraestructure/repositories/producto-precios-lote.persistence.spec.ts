import { DataSource } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { ProductoPersistenceAdapter } from './producto.persistence-adapters';
import { Producto } from '../../domain/entities/producto.entity';
import { HistorialPrecio } from '../../domain/entities/historial-precio.entity';
import { IUnitOfWork } from 'src/modules/common/unit-of-work/iunit-of-work.';
import { Usuario } from 'src/modules/gestion-usuario/usuario/domain/entities/usuario.entity';
import { CreateProductoDto } from '../../dto/create-producto.dto';
import { UpdateProductoDto } from '../../dto/update-producto.dto';
import { Linea } from 'src/modules/gestion-productos/linea/domain/entities/linea.entity';
import { Marca } from 'src/modules/gestion-productos/marca/domain/entities/marca.entity';
import { Presentacion } from '../../domain/value-objects/presentacion.vo';
import { DatabaseConnectionException } from 'src/modules/common/exceptions/database-connection.exception';

/*
  CR-006 — guardarPreciosEnLote corre en una única transacción:
  si falla la escritura de un producto se revierte todo el lote.
  CR-007 — el historial de precios se escribe en la MISMA transacción que el
  precio del producto (alta, edición y actualización masiva): o se guardan
  los dos o ninguno.
*/
const usuario = { id: 3 } as Usuario;

// Base simulada: un repositorio por entidad dentro de la transacción del queryRunner
const armar = (repos: { producto?: object; historial?: object; historialFuera?: object } = {}) => {
  const queryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      getRepository: (entidad: unknown) =>
        entidad === HistorialPrecio ? repos.historial : repos.producto,
    },
  };
  const dataSource = {
    createQueryRunner: () => queryRunner,
    getRepository: () => repos.historialFuera,
  } as unknown as DataSource;
  const adapter = new ProductoPersistenceAdapter({} as any, dataSource, {} as IUnitOfWork);
  return { adapter, queryRunner };
};

describe('ProductoPersistenceAdapter.guardarPreciosEnLote (CR-006 / CR-007)', () => {
  const productos = [10, 11, 12].map((id) =>
    Object.assign(new Producto(), { id, porcentaje: 20, precio: 120 }),
  );
  const historial = [10, 11].map((productoId) =>
    HistorialPrecio.registrar({ productoId, precioAnterior: 100, precioNuevo: 120, motivo: 'Actualización masiva' }),
  );

  it('escribe solo costo, margen, precio y usuario de cada producto y confirma', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const save = jest.fn().mockResolvedValue(undefined);
    const { adapter, queryRunner } = armar({ producto: { update }, historial: { save } });

    await adapter.guardarPreciosEnLote(productos, usuario, historial);

    expect(update).toHaveBeenCalledTimes(3);
    expect(update).toHaveBeenCalledWith(10, { porcentaje: 20, precio: 120, usuarioUpdated: usuario });
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
  });

  it('guarda el historial dentro de la misma transacción, antes del commit', async () => {
    const orden: string[] = [];
    const update = jest.fn(async () => { orden.push('update'); });
    const save = jest.fn(async () => { orden.push('historial'); });
    const { adapter, queryRunner } = armar({ producto: { update }, historial: { save } });
    queryRunner.commitTransaction.mockImplementation(async () => { orden.push('commit'); });

    await adapter.guardarPreciosEnLote(productos, usuario, historial);

    expect(save).toHaveBeenCalledWith(historial);
    expect(orden).toEqual(['update', 'update', 'update', 'historial', 'commit']);
  });

  it('sin cambios de precio no escribe historial', async () => {
    const save = jest.fn();
    const { adapter } = armar({ producto: { update: jest.fn() }, historial: { save } });

    await adapter.guardarPreciosEnLote(productos, usuario, []);

    expect(save).not.toHaveBeenCalled();
  });

  it('si falla un producto, revierte toda la transacción y no escribe historial', async () => {
    const update = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('fallo de base'));
    const save = jest.fn();
    const { adapter, queryRunner } = armar({ producto: { update }, historial: { save } });

    await expect(adapter.guardarPreciosEnLote(productos, usuario, historial)).rejects.toThrow('fallo de base');

    expect(save).not.toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
  });

  it('si falla el historial, también se revierten los precios', async () => {
    const save = jest.fn().mockRejectedValue(new Error('fallo historial'));
    const { adapter, queryRunner } = armar({ producto: { update: jest.fn() }, historial: { save } });

    await expect(adapter.guardarPreciosEnLote(productos, usuario, historial)).rejects.toThrow('fallo historial');

    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
  });
});

describe('ProductoPersistenceAdapter.create — historial del alta (CR-007)', () => {
  const linea = { id: 1 } as Linea;
  const marca = { id: 2 } as Marca;
  const presentacion = Presentacion.crear(1, 'kg');
  const dto = (costo: number | undefined) =>
    ({ denominacion: 'YERBA', costo, porcentaje: 20, presentacion: { cantidad: 1, unidadMedida: 'kg' } }) as CreateProductoDto;

  const repoProducto = () => ({
    create: jest.fn((datos: object) => Object.assign(new Producto(), datos)),
    save: jest.fn(async (p: Producto) => Object.assign(p, { id: 99 })),
  });

  it('con precio: registra el precio inicial (sin precio anterior) en la misma transacción', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const { adapter, queryRunner } = armar({ producto: repoProducto(), historial: { save } });

    await adapter.create(dto(100), linea, marca, usuario, presentacion);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toMatchObject({
      productoId: 99,
      precioAnterior: null,
      precioNuevo: 120,
      motivo: 'Alta de producto',
    });
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
  });

  it('sin costo (precio 0): el alta se hace igual y no registra historial', async () => {
    const save = jest.fn();
    const repo = repoProducto();
    const { adapter, queryRunner } = armar({ producto: repo, historial: { save } });

    const creado = await adapter.create(dto(undefined), linea, marca, usuario, presentacion);

    expect(creado.precio).toBe(0);
    expect(repo.save).toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
  });

  it('si falla el historial, el alta se revierte', async () => {
    const save = jest.fn().mockRejectedValue(new Error('fallo historial'));
    const { adapter, queryRunner } = armar({ producto: repoProducto(), historial: { save } });

    await expect(adapter.create(dto(100), linea, marca, usuario, presentacion)).rejects.toThrow();

    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
  });
});

describe('ProductoPersistenceAdapter.update — historial de la edición (CR-007)', () => {
  const linea = { id: 1 } as Linea;
  const marca = { id: 2 } as Marca;
  const existente = () =>
    Object.assign(new Producto(), { id: 7, denominacion: 'YERBA', costo: 100, porcentaje: 20, precio: 120 });

  const preparar = (actual: Producto, save = jest.fn().mockResolvedValue(undefined)) => {
    const repoProducto = { save: jest.fn(async (p: Producto) => p) };
    const { adapter, queryRunner } = armar({ producto: repoProducto, historial: { save } });
    jest.spyOn(adapter, 'findOne').mockResolvedValue(actual);
    return { adapter, queryRunner, repoProducto, save };
  };

  it('si el precio cambia, registra precio anterior y nuevo', async () => {
    const { adapter, save, queryRunner } = preparar(existente());

    await adapter.update(7, { costo: 200 } as UpdateProductoDto, linea, marca, usuario);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toMatchObject({
      productoId: 7,
      precioAnterior: 120,
      precioNuevo: 240,
      motivo: 'Edición de producto',
    });
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
  });

  it('si se edita algo que no afecta el precio, no registra historial', async () => {
    const { adapter, save } = preparar(existente());

    await adapter.update(7, { observacion: 'nueva' } as UpdateProductoDto, linea, marca, usuario);

    expect(save).not.toHaveBeenCalled();
  });

  it('regla precio > 0: dejar el precio en 0 se rechaza con 400 antes de escribir y se revierte', async () => {
    const { adapter, repoProducto, save, queryRunner } = preparar(existente());

    const error = await adapter
      .update(7, { costo: 0 } as UpdateProductoDto, linea, marca, usuario)
      .catch((e) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.message).toContain('debe ser mayor a 0');
    expect(repoProducto.save).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
  });
});

describe('ProductoPersistenceAdapter.findHistorialPrecios (CR-007)', () => {
  it('filtra por producto y ordena del cambio más reciente al más antiguo', async () => {
    const registros = [new HistorialPrecio()];
    const find = jest.fn().mockResolvedValue(registros);
    const { adapter } = armar({ historialFuera: { find } });

    await expect(adapter.findHistorialPrecios(7)).resolves.toBe(registros);
    expect(find).toHaveBeenCalledWith({
      where: { productoId: 7 },
      order: { fecha: 'DESC', id: 'DESC' },
    });
  });

  it('un error de base se informa como DatabaseConnectionException (500)', async () => {
    const { adapter } = armar({ historialFuera: { find: jest.fn().mockRejectedValue(new Error('down')) } });

    const error = await adapter.findHistorialPrecios(7).catch((e) => e);

    expect(error).toBeInstanceOf(DatabaseConnectionException);
    expect(error.getStatus()).toBe(500);
  });
});
