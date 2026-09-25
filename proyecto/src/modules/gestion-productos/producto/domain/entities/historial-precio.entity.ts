import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  ValueTransformer,
} from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { redondear } from 'src/modules/common/utils/number/redondeo';
import { Producto } from './producto.entity';

// Mismo tipo que las columnas monetarias de Producto (decimal 15,5), pero respetando null
const monetarioTransformer: ValueTransformer = {
  to: (value?: number | null) => (value == null ? value : value.toString()),
  from: (value?: string | null) => (value == null ? null : Number(value)),
};

export const MOTIVO_MAXIMO = 255;

export const MotivoHistorialPrecio = {
  ALTA: 'Alta de producto',
  EDICION: 'Edición de producto',
} as const;

/*
  CR-007 — Historial de precios.
  Entidad (no Value Object): dos cambios de precio del mismo producto en distintos
  momentos son eventos distintos aunque tengan los mismos valores.
  El precio vigente se sigue guardando en Producto (rendimiento); cada cambio
  queda registrado acá (trazabilidad). Regla: precio > 0, validada al crear el registro.
*/
@Entity('historial_precio')
@Index('IDX_historial_precio_producto_fecha', ['productoId', 'fecha'])
@Check('CHK_historial_precio_precio_nuevo_positivo', '`precioNuevo` > 0')
export class HistorialPrecio {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Producto, { nullable: false })
  @JoinColumn({
    name: 'producto_id',
    foreignKeyConstraintName: 'FK_historial_precio_producto',
  })
  producto?: Producto;

  @Column({ name: 'producto_id', type: 'int' })
  productoId: number;

  // null solo en el registro del alta: todavía no existía un precio anterior
  @Column('decimal', {
    precision: 15,
    scale: 5,
    nullable: true,
    transformer: monetarioTransformer,
  })
  precioAnterior: number | null;

  @Column('decimal', {
    precision: 15,
    scale: 5,
    transformer: monetarioTransformer,
  })
  precioNuevo: number;

  @Column({ type: 'datetime' })
  fecha: Date;

  @Column({ type: 'varchar', length: MOTIVO_MAXIMO })
  motivo: string;

  // Única forma de crear un registro: aplica las reglas antes de que exista
  static registrar(datos: {
    productoId: number;
    precioAnterior: number | null;
    precioNuevo: number;
    motivo: string;
    fecha?: Date;
  }): HistorialPrecio {
    const { productoId, precioAnterior, precioNuevo } = datos;
    const motivo = datos.motivo?.trim() ?? '';
    const fecha = datos.fecha ?? new Date();

    if (!Number.isInteger(productoId) || productoId <= 0) {
      throw new BadRequestException(
        'El historial de precios requiere un producto válido.',
      );
    }
    // Se valida el valor ya redondeado: es el que se persiste
    if (!Number.isFinite(precioNuevo) || redondear(precioNuevo, 2) <= 0) {
      throw new BadRequestException(
        `El precio nuevo (${precioNuevo}) debe ser mayor a 0.`,
      );
    }
    if (
      precioAnterior !== null &&
      (!Number.isFinite(precioAnterior) || precioAnterior < 0)
    ) {
      throw new BadRequestException(
        `El precio anterior (${precioAnterior}) no puede ser negativo.`,
      );
    }
    if (motivo === '') {
      throw new BadRequestException(
        'El motivo del cambio de precio es obligatorio.',
      );
    }
    if (motivo.length > MOTIVO_MAXIMO) {
      throw new BadRequestException(
        `El motivo del cambio de precio no puede superar ${MOTIVO_MAXIMO} caracteres.`,
      );
    }
    if (Number.isNaN(fecha.getTime())) {
      throw new BadRequestException(
        'La fecha del cambio de precio no es válida.',
      );
    }

    return Object.assign(new HistorialPrecio(), {
      productoId,
      precioAnterior: precioAnterior === null ? null : redondear(precioAnterior, 2),
      precioNuevo: redondear(precioNuevo, 2),
      fecha,
      motivo,
    });
  }
}
