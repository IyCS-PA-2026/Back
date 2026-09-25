import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive, IsString, Matches } from 'class-validator';

/*
  CR-002: Presentación del producto.
  Las reglas de negocio viven en el Value Object Presentacion;
  este DTO solo valida el formato de entrada para responder 400 con mensajes claros.
*/
export class PresentacionDto {
  @ApiProperty({ example: 1.5, description: 'Cantidad de la presentación (> 0, hasta 3 decimales)' })
  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'La cantidad de la presentación debe ser un número con hasta 3 decimales.' },
  )
  @IsPositive({ message: 'La cantidad de la presentación debe ser mayor que 0.' })
  cantidad: number;

  @ApiProperty({ example: 'kg', description: 'Unidad de medida de la presentación (texto libre)' })
  @IsString({ message: 'La unidad de medida debe ser una cadena de texto.' })
  @Matches(/\S/, { message: 'La unidad de medida no puede estar vacía.' })
  unidadMedida: string;
}
