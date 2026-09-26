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
import { Producto } from '../../domain/entities/producto.entity';
import { AlicuotaIva } from 'src/modules/organizacion/enums/alicuota-iva.enum';

/*
  CR-002 — Integración de Presentacion con los casos de uso de Producto.
  R5: todo Producto se crea con una presentación válida.
  R6: la presentación se reemplaza completa; si no se envía, se conserva.
*/
describe('ProductoService - presentación (CR-002)', () => {
  let service: ProductoService;

  const linea = { id: 1, denominacion: 'Aceites', sistema: 0 };
  const marca = { id: 2, denominacion: 'Natura', sistema: 0 };
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
      costo: 100,
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
      ['ausente', undefined],
      ['vacia', ''],
      ['solo espacios', '   '],
    ])('genera la denominacion sugerida cuando viene %s', async (_caso, denominacion) => {
      await service.create({
        ...createDto({ cantidad: 1, unidadMedida: 'L' }),
        denominacion,
      } as CreateProductoDto);

      expect(uniquenessValidator.validarDenominacionUnica).toHaveBeenCalledWith(
        'Natura Aceites 1 L',
      );
      expect(repository.create.mock.calls[0][0].denominacion).toBe(
        'Natura Aceites 1 L',
      );
    });

    it('conserva la denominacion manual valida enviada en el alta', async () => {
      await service.create({
        ...createDto({ cantidad: 1, unidadMedida: 'pack x6' }),
        denominacion: 'Nombre manual',
      } as CreateProductoDto);

      expect(uniquenessValidator.validarDenominacionUnica).toHaveBeenCalledWith(
        'Nombre manual',
      );
      expect(repository.create.mock.calls[0][0].denominacion).toBe(
        'Nombre manual',
      );
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
        costo: 150,
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
      expect(repository.update.mock.calls[0][1].denominacion).toBeUndefined();
      expect(uniquenessValidator.validarDenominacionUnica).not.toHaveBeenCalled();
    });

    it('permite editar manualmente la denominacion en una actualizacion', async () => {
      await service.update(10, {
        denominacion: 'nombre editado',
        usuarioUpdatedId: usuario.id,
      } as UpdateProductoDto);

      expect(uniquenessValidator.validarDenominacionUnica).toHaveBeenCalledWith(
        'nombre editado',
        10,
      );
      expect(repository.update.mock.calls[0][1].denominacion).toBe(
        'nombre editado',
      );
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

/*
  CR-001 — Validación de datos (US-001) en los casos de uso de Producto.
  Integrado sobre el modelo actual: el alta lleva Presentacion (CR-002), una
  denominación vacía en el alta se genera (CR-005) y el precio no se recibe,
  se deriva de costo y margen (CR-006).
*/
describe('ProductoService - validación de datos (CR-001)', () => {
  let service: ProductoService;
  let repository: { create: jest.Mock; update: jest.Mock; findOne: jest.Mock };
  let uniquenessValidator: {
    validarDenominacionUnica: jest.Mock;
    validarCodigoProveedorUnico: jest.Mock;
  };

  const buildCreateDto = (
    overrides: Partial<CreateProductoDto> = {},
  ): CreateProductoDto =>
    ({
      denominacion: 'arroz largo fino',
      utilizaStockMinimo: false,
      lineaId: 1,
      marcaId: 1,
      alicuotaIva: AlicuotaIva.ALICUOTA_21,
      usuarioCreatedId: 1,
      costo: 100,
      stock: 10,
      presentacion: { cantidad: 1, unidadMedida: 'kg' },
      ...overrides,
    }) as CreateProductoDto;

  const buildUpdateDto = (
    overrides: Partial<UpdateProductoDto> = {},
  ): UpdateProductoDto =>
    ({ usuarioUpdatedId: 1, ...overrides }) as UpdateProductoDto;

  const buildProductoActual = (overrides: Partial<Producto> = {}): Producto =>
    ({
      id: 7,
      denominacion: 'arroz largo fino',
      marcaId: 1,
      lineaId: 1,
      alicuotaIva: AlicuotaIva.ALICUOTA_21,
      utilizaStockMinimo: false,
      stockMinimo: null,
      ...overrides,
    }) as unknown as Producto;

  beforeEach(async () => {
    repository = {
      create: jest.fn().mockResolvedValue({ denominacion: 'arroz largo fino' }),
      update: jest.fn().mockResolvedValue({ denominacion: 'arroz largo fino' }),
      findOne: jest.fn(),
    };
    uniquenessValidator = {
      validarDenominacionUnica: jest.fn().mockResolvedValue(undefined),
      validarCodigoProveedorUnico: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductoService,
        // Validación de dominio real: es lo que se quiere verificar
        ProductoIntrinsicValidationService,
        { provide: 'IProductoRepository', useValue: repository },
        { provide: LineaService, useValue: {} },
        { provide: MarcaService, useValue: {} },
        { provide: ProveedorService, useValue: {} },
        { provide: UsuarioService, useValue: {} },
        {
          provide: ProductoValidationService,
          useValue: { validarEntidadesRelacionadas: jest.fn() },
        },
        {
          provide: ProductoRelatedEntitiesValidator,
          useValue: {
            validarYObtenerEntidadesRelacionadas: jest.fn().mockResolvedValue({
              marca: { id: 1, denominacion: 'Gallo' },
              linea: { id: 1, denominacion: 'Arroz' },
            }),
          },
        },
        { provide: ProductoUniquenessValidator, useValue: uniquenessValidator },
        {
          provide: UsuarioValidator,
          useValue: { validarUsuarioExiste: jest.fn().mockResolvedValue({ id: 1 }) },
        },
        { provide: ProductoDeletePolicy, useValue: {} },
      ],
    }).compile();

    service = module.get<ProductoService>(ProductoService);
  });

  describe('create', () => {
    it('CA7: con datos válidos y stock mínimo configurado, persiste el producto', async () => {
      const dto = buildCreateDto({ utilizaStockMinimo: true, stockMinimo: 5 });

      await expect(service.create(dto)).resolves.toBeDefined();
      expect(repository.create).toHaveBeenCalledWith(
        dto,
        expect.objectContaining({ id: 1 }),
        expect.objectContaining({ id: 1 }),
        { id: 1 },
        expect.any(Presentacion),
      );
    });

    it('CA5: utilizaStockMinimo = true sin stockMinimo → rechaza y no persiste', async () => {
      const dto = buildCreateDto({ utilizaStockMinimo: true });

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
      expect(uniquenessValidator.validarDenominacionUnica).not.toHaveBeenCalled();
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('CA6: utilizaStockMinimo = false sin stockMinimo → persiste', async () => {
      await service.create(buildCreateDto({ utilizaStockMinimo: false }));
      expect(repository.create).toHaveBeenCalledTimes(1);
    });

    // El CA3 original ("denominación vacía → rechaza") lo reemplaza CR-005 (US-006):
    // en el alta, una denominación vacía se genera como Marca + Línea + Presentación.
    it('CA3 (ajustado por CR-005): denominación vacía en el alta se genera en lugar de rechazarse', async () => {
      await service.create(buildCreateDto({ denominacion: '' }));

      expect(repository.create).toHaveBeenCalledTimes(1);
      expect(repository.create.mock.calls[0][0].denominacion).toBe('Gallo Arroz 1 kg');
    });
  });

  describe('update (combina valores nuevos con el estado actual)', () => {
    it('CA5: activa utilizaStockMinimo sin stockMinimo en dto ni en el producto actual → rechaza', async () => {
      repository.findOne.mockResolvedValue(
        buildProductoActual({ utilizaStockMinimo: false, stockMinimo: null as any }),
      );

      await expect(
        service.update(7, buildUpdateDto({ utilizaStockMinimo: true })),
      ).rejects.toThrow(BadRequestException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('activa utilizaStockMinimo informando stockMinimo → persiste', async () => {
      repository.findOne.mockResolvedValue(buildProductoActual());

      await service.update(
        7,
        buildUpdateDto({ utilizaStockMinimo: true, stockMinimo: 4 }),
      );
      expect(repository.update).toHaveBeenCalledTimes(1);
    });

    it('activa utilizaStockMinimo y toma el stockMinimo ya guardado en el producto → persiste', async () => {
      repository.findOne.mockResolvedValue(
        buildProductoActual({ utilizaStockMinimo: false, stockMinimo: 3 }),
      );

      await service.update(7, buildUpdateDto({ utilizaStockMinimo: true }));
      expect(repository.update).toHaveBeenCalledTimes(1);
    });

    // CR-006: el precio ya no se edita; se usa el costo como campo ajeno al stock mínimo
    it('producto actual con stock mínimo válido y dto sin esos campos → persiste', async () => {
      repository.findOne.mockResolvedValue(
        buildProductoActual({ utilizaStockMinimo: true, stockMinimo: 5 }),
      );

      await service.update(7, buildUpdateDto({ costo: 200 }));
      expect(repository.update).toHaveBeenCalledTimes(1);
    });

    it('CA6: desactiva utilizaStockMinimo → persiste aunque no haya stockMinimo', async () => {
      repository.findOne.mockResolvedValue(
        buildProductoActual({ utilizaStockMinimo: true, stockMinimo: null as any }),
      );

      await service.update(7, buildUpdateDto({ utilizaStockMinimo: false }));
      expect(repository.update).toHaveBeenCalledTimes(1);
    });

    it('producto actual inconsistente (utilizaStockMinimo = true, stockMinimo null) → rechaza cualquier modificación que no informe stockMinimo', async () => {
      repository.findOne.mockResolvedValue(
        buildProductoActual({ utilizaStockMinimo: true, stockMinimo: null as any }),
      );

      await expect(
        service.update(7, buildUpdateDto({ costo: 200 })),
      ).rejects.toThrow(
        'El stock mínimo es obligatorio cuando se utiliza stock mínimo',
      );
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('CA3: denominación vacía en la edición → rechaza (mensaje de CR-005)', async () => {
      repository.findOne.mockResolvedValue(buildProductoActual());

      await expect(
        service.update(7, buildUpdateDto({ denominacion: '' })),
      ).rejects.toThrow('La denominación no puede estar vacía.');
      expect(repository.update).not.toHaveBeenCalled();
    });
  });
});
