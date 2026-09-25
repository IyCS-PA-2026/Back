import { Usuario } from 'src/modules/gestion-usuario/usuario/domain/entities/usuario.entity';
import { AuditoriaDto } from 'src/modules/gestion-sistema/auditoria/dto/auditoria.dto';
import { CreateSuperLineaDto } from '../../dto/create-super-linea.dto';
import { UpdateSuperLineaDto } from '../../dto/update-super-linea.dto';
import { SuperLinea } from '../entities/super-linea.entity';

export interface ISuperLineaRepository {
  create(data: CreateSuperLineaDto): Promise<SuperLinea>;
  findAllListado(): Promise<SuperLinea[]>;
  findOne(id: number): Promise<SuperLinea | null>;
  findByDenominacionWith(denominacion: string): Promise<SuperLinea | null>;
  findByDenominacionFiltered(
    denominacion: string,
    skip: number,
    take: number,
    incluirEliminados: boolean,
  ): Promise<{ data: SuperLinea[]; total: number }>;
  findByIdConAuditoria(id: number): Promise<AuditoriaDto | null>;
  update(id: number, data: UpdateSuperLineaDto): Promise<SuperLinea>;
  remove(data: SuperLinea, usuario: Usuario): Promise<SuperLinea>;
}
