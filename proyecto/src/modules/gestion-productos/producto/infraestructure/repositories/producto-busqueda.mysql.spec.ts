import { config } from 'dotenv';
import { DataSource, EntityManager, QueryRunner } from 'typeorm';
import { ProductoPersistenceAdapter } from './producto.persistence-adapters';
import { Producto } from '../../domain/entities/producto.entity';
import { Presentacion } from '../../domain/value-objects/presentacion.vo';
import { Linea } from '../../../linea/domain/entities/linea.entity';
import { SuperLinea } from '../../../super-linea/domain/entities/super-linea.entity';
import { IUnitOfWork } from 'src/modules/common/unit-of-work/iunit-of-work.';

/*
  CR-004 — Búsqueda de productos contra MySQL real (criterios de aceptación).
  Un único texto se busca, en OR y con coincidencia parcial, en la denominación
  del Producto, de su Línea y de la SuperLínea de su Línea.

  Opcional: requiere la base de .env con las migraciones aplicadas.
    CR004_DB_TEST=1 npx jest producto-busqueda.mysql.spec --coverage=false
  Los datos se crean dentro de una transacción que se revierte al final:
  la base queda como estaba. Las denominaciones usan el prefijo QZ y el sufijo
  CR004 para no coincidir con datos existentes.

  Datos:
    SuperLínea         Línea                Producto
    QZALIMENTOS        QZLACTEOS            QZLECHE ENTERA, QZLECHE DESCREMADA
    QZFERRETERIA       QZLIMPIEZA           QZLAVANDINA
    —                  QZSUELTA             QZTORNILLO, QZMIXTO JUGO
    —                  QZMIXTOS             QZALFAJOR
    QZMIXTA            QZGOLOSINAS          QZCHICLE
    QZBORRADA (baja)   QZVARIOS             QZVELA
*/
const describeConBase = process.env.CR004_DB_TEST === '1' ? describe : describe.skip;

