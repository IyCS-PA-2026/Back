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
import { ProductoIntrinsicValidationService } from '../../domain/services/producto-intrinsic-validation.service.ts';
import { ProductoValidationService } from '../../domain/services/producto-validation.service.ts';
import { ProductoRelatedEntitiesValidator } from '../../infraestructure/validators/producto-related-entities.validator.ts';
import { ProductoUniquenessValidator } from '../../infraestructure/validators/producto-uniqueness.validator.ts';
import { ProductoDeletePolicy } from '../policies/producto-delete.policy';
import { Presentacion } from '../../domain/value-objects/presentacion.vo';

/*
  CR-002 — Endpoints de Producto con Supertest.
  Recorre HTTP → ValidationPipe → controller → ProductoService real → VO Presentacion.
  Solo se reemplazan la persistencia, los validadores con base de datos y la autenticación.
*/
describe('Producto HTTP - presentación (CR-002)', () => {
  let app: INestApplication<App>;

  const linea = { id: 1, sistema: 0 };
  const marca = { id: 2, sistema: 0 };
  const usuario = { id: 3 };

  const productoGuardado = () => ({
    id: 10,
    denominacion: 'ACEITE GIRASOL',
    lineaId: linea.id,
    marcaId: marca.id,
    alicuotaIva: 21,
    stock: 0,
    sistema: 0,
    linea: { ...linea, denominacion: 'aceites' },
    marca: { ...marca, denominacion: 'natura' },
    presentacion: Presentacion.crear(1.5, 'l'),
  });

  const repository = {
    create: jest.fn(),
    update: jest.fn(),
    findOne: jest.fn(),
  };

  const bodyValido = () => ({
    denominacion: 'aceite girasol',
    lineaId: linea.id,
    marcaId: marca.id,
    alicuotaIva: 21,
    utilizaStockMinimo: false,
    costo: 100,
    porcentaje: 20,
    usuarioCreatedId: usuario.id,
    presentacion: { cantidad: 1.5, unidadMedida: 'l' },
  });

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
        {
          provide: ProductoRelatedEntitiesValidator,
          useValue: {
            validarYObtenerEntidadesRelacionadas: jest
              .fn()
              .mockResolvedValue({ linea, marca }),
          },
        },
        {
          provide: ProductoUniquenessValidator,
          useValue: {
            validarDenominacionUnica: jest.fn(),
            validarCodigoProveedorUnico: jest.fn(),
          },
        },
        {
          provide: UsuarioValidator,
          useValue: { validarUsuarioExiste: jest.fn().mockResolvedValue(usuario) },
        },
        { provide: ProductoDeletePolicy, useValue: {} },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    // Mismas opciones que main.ts (duplicadas: ver deuda técnica en docs/CR-002-presentacion.md)
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    repository.create.mockResolvedValue(productoGuardado());
    repository.update.mockResolvedValue(productoGuardado());
    repository.findOne.mockResolvedValue(productoGuardado());
  });

  describe('POST /producto', () => {
    it('201: crea el producto con su presentación', async () => {
      await request(app.getHttpServer())
        .post('/producto')
        .send(bodyValido())
        .expect(201);

      const presentacion = repository.create.mock.calls[0][4];
      expect(presentacion).toBeInstanceOf(Presentacion);
      expect(presentacion.equals(Presentacion.crear(1.5, 'l'))).toBe(true);
    });

    it.each([
      ['costo negativo', { costo: -1 }],
      ['margen negativo', { porcentaje: -5 }],
      ['margen mayor al máximo', { porcentaje: 1000 }],
    ])('400: %s', async (_caso, extra) => {
      await request(app.getHttpServer())
        .post('/producto')
        .send({ ...bodyValido(), ...extra })
        .expect(400);

      expect(repository.create).not.toHaveBeenCalled();
    });

    it('201: conserva la unidad de medida sin normalizar', async () => {
      await request(app.getHttpServer())
        .post('/producto')
        .send({ ...bodyValido(), presentacion: { cantidad: 12, unidadMedida: 'Unidades' } })
        .expect(201);

      expect(repository.create.mock.calls[0][4].unidadMedida).toBe('Unidades');
    });

    it.each([
      ['sin presentación', undefined],
      ['presentación null', null],
      ['presentación no objeto', '1 kg'],
      ['sin cantidad', { unidadMedida: 'kg' }],
      ['cantidad 0', { cantidad: 0, unidadMedida: 'kg' }],
      ['cantidad negativa', { cantidad: -1, unidadMedida: 'kg' }],
      ['cantidad con 4 decimales', { cantidad: 1.2345, unidadMedida: 'kg' }],
      ['cantidad como texto', { cantidad: '1', unidadMedida: 'kg' }],
      ['sin unidad de medida', { cantidad: 1 }],
      ['unidad de medida vacía', { cantidad: 1, unidadMedida: '' }],
      ['unidad de medida con solo espacios', { cantidad: 1, unidadMedida: '   ' }],
      ['campo extra en presentación', { cantidad: 1, unidadMedida: 'kg', tipo: 'pack' }],
    ])('400: %s', async (_caso, presentacion) => {
      await request(app.getHttpServer())
        .post('/producto')
        .send({ ...bodyValido(), presentacion })
        .expect(400);

      expect(repository.create).not.toHaveBeenCalled();
    });

    it.each([
      ['utilizaPack', { utilizaPack: true }],
      ['cantidadPorPack', { cantidadPorPack: 6 }],
      // CR-006: el precio se deriva de costo y margen, no se carga
      ['precio', { precio: 150 }],
    ])('400: rechaza el campo eliminado %s', async (_campo, extra) => {
      await request(app.getHttpServer())
        .post('/producto')
        .send({ ...bodyValido(), ...extra })
        .expect(400);

      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('PUT /producto/:id', () => {
    it('200: sin presentación conserva la actual', async () => {
      await request(app.getHttpServer())
        .put('/producto/10')
        .send({ denominacion: 'aceite girasol', usuarioUpdatedId: usuario.id })
        .expect(200);

      expect(repository.update.mock.calls[0][5]).toBeUndefined();
    });

    it('200: con presentación completa la reemplaza', async () => {
      await request(app.getHttpServer())
        .put('/producto/10')
        .send({
          denominacion: 'aceite girasol',
          usuarioUpdatedId: usuario.id,
          presentacion: { cantidad: 900, unidadMedida: 'ml' },
        })
        .expect(200);

      expect(
        repository.update.mock.calls[0][5].equals(Presentacion.crear(900, 'ml')),
      ).toBe(true);
    });

    it.each([
      ['parcial (solo cantidad)', { cantidad: 2 }],
      ['parcial (solo unidad)', { unidadMedida: 'kg' }],
      ['cantidad 0', { cantidad: 0, unidadMedida: 'kg' }],
      ['unidad vacía', { cantidad: 2, unidadMedida: ' ' }],
    ])('400: presentación %s', async (_caso, presentacion) => {
      await request(app.getHttpServer())
        .put('/producto/10')
        .send({
          denominacion: 'aceite girasol',
          usuarioUpdatedId: usuario.id,
          presentacion,
        })
        .expect(400);

      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe('GET /producto/:id', () => {
    it('200: responde la presentación y no los campos de pack', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/producto/10')
        .expect(200);

      expect(body.presentacion).toEqual({ cantidad: 1.5, unidadMedida: 'l' });
      expect(body).not.toHaveProperty('utilizaPack');
      expect(body).not.toHaveProperty('cantidadPorPack');
    });
  });
});
