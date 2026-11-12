import { forwardRef, Module } from '@nestjs/common';
import { criarLookupController } from '../../common/lookups/lookup.controller';
import { ComprasEstoqueModule } from '../compras-estoque/compras-estoque.module';
import { ConfiguracoesGestaoModule } from '../configuracoes-gestao/configuracoes-gestao.module';
import { FinanceiroModule } from '../financeiro/financeiro.module';
import { GestaoProfissionaisModule } from '../gestao-profissionais/gestao-profissionais.module';
import { AgendaController } from './agenda/agenda.controller';
import { AgendaService } from './agenda/agenda.service';
import { OrcamentosController } from './orcamentos/orcamentos.controller';
import { OrcamentosService } from './orcamentos/orcamentos.service';
import { OrigensClienteController } from './origens-cliente/origens-cliente.controller';
import { OrigensClienteService } from './origens-cliente/origens-cliente.service';
import { ConsultasRealizadasController } from './vendas/consultas-realizadas.controller';
import { ConsultasRealizadasService } from './vendas/consultas-realizadas.service';
import { VendasController } from './vendas/vendas.controller';
import { VendasService } from './vendas/vendas.service';
import { PacientesController } from './pacientes/pacientes.controller';
import { PacientesService } from './pacientes/pacientes.service';
import { AtendimentoWhatsappController } from './whatsapp/atendimento-whatsapp.controller';
import { AtendimentoWhatsappService } from './whatsapp/atendimento-whatsapp.service';
import { ConversasWhatsappController } from './whatsapp/conversas-whatsapp.controller';
import { ConversasWhatsappService } from './whatsapp/conversas-whatsapp.service';
import { TagsAtendimentoController } from './whatsapp/tags-atendimento.controller';
import { TagsAtendimentoService } from './whatsapp/tags-atendimento.service';

/** Módulo COMERCIAL / ATENDIMENTO do inventário. Dono das entidades Paciente/Cliente, Origem de Cliente, Agendamento, Orçamento, Venda (Vendas/PDV) e Conversa WhatsApp. */
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
    ConsultasRealizadasController,
    ConversasWhatsappController,
    criarLookupController('pacientes', PacientesService),
    criarLookupController('origens-cliente', OrigensClienteService),
    OrcamentosController,
    OrigensClienteController,
    PacientesController,
    TagsAtendimentoController,
    VendasController,
    // Depois de ConversasWhatsappController: "contadores" não pode ser lido como `:id`.
    AtendimentoWhatsappController,
  ],
  providers: [
    PacientesService,
    OrigensClienteService,
    AgendaService,
    OrcamentosService,
    ConsultasRealizadasService,
    VendasService,
    ConversasWhatsappService,
    AtendimentoWhatsappService,
    TagsAtendimentoService,
  ],
  exports: [PacientesService, OrigensClienteService],
})
export class ComercialAtendimentoModule {}
