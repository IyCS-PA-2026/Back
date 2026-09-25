import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { UsuarioValidator } from 'src/modules/common/utils/validation/usuario-validator';
import { EntityNotFoundException } from 'src/modules/common/exceptions/entity-notFound-exceptions';
import { ILineaRepository } from 'src/modules/gestion-productos/linea/domain/interfaces/linea.repository.interface';
import { IProductoRepository } from '../interfaces/producto.repository-interface';
import { HistorialPrecio } from '../entities/historial-precio.entity';
import { ActualizacionMasivaPreciosDto } from '../../dto/actualizacion-masiva-precios.dto';
import {
  AlcanceActualizacionPrecios,
  ModalidadActualizacionPrecios,
} from '../../enums/actualizacion-masiva-precios.enum';

/*
  CR-006 — Actualización masiva de precios.
  - porcentaje: el valor pasa a ser el nuevo margen de cada producto (margen 20 = 20 % de ganancia).
  - monto: el valor se suma al costo de cada producto; el margen se conserva.
  En ambos casos el precio lo deriva Producto.calcularPrecio().
  Atomicidad total: se valida todo el conjunto en memoria y recién después se persiste,
  en una única transacción. Si un solo producto queda inválido no se modifica ninguno.
*/
@Injectable()
export class ActualizacionMasivaPreciosService {
  private readonly logger = new Logger(ActualizacionMasivaPreciosService.name);

  constructor(
    @Inject('IProductoRepository')
    private readonly productoRepository: IProductoRepository,
    @Inject('ILineaRepository')
    private readonly lineaRepository: ILineaRepository,
    private readonly usuarioValidator: UsuarioValidator,
  ) {}

  async ejecutar(
    dto: ActualizacionMasivaPreciosDto,
  ): Promise<{ productosActualizados: number }> {
    const usuario = await this.usuarioValidator.validarUsuarioExiste(
      dto.usuarioId,
    );

    const lineaId =
      dto.alcance === AlcanceActualizacionPrecios.LINEA ? dto.lineaId : undefined;

    if (lineaId !== undefined) {
      // El repositorio de Línea lanza EntityNotFoundException (404) en vez de devolver null
      const linea = await this.lineaRepository.findOne(lineaId).catch((error) => {
        if (error instanceof EntityNotFoundException) return null;
        throw error;
      });
      if (!linea) {
        throw new BadRequestException(`La línea con ID ${lineaId} no existe.`);
      }
    }

    const productos =
      await this.productoRepository.findActivosParaActualizacionPrecio(lineaId);

    // Validación previa de TODO el conjunto: los cambios quedan solo en memoria.
    // CR-007: el registro de historial (regla precio > 0) también se crea y valida acá, antes de persistir.
    const motivo = this.motivoHistorial(dto, lineaId);
    const rechazos: string[] = [];
    const historial: HistorialPrecio[] = [];
    for (const producto of productos) {
      try {
        const precioAnterior = producto.precio ?? 0;
        if (dto.modalidad === ModalidadActualizacionPrecios.PORCENTAJE) {
          producto.aplicarMargen(dto.valor);
        } else {
          producto.aplicarCosto((producto.costo ?? 0) + dto.valor);
        }
        const cambioDePrecio = producto.registrarCambioDePrecio(precioAnterior, motivo);
        if (cambioDePrecio) historial.push(cambioDePrecio);
      } catch (error) {
        rechazos.push(error instanceof Error ? error.message : String(error));
      }
    }

    if (rechazos.length > 0) {
      throw new BadRequestException(
        `Actualización cancelada, no se modificó ningún producto. ${rechazos.join(' ')}`,
      );
    }

    await this.productoRepository.guardarPreciosEnLote(productos, usuario, historial);

    this.logger.log(
      `Actualización masiva (${dto.alcance}, ${dto.modalidad} ${dto.valor}): ${productos.length} productos`,
    );

    return { productosActualizados: productos.length };
  }

  // Ej.: "Actualización masiva por porcentaje: margen 30% (línea 2)"
  private motivoHistorial(dto: ActualizacionMasivaPreciosDto, lineaId?: number): string {
    const detalle =
      dto.modalidad === ModalidadActualizacionPrecios.PORCENTAJE
        ? `margen ${dto.valor}%`
        : `${dto.valor >= 0 ? '+' : ''}${dto.valor} al costo`;
    const alcance = lineaId !== undefined ? `línea ${lineaId}` : 'global';
    return `Actualización masiva por ${dto.modalidad}: ${detalle} (${alcance})`;
  }
}
