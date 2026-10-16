import { Module } from '@nestjs/common';
import { criarLookupController } from '../../common/lookups/lookup.controller';
import { criarRelatoriosController } from '../../common/relatorios/relatorios.controller';
import { EmpresasService } from './empresas/empresas.service';
import { RelatoriosGestao } from './relatorios/relatorios-gestao';
import { TiposAgendamentoService } from './tipos-agendamento/tipos-agendamento.service';
import { UnidadesController } from './unidades/unidades.controller';
import { UnidadesService } from './unidades/unidades.service';

const SERVICES = [UnidadesService, EmpresasService, TiposAgendamentoService];

/**
 * Módulo CONFIGURAÇÕES / GESTÃO do inventário. Dono das entidades Empresa, Unidade e
 * Tipo de Agendamento.
 */
@Module({
  controllers: [
    UnidadesController,
    criarLookupController('empresas', EmpresasService),
    criarLookupController('unidades', UnidadesService),
    criarLookupController('tipos-agendamento', TiposAgendamentoService),
    criarRelatoriosController('configuracoes-gestao.relatorios', RelatoriosGestao),
  ],
  providers: [...SERVICES, RelatoriosGestao],
  exports: SERVICES,
})
export class ConfiguracoesGestaoModule {}
