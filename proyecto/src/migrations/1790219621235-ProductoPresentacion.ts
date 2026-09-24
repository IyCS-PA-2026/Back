import { MigrationInterface, QueryRunner } from "typeorm";

/*
  CR-002 — Presentación del producto.

  Reemplaza utilizaPack / cantidadPorPack por el Value Object Presentacion
  (embedded en Producto): presentacionCantidad y presentacionUnidadmedida.

  Productos existentes:
    La presentación es obligatoria (NOT NULL) y no puede deducirse de los datos
    actuales: utilizaPack / cantidadPorPack no contienen ninguna unidad de medida.
    MySQL completaría las filas existentes con 0 y '' (valores que violan las reglas
    del dominio), por lo que la migración NO se aplica si la tabla tiene filas
    (incluidas las eliminadas lógicamente). Ver docs/CR-002-presentacion.md.

  El control se hace antes de cualquier ALTER porque en MySQL cada DDL
  confirma implícitamente y no puede revertirse con la transacción.
*/
export class ProductoPresentacion1790219621235 implements MigrationInterface {
    name = 'ProductoPresentacion1790219621235'

    public async up(queryRunner: QueryRunner): Promise<void> {
        const [{ total }] = await queryRunner.query(`SELECT COUNT(*) AS \`total\` FROM \`producto\``);
        if (Number(total) > 0) {
            throw new Error(
                `CR-002: la tabla producto tiene ${total} fila(s). ` +
                `No es posible asignarles una presentación (cantidad y unidad de medida) sin conocer sus valores reales. ` +
                `Cargue la presentación real de cada producto o vacíe la tabla en entornos de prueba, y vuelva a ejecutar la migración. ` +
                `No se realizó ningún cambio.`,
            );
        }

        await queryRunner.query(`ALTER TABLE \`producto\` ADD \`presentacionCantidad\` decimal(12,3) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`producto\` ADD \`presentacionUnidadmedida\` text NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`producto\` DROP COLUMN \`utilizaPack\``);
        await queryRunner.query(`ALTER TABLE \`producto\` DROP COLUMN \`cantidadPorPack\``);
    }

    /*
      Restaura las columnas tal como las define Init1787269586538.
      Advertencia: la presentación de los productos se pierde al revertir;
      las filas quedan con utilizaPack = 0 y cantidadPorPack = NULL (defaults del esquema anterior).
    */
    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`producto\` ADD \`cantidadPorPack\` int NULL`);
        await queryRunner.query(`ALTER TABLE \`producto\` ADD \`utilizaPack\` tinyint NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE \`producto\` DROP COLUMN \`presentacionUnidadmedida\``);
        await queryRunner.query(`ALTER TABLE \`producto\` DROP COLUMN \`presentacionCantidad\``);
    }
}
