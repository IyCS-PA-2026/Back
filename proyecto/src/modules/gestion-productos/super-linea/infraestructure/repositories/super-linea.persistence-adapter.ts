import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { DatabaseConnectionException } from 'src/modules/common/exceptions/database-connection.exception';
import { EntityNotFoundException } from 'src/modules/common/exceptions/entity-notFound-exceptions';
import { IUnitOfWork } from 'src/modules/common/unit-of-work/iunit-of-work.';
import { Transactional } from 'src/modules/common/decorators/transactional.decoratos';
import { Usuario } from 'src/modules/gestion-usuario/usuario/domain/entities/usuario.entity';
import { AuditoriaDto } from 'src/modules/gestion-sistema/auditoria/dto/auditoria.dto';
import { FechaUtils } from 'src/modules/common/utils/date/fecha-utils';
import { QueryBuilderHelper } from 'src/modules/common/query-builders/query-builder-helpers';
import { BasePersistenceAdapter } from 'src/modules/common/persistence/base-persistence.adapter';
import { handleDatabaseError } from 'src/modules/common/query-builders/database-error.helper';
import { SuperLinea } from '../../domain/entities/super-linea.entity';
import { ISuperLineaRepository } from '../../domain/interfaces/super-linea.repository.interface';
import { CreateSuperLineaDto } from '../../dto/create-super-linea.dto';
import { UpdateSuperLineaDto } from '../../dto/update-super-linea.dto';
import { Linea } from '../../../linea/domain/entities/linea.entity';

