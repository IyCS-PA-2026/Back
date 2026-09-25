import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CreateProductoOperacionDto {
  @IsNotEmpty({ message: 'La cantidad es obligatoria.' })
  @IsNumber({}, { message: 'La cantidad debe ser un número.' })
  cantidad: number;

  @IsNotEmpty({ message: 'El motivo es obligatorio.' })
  @IsString({ message: 'El motivo debe ser una cadena de texto.' })
  motivo: string;
}
