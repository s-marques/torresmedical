import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  ATENDIMENTO_ANEXO_TIPO_ROTULOS,
  ATENDIMENTO_DOCUMENTO_TIPO_ROTULOS,
  ATENDIMENTO_TIPO_ROTULOS,
  EVOLUCAO_TIPO_ROTULOS,
  RECEITUARIO_TIPO_ROTULOS,
  type AtendimentoAnexoTipo,
  type AtendimentoDocumentoTipo,
  type AtendimentoTipo,
  type EvolucaoTipo,
  type ExportProntuarioQuery,
  type ModeloRespostas,
  type ReceituarioTipo,
} from '@torres/shared';
import { EscopoDadosService } from '../../../common/auth/escopo-dados.service';
import { BusinessException } from '../../../common/errors/api.exception';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import {
  writeDocumentoPdf,
  type BlocoDocumento,
} from '../../../common/export/documento-pdf.writer';
import { EXPORT_TIME_ZONE, formatValue } from '../../../common/export/export-values';
import type { ExportFile } from '../../../common/export/export.types';
import { nomeSeguroZip, writeZip, type EntradaZip } from '../../../common/export/zip.writer';
import { ArquivosService } from '../../../common/storage/arquivos.service';
import { PacientesService } from '../../comercial-atendimento/pacientes/pacientes.service';
import { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import { ModelosProntuarioService } from '../modelos-prontuario/modelos-prontuario.service';
import { PacientesVinculadosService } from '../pacientes-vinculados/pacientes-vinculados.service';
import { PrescricoesService } from '../receituarios/prescricoes.service';
import { AcessoProntuarioService } from './acesso-prontuario.service';

const NAO_EXCLUIDOS = { deletedAt: null } as const;
/** Soma máxima dos anexos de um ZIP síncrono. Acima disso, usar a exportação em lote. */
export const PRONTUARIO_ZIP_MAX_BYTES = 100 * 1024 * 1024;

const data = (valor: unknown) => formatValue(valor, 'date');
const dataHora = (valor: unknown) => formatValue(valor, 'datetime');
const DIA_LOCAL = new Intl.DateTimeFormat('pt-BR', {
  timeZone: EXPORT_TIME_ZONE,
  dateStyle: 'short',
});

/**
 * Exportação do prontuário completo do paciente (issue #158, R §39): PDF com o prontuário,
 * atendimentos (evoluções, receitas, documentos, anexos e adendos), anamneses e prescrições, ou
 * ZIP com o PDF e os arquivos anexados. Segue a segregação por profissional (#150 e #153): só
 * entram registros dos profissionais do escopo do usuário, e `profissionalId` restringe a um deles.
 */
@Injectable()
export class ProntuarioExportacaoService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly pacientes: PacientesService,
    private readonly profissionais: ProfissionaisService,
    private readonly vinculados: PacientesVinculadosService,
    private readonly escopo: EscopoDadosService,
    private readonly prescricoes: PrescricoesService,
    private readonly modelos: ModelosProntuarioService,
    private readonly acessos: AcessoProntuarioService,
    private readonly arquivos: ArquivosService,
  ) {}

  async exportar(
    pacienteId: string,
    query: ExportProntuarioQuery,
    agora = new Date(),
  ): Promise<ExportFile> {
    const paciente = await this.pacientes.detalhe(pacienteId);
    await this.vinculados.garantir(pacienteId);
    // 403 quando o profissional pedido está fora do escopo do usuário.
    const profissionalFiltro = this.escopo.filtroProfissional(query.profissionalId);
    await this.acessos.registrar(pacienteId, 'EXPORTACAO');

    const where = { pacienteId, ...NAO_EXCLUIDOS, profissionalId: profissionalFiltro };
    const [prontuario, atendimentos, anamneses, prescricoes] = await Promise.all([
      this.txHost.tx.prontuario.findUnique({ where: { id: pacienteId } }),
      this.txHost.tx.atendimento.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        include: {
          evolucoes: { where: NAO_EXCLUIDOS, orderBy: { createdAt: 'asc' } },
          receitas: { where: NAO_EXCLUIDOS, orderBy: { createdAt: 'asc' } },
          documentos: { where: NAO_EXCLUIDOS, orderBy: { dataEmissao: 'asc' } },
          anexos: { where: NAO_EXCLUIDOS, orderBy: { data: 'asc' } },
          versoes: { where: { tipo: 'ADENDO' }, orderBy: { numero: 'asc' } },
        },
      }),
      this.txHost.tx.anamnese.findMany({ where, orderBy: { createdAt: 'asc' } }),
      this.prescricoes.todasDoPaciente(pacienteId),
    ]);
    const prescricoesDoFiltro = prescricoes.filter(
      (p) => !query.profissionalId || p.profissionalId === query.profissionalId,
    );

    const [nomes, modelos, arquivos] = await Promise.all([
      this.nomesProfissionais([
        ...atendimentos.map((a) => a.profissionalId),
        ...anamneses.flatMap((a) => (a.profissionalId ? [a.profissionalId] : [])),
        ...(query.profissionalId ? [query.profissionalId] : []),
      ]),
      this.modelos.versoesPorId(atendimentos.map((a) => a.modeloVersaoId)),
      Promise.all(
        atendimentos
          .flatMap((a) => a.anexos)
          .map((anexo) => this.arquivos.findById(anexo.arquivoId)),
      ),
    ]);
    const arquivoPorId = new Map(arquivos.map((a) => [a.id, a]));
    const nomeDe = (id: string | null) => (id ? (nomes.get(id) ?? 'Profissional') : '—');

    const blocos: BlocoDocumento[] = [];
    blocos.push({ tipo: 'secao', titulo: 'Paciente' });
    blocos.push({ tipo: 'campo', rotulo: 'Nome', valor: paciente.nome });
    blocos.push({ tipo: 'campo', rotulo: 'Documento', valor: paciente.documento });
    blocos.push({
      tipo: 'campo',
      rotulo: 'Nascimento',
      valor: paciente.dataNascimento ? data(paciente.dataNascimento) : null,
    });
    blocos.push({ tipo: 'campo', rotulo: 'Sexo', valor: paciente.sexo });

    blocos.push({ tipo: 'secao', titulo: 'Prontuário' });
    const camposBase: [string, string | null | undefined][] = [
      ['Alergias', prontuario?.alergias],
      ['Medicamentos em uso', prontuario?.medicamentosEmUso],
      ['Doenças crônicas', prontuario?.doencasCronicas],
      ['Cirurgias anteriores', prontuario?.cirurgiasAnteriores],
      ['Histórico familiar', prontuario?.historicoFamiliar],
      ['Observações', prontuario?.observacoes],
    ];
    if (camposBase.every(([, valor]) => !valor?.trim())) {
      blocos.push({ tipo: 'texto', texto: 'Sem informações registradas.' });
    }
    for (const [rotulo, valor] of camposBase) blocos.push({ tipo: 'campo', rotulo, valor });

    blocos.push({ tipo: 'secao', titulo: `Atendimentos (${atendimentos.length})` });
    if (atendimentos.length === 0) blocos.push({ tipo: 'texto', texto: 'Nenhum atendimento.' });
    const entradasAnexos: { atendimentoId: string; arquivoId: string; data: Date }[] = [];
    for (const a of atendimentos) {
      const tipo = a.tipo ? ATENDIMENTO_TIPO_ROTULOS[a.tipo as AtendimentoTipo] : 'Atendimento';
      blocos.push({
        tipo: 'subsecao',
        titulo: `${tipo} · ${dataHora(a.createdAt)} · ${nomeDe(a.profissionalId)}`,
      });
      blocos.push({
        tipo: 'campo',
        rotulo: 'Situação',
        valor: a.status === 'FINALIZADO' ? 'Finalizado' : 'Em andamento',
      });
      blocos.push({
        tipo: 'campo',
        rotulo: 'Assinado em',
        valor: a.assinadoEm ? dataHora(a.assinadoEm) : null,
      });
      blocos.push({ tipo: 'campo', rotulo: 'Queixa', valor: a.queixa });
      blocos.push({ tipo: 'campo', rotulo: 'Evolução', valor: a.evolucao });
      blocos.push({ tipo: 'campo', rotulo: 'Diagnóstico', valor: a.diagnostico });
      blocos.push({ tipo: 'campo', rotulo: 'Conduta', valor: a.conduta });
      blocos.push({ tipo: 'campo', rotulo: 'Observações', valor: a.observacoes });

      const modelo = a.modeloVersaoId ? modelos.get(a.modeloVersaoId) : undefined;
      const respostas = (a.respostas as ModeloRespostas | null) ?? null;
      if (modelo && respostas) {
        for (const secao of modelo.secoes) {
          for (const campo of secao.campos) {
            const valor = respostas[campo.chave];
            blocos.push({
              tipo: 'campo',
              rotulo: `${secao.titulo} / ${campo.rotulo}`,
              valor: valor === null || valor === undefined ? null : String(valor),
            });
          }
        }
      }
      for (const e of a.evolucoes) {
        blocos.push({
          tipo: 'campo',
          rotulo: `${EVOLUCAO_TIPO_ROTULOS[e.tipo as EvolucaoTipo]} (${dataHora(e.createdAt)})`,
          valor: e.texto,
        });
      }
      for (const r of a.receitas) {
        blocos.push({
          tipo: 'campo',
          rotulo: `Receita${r.controlada ? ' controlada' : ''} (${dataHora(r.createdAt)}, validade ${r.validadeDias} dias)`,
          valor: [r.texto, r.observacoes].filter(Boolean).join(' — '),
        });
      }
      for (const d of a.documentos) {
        blocos.push({
          tipo: 'campo',
          rotulo: `${ATENDIMENTO_DOCUMENTO_TIPO_ROTULOS[d.tipo as AtendimentoDocumentoTipo]} (${data(d.dataEmissao)})`,
          valor: d.texto,
        });
      }
      for (const v of a.versoes) {
        blocos.push({
          tipo: 'campo',
          rotulo: `Adendo ${v.numero} (${dataHora(v.createdAt)})`,
          valor: v.texto,
        });
      }
      for (const anexo of a.anexos) {
        const arquivo = arquivoPorId.get(anexo.arquivoId);
        blocos.push({
          tipo: 'campo',
          rotulo: `${ATENDIMENTO_ANEXO_TIPO_ROTULOS[anexo.tipo as AtendimentoAnexoTipo]} (${data(anexo.data)})`,
          valor: [arquivo?.nomeOriginal ?? 'arquivo', anexo.descricao].filter(Boolean).join(' — '),
        });
        entradasAnexos.push({ atendimentoId: a.id, arquivoId: anexo.arquivoId, data: anexo.data });
      }
      blocos.push({ tipo: 'separador' });
    }

    blocos.push({ tipo: 'secao', titulo: `Anamneses (${anamneses.length})` });
    if (anamneses.length === 0) blocos.push({ tipo: 'texto', texto: 'Nenhuma anamnese.' });
    for (const a of anamneses) {
      blocos.push({
        tipo: 'subsecao',
        titulo: `Anamnese · ${dataHora(a.createdAt)} · ${nomeDe(a.profissionalId)}`,
      });
      blocos.push({ tipo: 'campo', rotulo: 'Queixa principal', valor: a.queixaPrincipal });
      blocos.push({
        tipo: 'campo',
        rotulo: 'História da doença atual',
        valor: a.historiaDoencaAtual,
      });
      blocos.push({ tipo: 'campo', rotulo: 'Exame físico', valor: a.exameFisico });
      blocos.push({ tipo: 'campo', rotulo: 'Hipótese diagnóstica', valor: a.hipoteseDiagnostica });
      blocos.push({ tipo: 'campo', rotulo: 'Conduta', valor: a.conduta });
    }

    blocos.push({ tipo: 'secao', titulo: `Prescrições (${prescricoesDoFiltro.length})` });
    if (prescricoesDoFiltro.length === 0) {
      blocos.push({ tipo: 'texto', texto: 'Nenhuma prescrição.' });
    }
    for (const p of prescricoesDoFiltro) {
      blocos.push({
        tipo: 'campo',
        rotulo: `Receita ${RECEITUARIO_TIPO_ROTULOS[p.tipo as ReceituarioTipo]} nº ${p.numero} (${data(p.dataPrescricao)}, ${nomeDe(p.profissionalId)})`,
        valor: [p.medicacao, p.posologia].filter(Boolean).join(' — '),
      });
    }

    const subtitulos = [
      `Paciente: ${paciente.nome}`,
      query.profissionalId
        ? `Profissional: ${nomeDe(query.profissionalId)}`
        : 'Profissionais: todos os do seu acesso',
    ];
    const pdf = await writeDocumentoPdf({
      titulo: 'Prontuário do paciente',
      subtitulos,
      blocos,
      geradoEm: agora,
    });

    const base = `prontuario-${pacienteId.slice(0, 8)}-${diaLocal(agora)}`;
    if (!query.incluirAnexos) {
      return { buffer: pdf, contentType: 'application/pdf', filename: `${base}.pdf` };
    }
    return {
      buffer: await this.compactar(pdf, entradasAnexos, arquivoPorId),
      contentType: 'application/zip',
      filename: `${base}.zip`,
    };
  }

  private async compactar(
    pdf: Buffer,
    anexos: readonly { atendimentoId: string; arquivoId: string; data: Date }[],
    arquivoPorId: ReadonlyMap<string, { nomeOriginal: string; tamanho: number }>,
  ): Promise<Buffer> {
    const total = anexos.reduce(
      (soma, a) => soma + (arquivoPorId.get(a.arquivoId)?.tamanho ?? 0),
      0,
    );
    if (total > PRONTUARIO_ZIP_MAX_BYTES) {
      throw new BusinessException(
        'EXPORT_LIMIT_EXCEEDED',
        'Os anexos passam do limite de uma exportação. Use a exportação em lote.',
      );
    }
    const entradas: EntradaZip[] = [{ nome: 'prontuario.pdf', conteudo: pdf }];
    for (const [indice, anexo] of anexos.entries()) {
      const { stream, arquivo } = await this.arquivos.ler(anexo.arquivoId);
      const nome = nomeSeguroZip(arquivo.nomeOriginal);
      entradas.push({
        nome: `anexos/${String(indice + 1).padStart(3, '0')}-${nome}`,
        conteudo: stream,
      });
    }
    return writeZip(entradas);
  }

  /** Nome de cada profissional (sem FK); excluído depois do registro → sem nome. */
  private async nomesProfissionais(ids: readonly string[]): Promise<Map<string, string>> {
    const nomes = new Map<string, string>();
    await Promise.all(
      [...new Set(ids)].map(async (id) => {
        try {
          nomes.set(id, (await this.profissionais.detalhe(id)).nome);
        } catch {
          // Profissional excluído: o PDF mostra um nome genérico.
        }
      }),
    );
    return nomes;
  }
}

function diaLocal(agora: Date): string {
  return DIA_LOCAL.format(agora).split('/').reverse().join('-');
}
