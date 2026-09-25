import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Rol } from 'src/modules/gestion-usuario/rol/domain/entities/rol.entity';
import { Usuario } from 'src/modules/gestion-usuario/usuario/domain/entities/usuario.entity';
import { In, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';

@Injectable()
export class SeedUsuarioService {
  constructor(

    @InjectRepository(Rol)
    private readonly rolRepository: Repository<Rol>,

    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,

  ) { }


  // Seed de Roles
  async seedRol() {
    /* ojo no cambiar el orden */
    const entryData =  [

      { denominacion: 'Administrador' },
      { denominacion: 'Empleado' },
      { denominacion: 'Repositor' },
      { denominacion: 'Vendedor' },
      { denominacion: 'Admin' },
      { denominacion: 'Repartidor' },
      { denominacion: 'Cobrador' },

    ];


    for (const data of entryData) {
      const exists = await this.rolRepository.findOneBy({
        denominacion: data.denominacion
      });

      if (!exists) {
        const dataGuardada = this.rolRepository.create(data); 
        await this.rolRepository.save(dataGuardada);
        console.log(`✅ Rol "${data.denominacion}" creado.`);
      } else {
        console.log(`⚠️ Rol"${data.denominacion}" ya existe.`);
      }
    }
  }


 // Seed de Usuarios
async seedUsuario() {

  const entryData = [
    // "Administrador" es el rol que exigen los endpoints de gestión (@Roles)
    { mail: 'admin@gmail.com', contrasena: 'admin123', roles: ["Admin", "Administrador"], denominacion:"Admin" },

  ];

  for (const data of entryData) {

    const roles = await this.rolRepository.findBy({
      denominacion: In(data.roles)
    });

    if (roles.length !== data.roles.length) {
      console.log(`❌ No se encontraron todos los roles "${data.roles.join(', ')}".`);
      continue;
    }

    const exists = await this.usuarioRepository.findOne({
      where: { mail: data.mail },
      relations: ['roles'],
    });

    if (exists) {
      // Bases creadas con el seed anterior: se agregan los roles faltantes
      const faltantes = roles.filter((rol) => !exists.roles.some((r) => r.id === rol.id));
      if (faltantes.length > 0) {
        exists.roles = [...exists.roles, ...faltantes];
        await this.usuarioRepository.save(exists);
        console.log(`✅ Usuario "${data.mail}": roles agregados ${faltantes.map((r) => r.denominacion).join(', ')}.`);
      } else {
        console.log(`⚠️ Usuario "${data.mail}" ya existe.`);
      }
      continue;
    }

    const contrasenaHasheada = await bcrypt.hash(data.contrasena, 10);

    const usuario = this.usuarioRepository.create({
      mail: data.mail,
      contrasena: contrasenaHasheada,
      denominacion: data.denominacion,
      roles,
    });

    await this.usuarioRepository.save(usuario);

    console.log(`✅ Usuario "${data.mail}" creado.`);
  }
}


  // Ejecutar todos los seeds
  async runAllSeeds() {
    console.log('🚀 Iniciando todos los seeds...');
  
    await this.seedRol();
    await this.seedUsuario();
    console.log('✅ Todos los seeds completados.');
  }
}

