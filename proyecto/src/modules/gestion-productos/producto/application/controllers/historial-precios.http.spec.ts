import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { ProductoController } from './producto.controller';
import { ProductoService } from '../services/producto.service';
import { AuthGuard } from 'src/modules/gestion-usuario/auth/auth.guard';
import { LineaService } from 'src/modules/gestion-productos/linea/application/services/linea.service';
import { MarcaService } from 'src/modules/gestion-productos/marca/application/services/marca.service';
import { ProveedorService } from 'src/modules/organizacion/proveedor/application/services/proveedor.service';
import { UsuarioService } from 'src/modules/gestion-usuario/usuario/application/services/usuario.service';
import { UsuarioValidator } from 'src/modules/common/utils/validation/usuario-validator';
import { EntityNotFoundException } from 'src/modules/common/exceptions/entity-notFound-exceptions';
import { ProductoIntrinsicValidationService } from '../../domain/services/producto-intrinsic-validation.service.ts';
import { ProductoValidationService } from '../../domain/services/producto-validation.service.ts';
import { ProductoRelatedEntitiesValidator } from '../../infraestructure/validators/producto-related-entities.validator.ts';
import { ProductoUniquenessValidator } from '../../infraestructure/validators/producto-uniqueness.validator.ts';
import { ProductoDeletePolicy } from '../policies/producto-delete.policy';
import { Producto } from '../../domain/entities/producto.entity';
import { HistorialPrecio } from '../../domain/entities/historial-precio.entity';

/*
  CR-007 — GET /producto/:id/historial-precios con Supertest.
  HTTP → controller → ProductoService real → mapper. Solo se reemplazan la
  persistencia y la autenticación.
*/
describe('Producto HTTP - historial de precios (CR-007)', () => {
  let app: INestApplication<App>;

  const repository = {
    findOne: jest.fn(),
    findHistorialPrecios: jest.fn(),
  };

  const registro = (id: number, precioAnterior: number | null, precioNuevo: number, fecha: string, motivo: string) =>
    Object.assign(
      HistorialPrecio.registrar({ productoId: 10, precioAnterior, precioNuevo, motivo, fecha: new Date(fecha) }),
      // La relación no debe filtrarse a la respuesta
      { id, producto: Object.assign(new Producto(), { id: 10, costo: 100 }) },
    );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProductoController],
      providers: [
        ProductoService,
        ProductoIntrinsicValidationService,
        ProductoValidationService,
        { provide: 'IProductoRepository', useValue: repository },
        { provide: LineaService, useValue: {} },
        { provide: MarcaService, useValue: {} },
        { provide: ProveedorService, useValue: {} },
        { provide: UsuarioService, useValue: {} },
        { provide: ProductoRelatedEntitiesValidator, useValue: {} },
        { provide: ProductoUniquenessValidator, useValue: {} },
        { provide: UsuarioValidator, useValue: {} },
        { provide: ProductoDeletePolicy, useValue: {} },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
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
    repository.findOne.mockResolvedValue(Object.assign(new Producto(), { id: 10 }));
  });

  it('200: responde los cambios del producto con los campos del CR, en el orden del repositorio', async () => {
    repository.findHistorialPrecios.mockResolvedValue([
      registro(2, 120, 130, '2026-09-25T15:00:00.000Z', 'Actualización masiva por porcentaje: margen 30% (global)'),
      registro(1, null, 120, '2026-09-20T10:00:00.000Z', 'Alta de producto'),
    ]);

    const { body } = await request(app.getHttpServer())
      .get('/producto/10/historial-precios')
      .expect(200);

    expect(repository.findHistorialPrecios).toHaveBeenCalledWith(10);
    expect(body).toEqual([
      {
        id: 2,
        productoId: 10,
        precioAnterior: 120,
        precioNuevo: 130,
        fecha: '2026-09-25T15:00:00.000Z',
        motivo: 'Actualización masiva por porcentaje: margen 30% (global)',
      },
      {
        id: 1,
        productoId: 10,
        precioAnterior: null,
        precioNuevo: 120,
        fecha: '2026-09-20T10:00:00.000Z',
        motivo: 'Alta de producto',
      },
    ]);
  });

  it('200: producto sin cambios de precio responde lista vacía', async () => {
    repository.findHistorialPrecios.mockResolvedValue([]);

    const { body } = await request(app.getHttpServer())
      .get('/producto/10/historial-precios')
      .expect(200);

    expect(body).toEqual([]);
  });

  it('404: producto inexistente o eliminado, sin consultar el historial', async () => {
    repository.findOne.mockRejectedValue(new EntityNotFoundException('Entidad no encontrada.'));

    await request(app.getHttpServer())
      .get('/producto/999/historial-precios')
      .expect(404);

    expect(repository.findHistorialPrecios).not.toHaveBeenCalled();
  });

  it('400: id no numérico', async () => {
    await request(app.getHttpServer())
      .get('/producto/abc/historial-precios')
      .expect(400);

    expect(repository.findOne).not.toHaveBeenCalled();
  });

  it('no existe un endpoint para cargar historial a mano: solo lo genera el cambio de precio', async () => {
    await request(app.getHttpServer())
      .post('/producto/10/historial-precios')
      .send({ precioNuevo: 100, motivo: 'manual' })
      .expect(404);
  });
});
