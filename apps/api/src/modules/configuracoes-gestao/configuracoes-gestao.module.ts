import { Module } from '@nestjs/common';
import { criarLookupController } from '../../common/lookups/lookup.controller';
import { criarRelatoriosController } from '../../common/relatorios/relatorios.controller';
import { CanaisWhatsappController } from './canais-whatsapp/canais-whatsapp.controller';
import { CanaisWhatsappService } from './canais-whatsapp/canais-whatsapp.service';
import { EmpresasService } from './empresas/empresas.service';
import { MinhaEmpresaController } from './minha-empresa/minha-empresa.controller';
import { MinhaEmpresaService } from './minha-empresa/minha-empresa.service';
import { PerfisAcessoController } from './perfis-acesso/perfis-acesso.controller';
import { PerfisAcessoService } from './perfis-acesso/perfis-acesso.service';
import { RelatoriosGestao } from './relatorios/relatorios-gestao';
import { RespostasRapidasController } from './respostas-rapidas/respostas-rapidas.controller';
import { RespostasRapidasService } from './respostas-rapidas/respostas-rapidas.service';
import { TiposAgendamentoController } from './tipos-agendamento/tipos-agendamento.controller';
import { TiposAgendamentoService } from './tipos-agendamento/tipos-agendamento.service';
import { UnidadesController } from './unidades/unidades.controller';
import { UnidadesService } from './unidades/unidades.service';
import { UsuariosController } from './usuarios/usuarios.controller';
import {
  PerfisLookupService,
  UsuariosLookupService,
  UsuariosService,
} from './usuarios/usuarios.service';

const SERVICES = [
  UnidadesService,
  EmpresasService,
  MinhaEmpresaService,
  TiposAgendamentoService,
  RespostasRapidasService,
  PerfisAcessoService,
  UsuariosService,
  PerfisLookupService,
  CanaisWhatsappService,
  UsuariosLookupService,
];

/**
 * Módulo CONFIGURAÇÕES / GESTÃO do inventário. Dono das entidades Empresa, Unidade,
 * Tipo de Agendamento, Resposta Rápida, Perfil de Acesso, Usuário e Canal WhatsApp.
 */
@Module({
  controllers: [
    MinhaEmpresaController,
    UnidadesController,
    TiposAgendamentoController,
    RespostasRapidasController,
    CanaisWhatsappController,
    PerfisAcessoController,
    UsuariosController,
    criarLookupController('empresas', EmpresasService),
    criarLookupController('unidades', UnidadesService),
    criarLookupController('tipos-agendamento', TiposAgendamentoService),
    criarLookupController('perfis', PerfisLookupService),
    criarLookupController('canais-whatsapp', CanaisWhatsappService),
    criarLookupController('usuarios', UsuariosLookupService),
    criarRelatoriosController('configuracoes-gestao.relatorios', RelatoriosGestao),
  ],
  providers: [...SERVICES, RelatoriosGestao],
  exports: SERVICES,
})
export class ConfiguracoesGestaoModule {}
