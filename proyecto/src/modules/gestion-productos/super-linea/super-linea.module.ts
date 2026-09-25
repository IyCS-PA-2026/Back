import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NormalizeDenominacionPipe } from 'src/modules/common/pipes/normalize-denominations.pipe';
import { IUnitOfWork } from 'src/modules/common/unit-of-work/iunit-of-work.';
import { TypeOrmUnitOfWork } from 'src/modules/common/unit-of-work/type-orm-unit-of-works1';
import { UsuarioModule } from 'src/modules/gestion-usuario/usuario/usuario.module';
import { SuperLinea } from './domain/entities/super-linea.entity';
import { SuperLineaController } from './application/controllers/super-linea.controller';
import { SuperLineaService } from './application/services/super-linea.service';
import { SuperLineaRepository } from './infraestructure/repositories/super-linea.repository';
import { SuperLineaPersistenceAdapter } from './infraestructure/repositories/super-linea.persistence-adapter';

@Module({
  imports: [TypeOrmModule.forFeature([SuperLinea]), UsuarioModule],
  controllers: [SuperLineaController],
  providers: [
    SuperLineaService,
    {
      provide: 'ISuperLineaRepository',
      useClass: SuperLineaRepository,
    },
    {
      provide: 'UnitOfWork',
      useFactory: (dataSource: DataSource): IUnitOfWork => {
        return new TypeOrmUnitOfWork(dataSource);
      },
      inject: [DataSource],
    },
    NormalizeDenominacionPipe,
    SuperLineaPersistenceAdapter,
  ],
  exports: [TypeOrmModule, SuperLineaService],
})
export class SuperLineaModule {}
