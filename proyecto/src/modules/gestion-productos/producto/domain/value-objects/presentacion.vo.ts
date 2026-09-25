import { BadRequestException } from '@nestjs/common';
import { Column } from 'typeorm';

/*
  CR-002: Presentación del producto (ej: 500 g, 1.5 kg, 12 unidades).
  Reemplaza a utilizaPack / cantidadPorPack.

  Value Object inmutable, persistido como embedded de Producto
  (columnas presentacionCantidad y presentacionUnidadmedida).
*/
export class Presentacion {
  // decimal(12,3): misma precisión que las cantidades del producto (stock).
  // Sin default: una cantidad por defecto violaría la regla cantidad > 0.
  @Column('decimal', {
    precision: 12,
    scale: 3,
    transformer: {
      to: (value: number | null | undefined) => value?.toString(),
      from: (value: string | null) => (value == null ? value : Number(value)),
    },
  })
  readonly cantidad: number;

  // Texto libre: CR-002 no define una lista cerrada ni un largo máximo.
  @Column({ type: 'text' })
  readonly unidadMedida: string;

  static readonly MAX_DECIMALES_CANTIDAD = 3;

  // Privado: la única forma válida de crear una Presentacion es crear().
  // TypeORM lo invoca sin argumentos al hidratar la entidad.
  private constructor(cantidad?: number, unidadMedida?: string) {
    this.cantidad = cantidad as number;
    this.unidadMedida = unidadMedida as string;
  }

  // Acepta valores ausentes para poder rechazarlos con la regla correspondiente
  static crear(
    cantidad: number | null | undefined,
    unidadMedida: string | null | undefined,
  ): Presentacion {
    Presentacion.validarCantidad(cantidad);
    Presentacion.validarUnidadMedida(unidadMedida);
    // Sin Object.freeze: TypeORM hace merge sobre la entidad luego del save.
    // La inmutabilidad la garantizan readonly y el constructor privado.
    return new Presentacion(cantidad, unidadMedida);
  }

  equals(otra: Presentacion | null | undefined): boolean {
    if (!otra) return false;
    return (
      this.cantidad === otra.cantidad && this.unidadMedida === otra.unidadMedida
    );
  }

  private static validarCantidad(
    cantidad: number | null | undefined,
  ): asserts cantidad is number {
    if (typeof cantidad !== 'number' || !Number.isFinite(cantidad)) {
      throw new BadRequestException(
        'La cantidad de la presentación es obligatoria y debe ser un número.',
      );
    }
    if (cantidad <= 0) {
      throw new BadRequestException(
        'La cantidad de la presentación debe ser mayor que 0.',
      );
    }
    // Coherencia con decimal(12,3): más decimales se redondearían en la base.
    if (
      Number(cantidad.toFixed(Presentacion.MAX_DECIMALES_CANTIDAD)) !== cantidad
    ) {
      throw new BadRequestException(
        `La cantidad de la presentación admite hasta ${Presentacion.MAX_DECIMALES_CANTIDAD} decimales.`,
      );
    }
  }

  private static validarUnidadMedida(
    unidadMedida: string | null | undefined,
  ): asserts unidadMedida is string {
    if (typeof unidadMedida !== 'string' || unidadMedida.trim().length === 0) {
      throw new BadRequestException(
        'La unidad de medida de la presentación es obligatoria y no puede estar vacía.',
      );
    }
  }
}
