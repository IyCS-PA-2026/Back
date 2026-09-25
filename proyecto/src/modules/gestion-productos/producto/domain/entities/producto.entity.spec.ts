import { Producto } from './producto.entity';
import { Presentacion } from '../value-objects/presentacion.vo';

describe('Producto - denominacion automatica (CR-005)', () => {
  it.each([
    [1, 'L', 'Natura Aceites 1 L'],
    [1, 'pack x6', 'Natura Aceites 1 pack x6'],
  ])(
    'genera la denominacion sugerida con presentacion %p %p',
    (cantidad, unidadMedida, esperada) => {
      const denominacion = Producto.generarDenominacionSugerida(
        { denominacion: 'Natura' },
        { denominacion: 'Aceites' },
        Presentacion.crear(cantidad, unidadMedida),
      );

      expect(denominacion).toBe(esperada);
    },
  );
});
