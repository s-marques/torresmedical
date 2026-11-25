import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import { exportPrescricoesQuerySchema } from '@torres/shared';
import {
  ExportacaoLoteFontes,
  FonteExportacaoLoteBase,
  type ArquivoDoLote,
  type TabelaDoLote,
} from '../../../common/export/exportacao-lote.fontes';
import { ExportService } from '../../../common/export/export.service';
import type { ExportColumn } from '../../../common/export/export.types';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { PrescricoesService } from '../receituarios/prescricoes.service';

const NAO_EXCLUIDOS = { deletedAt: null } as const;

type Linha = Record<string, unknown>;

function coluna(
  key: string,
  header: string,
  type?: ExportColumn<Linha>['type'],
): ExportColumn<Linha> {
  return { key, header, type, value: (linha) => linha[key] };
}

const COLUNAS = {
  prontuarios: [
    coluna('id', 'Paciente (id)'),
    coluna('alergias', 'Alergias'),
    coluna('medicamentosEmUso', 'Medicamentos em uso'),
    coluna('doencasCronicas', 'Doenças crônicas'),
    coluna('cirurgiasAnteriores', 'Cirurgias anteriores'),
    coluna('historicoFamiliar', 'Histórico familiar'),
    coluna('observacoes', 'Observações'),
    coluna('updatedAt', 'Atualizado em', 'datetime'),
  ],
  atendimentos: [
    coluna('id', 'Id'),
    coluna('pacienteId', 'Paciente (id)'),
    coluna('profissionalId', 'Profissional (id)'),
    coluna('tipo', 'Tipo'),
    coluna('status', 'Status'),
    coluna('createdAt', 'Criado em', 'datetime'),
    coluna('finalizadoEm', 'Finalizado em', 'datetime'),
    coluna('assinadoEm', 'Assinado em', 'datetime'),
    coluna('queixa', 'Queixa'),
    coluna('evolucao', 'Evolução'),
    coluna('diagnostico', 'Diagnóstico'),
    coluna('conduta', 'Conduta'),
    coluna('observacoes', 'Observações'),
    coluna('respostasJson', 'Respostas do modelo (JSON)'),
  ],
  evolucoes: [
    coluna('id', 'Id'),
    coluna('atendimentoId', 'Atendimento (id)'),
    coluna('tipo', 'Tipo'),
    coluna('texto', 'Texto'),
    coluna('createdAt', 'Criado em', 'datetime'),
  ],
  receitas: [
    coluna('id', 'Id'),
    coluna('atendimentoId', 'Atendimento (id)'),
    coluna('controlada', 'Controlada', 'boolean'),
    coluna('validadeDias', 'Validade (dias)', 'number'),
    coluna('texto', 'Texto'),
    coluna('observacoes', 'Observações'),
    coluna('createdAt', 'Criado em', 'datetime'),
  ],
  documentos: [
    coluna('id', 'Id'),
    coluna('atendimentoId', 'Atendimento (id)'),
    coluna('tipo', 'Tipo'),
    coluna('dataEmissao', 'Emissão', 'date'),
    coluna('texto', 'Texto'),
  ],
  anexos: [
    coluna('id', 'Id'),
    coluna('atendimentoId', 'Atendimento (id)'),
    coluna('tipo', 'Tipo'),
    coluna('data', 'Data', 'date'),
    coluna('descricao', 'Descrição'),
    coluna('arquivo', 'Arquivo no ZIP'),
  ],
  adendos: [
    coluna('id', 'Id'),
    coluna('atendimentoId', 'Atendimento (id)'),
    coluna('numero', 'Número', 'number'),
    coluna('tipo', 'Tipo'),
    coluna('usuarioId', 'Usuário (id)'),
    coluna('texto', 'Texto'),
    coluna('hash', 'Hash'),
    coluna('createdAt', 'Criado em', 'datetime'),
  ],
  anamneses: [
    coluna('id', 'Id'),
    coluna('pacienteId', 'Paciente (id)'),
    coluna('profissionalId', 'Profissional (id)'),
    coluna('queixaPrincipal', 'Queixa principal'),
    coluna('historiaDoencaAtual', 'História da doença atual'),
    coluna('exameFisico', 'Exame físico'),
    coluna('hipoteseDiagnostica', 'Hipótese diagnóstica'),
    coluna('conduta', 'Conduta'),
    coluna('createdAt', 'Criado em', 'datetime'),
  ],
} as const;

