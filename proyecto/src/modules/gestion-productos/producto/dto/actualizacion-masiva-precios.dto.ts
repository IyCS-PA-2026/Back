import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNumber, Min, ValidateIf } from 'class-validator';
import {
  AlcanceActualizacionPrecios,
  ModalidadActualizacionPrecios,
} from '../enums/actualizacion-masiva-precios.enum';

export class ActualizacionMasivaPreciosDto {
  @ApiProperty({ enum: AlcanceActualizacionPrecios, example: 'linea' })
  @IsEnum(AlcanceActualizacionPrecios, {
    message: 'El alcance debe ser "linea" o "global".',
  })
  alcance: AlcanceActualizacionPrecios;

  @ApiPropertyOptional({
    example: 1,
    description: 'Obligatorio si el alcance es "linea"',
  })
  @ValidateIf((dto) => dto.alcance === AlcanceActualizacionPrecios.LINEA)
  @IsInt({ message: 'La línea es obligatoria y debe ser un número entero.' })
  @Min(1, { message: 'La línea debe ser un ID válido.' })
  lineaId?: number;

  @ApiProperty({ enum: ModalidadActualizacionPrecios, example: 'porcentaje' })
  @IsEnum(ModalidadActualizacionPrecios, {
    message: 'La modalidad debe ser "porcentaje" o "monto".',
  })
  modalidad: ModalidadActualizacionPrecios;

  @ApiProperty({
    example: 10,
    description:
      'porcentaje: nuevo margen (%) de cada producto. monto: importe a sumar al costo de cada producto (admite negativos)',
  })
  @IsNumber({}, { message: 'El valor debe ser numérico.' })
  valor: number;

  @ApiProperty({ example: 3, description: 'ID del usuario que realiza la actualización' })
  @IsInt({ message: 'El usuario es obligatorio.' })
  usuarioId: number;
}
