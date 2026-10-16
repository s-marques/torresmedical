import { Injectable } from '@nestjs/common';
import type { AtivoStatus, Sort, UnidadeExportColumn } from '@torres/shared';
import type { Unidade } from '../../../generated/prisma/client';
import {
  definirRelatorio,
  type ProvedorRelatorios,
  type ReportDefinition,
} from '../../../common/relatorios/relatorio.types';
import { UNIDADE_EXPORT_DEFINITIONS, UnidadesService } from '../unidades/unidades.service';

/** Código do relatório de exemplo da infraestrutura (#82). A tela de Relatórios de Gestão (#34) o substitui. */
export const RELATORIO_EXEMPLO_ID = 'EX-01';

/**
 * Relatórios da tela Relatórios de Gestão (`/gestao/relatorios`). Por enquanto só o exemplo
 * da infraestrutura: unidades cadastradas no período, com as colunas do grid de Unidades.
 */
@Injectable()
export class RelatoriosGestao implements ProvedorRelatorios {
  readonly relatorios: readonly ReportDefinition[];

  constructor(unidades: UnidadesService) {
    this.relatorios = [
      definirRelatorio<Unidade>({
        id: RELATORIO_EXEMPLO_ID,
        nome: 'Unidades cadastradas no período',
        // Unidades são dados da tela Minha Empresa: quem não a vê não vê o relatório.
        permissao: 'configuracoes-gestao.minha-empresa.ver',
        colunas: UNIDADE_EXPORT_DEFINITIONS.map((coluna) => ({ ...coluna, ordenavel: true })),
        ordenacaoPadrao: 'createdAt:asc',
        filtros: [
          {
            tipo: 'select',
            parametro: 'status',
            rotulo: 'Status',
            opcoes: [
              { valor: 'ativo', rotulo: 'Ativo' },
              { valor: 'inativo', rotulo: 'Inativo' },
            ],
          },
        ],
        buscar: (consulta, pagina) =>
          unidades.cadastradasNoPeriodo(
            { intervalo: consulta.intervalo, status: consulta.filtros.status as AtivoStatus },
            consulta.sort as Sort<UnidadeExportColumn>,
            pagina,
          ),
        contar: (consulta) =>
          unidades.contarCadastradasNoPeriodo({
            intervalo: consulta.intervalo,
            status: consulta.filtros.status as AtivoStatus,
          }),
      }),
    ];
  }
}
