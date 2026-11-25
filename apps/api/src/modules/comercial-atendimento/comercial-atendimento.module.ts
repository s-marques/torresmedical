import { InsightsAgendaAiGrowth } from './ai-growth/insights-agenda.fonte';
import { PacientesLoteFonte } from './pacientes/pacientes-lote.fonte';
import { AgendamentosLoteFonte } from './agenda/agendamentos-lote.fonte';
import { forwardRef, Module } from '@nestjs/common';
import { criarRelatoriosController } from '../../common/relatorios/relatorios.controller';
import { criarLookupController } from '../../common/lookups/lookup.controller';
import { ComprasEstoqueModule } from '../compras-estoque/compras-estoque.module';
import { ConfiguracoesGestaoModule } from '../configuracoes-gestao/configuracoes-gestao.module';
import { ConsultorioAssistencialModule } from '../consultorio-assistencial/consultorio-assistencial.module';
import { FinanceiroModule } from '../financeiro/financeiro.module';
import { GestaoProfissionaisModule } from '../gestao-profissionais/gestao-profissionais.module';
import { AgendaConflitosService } from './agenda/agenda-conflitos.service';
import { AgendaController } from './agenda/agenda.controller';
import { RecepcaoController } from './recepcao/recepcao.controller';
import { RecepcaoService } from './recepcao/recepcao.service';
import { AgendaMatrizController } from './agenda/agenda-matriz.controller';
import { AgendaMatrizService } from './agenda/agenda-matriz.service';
import { AgendaOcupacaoService } from './agenda/agenda-ocupacao.service';
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
import { ConfirmacoesAgendador } from './confirmacoes/confirmacoes.agendador';
import { ConfirmacoesConfigService } from './confirmacoes/confirmacoes-config.service';
import { ConfirmacoesController } from './confirmacoes/confirmacoes.controller';
import { ConfirmacoesService } from './confirmacoes/confirmacoes.service';
import { EnvioConfirmacaoService } from './confirmacoes/envio-confirmacao.service';
import { GruposWhatsappController } from './grupos-whatsapp/grupos-whatsapp.controller';
import { GruposWhatsappService } from './grupos-whatsapp/grupos-whatsapp.service';
import { ProvedorGruposVazio } from './grupos-whatsapp/provedor-grupos-vazio';
import { ProvedorGruposWhatsapp } from './grupos-whatsapp/provedor-grupos-whatsapp';
import { EnviarPesquisaNpsConsumer } from './pesquisa-nps/enviar-pesquisa-nps.consumer';
import { EnvioPesquisaNpsService } from './pesquisa-nps/envio-pesquisa-nps.service';
import { PesquisaNpsController } from './pesquisa-nps/pesquisa-nps.controller';
import { PesquisaNpsService } from './pesquisa-nps/pesquisa-nps.service';
import { EnvioPesquisaProfissionalService } from './pesquisa-profissional/envio-pesquisa-profissional.service';
import { PesquisaProfissionalAgendador } from './pesquisa-profissional/pesquisa-profissional.agendador';
import { PesquisaProfissionalConfigService } from './pesquisa-profissional/pesquisa-profissional-config.service';
import { PesquisaProfissionalController } from './pesquisa-profissional/pesquisa-profissional.controller';
import { PesquisaProfissionalPublicaController } from './pesquisa-profissional/pesquisa-profissional-publica.controller';
import { PesquisaProfissionalService } from './pesquisa-profissional/pesquisa-profissional.service';
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
import { MensalidadesController } from './mensalidades/mensalidades.controller';
import { MensalidadesTitulosService } from './mensalidades/mensalidades-titulos.service';
import { MensalidadesService } from './mensalidades/mensalidades.service';
import { PacotesController } from './pacotes/pacotes.controller';
import { RelatoriosComercial } from './relatorios/relatorios-comercial';
import { PacotesService } from './pacotes/pacotes.service';
import { CrmConfigController } from './pipeline/crm-config.controller';
import { CrmConfigService } from './pipeline/crm-config.service';
import { NegociosController } from './pipeline/negocios.controller';
import { NegociosListaController } from './pipeline/negocios-lista.controller';
import { NegociosListaService } from './pipeline/negocios-lista.service';
import { NegociosLookupService } from './pipeline/negocios-lookup.service';
import { NegociosHistoricoService } from './pipeline/negocios-historico.service';
import { NegociosService } from './pipeline/negocios.service';
import { IndicadoresGestaoService } from './indicadores-gestao/indicadores-gestao.service';
import { ConsentimentosPacienteService } from './pacientes/consentimentos-paciente.service';
import { PacientesController } from './pacientes/pacientes.controller';
import { PacientesDuplicidadeService } from './pacientes/pacientes-duplicidade.service';
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
  // Consultório: pacientes vinculados ao profissional do usuário (tela Pacientes, issue #153).
  imports: [
    forwardRef(() => GestaoProfissionaisModule),
    forwardRef(() => ConsultorioAssistencialModule),
    forwardRef(() => ComprasEstoqueModule),
    forwardRef(() => ConfiguracoesGestaoModule),
    FinanceiroModule,
  ],
  controllers: [
    AgendaController,
    RecepcaoController,
    AgendaMatrizController,
    AtividadesController,
    CampanhasController,
    ConfirmacoesController,
    GruposWhatsappController,
    PesquisaNpsController,
    PesquisaProfissionalController,
    PesquisaProfissionalPublicaController,
    ConsultasRealizadasController,
    ConversasWhatsappController,
    CrmConfigController,
    criarLookupController('pacientes', PacientesService),
    criarLookupController('origens-cliente', OrigensClienteService),
    criarLookupController('negocios', NegociosLookupService),
    criarRelatoriosController('comercial-atendimento.relatorios', RelatoriosComercial),
    MensagensAutomaticasController,
    OrcamentosController,
    OrigensClienteController,
    PacientesController,
    PacotesController,
    MensalidadesController,
    NegociosController,
    NegociosListaController,
    TagsAtendimentoController,
    VendasController,
    // Depois de ConversasWhatsappController: "contadores" não pode ser lido como `:id`.
    AtendimentoWhatsappController,
  ],
  providers: [
    PacientesLoteFonte,
    AgendamentosLoteFonte,
    PacientesService,
    ConsentimentosPacienteService,
    PacientesDuplicidadeService,
    OrigensClienteService,
    AgendaService,
    RecepcaoService,
    AgendaMatrizService,
    AgendaOcupacaoService,
    AgendaConflitosService,
    AgendamentosAtendimentoService,
    OrcamentosService,
    ConsultasRealizadasService,
    PacotesService,
    MensalidadesService,
    MensalidadesTitulosService,
    VendasService,
    ConversasWhatsappService,
    AtendimentoWhatsappService,
    TagsAtendimentoService,
    CrmConfigService,
    NegociosService,
    NegociosHistoricoService,
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
    ConfirmacoesConfigService,
    EnvioConfirmacaoService,
    ConfirmacoesService,
    GruposWhatsappService,
    { provide: ProvedorGruposWhatsapp, useClass: ProvedorGruposVazio },
    ConfirmacoesAgendador,
    PesquisaNpsService,
    EnvioPesquisaNpsService,
    EnviarPesquisaNpsConsumer,
    PesquisaProfissionalService,
    PesquisaProfissionalConfigService,
    EnvioPesquisaProfissionalService,
    PesquisaProfissionalAgendador,
    InsightsAgendaAiGrowth,
    RelatoriosComercial,
    IndicadoresGestaoService,
  ],
  exports: [
    PacientesService,
    OrigensClienteService,
    AgendamentosAtendimentoService,
    OrcamentosService,
    PesquisaNpsService,
    // NPS dos profissionais por mês, para o relatório mensal (issue #145).
    PesquisaProfissionalService,
    // Agendamentos por sala: ocupação efetiva do Painel (#139).
    AgendaOcupacaoService,
    // Relatórios GES-02 e GES-04 de Configurações / Gestão.
    IndicadoresGestaoService,
    // Eventos do CRM na linha do tempo do profissional (#144).
    NegociosHistoricoService,
  ],
})
export class ComercialAtendimentoModule {}