/** Pasta e nome do anexo dentro do ZIP; o CSV de anexos aponta para o mesmo caminho. */
export function caminhoAnexo(anexoId: string): string {
  return `anexos/${anexoId}`;
}

/**
 * Fonte da exportação em lote (issue #158): todo o prontuário clínico (base, atendimentos,
 * evoluções, receitas, documentos, adendos, anamneses e prescrições) e os exames e anexos.
 * Os CSVs guardam ids: o cruzamento com pacientes e profissionais é pelos CSVs deles.
 */
@Injectable()
export class ProntuariosLoteFonte extends FonteExportacaoLoteBase {
  readonly entidade = 'prontuarios' as const;

  constructor(
    registro: ExportacaoLoteFontes,
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
    private readonly prescricoes: PrescricoesService,
  ) {
    super(registro);
  }

  async tabelas(): Promise<TabelaDoLote[]> {
    const tx = this.txHost.tx;
    const [prontuarios, atendimentos, evolucoes, receitas, documentos, anexos, adendos, anamneses] =
      await Promise.all([
        tx.prontuario.findMany({ orderBy: { createdAt: 'asc' } }),
        tx.atendimento.findMany({ where: NAO_EXCLUIDOS, orderBy: { createdAt: 'asc' } }),
        tx.atendimentoEvolucao.findMany({ where: NAO_EXCLUIDOS, orderBy: { createdAt: 'asc' } }),
        tx.atendimentoReceita.findMany({ where: NAO_EXCLUIDOS, orderBy: { createdAt: 'asc' } }),
        tx.atendimentoDocumento.findMany({ where: NAO_EXCLUIDOS, orderBy: { createdAt: 'asc' } }),
        tx.atendimentoAnexo.findMany({ where: NAO_EXCLUIDOS, orderBy: { createdAt: 'asc' } }),
        tx.atendimentoVersao.findMany({ where: { tipo: 'ADENDO' }, orderBy: { createdAt: 'asc' } }),
        tx.anamnese.findMany({ where: NAO_EXCLUIDOS, orderBy: { createdAt: 'asc' } }),
      ]);

    const tabelas: [string, readonly ExportColumn<Linha>[], readonly Linha[]][] = [
      ['prontuarios', COLUNAS.prontuarios, prontuarios],
      [
        'atendimentos',
        COLUNAS.atendimentos,
        atendimentos.map((a) => ({
          ...a,
          respostasJson: a.respostas ? JSON.stringify(a.respostas) : null,
        })),
      ],
      ['evolucoes', COLUNAS.evolucoes, evolucoes],
      ['receitas-manuais', COLUNAS.receitas, receitas],
      ['documentos', COLUNAS.documentos, documentos],
      ['anexos', COLUNAS.anexos, anexos.map((a) => ({ ...a, arquivo: caminhoAnexo(a.id) }))],
      ['adendos', COLUNAS.adendos, adendos],
      ['anamneses', COLUNAS.anamneses, anamneses],
    ];

    const resultado: TabelaDoLote[] = [];
    for (const [nome, columns, rows] of tabelas) {
      resultado.push({
        nome: `prontuarios/${nome}`,
        arquivo: await this.exportService.export({
          format: 'csv',
          title: nome,
          filename: nome,
          columns,
          rows,
        }),
      });
    }
    resultado.push({
      nome: 'prontuarios/prescricoes',
      arquivo: await this.prescricoes.export(exportPrescricoesQuerySchema.parse({ format: 'csv' })),
    });
    return resultado;
  }

  async arquivos(): Promise<ArquivoDoLote[]> {
    const anexos = await this.txHost.tx.atendimentoAnexo.findMany({
      where: NAO_EXCLUIDOS,
      select: { id: true, arquivoId: true },
      orderBy: { createdAt: 'asc' },
    });
    return anexos.map((a) => ({ caminho: caminhoAnexo(a.id), arquivoId: a.arquivoId }));
  }
}
