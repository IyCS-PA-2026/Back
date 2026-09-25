import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthGuard } from 'src/modules/gestion-usuario/auth/auth.guard';
import { Roles } from 'src/modules/gestion-usuario/auth/roles.decorator';
import { ActualizacionMasivaPreciosDto } from '../../dto/actualizacion-masiva-precios.dto';
import { ActualizacionMasivaPreciosService } from '../../domain/services/actualizacion-masiva-precios.service';

@ApiTags('Gestion Productos')
@Controller('productos')
@UseGuards(AuthGuard)
export class ActualizacionMasivaPreciosController {
  constructor(private readonly service: ActualizacionMasivaPreciosService) {}

  @Post('actualizacion-masiva-precios')
  @HttpCode(HttpStatus.OK)
  @Roles('Root', 'Administrador', 'Empleado')
  actualizar(@Body() dto: ActualizacionMasivaPreciosDto) {
    return this.service.ejecutar(dto);
  }
}
