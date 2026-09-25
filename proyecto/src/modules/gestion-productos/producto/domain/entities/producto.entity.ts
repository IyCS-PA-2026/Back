import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  Index,
  JoinColumn,
} from 'typeorm';
import { Linea } from '../../../linea/domain/entities/linea.entity';
import { Marca } from '../../../marca/domain/entities/marca.entity';
import { AlicuotaIva } from 'src/modules/organizacion/enums/alicuota-iva.enum';
import { ApiProperty } from '@nestjs/swagger';
import { ProductoOperacion } from '../../../producto-operacion/entities/producto-operacion.entity';
import { Usuario } from 'src/modules/gestion-usuario/usuario/domain/entities/usuario.entity';
import { MonetarioColumn } from 'src/modules/common/decorators/monetario-column.decorator';
import { CantidadColumn } from 'src/modules/common/decorators/cantidad-column.decorator';
import { PorcentajeColumn } from 'src/modules/common/decorators/porcentaje-column.decorator';
import { Proveedor } from 'src/modules/organizacion/proveedor/domain/entities/proveedor.entity';
import { Presentacion } from '../value-objects/presentacion.vo';
import { BadRequestException } from '@nestjs/common';
import { redondear } from 'src/modules/common/utils/number/redondeo';
import { HistorialPrecio } from './historial-precio.entity';

// Límite de la columna del margen: decimal(5,2)
export const MARGEN_MAXIMO = 999.99;

@Entity('producto')
export class Producto {
  @ApiProperty()
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty()
  @Column({ type: 'text' })
  denominacion: string;

  @Index()
  @Column({ type: 'varchar', length: 255, nullable: true })
  codigoProveedor?: string | null;

  @Column({ type: 'text', nullable: true })
  codigoBarra?: string | null;

  // ========== PROVEEDOR ==========
  @ManyToOne(() => Proveedor, (pro) => pro.proveedoresOperacion, {
    eager: true,
  })
  @JoinColumn({ name: 'proveedor_id' })
  @Index()
  proveedor: Proveedor;

  @Column({ type: 'int', nullable: true })
  proveedorId?: number;

  /*
  Nota: No usar el enum alciculta iva en @Column
        sino no anda el importar precios 
  */
  @PorcentajeColumn(21.0)
  alicuotaIva: AlicuotaIva;

  // Stock: cantidades reales, admite fracciones (1.5 kg, 0.25 lts)
  @CantidadColumn()
  stock: number;

  @Column('boolean', { default: false })
  utilizaStockMinimo: boolean;

  @Column('boolean', { default: false })
  utilizaStockMinimoPorEmpresa: boolean;

  @CantidadColumn()
  stockMinimo: number;

  @MonetarioColumn()
  costo?: number;

  @MonetarioColumn()
  costoDolar?: number;

  /*
  Ultima cotizacion dolar por el cambio de precio si producto posee costo dolar
  */
  @MonetarioColumn()
  cotizacionDolar?: number;
  //se utiliza en las importaciones;

  @MonetarioColumn()
  precioDolar?: number;
  // Precio de venta

  @MonetarioColumn()
  precio?: number;

  @PorcentajeColumn()
  porcentaje?: number;

  @Column({ type: 'timestamp', nullable: true })
  fechaCosto?: Date;

  @Column('boolean', { default: false })
  costoEnDolar?: boolean;

  @Column({ type: 'timestamp', nullable: true })
  fechaCostoDolar?: Date;


  @Column('boolean', { default: false })
  destacado?: boolean;

  @Column('boolean', { default: false })
  envioGratis?: boolean;

