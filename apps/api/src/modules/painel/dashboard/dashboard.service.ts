import { Injectable } from '@nestjs/common';
import type { AbaPainel, BasePeriodo, DashboardPainel, FiltrosPainel } from '@torres/shared';
import { PacientesService } from '../../comercial-atendimento/pacientes/pacientes.service';
import { IndicadoresFinanceirosService } from '../../financeiro/indicadores/indicadores.service';
import { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import { abaComercial } from './abas/comercial';
import { abaExecutivo } from './abas/executivo';
import { abaFinanceiro } from './abas/financeiro';
import { abaOcupacao } from './abas/ocupacao';
import { abaPacientes } from './abas/pacientes';
import type { ConstrutorAba, DadosPainel } from './blocos';
import { periodoDoPainel } from './periodo-painel';

const ABAS: Record<AbaPainel, ConstrutorAba> = {
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
  ) {}

  async obter(aba: AbaPainel, filtros: FiltrosPainel): Promise<DashboardPainel> {
    const periodo = periodoDoPainel(filtros);
    const dados = await this.carregarDados(aba, periodo, filtros.base);
    return { aba, periodo, base: filtros.base, secoes: ABAS[aba](dados) };
  }

  /** Só consulta o que a aba usa. */
  private async carregarDados(
    aba: AbaPainel,
    periodo: { de: string; ate: string },
    base: BasePeriodo,
  ): Promise<DadosPainel> {
    const [profissionaisAtivos, totalPacientes, financeiro] = await Promise.all([
      aba === 'comercial' ? this.profissionais.contarAtivos() : 0,
      aba === 'pacientes' ? this.pacientes.contar() : 0,
      // Mesma fonte da tela Financeiro > Indicadores (issue #50).
      aba === 'financeiro' ? this.indicadores.calcular(periodo.de, periodo.ate, base) : null,
    ]);
    return { profissionaisAtivos, totalPacientes, financeiro };
  }
}
