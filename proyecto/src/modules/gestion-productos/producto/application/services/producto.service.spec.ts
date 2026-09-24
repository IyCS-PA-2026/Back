import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ProductoService } from './producto.service';
import { LineaService } from 'src/modules/gestion-productos/linea/application/services/linea.service';
import { MarcaService } from 'src/modules/gestion-productos/marca/application/services/marca.service';
import { ProveedorService } from 'src/modules/organizacion/proveedor/application/services/proveedor.service';
import { UsuarioService } from 'src/modules/gestion-usuario/usuario/application/services/usuario.service';
import { UsuarioValidator } from 'src/modules/common/utils/validation/usuario-validator';
import { ProductoIntrinsicValidationService } from '../../domain/services/producto-intrinsic-validation.service.ts';
import { ProductoValidationService } from '../../domain/services/producto-validation.service.ts';
import { ProductoRelatedEntitiesValidator } from '../../infraestructure/validators/producto-related-entities.validator.ts';
import { ProductoUniquenessValidator } from '../../infraestructure/validators/producto-uniqueness.validator.ts';
import { ProductoDeletePolicy } from '../policies/producto-delete.policy';
import { Presentacion } from '../../domain/value-objects/presentacion.vo';
import { CreateProductoDto } from '../../dto/create-producto.dto';
import { UpdateProductoDto } from '../../dto/update-producto.dto';

/*
  CR-002 — Integración de Presentacion con los casos de uso de Producto.
  R5: todo Producto se crea con una presentación válida.
  R6: la presentación se reemplaza completa; si no se envía, se conserva.
*/
describe('ProductoService - presentación (CR-002)', () => {
  let service: ProductoService;

  const linea = { id: 1, sistema: 0 };
  const marca = { id: 2, sistema: 0 };
  const usuario = { id: 3 };

  const repository = {
    create: jest.fn(),
    update: jest.fn(),
    findOne: jest.fn(),
  };
  const uniquenessValidator = {
    validarDenominacionUnica: jest.fn(),
    validarCodigoProveedorUnico: jest.fn(),
  };
  const relatedEntitiesValidator = {
    validarYObtenerEntidadesRelacionadas: jest.fn(),
  };
  const usuarioValidator = { validarUsuarioExiste: jest.fn() };

  const createDto = (presentacion: unknown): CreateProductoDto =>
    ({
      denominacion: 'aceite girasol',
      lineaId: linea.id,
      marcaId: marca.id,
      alicuotaIva: 21,
      utilizaStockMinimo: false,
      precio: 100,
      usuarioCreatedId: usuario.id,
      presentacion,
    }) as CreateProductoDto;

  beforeEach(async () => {
    jest.clearAllMocks();

    repository.create.mockResolvedValue({ id: 10, denominacion: 'aceite girasol' });
    repository.update.mockResolvedValue({ id: 10, denominacion: 'aceite girasol' });
    repository.findOne.mockResolvedValue({
      id: 10,
      denominacion: 'aceite girasol',
      lineaId: linea.id,
      marcaId: marca.id,
      alicuotaIva: 21,
      presentacion: Presentacion.crear(1, 'unidad'),
    });
    relatedEntitiesValidator.validarYObtenerEntidadesRelacionadas.mockResolvedValue({
      linea,
      marca,
    });
    usuarioValidator.validarUsuarioExiste.mockResolvedValue(usuario);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductoService,
        ProductoIntrinsicValidationService,
        ProductoValidationService,
        { provide: 'IProductoRepository', useValue: repository },
        { provide: LineaService, useValue: {} },
        { provide: MarcaService, useValue: {} },
        { provide: ProveedorService, useValue: {} },
        { provide: UsuarioService, useValue: {} },
        { provide: ProductoRelatedEntitiesValidator, useValue: relatedEntitiesValidator },
        { provide: ProductoUniquenessValidator, useValue: uniquenessValidator },
        { provide: UsuarioValidator, useValue: usuarioValidator },
        { provide: ProductoDeletePolicy, useValue: {} },
      ],
    }).compile();

    service = module.get(ProductoService);
  });

  describe('create (R5)', () => {
    it('persiste el producto con un Value Object Presentacion construido desde el DTO', async () => {
      await service.create(createDto({ cantidad: 1.5, unidadMedida: 'kg' }));

      expect(repository.create).toHaveBeenCalledTimes(1);
      const presentacion = repository.create.mock.calls[0][4];
      expect(presentacion).toBeInstanceOf(Presentacion);
      expect(presentacion.equals(Presentacion.crear(1.5, 'kg'))).toBe(true);
    });

    it.each([
      ['sin presentación', undefined],
      ['cantidad 0', { cantidad: 0, unidadMedida: 'kg' }],
      ['cantidad negativa', { cantidad: -2, unidadMedida: 'kg' }],
      ['cantidad con 4 decimales', { cantidad: 1.2345, unidadMedida: 'kg' }],
      ['sin cantidad', { unidadMedida: 'kg' }],
      ['sin unidad de medida', { cantidad: 1 }],
      ['unidad de medida vacía', { cantidad: 1, unidadMedida: '   ' }],
    ])('rechaza el alta %s y no persiste nada', async (_caso, presentacion) => {
      await expect(service.create(createDto(presentacion))).rejects.toThrow(
        BadRequestException,
      );

      expect(repository.create).not.toHaveBeenCalled();
      // La regla de dominio se evalúa antes de consultar la base
      expect(uniquenessValidator.validarDenominacionUnica).not.toHaveBeenCalled();
    });
  });

  describe('update (R6)', () => {
    it('sin presentación en el DTO conserva la actual (pasa undefined al repositorio)', async () => {
      await service.update(10, {
        precio: 150,
        usuarioUpdatedId: usuario.id,
      } as UpdateProductoDto);

      expect(repository.update).toHaveBeenCalledTimes(1);
      expect(repository.update.mock.calls[0][5]).toBeUndefined();
    });

    it('con presentación en el DTO la reemplaza por un nuevo Value Object', async () => {
      await service.update(10, {
        presentacion: { cantidad: 500, unidadMedida: 'g' },
        usuarioUpdatedId: usuario.id,
      } as UpdateProductoDto);

      const presentacion = repository.update.mock.calls[0][5];
      expect(presentacion).toBeInstanceOf(Presentacion);
      expect(presentacion.equals(Presentacion.crear(500, 'g'))).toBe(true);
    });

    it('con presentación inválida no persiste nada', async () => {
      await expect(
        service.update(10, {
          presentacion: { cantidad: 0, unidadMedida: 'g' },
          usuarioUpdatedId: usuario.id,
        } as UpdateProductoDto),
      ).rejects.toThrow(BadRequestException);

      expect(repository.update).not.toHaveBeenCalled();
    });
  });
});