  @Column({ type: 'text', nullable: true })
  observacion?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  @Index()
  deletedAt?: Date;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'usuario_created_id' })
  usuarioCreated: Usuario;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'usuario_updated_id' })
  usuarioUpdated: Usuario;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'usuario_deleted_id' })
  usuarioDeleted: Usuario;


  // ========== LINEA ==========
  @ManyToOne(() => Linea, (linea) => linea.productos)
  @JoinColumn({ name: 'linea_id' })
  linea: Linea;

  @Column({ type: 'int', nullable: true })
  lineaId?: number;


 // ==========  MARCA ==========
  @ManyToOne(() => Marca, (marca) => marca.productos)
  @JoinColumn({ name: 'marca_id' })
  marca: Marca;

  @Column({ type: 'int', nullable: true })
  marcaId?: number;


  // ========== PRESENTACION (CR-002) ==========
  // Value Object embebido: columnas presentacionCantidad y presentacionUnidadmedida
  @Column(() => Presentacion)
  presentacion: Presentacion;

  @Column({ type: 'text', nullable: true })
  imagen?: string;


  @Column({ type: 'text', nullable: true })
  ubicacion?: string;

  @ManyToOne(() => Producto, (producto) => producto.productosOperacion)
  productosOperacion: ProductoOperacion;


  @Column({ type: 'int', default: 0 })
  sistema: number;

  @Column({ type: 'text', nullable: true })
  codigoReferencia?: string | null;

  // ========== PRECIO (CR-006) ==========
  // El margen se persiste en la columna "porcentaje" (pendiente de renombrar)
  get margen(): number {
    return this.porcentaje ?? 0;
  }

  // Precio = Costo × (1 + Margen / 100). Única fuente de la fórmula.
  calcularPrecio(): number {
    return redondear((this.costo ?? 0) * (1 + this.margen / 100), 2);
  }

  // Asigna un nuevo margen y deriva el precio. Rechaza márgenes o costos inválidos.
  aplicarMargen(nuevoMargen: number): void {
    if (!Number.isFinite(nuevoMargen) || nuevoMargen < 0) {
      throw new BadRequestException(
        `El margen resultante (${nuevoMargen}) del producto "${this.denominacion}" no puede ser negativo.`,
      );
    }
    if (nuevoMargen > MARGEN_MAXIMO) {
      throw new BadRequestException(
        `El margen resultante (${nuevoMargen}) del producto "${this.denominacion}" supera el máximo de ${MARGEN_MAXIMO}.`,
      );
    }
    if (this.costo == null || !Number.isFinite(this.costo) || this.costo < 0) {
      throw new BadRequestException(
        `El producto "${this.denominacion}" no tiene un costo válido para calcular el precio.`,
      );
    }

    this.porcentaje = redondear(nuevoMargen, 2);
    this.precio = this.calcularPrecio();
  }

  // Asigna un nuevo costo conservando el margen, y deriva el precio.
  aplicarCosto(nuevoCosto: number): void {
    if (!Number.isFinite(nuevoCosto) || nuevoCosto < 0) {
      throw new BadRequestException(
        `El costo resultante (${nuevoCosto}) del producto "${this.denominacion}" no puede ser negativo.`,
      );
    }
    if (!Number.isFinite(this.margen) || this.margen < 0) {
      throw new BadRequestException(
        `El producto "${this.denominacion}" no tiene un margen válido para calcular el precio.`,
      );
    }

    this.costo = redondear(nuevoCosto, 2);
    this.fechaCosto = new Date();
    this.precio = this.calcularPrecio();
  }

  // Alta y edición: el precio nunca se carga, se deriva de costo y margen
  recalcularPrecio(): void {
    this.precio = this.calcularPrecio();
  }

  // ========== HISTORIAL DE PRECIOS (CR-007) ==========
  // Devuelve el registro del cambio (sin persistir) o null si el precio no cambió.
  // precioAnterior null = alta: sin precio todavía (precio 0) no hay nada que registrar.
  // La regla precio > 0 la aplica HistorialPrecio.registrar.
  registrarCambioDePrecio(
    precioAnterior: number | null,
    motivo: string,
  ): HistorialPrecio | null {
    const precioNuevo = this.precio ?? 0;

    if (precioAnterior === null && precioNuevo === 0) return null;
    if (
      precioAnterior !== null &&
      redondear(precioAnterior, 2) === redondear(precioNuevo, 2)
    ) {
      return null;
    }

    try {
      return HistorialPrecio.registrar({
        productoId: this.id,
        precioAnterior,
        precioNuevo,
        motivo,
      });
    } catch (error) {
      throw new BadRequestException(
        `Producto "${this.denominacion}": ${error.message}`,
      );
    }
  }
}
