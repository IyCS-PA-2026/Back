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
  CR-004 — GET /producto/search-by con Supertest.
  El filtro de búsqueda es único: el texto de `denominacion`.
  Recorre HTTP → ValidationPipe → NormalizeDenominacionSearchPipe → controller →
  ProductoService real → mapper. Solo se reemplazan el repositorio y la autenticación.
  El OR entre Producto, Línea y SuperLínea se prueba en producto-busqueda.persistence.spec.ts.
*/
describe('Producto HTTP - búsqueda (CR-004)', () => {
  let app: INestApplication<App>;

  const productoEncontrado = () => ({
    id: 10,
    denominacion: 'LECHE ENTERA',
    codigoProveedor: 'L-1',
    alicuotaIva: 21,
    precio: 100,
    stock: 5,
    sistema: 0,
    linea: { id: 3, denominacion: 'LACTEOS' },
    marca: { id: 2, denominacion: 'SERENISIMA' },
    presentacion: Presentacion.crear(1, 'l'),
  });

  const repository = { findBy: jest.fn() };

  // Índices de los argumentos de IProductoRepository.findBy
  const ARG = { denominacion: 0, marcaId: 4, lineaId: 5, proveedorId: 6, conStock: 7, skip: 8, take: 9 };

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
    // Mismas opciones que main.ts (duplicadas, como en producto-presentacion.http.spec.ts)
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
    repository.findBy.mockResolvedValue({ data: [productoEncontrado()], total: 1 });
  });

  const buscar = (query: string) =>
    request(app.getHttpServer()).get(`/producto/search-by?${query}`);

  const argumentos = () => repository.findBy.mock.calls[0];

  describe('filtro único de búsqueda', () => {
    it('200: envía el texto al repositorio y devuelve los productos encontrados', async () => {
      const { body } = await buscar('denominacion=alim').expect(200);

      expect(argumentos()[ARG.denominacion]).toBe('ALIM');
      expect(body.total).toBe(1);
      expect(body.data[0].denominacion).toBe('LECHE ENTERA');
    });

    it('200: el texto se normaliza como en la búsqueda existente (trim y mayúsculas)', async () => {
      await buscar('denominacion=%20limp%20').expect(200);

      expect(argumentos()[ARG.denominacion]).toBe('LIMP');
    });

    it('200: sin coincidencias devuelve data vacía y total 0', async () => {
      repository.findBy.mockResolvedValue({ data: [], total: 0 });

      const { body } = await buscar('denominacion=zzzz').expect(200);

      expect(body).toEqual({ data: [], total: 0 });
    });

    it.each(['linea', 'superLinea', 'superLineaId'])(
      '400: no existe un filtro independiente "%s"',
      async (parametro) => {
        await buscar(`${parametro}=1`).expect(400);

        expect(repository.findBy).not.toHaveBeenCalled();
      },
    );
  });

  describe('compatibilidad', () => {
    it('200: el texto se combina con los filtros existentes y la paginación', async () => {
      await buscar(
        'denominacion=leche&marcaId=2&lineaId=3&proveedorId=7&conStock=true&skip=20&take=5',
      ).expect(200);

      const args = argumentos();
      expect(args[ARG.denominacion]).toBe('LECHE');
      expect(args[ARG.marcaId]).toBe(2);
      expect(args[ARG.lineaId]).toBe(3);
      expect(args[ARG.proveedorId]).toBe(7);
      expect(args[ARG.conStock]).toBe(true);
      expect(args[ARG.skip]).toBe(20);
      expect(args[ARG.take]).toBe(5);
    });

    it('200: sin texto la búsqueda funciona como antes (paginación por defecto)', async () => {
      const { body } = await buscar('').expect(200);

      const args = argumentos();
      expect(args[ARG.denominacion]).toBe('');
      expect(args[ARG.skip]).toBe(0);
      expect(args[ARG.take]).toBe(10);
      expect(body.total).toBe(1);
    });

    it('200: el resultado incluye la presentación de CR-002 y no los campos de pack', async () => {
      const { body } = await buscar('denominacion=alim').expect(200);

      expect(body.data[0].presentacion).toEqual({ cantidad: 1, unidadMedida: 'l' });
      expect(body.data[0]).not.toHaveProperty('utilizaPack');
      expect(body.data[0]).not.toHaveProperty('cantidadPorPack');
    });
  });
});
