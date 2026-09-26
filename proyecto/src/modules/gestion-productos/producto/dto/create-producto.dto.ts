import { Transform, Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  MaxLength,
  Matches,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsInt,
  IsEnum,
  IsPositive,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { AlicuotaIva } from 'src/modules/organizacion/enums/alicuota-iva.enum';
import { PresentacionDto } from './presentacion.dto';
import { MARGEN_MAXIMO } from '../domain/entities/producto.entity';

export class CreateProductoDto {
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const normalizada = value.trim().toLowerCase();
    return normalizada.length === 0 ? undefined : normalizada;
  })
  @IsOptional()
  @IsString({ message: 'La denominación debe ser una cadena de texto.' }) // Valida que sea string
  @IsNotEmpty({ message: 'La denominación no puede estar vacía.' }) // Valida que no esté vacía
  @MaxLength(255, { message: 'La denominación no puede estar vacía.' })
  /*  @Matches(/^[A-Za-z0-9 áéíóúÁÉÍÓÚñÑ.\-/]+$/, {
    message:
      'La denominación solo puede contener letras, números, espacios, puntos, guiones y barras.',
  }) */
  @Matches(/^[\w áéíóúÁÉÍÓÚñÑ.\-/%]+$/, {
    message: 'La denominación contiene caracteres inválidos ',
  })
  denominacion?: string;

  @IsOptional()
  @IsString()
  observacion?: string;

  // si no tiene poner vacio
  @IsOptional()
  @IsString()
  codigoProveedor?: string;

  @IsOptional()
  @IsString()
  codigoBarra?: string;

  @IsOptional()
  @IsString()
  codigoReferencia?: string;

  @IsOptional()
  @IsString()
  ubicacion?: string;

  @IsBoolean()
  utilizaStockMinimo: boolean;

  @IsOptional()
  @IsInt()
  stockMinimo?: number;

  @IsOptional()
  @IsInt()
  @Min(0, { message: 'El stock no puede ser negativo.' })
  stock?: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  costoEnDolar?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  destacado?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  envioGratis?: boolean;

  @IsOptional()
  @IsNumber()
  @IsPositive({ message: 'El costo debe ser mayor que 0.' })
  costo?: number;

  // CR-002: obligatoria al crear. Si falta, @ValidateNested la rechaza
  // (no es un objeto); en UpdateProductoDto PartialType la vuelve opcional.
  @ValidateNested()
  @Type(() => PresentacionDto)
  presentacion: PresentacionDto;

  @IsOptional()
  @IsNumber()
  costoDolar?: number;

  @IsNotEmpty({ message: 'La linea es obligatoria.' })
  @IsInt({ message: 'La linea  debe ser un número entero.' })
  lineaId: number;


  @IsNotEmpty({ message: 'La marca es obligatoria.' })
  @IsInt({ message: 'La marca  debe ser un número entero.' })
  marcaId: number;


  // Margen (%). El precio no se recibe: lo deriva Producto.calcularPrecio()
  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'El margen no puede ser negativo.' })
  @Max(MARGEN_MAXIMO, { message: `El margen no puede superar ${MARGEN_MAXIMO}.` })
  porcentaje?: number;

  // CR-001 + CR-006: el precio no es un dato de entrada (forbidNonWhitelisted lo
  // rechaza). La regla "precio resultante > 0" la valida HistorialPrecio (CR-007).

  createdAt?: Date;

  @IsEnum(AlicuotaIva, {
    message:
      'tipo debe ser ALICUOTA_0  ALICUOTA_105, ALICUOTA_21, ALICUOTA_27,',
  })
  @Transform(({ value }) => {
    // Si el valor es un string, lo convierte al valor numérico del enum
    if (typeof value === 'string') {
      return AlicuotaIva[value.toUpperCase() as keyof typeof AlicuotaIva];
    }
    return value;
  })
  alicuotaIva: AlicuotaIva;

  @IsNotEmpty({ message: 'El usuarioCreatedId es obligatorio.' })
  @IsInt({ message: 'El usuarioCreatedId debe ser un número entero.' })
  usuarioCreatedId: number;

}
