import { Injectable } from '@nestjs/common';
import type { AbaPainel, DashboardPainel, FiltrosPainel } from '@torres/shared';
import { EscopoDadosService } from '../../../common/auth/escopo-dados.service';
import { AgendaOcupacaoService } from '../../comercial-atendimento/agenda/agenda-ocupacao.service';
import { NegociosListaService } from '../../comercial-atendimento/pipeline/negocios-lista.service';
import { RecepcaoService } from '../../comercial-atendimento/recepcao/recepcao.service';
import { PacientesService } from '../../comercial-atendimento/pacientes/pacientes.service';
import { IndicadoresFinanceirosService } from '../../financeiro/indicadores/indicadores.service';
import { InadimplenciaService } from '../../financeiro/inadimplencia/inadimplencia.service';
import { ContratosSalaService } from '../../gestao-profissionais/salas/contratos-sala.service';
import { SalasService } from '../../gestao-profissionais/salas/salas.service';
import { ProfissionaisClassificacaoService } from '../../gestao-profissionais/profissionais/profissionais-classificacao.service';
import { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import { OcupacaoService } from '../ocupacao/ocupacao.service';
import { abaComercial } from './abas/comercial';
import { abaExecutivo } from './abas/executivo';
import { abaFinanceiro } from './abas/financeiro';
import { abaOcupacao } from './abas/ocupacao';
import { abaPacientes } from './abas/pacientes';
import { abaHoje } from './abas/hoje';
import type { ConstrutorAba, DadosHoje, DadosPainel } from './blocos';
import { periodoDoPainel } from './periodo-painel';

const ABAS: Record<AbaPainel, ConstrutorAba> = {
  hoje: abaHoje,
  executivo: abaExecutivo,
  comercial: abaComercial,
  ocupacao: abaOcupacao,
  financeiro: abaFinanceiro,
  pacientes: abaPacientes,
};

/**
 * Dashboard do módulo Painel. Só lê: os dados dos outros módulos vêm dos services exportados
 * por eles. Indicadores cujo módulo dono ainda não existe saem sem valor (`null`) ou com a
 * tabela vazia, e passam a ser preenchidos quando o módulo dono expuser a consulta.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly profissionais: ProfissionaisService,
    private readonly pacientes: PacientesService,
    private readonly indicadores: IndicadoresFinanceirosService,
    private readonly ocupacao: OcupacaoService,
    private readonly classificacao: ProfissionaisClassificacaoService,
    private readonly recepcao: RecepcaoService,
    private readonly agendaOcupacao: AgendaOcupacaoService,
    private readonly salas: SalasService,
    private readonly contratosSala: ContratosSalaService,
    private readonly negocios: NegociosListaService,
    private readonly inadimplencia: InadimplenciaService,
    private readonly indicadoresFinanceiros: IndicadoresFinanceirosService,
    private readonly escopo: EscopoDadosService,
  ) {}

  async obter(
    aba: AbaPainel,
    filtros: FiltrosPainel,
    empresaId?: string,
  ): Promise<DashboardPainel> {
    const periodo = periodoDoPainel(filtros);
    const dados = await this.carregarDados(aba, periodo, filtros, empresaId);
    return { aba, periodo, base: filtros.base, secoes: ABAS[aba](dados) };
  }

  /** Só consulta o que a aba usa. */
  private async carregarDados(
    aba: AbaPainel,
    periodo: { de: string; ate: string },
    filtros: FiltrosPainel,
    empresaId?: string,
  ): Promise<DadosPainel> {
    const { base } = filtros;
    const [profissionaisAtivos, totalPacientes, financeiro, ocupacao, parceiros, hoje] =
      await Promise.all([
        aba === 'comercial' ? this.profissionais.contarAtivos() : 0,
        aba === 'pacientes' ? this.pacientes.contar() : 0,
        // Mesma fonte da tela Financeiro > Indicadores (issue #50).
        aba === 'financeiro' ? this.indicadores.calcular(periodo.de, periodo.ate, base) : null,
        aba === 'ocupacao' ? this.ocupacao.calcular(filtros, periodo, empresaId) : null,
        aba === 'executivo' ? this.classificacao.resumo() : null,
        aba === 'hoje' ? this.carregarHoje(periodo) : null,
      ]);
    return { profissionaisAtivos, totalPacientes, financeiro, ocupacao, parceiros, hoje };
  }

  /**
   * Aba Hoje (#170). A agenda segue o escopo do usuário; salas, financeiro e comercial são visão da
   * administração e ficam de fora para o perfil restrito a profissionais (#153).
   */
  private async carregarHoje(periodo: { de: string; ate: string }): Promise<DadosHoje> {
    const atendimento = await this.recepcao.resumoDoDia();
    if (this.escopo.restrito()) {
      return { periodo, atendimento, geral: null, financeiro: null, comercial: null };
    }
    const [profissionaisAtivos, salas, ocupadas, receber, vencidos, porMarco, contratos] =
      await Promise.all([
        this.profissionais.contarAtivos(),
        this.salas.listarParaMatriz(),
        this.agendaOcupacao.salasOcupadasEm(new Date()),
        this.indicadoresFinanceiros.resumoReceber(periodo.de, periodo.ate),
        this.inadimplencia.painel().then((p) => p.vencidos),
        this.negocios.contarAbertosPorMarco(),
        this.contratosSala.contarAguardandoAssinatura(),
      ]);
    return {
      periodo,
      atendimento,
      geral: {
        profissionaisAtivos,
        salasTotal: salas.length,
        salasOcupadas: salas.filter((s) => ocupadas.has(s.id)).length,
      },
      financeiro: {
        receber,
        vencido: { valor: Number(vencidos.valor), quantidade: vencidos.quantidade },
      },
      comercial: { porMarco, contratosAguardandoAssinatura: contratos },
    };
  }
}
