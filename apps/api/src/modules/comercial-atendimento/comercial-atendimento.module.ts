import { forwardRef, Module } from '@nestjs/common';
import { criarLookupController } from '../../common/lookups/lookup.controller';
import { ComprasEstoqueModule } from '../compras-estoque/compras-estoque.module';
import { ConfiguracoesGestaoModule } from '../configuracoes-gestao/configuracoes-gestao.module';
import { FinanceiroModule } from '../financeiro/financeiro.module';
import { GestaoProfissionaisModule } from '../gestao-profissionais/gestao-profissionais.module';
import { AgendaController } from './agenda/agenda.controller';
import { AtividadesController } from './atividades/atividades.controller';
import { AtividadesService } from './atividades/atividades.service';
import { CampanhasAgendador } from './campanhas/campanhas.agendador';
import {
  CampanhasController,
  MensagensAutomaticasController,
} from './campanhas/campanhas.controller';
import { CampanhasService } from './campanhas/campanhas.service';
import { DestinatariosService } from './campanhas/destinatarios.service';
import { EnviosCampanhaService } from './campanhas/envios-campanha.service';
import { MensagensAutomaticasService } from './campanhas/mensagens-automaticas.service';
import { PrepararEnviosConsumer } from './campanhas/preparar-envios.consumer';
import { AgendaService } from './agenda/agenda.service';
import { AgendamentosAtendimentoService } from './agenda/agendamentos-atendimento.service';
import { OrcamentosController } from './orcamentos/orcamentos.controller';
import { OrcamentosService } from './orcamentos/orcamentos.service';
import { OrigensClienteController } from './origens-cliente/origens-cliente.controller';
import { OrigensClienteService } from './origens-cliente/origens-cliente.service';
import { ConsultasRealizadasController } from './vendas/consultas-realizadas.controller';
import { ConsultasRealizadasService } from './vendas/consultas-realizadas.service';
import { VendasController } from './vendas/vendas.controller';
import { VendasService } from './vendas/vendas.service';
import { PacotesController } from './pacotes/pacotes.controller';
import { PacotesService } from './pacotes/pacotes.service';
import { CrmConfigController } from './pipeline/crm-config.controller';
import { CrmConfigService } from './pipeline/crm-config.service';
import { NegociosController } from './pipeline/negocios.controller';
import { NegociosListaController } from './pipeline/negocios-lista.controller';
import { NegociosListaService } from './pipeline/negocios-lista.service';
import { NegociosLookupService } from './pipeline/negocios-lookup.service';
import { NegociosService } from './pipeline/negocios.service';
import { PacientesController } from './pacientes/pacientes.controller';
import { PacientesService } from './pacientes/pacientes.service';
import { AtendimentoWhatsappController } from './whatsapp/atendimento-whatsapp.controller';
import { AtendimentoWhatsappService } from './whatsapp/atendimento-whatsapp.service';
import { ConversasWhatsappController } from './whatsapp/conversas-whatsapp.controller';
import { ConversasWhatsappService } from './whatsapp/conversas-whatsapp.service';
import { TagsAtendimentoController } from './whatsapp/tags-atendimento.controller';
import { MensagensSaidaWhatsappService } from './whatsapp/mensagens-saida-whatsapp.service';
import { TagsAtendimentoService } from './whatsapp/tags-atendimento.service';

/** Módulo COMERCIAL / ATENDIMENTO do inventário. Dono das entidades Paciente/Cliente, Origem de Cliente, Agendamento, Orçamento, Venda (Vendas/PDV), Conversa WhatsApp e Negócio (CRM). */
@Module({
  // Profissional pertence a gestao-profissionais, que por sua vez usa Paciente daqui.
  imports: [
    forwardRef(() => GestaoProfissionaisModule),
    ComprasEstoqueModule,
    ConfiguracoesGestaoModule,
    FinanceiroModule,
  ],
  controllers: [
    AgendaController,
    AtividadesController,
    CampanhasController,
    ConsultasRealizadasController,
    ConversasWhatsappController,
    CrmConfigController,
    criarLookupController('pacientes', PacientesService),
    criarLookupController('origens-cliente', OrigensClienteService),
    criarLookupController('negocios', NegociosLookupService),
    MensagensAutomaticasController,
    OrcamentosController,
    OrigensClienteController,
    PacientesController,
    PacotesController,
    NegociosController,
    NegociosListaController,
    TagsAtendimentoController,
    VendasController,
    // Depois de ConversasWhatsappController: "contadores" não pode ser lido como `:id`.
    AtendimentoWhatsappController,
  ],
  providers: [
    PacientesService,
    OrigensClienteService,
    AgendaService,
    AgendamentosAtendimentoService,
    OrcamentosService,
    ConsultasRealizadasService,
    PacotesService,
    VendasService,
    ConversasWhatsappService,
    AtendimentoWhatsappService,
    TagsAtendimentoService,
    CrmConfigService,
    NegociosService,
    NegociosListaService,
    NegociosLookupService,
    AtividadesService,
    MensagensSaidaWhatsappService,
    DestinatariosService,
    CampanhasService,
    MensagensAutomaticasService,
    EnviosCampanhaService,
    PrepararEnviosConsumer,
    CampanhasAgendador,
  ],
  exports: [PacientesService, OrigensClienteService, AgendamentosAtendimentoService],
})
export class ComercialAtendimentoModule {}
