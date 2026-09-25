import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class SuperLineaDto {
  @ApiProperty({ example: 1, description: 'ID de la superlínea' })
  @Type(() => Number)
  @IsInt()
  id: number;

  @ApiProperty({
    example: 'ferreteria',
    description: 'Denominación o nombre de la superlínea',
  })
  @IsString()
  denominacion: string;

  @ApiProperty({
    example: '',
    description: 'Observaciones varias sobre la superlínea',
  })
  @IsString()
  observacion: string;

  @ApiProperty({
    example: 1,
    description: 'de sistema no se puede editar ni eliminar',
  })
  @Type(() => Number)
  @IsInt()
  sistema: number;

  @ApiProperty({ example: null, description: 'Fecha de eliminación (null si está activa)', nullable: true })
  @IsOptional()
  deletedAt: string | null;
}
