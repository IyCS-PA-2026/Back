import { ApiProperty } from '@nestjs/swagger';

// CR-007: un cambio de precio de un producto
export class HistorialPrecioDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 10 })
  productoId: number;

  @ApiProperty({
    example: 120,
    nullable: true,
    description: 'null en el registro del alta del producto',
  })
  precioAnterior: number | null;

  @ApiProperty({ example: 130 })
  precioNuevo: number;

  @ApiProperty({ example: '2026-09-25T14:30:00.000Z' })
  fecha: Date;

  @ApiProperty({ example: 'Actualización masiva por porcentaje: margen 30% (global)' })
  motivo: string;
}
