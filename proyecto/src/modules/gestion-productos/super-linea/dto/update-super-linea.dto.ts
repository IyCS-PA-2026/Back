import { PartialType } from '@nestjs/mapped-types';
import { CreateSuperLineaDto } from './create-super-linea.dto';
import { IsInt, IsNotEmpty } from 'class-validator';

export class UpdateSuperLineaDto extends PartialType(CreateSuperLineaDto) {
  updatedAt: Date;

  @IsNotEmpty({ message: 'El usuarioUpdatedId es obligatorio.' })
  @IsInt({ message: 'El usuarioUpdatedId debe ser un número entero.' })
  usuarioUpdatedId: number;
}