@Injectable()
export class SuperLineaPersistenceAdapter
  extends BasePersistenceAdapter<SuperLinea>
  implements ISuperLineaRepository
{
  private readonly logger = new Logger(SuperLineaPersistenceAdapter.name);

  protected readonly ALIAS = 'superLinea';

  constructor(
    @InjectRepository(SuperLinea)
    repository: Repository<SuperLinea>,

    private readonly dataSource: DataSource,
    @Inject('UnitOfWork') public readonly uow: IUnitOfWork,
  ) {
    super(repository);
  }

  @Transactional()
  async create(data: CreateSuperLineaDto): Promise<SuperLinea> {
    const repo = this.uow.getRepository(SuperLinea);

    try {
      const nuevaEntity = repo.create({
        denominacion: data.denominacion,
        observacion: data.observacion,
        usuarioCreatedId: data.usuarioCreatedId,
      });

      return await repo.save(nuevaEntity);
    } catch (error) {
      this.logger.error(`Error al conectar con la base de datos: ${error}`);
      throw new DatabaseConnectionException(
        'Error al guardar en la base de datos.',
      );
    }
  }

  @Transactional()
  async update(id: number, data: UpdateSuperLineaDto): Promise<SuperLinea> {
    const repo = this.uow.getRepository(SuperLinea);

    const entity = await repo.findOne({ where: { id } });

    if (!entity) {
      throw new NotFoundException(`SuperLínea con ID ${id} no encontrada`);
    }

    entity.denominacion = data.denominacion ?? entity.denominacion;
    entity.observacion = data.observacion ?? entity.observacion;
    entity.usuarioUpdatedId = data.usuarioUpdatedId;

    return await repo.save(entity);
  }

  async findOne(id: number): Promise<SuperLinea | null> {
    try {
      const entity = await this.baseQuery()
        .andWhere(`${this.ALIAS}.id = :id`, { id })
        .getOne();

      if (!entity) {
        throw new EntityNotFoundException('Entidad no encontrada');
      }

      return entity;
    } catch (error) {
      if (error instanceof EntityNotFoundException) {
        throw error;
      }

      throw new DatabaseConnectionException(
        'Error al conectar con la base de datos.',
      );
    }
  }

  async findAllListado(): Promise<SuperLinea[]> {
    try {
      const query = this.baseQuery();
      QueryBuilderHelper.applyOrder(query, this.ALIAS, 'denominacion', 'ASC');
      return await query.getMany();
    } catch (error) {
      handleDatabaseError(this.logger, 'findAllListado', error);
    }
  }

  async findByDenominacionWith(
    denominacion: string,
  ): Promise<SuperLinea | null> {
    try {
      const normalizada = denominacion.trim().toUpperCase();

      return await this.baseQueryWithDeleted()
        .where(`UPPER(${this.ALIAS}.denominacion) = :denominacion`, {
          denominacion: normalizada,
        })
        .getOne();
    } catch (error) {
      handleDatabaseError(this.logger, 'findByDenominacionWith', error);
    }
  }

  async findByDenominacionFiltered(
    denominacion: string,
    skip = 0,
    take = 10,
    incluirEliminados = false,
  ): Promise<{ data: SuperLinea[]; total: number }> {
    try {
      const query = this.baseQuery(incluirEliminados);

      if (denominacion) {
        query.andWhere(`UPPER(${this.ALIAS}.denominacion) LIKE :denominacion`, {
          denominacion: `%${denominacion.toUpperCase()}%`,
        });
      }

      QueryBuilderHelper.applyOrder(query, this.ALIAS, 'denominacion', 'ASC');
      QueryBuilderHelper.applyPagination(query, skip, take);

      const [data, total] = await query.getManyAndCount();
      return { data, total };
    } catch (error) {
      handleDatabaseError(this.logger, 'findBy', error);
    }
  }

  // La SuperLínea tiene ciclo de vida propio: al eliminarla, sus líneas
  // quedan desagrupadas en lugar de bloquear la eliminación.
  @Transactional()
  async remove(entity: SuperLinea, usuario: Usuario): Promise<SuperLinea> {
    const repo = this.uow.getRepository(SuperLinea);
    const lineaRepo = this.uow.getRepository(Linea);

    await lineaRepo.update(
      { superLineaId: entity.id },
      { superLineaId: null },
    );

    entity.deletedAt = new Date();
    entity.usuarioDeletedId = usuario.id;
    await repo.save(entity);

    return entity;
  }

  async findByIdConAuditoria(id: number): Promise<AuditoriaDto | null> {
    try {
      const raw = await this.repository
        .createQueryBuilder('superLinea')
        .withDeleted()
        .leftJoin(
          'usuario',
          'usuarioCreated',
          'usuarioCreated.id = superLinea.usuarioCreatedId',
        )
        .leftJoin(
          'usuario',
          'usuarioUpdated',
          'usuarioUpdated.id = superLinea.usuarioUpdatedId',
        )
        .leftJoin(
          'usuario',
          'usuarioDeleted',
          'usuarioDeleted.id = superLinea.usuarioDeletedId',
        )
        .addSelect([
          'superLinea.id as superLinea_id',
          'superLinea.denominacion as superLinea_denominacion',
          'superLinea.createdAt as superLinea_createdAt',
          'superLinea.updatedAt as superLinea_updatedAt',
          'superLinea.deletedAt as superLinea_deletedAt',
          'usuarioCreated.denominacion as usuarioCreated_nombre',
          'usuarioUpdated.denominacion as usuarioUpdated_nombre',
          'usuarioDeleted.denominacion as usuarioDeleted_nombre',
        ])
        .where('superLinea.id = :id', { id })
        .getRawOne();

      if (!raw) return null;

      return {
        id: raw.superLinea_id ?? 0,
        detalle: raw.superLinea_denominacion
          ? `superlínea ${raw.superLinea_denominacion}`
          : 'superlínea (sin denominación)',
        createdAt: raw.superLinea_createdAt
          ? FechaUtils.formatFechaHora(raw.superLinea_createdAt)
          : '',
        updatedAt: raw.superLinea_updatedAt
          ? FechaUtils.formatFechaHora(raw.superLinea_updatedAt)
          : '',
        deletedAt: raw.superLinea_deletedAt
          ? FechaUtils.formatFechaHora(raw.superLinea_deletedAt)
          : '',
        usuarioCreated: raw.usuarioCreated_nombre ?? '',
        usuarioUpdated: raw.usuarioUpdated_nombre ?? '',
        usuarioDeleted: raw.usuarioDeleted_nombre ?? '',
      };
    } catch (error) {
      this.logger.error(`Error en findByIdConAuditoria: ${error}`);
      throw new DatabaseConnectionException(
        'Error al conectar con la base de datos.',
      );
    }
  }
}