describeConBase('ProductoPersistenceAdapter.findBy - MySQL (CR-004)', () => {
  let dataSource: DataSource;
  let queryRunner: QueryRunner;
  let adapter: ProductoPersistenceAdapter;
  let lineaLacteosId: number;
  let lineaSueltaId: number;

  beforeAll(async () => {
    config({ path: '.env', override: true });
    dataSource = new DataSource({
      type: 'mysql',
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '3306', 10),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      timezone: '-03:00',
      entities: [__dirname + '/../../../../../**/*.entity.ts'],
    });
    await dataSource.initialize();

    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    const manager: EntityManager = queryRunner.manager;

    const [alimentos, ferreteria, mixta, borrada] = await manager.save(SuperLinea, [
      { denominacion: 'QZALIMENTOS CR004' },
      { denominacion: 'QZFERRETERIA CR004' },
      { denominacion: 'QZMIXTA CR004' },
      { denominacion: 'QZBORRADA CR004', deletedAt: new Date() },
    ]);

    const [lacteos, limpieza, suelta, mixtos, golosinas, varios] = await manager.save(Linea, [
      { denominacion: 'QZLACTEOS CR004', superLineaId: alimentos.id },
      { denominacion: 'QZLIMPIEZA CR004', superLineaId: ferreteria.id },
      { denominacion: 'QZSUELTA CR004', superLineaId: null },
      { denominacion: 'QZMIXTOS CR004', superLineaId: null },
      { denominacion: 'QZGOLOSINAS CR004', superLineaId: mixta.id },
      { denominacion: 'QZVARIOS CR004', superLineaId: borrada.id },
    ]);
    lineaLacteosId = lacteos.id;
    lineaSueltaId = suelta.id;

    const producto = (denominacion: string, linea: Linea) => ({
      denominacion,
      linea,
      presentacion: Presentacion.crear(1, 'unidad'),
    });
    await manager.save(Producto, [
      { ...producto('QZLECHE ENTERA CR004', lacteos), presentacion: Presentacion.crear(1, 'l') },
      producto('QZLECHE DESCREMADA CR004', lacteos),
      producto('QZLAVANDINA CR004', limpieza),
      { ...producto('QZTORNILLO CR004', suelta), presentacion: Presentacion.crear(12, 'unidades') },
      producto('QZMIXTO JUGO CR004', suelta),
      producto('QZALFAJOR CR004', mixtos),
      producto('QZCHICLE CR004', golosinas),
      producto('QZVELA CR004', varios),
    ]);

    // Usa el repositorio de la transacción para ver los datos no confirmados
    adapter = new ProductoPersistenceAdapter(
      manager.getRepository(Producto),
      dataSource,
      {} as IUnitOfWork,
    );
  });

  afterAll(async () => {
    if (queryRunner) {
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
    }
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  const buscar = (
    texto: string,
    { lineaId, skip = 0, take = 10 }: { lineaId?: number; skip?: number; take?: number } = {},
  ) =>
    adapter.findBy(
      texto,
      undefined as unknown as string,
      false,
      undefined as unknown as string,
      undefined as unknown as number,
      lineaId as number,
      undefined as unknown as number,
      undefined as unknown as boolean,
      skip,
      take,
    );

  const denominaciones = async (...args: Parameters<typeof buscar>) =>
    (await buscar(...args)).data.map((p) => p.denominacion);

  describe('CA1 - denominación del Producto', () => {
    it('encuentra por coincidencia parcial (sin distinguir mayúsculas)', async () => {
      expect(await denominaciones('qzleche')).toEqual([
        'QZLECHE DESCREMADA CR004',
        'QZLECHE ENTERA CR004',
      ]);
    });

    it('encuentra productos cuya Línea no tiene SuperLínea', async () => {
      expect(await denominaciones('qztornillo')).toEqual(['QZTORNILLO CR004']);
    });
  });

  describe('CA2 - denominación de la Línea', () => {
    it('encuentra los productos de las Líneas que coinciden parcialmente', async () => {
      expect(await denominaciones('qzlimp')).toEqual(['QZLAVANDINA CR004']);
    });
  });

  describe('CA3 - denominación de la SuperLínea', () => {
    it('encuentra los productos de las Líneas de las SuperLíneas que coinciden', async () => {
      expect(await denominaciones('qzalim')).toEqual([
        'QZLECHE DESCREMADA CR004',
        'QZLECHE ENTERA CR004',
      ]);
    });

    it('una SuperLínea eliminada no produce coincidencias', async () => {
      expect(await denominaciones('qzborrada')).toEqual([]);
    });
  });

  describe('OR entre Producto, Línea y SuperLínea', () => {
    it('un mismo texto encuentra productos por cualquiera de los tres campos', async () => {
      // QZMIXTO JUGO (producto), QZALFAJOR (Línea QZMIXTOS), QZCHICLE (SuperLínea QZMIXTA)
      expect(await denominaciones('qzmixt')).toEqual([
        'QZALFAJOR CR004',
        'QZCHICLE CR004',
        'QZMIXTO JUGO CR004',
      ]);
    });

    it('no encuentra productos cuando no coincide ningún campo', async () => {
      expect(await denominaciones('qznada')).toEqual([]);
    });

    it('respeta la paginación: data paginada y total completo', async () => {
      const pagina = await buscar('qzmixt', { skip: 1, take: 1 });

      expect(pagina.total).toBe(3);
      expect(pagina.data.map((p) => p.denominacion)).toEqual(['QZCHICLE CR004']);
    });
  });

  describe('compatibilidad', () => {
    it('el texto se combina con AND con los filtros existentes (lineaId)', async () => {
      expect(await denominaciones('qzmixt', { lineaId: lineaSueltaId })).toEqual([
        'QZMIXTO JUGO CR004',
      ]);
    });

    it('sin texto, los filtros existentes funcionan como antes', async () => {
      expect(await denominaciones('', { lineaId: lineaLacteosId })).toEqual([
        'QZLECHE DESCREMADA CR004',
        'QZLECHE ENTERA CR004',
      ]);
    });

    it('los productos encontrados traen su Presentacion (CR-002)', async () => {
      const [producto] = (await buscar('qztornillo')).data;

      expect(producto.presentacion).toBeInstanceOf(Presentacion);
      expect(producto.presentacion.equals(Presentacion.crear(12, 'unidades'))).toBe(true);
    });
  });
});
