import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AuthGuard } from 'src/modules/gestion-usuario/auth/auth.guard';
import { UsuarioValidator } from 'src/modules/common/utils/validation/usuario-validator';
import { ActualizacionMasivaPreciosController } from './actualizacion-masiva-precios.controller';
import { ActualizacionMasivaPreciosService } from '../../domain/services/actualizacion-masiva-precios.service';
import { Producto } from '../../domain/entities/producto.entity';

/*
  CR-006 — POST /productos/actualizacion-masiva-precios con Supertest.
  HTTP → ValidationPipe → controller → service de dominio real → Producto.
  Solo se reemplazan los repositorios y la autenticación.
*/
describe('Productos HTTP - actualización masiva de precios (CR-006)', () => {
  let app: INestApplication<App>;
  const URL = '/productos/actualizacion-masiva-precios';

  const productoRepository = {
    findActivosParaActualizacionPrecio: jest.fn(),
    guardarPreciosEnLote: jest.fn(),
  };
  const lineaRepository = { findOne: jest.fn() };

  const producto = (id: number, costo: number, porcentaje: number) =>
    Object.assign(new Producto(), { id, denominacion: `P${id}`, costo, porcentaje });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ActualizacionMasivaPreciosController],
      providers: [
        ActualizacionMasivaPreciosService,
        { provide: 'IProductoRepository', useValue: productoRepository },
        { provide: 'ILineaRepository', useValue: lineaRepository },
        {
          provide: UsuarioValidator,
          useValue: { validarUsuarioExiste: jest.fn().mockResolvedValue({ id: 3 }) },
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    // Mismas opciones que main.ts
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    lineaRepository.findOne.mockResolvedValue({ id: 1 });
    productoRepository.findActivosParaActualizacionPrecio.mockImplementation(async () => [
      producto(10, 100, 20),
      producto(11, 50, 10),
    ]);
  });

  it('200: responde la cantidad de productos actualizados', async () => {
    const res = await request(app.getHttpServer())
      .post(URL)
      .send({ alcance: 'global', modalidad: 'porcentaje', valor: 10, usuarioId: 3 })
      .expect(200);

    expect(res.body).toEqual({ productosActualizados: 2 });
  });

  it('400: línea inexistente, con el motivo', async () => {
    lineaRepository.findOne.mockResolvedValue(null);

    const res = await request(app.getHttpServer())
      .post(URL)
      .send({ alcance: 'linea', lineaId: 99, modalidad: 'monto', valor: 5, usuarioId: 3 })
      .expect(400);

    expect(res.body.message).toBe('La línea con ID 99 no existe.');
    expect(productoRepository.guardarPreciosEnLote).not.toHaveBeenCalled();
  });

  it('400: un producto inválido cancela la operación', async () => {
    const res = await request(app.getHttpServer())
      .post(URL)
      .send({ alcance: 'global', modalidad: 'monto', valor: -60, usuarioId: 3 })
      .expect(400);

    expect(res.body.message).toContain('P11');
    expect(productoRepository.guardarPreciosEnLote).not.toHaveBeenCalled();
  });

  it.each([
    ['alcance linea sin lineaId', { alcance: 'linea', modalidad: 'monto', valor: 5, usuarioId: 3 }],
    ['alcance inválido', { alcance: 'marca', modalidad: 'monto', valor: 5, usuarioId: 3 }],
    ['modalidad inválida', { alcance: 'global', modalidad: 'fijo', valor: 5, usuarioId: 3 }],
    ['valor como texto', { alcance: 'global', modalidad: 'monto', valor: '5', usuarioId: 3 }],
    ['sin valor', { alcance: 'global', modalidad: 'monto', usuarioId: 3 }],
    ['sin usuario', { alcance: 'global', modalidad: 'monto', valor: 5 }],
    ['precio enviado a mano', { alcance: 'global', modalidad: 'monto', valor: 5, usuarioId: 3, precio: 100 }],
  ])('400: DTO inválido (%s)', async (_caso, body) => {
    await request(app.getHttpServer()).post(URL).send(body).expect(400);

    expect(productoRepository.findActivosParaActualizacionPrecio).not.toHaveBeenCalled();
    expect(productoRepository.guardarPreciosEnLote).not.toHaveBeenCalled();
  });
});
