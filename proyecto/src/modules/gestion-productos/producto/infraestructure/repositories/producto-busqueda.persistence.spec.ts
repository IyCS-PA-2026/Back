import { DataSource, SelectQueryBuilder } from 'typeorm';
import { ProductoPersistenceAdapter } from './producto.persistence-adapters';
import { Producto } from '../../domain/entities/producto.entity';
import { IUnitOfWork } from 'src/modules/common/unit-of-work/iunit-of-work.';

/*
  CR-004 — Consulta SQL de la búsqueda de productos.
  Un único texto (denominacion) se busca con coincidencia parcial, en OR, en:
  producto.denominacion, linea.denominacion y super_linea.denominacion.
  Usa la metadata real de TypeORM con el driver de MySQL, sin conexión:
  se captura la consulta que arma ProductoPersistenceAdapter.findBy
  y se verifica que el filtro se resuelve en SQL (JOIN + WHERE), no en memoria.
*/
describe('ProductoPersistenceAdapter.findBy - consulta (CR-004)', () => {
  let adapter: ProductoPersistenceAdapter;
  let consulta: SelectQueryBuilder<Producto>;

  beforeAll(async () => {
    const dataSource = new DataSource({
      type: 'mysql',
      database: 'sin-conexion',
      entities: [__dirname + '/../../../../../**/*.entity.ts'],
    });
    await (dataSource as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();

    adapter = new ProductoPersistenceAdapter(
      dataSource.getRepository(Producto),
      dataSource,
      {} as IUnitOfWork,
    );
    // Compila todas las entidades del proyecto: supera los 5 s por defecto de Jest
    // en máquinas lentas o volúmenes montados (Docker)
  }, 60_000);

  beforeEach(() => {
    jest
      .spyOn(SelectQueryBuilder.prototype, 'getManyAndCount')
      .mockImplementation(async function (this: SelectQueryBuilder<Producto>) {
        consulta = this;
        return [[], 0];
      });
  });

  afterEach(() => jest.restoreAllMocks());

  type Busqueda = {
    denominacion?: string;
    codigoProveedor?: string;
    codigoReferencia?: string;
    marcaId?: number;
    lineaId?: number;
    conStock?: boolean;
    skip?: number;
    take?: number;
  };

  const buscar = async (b: Busqueda = {}) => {
    await adapter.findBy(
      b.denominacion ?? '',
      b.codigoProveedor as string,
      false,
      b.codigoReferencia as string,
      b.marcaId as number,
      b.lineaId as number,
      undefined as unknown as number,
      b.conStock as boolean,
      b.skip ?? 0,
      b.take ?? 10,
    );
    const [sql, parametros] = consulta.getQueryAndParameters();
    return { sql, where: sql.slice(sql.indexOf(' WHERE ')), parametros };
  };

  const OR_PRODUCTO_LINEA_SUPERLINEA =
    '(UPPER(`producto`.`denominacion`) LIKE UPPER(?)' +
    ' OR UPPER(`linea`.`denominacion`) LIKE UPPER(?)' +
    ' OR UPPER(`superLinea`.`denominacion`) LIKE UPPER(?))';

  const JOIN_SUPER_LINEA =
    'LEFT JOIN `super_linea` `superLinea` ON `superLinea`.`id`=`linea`.`super_linea_id`';

  describe('filtro único de búsqueda', () => {
    it('busca el texto en Producto, Línea y SuperLínea con OR', async () => {
      const { where } = await buscar({ denominacion: 'LECHE' });

      expect(where).toContain(OR_PRODUCTO_LINEA_SUPERLINEA);
    });

    it('usa coincidencia parcial con el mismo texto en los tres campos', async () => {
      const { parametros } = await buscar({ denominacion: 'LECHE' });

      expect(parametros).toEqual(['%LECHE%', '%LECHE%', '%LECHE%']);
    });

    it('no son filtros independientes con AND', async () => {
      const { where } = await buscar({ denominacion: 'LECHE' });

      expect(where).not.toMatch(/\) AND UPPER\(`linea`\.`denominacion`\)/);
      expect(where).not.toMatch(/AND UPPER\(`superLinea`\.`denominacion`\)/);
    });

    it('llega a la SuperLínea por Producto → Línea → SuperLínea (relación de CR-003)', async () => {
      const { sql } = await buscar({ denominacion: 'LECHE' });

      expect(sql).toContain(
        'LEFT JOIN `linea` `linea` ON `linea`.`id`=`producto`.`linea_id`',
      );
      expect(sql).toContain(JOIN_SUPER_LINEA);
      // Se reutiliza el JOIN existente con Línea
      expect(sql.match(/LEFT JOIN `linea`/g)).toHaveLength(1);
    });

    it('LEFT JOIN: los productos sin SuperLínea siguen pudiendo coincidir por nombre o Línea', async () => {
      const { sql } = await buscar({ denominacion: 'LECHE' });

      expect(sql).not.toContain('INNER JOIN `super_linea`');
    });

    it('las Líneas y SuperLíneas eliminadas no participan (condición en el JOIN)', async () => {
      const { sql } = await buscar({ denominacion: 'LECHE' });

      expect(sql).toContain('AND (`superLinea`.`deletedAt` IS NULL)');
      expect(sql).toContain('AND (`linea`.`deletedAt` IS NULL)');
    });
  });

  describe('combinación con el buscador existente', () => {
    it('los códigos se suman al mismo OR, como antes', async () => {
      const { where } = await buscar({
        denominacion: 'LECHE',
        codigoProveedor: 'A1',
      });

      expect(where).toContain(
        OR_PRODUCTO_LINEA_SUPERLINEA.slice(0, -1) +
          ' OR UPPER(`producto`.`codigoProveedor`) LIKE UPPER(?))',
      );
    });

    it('marcaId, lineaId y conStock siguen aplicándose con AND', async () => {
      const { where, parametros } = await buscar({
        denominacion: 'LECHE',
        marcaId: 2,
        lineaId: 3,
        conStock: true,
      });

      expect(where).toContain(`${OR_PRODUCTO_LINEA_SUPERLINEA} AND \`marca\`.\`id\` = ?`);
      expect(where).toContain('AND `linea`.`id` = ?');
      expect(where).toContain('AND `producto`.`stock` > 0');
      expect(parametros).toEqual(expect.arrayContaining([2, 3]));
    });

    it('respeta la paginación', async () => {
      await buscar({ denominacion: 'LECHE', skip: 20, take: 5 });

      expect(consulta.expressionMap.skip).toBe(20);
      expect(consulta.expressionMap.take).toBe(5);
    });
  });

  describe('compatibilidad', () => {
    it('sin texto la consulta es la de antes: sin JOIN a SuperLínea ni condiciones de texto', async () => {
      const { sql, where } = await buscar({ marcaId: 2 });

      expect(sql).not.toContain('`super_linea`');
      expect(where).not.toContain('LIKE');
      expect(where).toContain('`producto`.`deletedAt` IS NULL');
    });

    it('solo con códigos no se busca en Línea ni SuperLínea', async () => {
      const { sql, where } = await buscar({ codigoReferencia: 'R1' });

      expect(sql).not.toContain('`super_linea`');
      expect(where).toContain('(UPPER(`producto`.`codigoReferencia`) LIKE UPPER(?))');
      expect(where).not.toContain('`linea`.`denominacion`');
    });

    it('la consulta sigue seleccionando las columnas de presentación (CR-002)', async () => {
      const { sql } = await buscar({ denominacion: 'LECHE' });

      expect(sql).toContain('`producto`.`presentacionCantidad`');
      expect(sql).toContain('`producto`.`presentacionUnidadmedida`');
    });
  });
});
