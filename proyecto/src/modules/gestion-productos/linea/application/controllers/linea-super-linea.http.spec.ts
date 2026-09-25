import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { LineaController } from './linea.controller';
import { LineaService } from '../services/linea.service';
import { AuthGuard } from 'src/modules/gestion-usuario/auth/auth.guard';
import { UsuarioService } from 'src/modules/gestion-usuario/usuario/application/services/usuario.service';
import { EntityNotFoundException } from 'src/modules/common/exceptions/entity-notFound-exceptions';
import { PoliticaEliminacionLinea } from '../../domain/services/politica-eliminacion-linea.service';
import { SuperLineaService } from '../../../super-linea/application/services/super-linea.service';

/*
  CR-003 — Gestión de la relación Línea → SuperLínea desde los endpoints de Línea.
  Recorre HTTP → ValidationPipe → controller → LineaService real.
  Se reemplazan el repositorio de Línea, SuperLineaService y la autenticación.
*/
describe('Línea HTTP - agrupación en SuperLínea (CR-003)', () => {
  let app: INestApplication<App>;

  const lineaGuardada = (overrides: object = {}) => ({
    id: 5,
    denominacion: 'GASEOSAS',
    stockMinimo: 0,
    utilizaStockMinimo: false,
    sistema: 0,
    ...overrides,
  });

  const repository = {
    create: jest.fn(),
    update: jest.fn(),
    findOne: jest.fn(),
    findByDenominacionWith: jest.fn(),
    findByDenominacionFiltered: jest.fn(),
  };
  const superLineaService = { findEntityById: jest.fn() };

  const altaValida = (extra: object = {}) => ({
    denominacion: 'gaseosas',
    utilizaStockMinimo: false,
    usuarioCreatedId: 7,
    ...extra,
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [LineaController],
      providers: [
        LineaService,
        { provide: 'ILineaRepository', useValue: repository },
        { provide: PoliticaEliminacionLinea, useValue: {} },
        { provide: UsuarioService, useValue: {} },
        { provide: SuperLineaService, useValue: superLineaService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    // Mismas opciones que main.ts
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
    repository.findByDenominacionWith.mockResolvedValue(null);
    repository.findOne.mockResolvedValue(lineaGuardada());
    repository.create.mockResolvedValue(lineaGuardada());
    repository.update.mockResolvedValue(lineaGuardada());
    superLineaService.findEntityById.mockResolvedValue({ id: 3, denominacion: 'BEBIDAS' });
  });

  describe('POST /linea', () => {
    it('201: crea la línea agrupada en una superlínea existente', async () => {
      await request(app.getHttpServer())
        .post('/linea')
        .send(altaValida({ superLineaId: 3 }))
        .expect(201);

      expect(superLineaService.findEntityById).toHaveBeenCalledWith(3);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ superLineaId: 3 }),
      );
    });

    it('201: crea la línea sin agrupar', async () => {
      await request(app.getHttpServer())
        .post('/linea')
        .send(altaValida())
        .expect(201);

      expect(superLineaService.findEntityById).not.toHaveBeenCalled();
    });

    it('404: la superlínea no existe o fue eliminada', async () => {
      superLineaService.findEntityById.mockRejectedValue(
        new EntityNotFoundException('Entidad no encontrada'),
      );

      await request(app.getHttpServer())
        .post('/linea')
        .send(altaValida({ superLineaId: 999 }))
        .expect(404);

      expect(repository.create).not.toHaveBeenCalled();
    });

    it.each([
      ['string', '3'],
      ['decimal', 3.5],
    ])('400: superLineaId %s', async (_caso, superLineaId) => {
      await request(app.getHttpServer())
        .post('/linea')
        .send(altaValida({ superLineaId }))
        .expect(400);

      expect(superLineaService.findEntityById).not.toHaveBeenCalled();
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('PUT /linea/:id', () => {
    const modificacion = (extra: object = {}) => ({
      utilizaStockMinimo: false,
      usuarioUpdatedId: 7,
      ...extra,
    });

    it('200: reasigna la línea a otra superlínea', async () => {
      await request(app.getHttpServer())
        .put('/linea/5')
        .send(modificacion({ superLineaId: 4 }))
        .expect(200);

      expect(superLineaService.findEntityById).toHaveBeenCalledWith(4);
      expect(repository.update).toHaveBeenCalledWith(
        5,
        expect.objectContaining({ superLineaId: 4 }),
      );
    });

    it('200: desagrupa la línea con superLineaId null', async () => {
      await request(app.getHttpServer())
        .put('/linea/5')
        .send(modificacion({ superLineaId: null }))
        .expect(200);

      expect(superLineaService.findEntityById).not.toHaveBeenCalled();
      expect(repository.update).toHaveBeenCalledWith(
        5,
        expect.objectContaining({ superLineaId: null }),
      );
    });

    it('200: sin superLineaId no se toca la agrupación', async () => {
      await request(app.getHttpServer())
        .put('/linea/5')
        .send(modificacion())
        .expect(200);

      expect(superLineaService.findEntityById).not.toHaveBeenCalled();
      expect(repository.update.mock.calls[0][1]).not.toHaveProperty('superLineaId');
    });

    it('404: la superlínea destino no existe', async () => {
      superLineaService.findEntityById.mockRejectedValue(
        new EntityNotFoundException('Entidad no encontrada'),
      );

      await request(app.getHttpServer())
        .put('/linea/5')
        .send(modificacion({ superLineaId: 999 }))
        .expect(404);

      expect(repository.update).not.toHaveBeenCalled();
    });

    it('403: no permite agrupar una línea de sistema', async () => {
      repository.findOne.mockResolvedValue(lineaGuardada({ sistema: 1 }));

      await request(app.getHttpServer())
        .put('/linea/5')
        .send(modificacion({ superLineaId: 3 }))
        .expect(403);
    });
  });

  describe('GET /linea', () => {
    it('GET /linea/:id expone la superlínea que la agrupa', async () => {
      repository.findOne.mockResolvedValue(
        lineaGuardada({
          superLineaId: 3,
          superLinea: { id: 3, denominacion: 'BEBIDAS' },
        }),
      );

      const res = await request(app.getHttpServer()).get('/linea/5').expect(200);

      expect(res.body.superLinea).toEqual({ id: 3, denominacion: 'BEBIDAS' });
    });

    it('GET /linea/:id devuelve referencia vacía si no está agrupada', async () => {
      const res = await request(app.getHttpServer()).get('/linea/5').expect(200);

      expect(res.body.superLinea).toEqual({ id: 0, denominacion: '' });
    });

    it('GET /linea/search-by incluye la superlínea en cada resultado', async () => {
      repository.findByDenominacionFiltered.mockResolvedValue({
        data: [
          lineaGuardada({ superLinea: { id: 3, denominacion: 'BEBIDAS' } }),
          lineaGuardada({ id: 6, denominacion: 'AGUAS', superLinea: null }),
        ],
        total: 2,
      });

      const res = await request(app.getHttpServer())
        .get('/linea/search-by')
        .query({ skip: 0, take: 10 })
        .expect(200);

      expect(res.body.data.map((l: any) => l.superLinea)).toEqual([
        { id: 3, denominacion: 'BEBIDAS' },
        { id: 0, denominacion: '' },
      ]);
    });
  });
});
