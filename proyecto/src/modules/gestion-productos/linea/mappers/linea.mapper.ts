import { Logger } from '@nestjs/common';
import { Linea } from '../domain/entities/linea.entity';
import { LineaDto } from '../dto/linea.dto';
import { toReferenciaDtoOrEmpty } from 'src/modules/common/utils/mappers/referencia.mapper';

export class LineaMapper {
  private static readonly logger = new Logger(LineaMapper.name);

  static toDto(entity: Linea): LineaDto {
    return {
      id: entity.id,
      denominacion: entity.denominacion,
      stockMinimo: entity.stockMinimo,
      utilizaStockMinimo: entity.utilizaStockMinimo,
      observacion: entity.observacion ?? '',
      superLinea: toReferenciaDtoOrEmpty(entity.superLinea),
      sistema: entity.sistema,
      deletedAt: entity.deletedAt ? entity.deletedAt.toISOString() : null,

    };
  }
}
