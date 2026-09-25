import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';

import { Producto } from '../../../producto/domain/entities/producto.entity';
import { CantidadColumn } from 'src/modules/common/decorators/cantidad-column.decorator';
import { SuperLinea } from '../../../super-linea/domain/entities/super-linea.entity';

@Entity('linea')
@Index(['denominacion', 'deletedAt'], { unique: true })
export class Linea {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  denominacion: string;

  @Column({ type: 'text', nullable: true })
  observacion?: string;

  @OneToMany(() => Producto, (producto) => producto.linea)
  productos: Producto[];

  // ========== SUPER LINEA ==========
  @ManyToOne(() => SuperLinea, (superLinea) => superLinea.lineas, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'super_linea_id' })
  superLinea?: SuperLinea | null;

  @Column({ name: 'super_linea_id', type: 'int', nullable: true })
  superLineaId?: number | null;

  @Column('boolean', { default: false })
  utilizaStockMinimo: boolean;

  @CantidadColumn()
  stockMinimo: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;

  @Column({ type: 'int', nullable: true })
  usuarioCreatedId?: number;

  @Column({ type: 'int', nullable: true })
  usuarioDeletedId?: number;

  @Column({ type: 'int', nullable: true })
  usuarioUpdatedId?: number;

  @Column({ type: 'int', default: 0 })
  sistema: number;
}
