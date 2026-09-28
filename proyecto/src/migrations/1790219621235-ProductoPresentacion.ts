import { MigrationInterface, QueryRunner } from "typeorm";

/*
  CR-002 — Presentación del producto.

  Reemplaza utilizaPack / cantidadPorPack por el Value Object Presentacion
  (embedded en Producto): presentacionCantidad y presentacionUnidadmedida.

  Productos existentes:
    Se asigna cantidad = 1 y unidad = 'Unidad' a todas las filas existentes,
    incluidas las eliminadas lógicamente. Son valores provisionales acordados
    para el despliegue, no una conversión de utilizaPack / cantidadPorPack.
    Luego se aplica NOT NULL sin dejar defaults para las altas nuevas.

  En MySQL cada DDL confirma implícitamente: realizar un respaldo y detener
  las escrituras durante la migración; una falla puede dejar cambios parciales.
*/
export class ProductoPresentacion1790219621235 implements MigrationInterface {
    name = 'ProductoPresentacion1790219621235'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`producto\` ADD \`presentacionCantidad\` decimal(12,3) NULL, ADD \`presentacionUnidadmedida\` text NULL`);
        await queryRunner.query(`UPDATE \`producto\` SET \`presentacionCantidad\` = 1, \`presentacionUnidadmedida\` = 'Unidad'`);
        await queryRunner.query(`ALTER TABLE \`producto\` MODIFY \`presentacionCantidad\` decimal(12,3) NOT NULL, MODIFY \`presentacionUnidadmedida\` text NOT NULL`);
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
