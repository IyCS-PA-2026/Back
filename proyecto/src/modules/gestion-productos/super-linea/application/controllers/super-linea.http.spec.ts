import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { SuperLineaController } from './super-linea.controller';
import { SuperLineaService } from '../services/super-linea.service';
import { AuthGuard } from 'src/modules/gestion-usuario/auth/auth.guard';
import { UsuarioService } from 'src/modules/gestion-usuario/usuario/application/services/usuario.service';
import { EntityNotFoundException } from 'src/modules/common/exceptions/entity-notFound-exceptions';

/*
  CR-003 — Endpoints de SuperLinea con Supertest.
  Recorre HTTP → ValidationPipe → pipes de denominación → controller →
  SuperLineaService real. Solo se reemplazan el repositorio, UsuarioService
  y la autenticación.
*/
describe('SuperLinea HTTP (CR-003)', () => {
  let app: INestApplication<App>;

  const superLinea = (overrides: object = {}) => ({
    id: 1,
    denominacion: 'BEBIDAS',
    observacion: 'gaseosas y aguas',
    sistema: 0,
    ...overrides,
  });

  const repository = {
    create: jest.fn(),
    update: jest.fn(),
    findOne: jest.fn(),
    findByDenominacionWith: jest.fn(),
    findByDenominacionFiltered: jest.fn(),
    findByIdConAuditoria: jest.fn(),
    findAllListado: jest.fn(),
    remove: jest.fn(),
  };
  const usuarioService = { findOne: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SuperLineaController],
      providers: [
        SuperLineaService,
        { provide: 'ISuperLineaRepository', useValue: repository },
        { provide: UsuarioService, useValue: usuarioService },
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
    repository.findOne.mockResolvedValue(superLinea());
    repository.create.mockResolvedValue(superLinea());
    repository.update.mockResolvedValue(superLinea());
    usuarioService.findOne.mockResolvedValue({ id: 7 });
  });

  describe('POST /super-linea', () => {
    it('201: crea la superlínea y guarda la denominación normalizada en mayúsculas', async () => {
      const res = await request(app.getHttpServer())
        .post('/super-linea')
        .send({ denominacion: '  Bebidas  ', usuarioCreatedId: 7 })
        .expect(201);

      expect(res.body).toEqual({
        mensaje: 'SuperLinea creada con éxito con denominacion: BEBIDAS',
      });
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ denominacion: 'BEBIDAS', usuarioCreatedId: 7 }),
      );
    });

    it('409: rechaza una denominación ya existente', async () => {
      repository.findByDenominacionWith.mockResolvedValue(superLinea({ id: 2 }));

      await request(app.getHttpServer())
        .post('/super-linea')
        .send({ denominacion: 'bebidas', usuarioCreatedId: 7 })
        .expect(409);

      expect(repository.create).not.toHaveBeenCalled();
    });

    it.each([
      ['denominación vacía', { denominacion: '', usuarioCreatedId: 7 }],
      ['sin usuarioCreatedId', { denominacion: 'bebidas' }],
      ['caracteres inválidos', { denominacion: 'beb#das', usuarioCreatedId: 7 }],
      [
        'propiedad no permitida',
        { denominacion: 'bebidas', usuarioCreatedId: 7, lineas: [5] },
      ],
    ])('400: %s', async (_caso, body) => {
      await request(app.getHttpServer())
        .post('/super-linea')
        .send(body)
        .expect(400);

      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('GET /super-linea/search-by', () => {
    it('200: busca por denominación normalizada con paginación', async () => {
      repository.findByDenominacionFiltered.mockResolvedValue({
        data: [superLinea()],
        total: 1,
      });

      const res = await request(app.getHttpServer())
        .get('/super-linea/search-by')
        .query({ denominacion: ' beb ', skip: 0, take: 10 })
        .expect(200);

      expect(repository.findByDenominacionFiltered).toHaveBeenCalledWith(
        'BEB',
        0,
        10,
        false,
      );
      expect(res.body).toEqual({
        data: [
          {
            id: 1,
            denominacion: 'BEBIDAS',
            observacion: 'gaseosas y aguas',
            sistema: 0,
            deletedAt: null,
          },
        ],
        total: 1,
      });
    });

    it('200: permite incluir las eliminadas', async () => {
      repository.findByDenominacionFiltered.mockResolvedValue({ data: [], total: 0 });

      await request(app.getHttpServer())
        .get('/super-linea/search-by')
        .query({ skip: 0, take: 10, incluirEliminados: 'true' })
        .expect(200);

      expect(repository.findByDenominacionFiltered).toHaveBeenCalledWith(
        '',
        0,
        10,
        true,
      );
    });

    it('400: rechaza un take inválido', async () => {
      await request(app.getHttpServer())
        .get('/super-linea/search-by')
        .query({ skip: 0, take: 0 })
        .expect(400);
    });
  });

  describe('GET /super-linea/:id', () => {
    it('200: devuelve la superlínea', async () => {
      const res = await request(app.getHttpServer())
        .get('/super-linea/1')
        .expect(200);

      expect(res.body).toMatchObject({ id: 1, denominacion: 'BEBIDAS' });
    });

    it('404: superlínea inexistente o eliminada', async () => {
      repository.findOne.mockRejectedValue(
        new EntityNotFoundException('Entidad no encontrada'),
      );

      await request(app.getHttpServer()).get('/super-linea/99').expect(404);
    });

    it('400: id no numérico', async () => {
      await request(app.getHttpServer()).get('/super-linea/abc').expect(400);
    });
  });

  describe('PUT /super-linea/:id', () => {
    it('200: renombra la superlínea', async () => {
      repository.update.mockResolvedValue(superLinea({ denominacion: 'BEBIDAS FRIAS' }));

      const res = await request(app.getHttpServer())
        .put('/super-linea/1')
        .send({ denominacion: 'Bebidas Frias', usuarioUpdatedId: 7 })
        .expect(200);

      expect(repository.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ denominacion: 'BEBIDAS FRIAS', usuarioUpdatedId: 7 }),
      );
      expect(res.body.mensaje).toBe(
        'SuperLinea editada con éxito con denominacion: BEBIDAS FRIAS',
      );
    });

    it('403: no permite modificar una superlínea de sistema', async () => {
      repository.findOne.mockResolvedValue(superLinea({ sistema: 1 }));

      await request(app.getHttpServer())
        .put('/super-linea/1')
        .send({ denominacion: 'otra', usuarioUpdatedId: 7 })
        .expect(403);

      expect(repository.update).not.toHaveBeenCalled();
    });

    it('409: rechaza renombrar con una denominación de otra superlínea', async () => {
      repository.findByDenominacionWith.mockResolvedValue(superLinea({ id: 2 }));

      await request(app.getHttpServer())
        .put('/super-linea/1')
        .send({ denominacion: 'snacks', usuarioUpdatedId: 7 })
        .expect(409);
    });

    it('400: sin usuarioUpdatedId', async () => {
      await request(app.getHttpServer())
        .put('/super-linea/1')
        .send({ denominacion: 'otra' })
        .expect(400);
    });
  });

  describe('DELETE /super-linea/:id', () => {
    it('200: elimina la superlínea', async () => {
      const res = await request(app.getHttpServer())
        .delete('/super-linea/1')
        .query({ usuarioId: 7 })
        .expect(200);

      expect(repository.remove).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1 }),
        { id: 7 },
      );
      expect(res.body.mensaje).toBe(
        'SuperLinea eliminada con éxito con denominacion: BEBIDAS',
      );
    });

    it('400: sin usuarioId', async () => {
      await request(app.getHttpServer()).delete('/super-linea/1').expect(400);
      expect(repository.remove).not.toHaveBeenCalled();
    });

    it('404: usuario inexistente', async () => {
      usuarioService.findOne.mockResolvedValue(null);

      await request(app.getHttpServer())
        .delete('/super-linea/1')
        .query({ usuarioId: 99 })
        .expect(404);
    });

    it('403: no permite eliminar una superlínea de sistema', async () => {
      repository.findOne.mockResolvedValue(superLinea({ sistema: 1 }));

      await request(app.getHttpServer())
        .delete('/super-linea/1')
        .query({ usuarioId: 7 })
        .expect(403);
    });
  });

  describe('GET /super-linea/:id/audit', () => {
    it('200: devuelve la auditoría', async () => {
      const auditoria = {
        id: 1,
        detalle: 'superlínea BEBIDAS',
        createdAt: '20/09/2026 10:00',
        updatedAt: '',
        deletedAt: '',
        usuarioCreated: 'admin',
        usuarioUpdated: '',
        usuarioDeleted: '',
      };
      repository.findByIdConAuditoria.mockResolvedValue(auditoria);

      const res = await request(app.getHttpServer())
        .get('/super-linea/1/audit')
        .expect(200);

      expect(res.body).toEqual(auditoria);
    });
  });
});
