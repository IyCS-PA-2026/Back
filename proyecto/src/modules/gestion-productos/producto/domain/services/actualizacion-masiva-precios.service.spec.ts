import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UsuarioValidator } from 'src/modules/common/utils/validation/usuario-validator';
import { EntityNotFoundException } from 'src/modules/common/exceptions/entity-notFound-exceptions';
import { Producto } from '../entities/producto.entity';
import { ActualizacionMasivaPreciosService } from './actualizacion-masiva-precios.service';
import { ActualizacionMasivaPreciosDto } from '../../dto/actualizacion-masiva-precios.dto';
import {
  AlcanceActualizacionPrecios,
  ModalidadActualizacionPrecios,
} from '../../enums/actualizacion-masiva-precios.enum';

/*
  CR-006 — Actualización masiva de precios.
  El repositorio falso simula la base: cada lectura devuelve copias nuevas y solo
  guardarPreciosEnLote modifica lo "persistido".
*/
describe('ActualizacionMasivaPreciosService (CR-006)', () => {
  let service: ActualizacionMasivaPreciosService;
  let base: Map<number, { lineaId: number; denominacion: string; costo: number | undefined; porcentaje: number; precio: number }>;

  const usuario = { id: 3 };
  const LINEA_ACEITES = 1;
  const LINEA_HARINAS = 2;

  const aProducto = (id: number): Producto =>
    Object.assign(new Producto(), { id, ...base.get(id) });

  const productoRepository = {
    findActivosParaActualizacionPrecio: jest.fn(async (lineaId?: number) =>
      [...base.entries()]
        .filter(([, p]) => lineaId === undefined || p.lineaId === lineaId)
        .map(([id]) => aProducto(id)),
    ),
    guardarPreciosEnLote: jest.fn(async (productos: Producto[], _usuario: unknown) => {
      for (const p of productos) {
        base.set(p.id, { ...base.get(p.id)!, costo: p.costo, porcentaje: p.porcentaje!, precio: p.precio! });
      }
    }),
  };
  const lineaRepository = {
    findOne: jest.fn(async (id: number) =>
      [LINEA_ACEITES, LINEA_HARINAS].includes(id) ? { id } : null,
    ),
  };
  const usuarioValidator = {
    validarUsuarioExiste: jest.fn().mockResolvedValue(usuario),
  };

  const dto = (parcial: Partial<ActualizacionMasivaPreciosDto>) =>
    ({ usuarioId: usuario.id, ...parcial }) as ActualizacionMasivaPreciosDto;

  const snapshot = () => JSON.parse(JSON.stringify([...base.entries()]));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ActualizacionMasivaPreciosService,
        { provide: 'IProductoRepository', useValue: productoRepository },
        { provide: 'ILineaRepository', useValue: lineaRepository },
        { provide: UsuarioValidator, useValue: usuarioValidator },
      ],
    }).compile();
    service = moduleRef.get(ActualizacionMasivaPreciosService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    base = new Map([
      [10, { lineaId: LINEA_ACEITES, denominacion: 'ACEITE GIRASOL', costo: 100, porcentaje: 20, precio: 120 }],
      [11, { lineaId: LINEA_ACEITES, denominacion: 'ACEITE OLIVA', costo: 200, porcentaje: 50, precio: 300 }],
      [12, { lineaId: LINEA_HARINAS, denominacion: 'HARINA 000', costo: 50, porcentaje: 10, precio: 55 }],
    ]);
  });

  it('por porcentaje global: el valor pasa a ser el margen de todos los productos y se recalcula el precio', async () => {
    const resultado = await service.ejecutar(
      dto({ alcance: AlcanceActualizacionPrecios.GLOBAL, modalidad: ModalidadActualizacionPrecios.PORCENTAJE, valor: 30 }),
    );

    expect(resultado).toEqual({ productosActualizados: 3 });
    expect(productoRepository.findActivosParaActualizacionPrecio).toHaveBeenCalledWith(undefined);
    expect(base.get(10)).toMatchObject({ costo: 100, porcentaje: 30, precio: 130 });
    expect(base.get(11)).toMatchObject({ costo: 200, porcentaje: 30, precio: 260 });
    expect(base.get(12)).toMatchObject({ costo: 50, porcentaje: 30, precio: 65 });
  });

  it('por monto en una línea: suma el monto al costo, conserva el margen y solo toca esa línea', async () => {
    const resultado = await service.ejecutar(
      dto({ alcance: AlcanceActualizacionPrecios.LINEA, lineaId: LINEA_ACEITES, modalidad: ModalidadActualizacionPrecios.MONTO, valor: 50 }),
    );

    expect(resultado).toEqual({ productosActualizados: 2 });
    expect(base.get(10)).toMatchObject({ costo: 150, porcentaje: 20, precio: 180 });
    expect(base.get(11)).toMatchObject({ costo: 250, porcentaje: 50, precio: 375 });
    expect(base.get(12)).toMatchObject({ costo: 50, porcentaje: 10, precio: 55 });
  });

  it('por porcentaje con margen negativo: rechaza y ningún producto cambia', async () => {
    const antes = snapshot();

    await expect(
      service.ejecutar(dto({ alcance: AlcanceActualizacionPrecios.GLOBAL, modalidad: ModalidadActualizacionPrecios.PORCENTAJE, valor: -5 })),
    ).rejects.toThrow('no puede ser negativo');

    expect(productoRepository.guardarPreciosEnLote).not.toHaveBeenCalled();
    expect(snapshot()).toEqual(antes);
  });

  it('línea inexistente: rechaza sin buscar ni tocar productos', async () => {
    const antes = snapshot();

    await expect(
      service.ejecutar(
        dto({ alcance: AlcanceActualizacionPrecios.LINEA, lineaId: 999, modalidad: ModalidadActualizacionPrecios.MONTO, valor: 5 }),
      ),
    ).rejects.toThrow(new BadRequestException('La línea con ID 999 no existe.'));

    expect(productoRepository.findActivosParaActualizacionPrecio).not.toHaveBeenCalled();
    expect(productoRepository.guardarPreciosEnLote).not.toHaveBeenCalled();
    expect(snapshot()).toEqual(antes);
  });

  it('línea inexistente cuando el repositorio lanza EntityNotFoundException: responde 400, no 404', async () => {
    lineaRepository.findOne.mockRejectedValueOnce(new EntityNotFoundException('Entidad no encontrada'));

    await expect(
      service.ejecutar(
        dto({ alcance: AlcanceActualizacionPrecios.LINEA, lineaId: 999, modalidad: ModalidadActualizacionPrecios.MONTO, valor: 5 }),
      ),
    ).rejects.toThrow(new BadRequestException('La línea con ID 999 no existe.'));

    expect(productoRepository.guardarPreciosEnLote).not.toHaveBeenCalled();
  });

  it('un producto queda con costo negativo: rechaza TODA la operación y ningún producto cambia', async () => {
    const antes = snapshot();

    // -60 al costo: 100→40 y 200→140 serían válidos, pero 50→-10 no
    const error = await service
      .ejecutar(dto({ alcance: AlcanceActualizacionPrecios.GLOBAL, modalidad: ModalidadActualizacionPrecios.MONTO, valor: -60 }))
      .catch((e) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.message).toContain('HARINA 000');
    expect(error.message).toContain('no se modificó ningún producto');
    expect(productoRepository.guardarPreciosEnLote).not.toHaveBeenCalled();
    expect(snapshot()).toEqual(antes);
  });

  it('un producto sin costo: rechaza TODA la operación', async () => {
    base.set(13, { lineaId: LINEA_HARINAS, denominacion: 'HARINA 0000', costo: undefined, porcentaje: 10, precio: 0 });
    const antes = snapshot();

    await expect(
      service.ejecutar(dto({ alcance: AlcanceActualizacionPrecios.GLOBAL, modalidad: ModalidadActualizacionPrecios.PORCENTAJE, valor: 10 })),
    ).rejects.toThrow('HARINA 0000');

    expect(productoRepository.guardarPreciosEnLote).not.toHaveBeenCalled();
    expect(snapshot()).toEqual(antes);
  });

  it('el precio persistido es el que deriva Producto.calcularPrecio()', async () => {
    const calcularPrecio = jest.spyOn(Producto.prototype, 'calcularPrecio');

    await service.ejecutar(
      dto({ alcance: AlcanceActualizacionPrecios.GLOBAL, modalidad: ModalidadActualizacionPrecios.PORCENTAJE, valor: 10 }),
    );

    expect(calcularPrecio).toHaveBeenCalledTimes(3);
    const guardados: Producto[] = productoRepository.guardarPreciosEnLote.mock.calls[0][0];
    for (const p of guardados) {
      expect(p.precio).toBe(p.calcularPrecio());
    }
    expect(productoRepository.guardarPreciosEnLote.mock.calls[0][1]).toBe(usuario);
    calcularPrecio.mockRestore();
  });
});
