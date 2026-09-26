import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';


@Injectable()
export class NormalizeDenominacionPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    if (value?.denominacion != null && typeof value.denominacion !== 'string') {
      throw new BadRequestException('La denominación debe ser una cadena.');
    }

    if (typeof value?.denominacion === 'string') {
      const normalizedValue = value.denominacion.trim().toUpperCase();
      value.denominacion = normalizedValue;
    }
    return value;
  }
}
