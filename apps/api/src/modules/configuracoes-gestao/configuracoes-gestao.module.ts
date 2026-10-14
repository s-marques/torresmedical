import { Module } from '@nestjs/common';
import { UnidadesController } from './unidades/unidades.controller';
import { UnidadesService } from './unidades/unidades.service';

/** Módulo CONFIGURAÇÕES / GESTÃO do inventário. Dono das entidades Empresa e Unidade. */
@Module({
  controllers: [UnidadesController],
  providers: [UnidadesService],
  exports: [UnidadesService],
})
export class ConfiguracoesGestaoModule {}
