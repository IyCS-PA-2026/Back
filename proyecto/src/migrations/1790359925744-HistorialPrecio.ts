import { MigrationInterface, QueryRunner } from "typeorm";

/*
  CR-007 — Historial de precios.

  Crea historial_precio (entidad HistorialPrecio). La regla del dominio
  "precio > 0" también queda como CHECK en la base (MySQL >= 8.0.16), para que
  ningún proceso externo al dominio pueda registrar un precio inválido.

  Productos existentes:
    Cada producto activo con precio > 0 recibe un registro inicial
    (precioAnterior NULL, motivo "Precio inicial (migración CR-007)"), así el
    historial arranca coherente con el precio guardado en producto.
    Los productos con precio 0 no se registran: no tienen precio que trazar
    (misma regla que el alta).
*/
export class HistorialPrecio1790359925744 implements MigrationInterface {
    name = 'HistorialPrecio1790359925744'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`historial_precio\` (\`id\` int NOT NULL AUTO_INCREMENT, \`producto_id\` int NOT NULL, \`precioAnterior\` decimal(15,5) NULL, \`precioNuevo\` decimal(15,5) NOT NULL, \`fecha\` datetime NOT NULL, \`motivo\` varchar(255) NOT NULL, INDEX \`IDX_historial_precio_producto_fecha\` (\`producto_id\`, \`fecha\`), CONSTRAINT \`CHK_historial_precio_precio_nuevo_positivo\` CHECK (\`precioNuevo\` > 0), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`historial_precio\` ADD CONSTRAINT \`FK_historial_precio_producto\` FOREIGN KEY (\`producto_id\`) REFERENCES \`producto\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`INSERT INTO \`historial_precio\` (\`producto_id\`, \`precioAnterior\`, \`precioNuevo\`, \`fecha\`, \`motivo\`) SELECT \`id\`, NULL, \`precio\`, NOW(), 'Precio inicial (migración CR-007)' FROM \`producto\` WHERE \`precio\` > 0 AND \`deletedAt\` IS NULL`);
    }

    // Advertencia: al revertir se pierde el historial registrado
    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`historial_precio\` DROP FOREIGN KEY \`FK_historial_precio_producto\``);
        await queryRunner.query(`DROP TABLE \`historial_precio\``);
    }
}
