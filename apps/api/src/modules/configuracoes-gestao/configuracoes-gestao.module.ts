import { forwardRef, Module } from '@nestjs/common';
import { ComercialAtendimentoModule } from '../comercial-atendimento/comercial-atendimento.module';
import { GestaoProfissionaisModule } from '../gestao-profissionais/gestao-profissionais.module';
import { criarLookupController } from '../../common/lookups/lookup.controller';
import { criarRelatoriosController } from '../../common/relatorios/relatorios.controller';
import { AiGrowthController } from './ai-growth/ai-growth.controller';
import { AiGrowthService } from './ai-growth/ai-growth.service';
import { AnalisarAiGrowthConsumer } from './ai-growth/analisar-ai-growth.consumer';
import { FontesInsightsAiGrowth } from './ai-growth/fontes-insights-ai-growth';
import { BaseConhecimentoController } from './base-conhecimento/base-conhecimento.controller';
import { BaseConhecimentoService } from './base-conhecimento/base-conhecimento.service';
import { BypassAgenteController } from './bypass-agente/bypass-agente.controller';
import { BypassAgenteService } from './bypass-agente/bypass-agente.service';
import { CanaisWhatsappController } from './canais-whatsapp/canais-whatsapp.controller';
import { CanaisWhatsappService } from './canais-whatsapp/canais-whatsapp.service';
import { ConfiguracoesController } from './configuracoes/configuracoes.controller';
import { ConfiguracoesService } from './configuracoes/configuracoes.service';
import { EmpresasService } from './empresas/empresas.service';
import { AgenteAlertasDestinosController } from './instrucoes-agente/agente-alertas-destinos.controller';
import { AgenteAlertasDestinosService } from './instrucoes-agente/agente-alertas-destinos.service';
import { AgenteInstrucoesController } from './instrucoes-agente/agente-instrucoes.controller';
import { AgenteInstrucoesExtrasController } from './instrucoes-agente/agente-instrucoes-extras.controller';
import { AgenteInstrucoesExtrasService } from './instrucoes-agente/agente-instrucoes-extras.service';
import { AgenteInstrucoesService } from './instrucoes-agente/agente-instrucoes.service';
import { AgenteRegrasController } from './instrucoes-agente/agente-regras.controller';
import { AgenteRegrasService } from './instrucoes-agente/agente-regras.service';
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
  ConfiguracoesService,
  TiposAgendamentoService,
  RespostasRapidasService,
  BaseConhecimentoService,
  BypassAgenteService,
  AgenteInstrucoesService,
  AgenteInstrucoesExtrasService,
  AgenteAlertasDestinosService,
  AgenteRegrasService,
  AiGrowthService,
  FontesInsightsAiGrowth,
  PerfisAcessoService,
  UsuariosService,
  PerfisLookupService,
  CanaisWhatsappService,
  UsuariosLookupService,
];

/**
 * Módulo CONFIGURAÇÕES / GESTÃO do inventário. Dono das entidades Empresa, Unidade,
 * Tipo de Agendamento, Resposta Rápida, Documento de Conhecimento, Perfil de Acesso, Usuário e Canal WhatsApp.
 */
@Module({
  // Os relatórios GES-02 a GES-04 usam services exportados destes módulos (que usam os daqui).
  imports: [
    forwardRef(() => ComercialAtendimentoModule),
    forwardRef(() => GestaoProfissionaisModule),
  ],
  controllers: [
    MinhaEmpresaController,
    ConfiguracoesController,
    UnidadesController,
    TiposAgendamentoController,
    RespostasRapidasController,
    BaseConhecimentoController,
    BypassAgenteController,
    AgenteInstrucoesController,
    AgenteInstrucoesExtrasController,
    AgenteAlertasDestinosController,
    AgenteRegrasController,
    AiGrowthController,
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
  providers: [...SERVICES, RelatoriosGestao, AnalisarAiGrowthConsumer],
  exports: SERVICES,
})
export class ConfiguracoesGestaoModule {}
