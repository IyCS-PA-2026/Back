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
import { Producto } from '../../domain/entities/producto.entity';
import { CreateProductoDto } from '../../dto/create-producto.dto';
import { UpdateProductoDto } from '../../dto/update-producto.dto';
import { AlicuotaIva } from 'src/modules/organizacion/enums/alicuota-iva.enum';

const buildCreateDto = (
  overrides: Partial<CreateProductoDto> = {},
): CreateProductoDto =>
  ({
    denominacion: 'arroz largo fino',
    utilizaStockMinimo: false,
    utilizaPack: false,
    lineaId: 1,
    marcaId: 1,
    alicuotaIva: AlicuotaIva.ALICUOTA_21,
    usuarioCreatedId: 1,
    costo: 100,
    precio: 150,
    stock: 10,
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

describe('ProductoService', () => {
  let service: ProductoService;
  let repository: { create: jest.Mock; update: jest.Mock; findOne: jest.Mock };
  let uniquenessValidator: {
    validarDenominacionUnica: jest.Mock;
    validarCodigoProveedorUnico: jest.Mock;
  };

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
            validarYObtenerEntidadesRelacionadas: jest
              .fn()
              .mockResolvedValue({ marca: { id: 1 }, linea: { id: 1 } }),
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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('CA7: con datos válidos y stock mínimo configurado, persiste el producto', async () => {
      const dto = buildCreateDto({ utilizaStockMinimo: true, stockMinimo: 5 });

      await expect(service.create(dto)).resolves.toBeDefined();
      expect(repository.create).toHaveBeenCalledWith(
        dto,
        { id: 1 },
        { id: 1 },
        { id: 1 },
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

    it('CA3: denominacion vacía → rechaza y no persiste', async () => {
      await expect(
        service.create(buildCreateDto({ denominacion: '' })),
      ).rejects.toThrow('La denominación es obligatoria');
      expect(repository.create).not.toHaveBeenCalled();
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

    it('producto actual con stock mínimo válido y dto sin esos campos → persiste', async () => {
      repository.findOne.mockResolvedValue(
        buildProductoActual({ utilizaStockMinimo: true, stockMinimo: 5 }),
      );

      await service.update(7, buildUpdateDto({ precio: 200 }));
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
        service.update(7, buildUpdateDto({ precio: 200 })),
      ).rejects.toThrow(
        'El stock mínimo es obligatorio cuando se utiliza stock mínimo',
      );
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('CA3: denominacion vacía en el dto no se reemplaza por la actual → rechaza', async () => {
      repository.findOne.mockResolvedValue(buildProductoActual());

      await expect(
        service.update(7, buildUpdateDto({ denominacion: '' })),
      ).rejects.toThrow('La denominación es obligatoria');
      expect(repository.update).not.toHaveBeenCalled();
    });
  });
});
