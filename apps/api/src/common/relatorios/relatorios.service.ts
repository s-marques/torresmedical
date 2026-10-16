import { Injectable } from '@nestjs/common';
import {
  consultaRelatorioSchema,
  exportRelatorioSchema,
  type CatalogoRelatorios,
  type ExportFormat,
  type LinhaRelatorio,
  type OpcoesConsultaRelatorio,
  type Permissao,
  type RelatorioResumo,
  type Sort,
} from '@torres/shared';
import { ApiException } from '../errors/api.exception';
import { ErrorCode } from '../errors/error-codes';
import { ExportService, selectColumns } from '../export/export.service';
import type { ExportFile } from '../export/export.types';
import type { Page } from '../pagination/paginate';
import { ZodValidationPipe } from '../validation/zod-validation.pipe';
import { formatarDia, intervaloDoPeriodo } from './periodo';
import type { ConsultaRelatorio, ReportDefinition } from './relatorio.types';

export const RELATORIO_NAO_ENCONTRADO = 'Relatório não encontrado';

/** Permissões do usuário da requisição (o guard global já exigiu a da tela). */
export type PermissoesUsuario = ReadonlySet<Permissao>;

interface Schemas {
  consulta: ZodValidationPipe<ReturnType<typeof consultaRelatorioSchema>>;
  exportacao: ZodValidationPipe<ReturnType<typeof exportRelatorioSchema>>;
}

/**
 * Regras comuns das telas de Relatórios: catálogo filtrado por permissão, resolução do relatório
 * (404/403), validação da query pelo schema do relatório, paginação e exportação Excel/PDF.
 */
@Injectable()
export class RelatoriosService {
  private readonly schemas = new WeakMap<ReportDefinition, Schemas>();

  constructor(private readonly exportService: ExportService) {}

  /** Relatórios que o usuário pode ver, com colunas e filtros para o front montar o grid. */
  catalogo(
    definicoes: readonly ReportDefinition[],
    permissoes: PermissoesUsuario,
  ): CatalogoRelatorios {
    return {
      data: definicoes
        .filter((definicao) => permitido(definicao, permissoes))
        .map((definicao) => resumo(definicao)),
    };
  }

  /** 404 para id desconhecido; 403 sem a permissão do relatório. */
  resolver(
    definicoes: readonly ReportDefinition[],
    id: string,
    permissoes: PermissoesUsuario,
  ): ReportDefinition {
    const definicao = definicoes.find((item) => item.id === id);
    if (!definicao) {
      throw new ApiException(404, 'RELATORIO_NAO_ENCONTRADO', RELATORIO_NAO_ENCONTRADO);
    }
    if (!permitido(definicao, permissoes)) {
      throw new ApiException(403, ErrorCode.FORBIDDEN, 'Sem permissão');
    }
    return definicao;
  }

  /** Página do resultado no contrato `{ data, meta }`. Query inválida → 400. */
  async consultar(definicao: ReportDefinition, query: unknown): Promise<Page<LinhaRelatorio>> {
    const { page, pageSize, ...valores } = this.schemasDe(definicao).consulta.transform(query);
    const consulta = consultaDe(definicao, valores);
    const [linhas, total] = await Promise.all([
      definicao.buscar(consulta, { skip: (page - 1) * pageSize, take: pageSize }),
      definicao.contar(consulta),
    ]);
    return {
      data: linhas.map((linha) => linhaDe(definicao, linha)),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  /** Arquivo com todas as linhas do período e as colunas pedidas. Acima do limite → 422. */
  async exportar(definicao: ReportDefinition, query: unknown): Promise<ExportFile> {
    const { format, columns, ...valores } = this.schemasDe(definicao).exportacao.transform(query);
    const consulta = consultaDe(definicao, valores);
    this.exportService.ensureWithinLimit(await definicao.contar(consulta));
    const { de, ate } = consulta.periodo;
    return this.exportService.export({
      format: format as ExportFormat,
      title: `${definicao.id} — ${definicao.nome} (${formatarDia(de)} a ${formatarDia(ate)})`,
      filename: `relatorio-${definicao.id.toLowerCase()}`,
      columns: selectColumns(definicao.colunas, columns),
      rows: await definicao.buscar(consulta),
    });
  }

  private schemasDe(definicao: ReportDefinition): Schemas {
    let schemas = this.schemas.get(definicao);
    if (!schemas) {
      const opcoes = opcoesDe(definicao);
      schemas = {
        consulta: new ZodValidationPipe(consultaRelatorioSchema(opcoes)),
        exportacao: new ZodValidationPipe(exportRelatorioSchema(opcoes)),
      };
      this.schemas.set(definicao, schemas);
    }
    return schemas;
  }
}

function permitido(definicao: ReportDefinition, permissoes: PermissoesUsuario): boolean {
  return !definicao.permissao || permissoes.has(definicao.permissao);
}

function resumo(definicao: ReportDefinition): RelatorioResumo {
  return {
    id: definicao.id,
    nome: definicao.nome,
    colunas: definicao.colunas.map((coluna) => ({
      id: coluna.key,
      titulo: coluna.header,
      tipo: coluna.type ?? 'text',
      ordenavel: coluna.ordenavel === true,
    })),
    filtros: [...(definicao.filtros ?? [])],
  };
}

function opcoesDe(definicao: ReportDefinition): OpcoesConsultaRelatorio {
  const [primeira, ...demais] = definicao.colunas.map((coluna) => coluna.key);
  if (primeira === undefined) throw new Error(`Relatório ${definicao.id} sem colunas.`);
  return {
    colunas: [primeira, ...demais],
    ordenaveis: definicao.colunas.filter((coluna) => coluna.ordenavel).map((coluna) => coluna.key),
    ordenacaoPadrao: definicao.ordenacaoPadrao,
    filtros: definicao.filtros ?? [],
  };
}

function consultaDe(
  definicao: ReportDefinition,
  {
    de,
    ate,
    sort,
    ...resto
  }: { de: string; ate: string; sort?: unknown } & Record<string, unknown>,
): ConsultaRelatorio {
  const filtros: Record<string, string | undefined> = {};
  for (const { parametro } of definicao.filtros ?? []) {
    filtros[parametro] = resto[parametro] as string | undefined;
  }
  return {
    periodo: { de, ate },
    intervalo: intervaloDoPeriodo(de, ate),
    sort: sort as Sort | undefined,
    filtros,
  };
}

function linhaDe(definicao: ReportDefinition, linha: unknown): LinhaRelatorio {
  return Object.fromEntries(definicao.colunas.map((coluna) => [coluna.key, coluna.value(linha)]));
}
