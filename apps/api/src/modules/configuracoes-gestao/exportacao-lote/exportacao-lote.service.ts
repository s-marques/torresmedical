import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable, Logger } from '@nestjs/common';
import {
  ARQUIVO_USOS,
  EXPORTACAO_LOTE_COM_ARQUIVOS,
  EXPORTACAO_LOTE_ENTIDADES,
  EXPORTACAO_LOTE_ROTULOS,
  EXPORTACAO_LOTE_VALIDADE_HORAS,
  type CreateExportacaoLote,
  type ExportacaoLote as ExportacaoLoteDto,
  type ExportacaoLoteEntidade,
  type ExportacaoLoteEntidadeInfo,
  type ExportacaoLoteErro,
  type ExportacaoLotePage,
  type ListExportacoesLoteQuery,
} from '@torres/shared';
import type { ExportacaoLote } from '../../../generated/prisma/client';
import { AuditService } from '../../../common/audit/audit.service';
import { EscopoDadosService, semPermissao } from '../../../common/auth/escopo-dados.service';
import { RequestContextService } from '../../../common/context/request-context.service';
import { BusinessException } from '../../../common/errors/api.exception';
import {
  ExportacaoLoteFontes,
  type ArquivoDoLote,
  type TabelaDoLote,
} from '../../../common/export/exportacao-lote.fontes';
import { CSV_BOM } from '../../../common/export/csv.writer';
import { ExportService } from '../../../common/export/export.service';
import {
  nomeSeguroZip,
  writeZipSequencial,
  type EntradaZip,
} from '../../../common/export/zip.writer';
import { EventPublisher } from '../../../common/messaging/event-publisher';
import { paginate, toOrderBy } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { ArquivosService, type ConteudoArquivo } from '../../../common/storage/arquivos.service';

export const COMANDO_GERAR_EXPORTACAO_LOTE = 'configuracoes-gestao.exportacao-lote.gerar';
export const EXPORTACAO_EM_ANDAMENTO = 'EXPORTACAO_EM_ANDAMENTO';
export const EXPORTACAO_INDISPONIVEL = 'EXPORTACAO_INDISPONIVEL';
export const EXPORTACAO_EXPIRADA = 'EXPORTACAO_EXPIRADA';
/** Soma máxima dos arquivos de um ZIP (ele é montado em memória antes de ir para o storage). */
export const EXPORTACAO_LOTE_ARQUIVOS_MAX_BYTES = 200 * 1024 * 1024;
/** Pedido parado em PENDENTE/PROCESSANDO há mais que isso deixa de bloquear um novo pedido. */
const PRAZO_ANDAMENTO_MS = 60 * 60 * 1000;
const HORA_MS = 60 * 60 * 1000;

const EM_ANDAMENTO = ['PENDENTE', 'PROCESSANDO'];

class ArquivosAcimaDoLimite extends Error {}

export function toExportacaoLoteDto(
  registro: ExportacaoLote,
  agora = new Date(),
): ExportacaoLoteDto {
  const expirou = registro.expiraEm !== null && registro.expiraEm.getTime() <= agora.getTime();
  return {
    id: registro.id,
    entidade: registro.entidade as ExportacaoLoteEntidade,
    incluirArquivos: registro.incluirArquivos,
    status: registro.status as ExportacaoLoteDto['status'],
    solicitadoPorId: registro.solicitadoPorId,
    solicitadaEm: registro.solicitadaEm.toISOString(),
    concluidaEm: registro.concluidaEm?.toISOString() ?? null,
    expiraEm: registro.expiraEm?.toISOString() ?? null,
    tamanhoBytes: registro.tamanhoBytes,
    erroCodigo: registro.erroCodigo,
    disponivel: registro.status === 'CONCLUIDA' && registro.arquivoId !== null && !expirou,
  };
}

/**
 * Exportação em lote por entidade (issue #158, R §39). O pedido só grava a linha e publica o
 * comando; o `GerarExportacaoLoteConsumer` monta o ZIP (CSV + arquivos) a partir das fontes que
 * cada módulo registra. O download exige login e permissão e vale por 24 h.
 * É uma visão geral da clínica: perfil com escopo restrito não usa (403).
 */
@Injectable()
export class ExportacaoLoteService {
  private readonly logger = new Logger(ExportacaoLoteService.name);

  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly fontes: ExportacaoLoteFontes,
    private readonly events: EventPublisher,
    private readonly audit: AuditService,
    private readonly context: RequestContextService,
    private readonly escopo: EscopoDadosService,
    private readonly arquivos: ArquivosService,
    private readonly exportService: ExportService,
  ) {}

  /** Entidades que podem ser exportadas (as que têm fonte registrada), na ordem do catálogo. */
  entidades(): ExportacaoLoteEntidadeInfo[] {
    const disponiveis = new Set(this.fontes.disponiveis());
    return EXPORTACAO_LOTE_ENTIDADES.filter((id) => disponiveis.has(id)).map((id) => ({
      id,
      rotulo: EXPORTACAO_LOTE_ROTULOS[id],
      comArquivos: EXPORTACAO_LOTE_COM_ARQUIVOS.includes(id),
    }));
  }

  async listar(query: ListExportacoesLoteQuery): Promise<ExportacaoLotePage> {
    this.exigirVisaoGeral();
    const where = { entidade: query.entidade, status: query.status };
    const agora = new Date();
    const pagina = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.exportacaoLote.findMany({
          where,
          orderBy: toOrderBy(query.sort),
          ...p,
        }),
      count: () => this.txHost.tx.exportacaoLote.count({ where }),
    });
    return { data: pagina.data.map((r) => toExportacaoLoteDto(r, agora)), meta: pagina.meta };
  }

  async detalhe(id: string): Promise<ExportacaoLoteDto> {
    return toExportacaoLoteDto(await this.carregar(id));
  }

  /** `POST`: grava o pedido e publica o comando (sai só depois do commit). */
  async solicitar(input: CreateExportacaoLote): Promise<ExportacaoLoteDto> {
    this.exigirVisaoGeral();
    if (!this.fontes.obter(input.entidade)) {
      throw new BusinessException(
        EXPORTACAO_INDISPONIVEL,
        'Esta entidade ainda não pode ser exportada em lote',
        { status: 422 },
      );
    }
    const tx = this.txHost.tx;
    const andamento = await tx.exportacaoLote.findFirst({
      where: {
        entidade: input.entidade,
        status: { in: EM_ANDAMENTO },
        solicitadaEm: { gte: new Date(Date.now() - PRAZO_ANDAMENTO_MS) },
      },
      select: { id: true },
    });
    if (andamento) {
      throw new BusinessException(
        EXPORTACAO_EM_ANDAMENTO,
        'Já existe uma exportação desta entidade em andamento',
        { status: 409 },
      );
    }
    const registro = await tx.exportacaoLote.create({
      data: {
        entidade: input.entidade,
        incluirArquivos:
          input.incluirArquivos && EXPORTACAO_LOTE_COM_ARQUIVOS.includes(input.entidade),
        solicitadoPorId: this.context.getUserId() ?? null,
      },
    });
    await this.events.publish(COMANDO_GERAR_EXPORTACAO_LOTE, { exportacaoId: registro.id });
    return toExportacaoLoteDto(registro);
  }

  /**
   * Chamado pelo consumidor. Idempotente: só quem move PENDENTE → PROCESSANDO processa, então
   * repetir o comando (retry ou entrega dupla) não gera outro arquivo.
   */
  async processar(exportacaoId: string): Promise<boolean> {
    const tx = this.txHost.tx;
    const { count } = await tx.exportacaoLote.updateMany({
      where: { id: exportacaoId, status: 'PENDENTE' },
      data: { status: 'PROCESSANDO', iniciadaEm: new Date() },
    });
    if (count === 0) return false;
    const registro = await tx.exportacaoLote.findUniqueOrThrow({ where: { id: exportacaoId } });
    const entidade = registro.entidade as ExportacaoLoteEntidade;

    try {
      const fonte = this.fontes.obter(entidade);
      if (!fonte) throw new BusinessException(EXPORTACAO_INDISPONIVEL, 'Entidade indisponível');

      const agora = new Date();
      const tabelas = await this.exportService.semLimite(() => fonte.tabelas());
      const arquivosDoLote =
        registro.incluirArquivos && fonte.arquivos ? await fonte.arquivos() : [];
      const zip = await writeZipSequencial(this.entradas(entidade, agora, tabelas, arquivosDoLote));
      const arquivo = await this.arquivos.salvarGerado({
        uso: 'exportacao-lote',
        nomeOriginal: `exportacao-${entidade}-${agora.toISOString().slice(0, 10)}.zip`,
        contentType: 'application/zip',
        conteudo: zip,
        criadoPor: registro.solicitadoPorId,
      });
      const concluidaEm = new Date();
      await tx.exportacaoLote.update({
        where: { id: exportacaoId },
        data: {
          status: 'CONCLUIDA',
          concluidaEm,
          expiraEm: new Date(concluidaEm.getTime() + EXPORTACAO_LOTE_VALIDADE_HORAS * HORA_MS),
          arquivoId: arquivo.id,
          tamanhoBytes: zip.length,
        },
      });
      await this.audit.record({
        action: 'UPDATE',
        entity: 'ExportacaoLote',
        entityId: exportacaoId,
        before: { status: 'PROCESSANDO' },
        after: { status: 'CONCLUIDA', entidade, tamanhoBytes: zip.length },
      });
    } catch (erro) {
      const codigo: ExportacaoLoteErro =
        erro instanceof ArquivosAcimaDoLimite
          ? 'ARQUIVOS_ACIMA_DO_LIMITE'
          : erro instanceof BusinessException && erro.code === EXPORTACAO_INDISPONIVEL
            ? 'ENTIDADE_INDISPONIVEL'
            : 'ERRO_PROCESSAMENTO';
      // Só o id e o tipo do erro vão para o log (sem dados pessoais).
      this.logger.error(
        `Exportação ${exportacaoId} falhou: ${erro instanceof Error ? erro.name : 'erro desconhecido'}`,
      );
      await tx.exportacaoLote.update({
        where: { id: exportacaoId },
        data: { status: 'FALHOU', erroCodigo: codigo, concluidaEm: new Date() },
      });
      await this.audit.record({
        action: 'UPDATE',
        entity: 'ExportacaoLote',
        entityId: exportacaoId,
        before: { status: 'PROCESSANDO' },
        after: { status: 'FALHOU', erroCodigo: codigo },
      });
    }
    return true;
  }

  /**
   * Arquivo do ZIP pronto para o download. 404 se não existe ou não terminou; 410 depois da
   * validade. O `@Audit` EXPORT do endpoint registra quem baixou.
   */
  async baixar(id: string, agora = new Date()): Promise<ConteudoArquivo> {
    this.exigirVisaoGeral();
    const registro = await this.carregar(id);
    if (registro.status !== 'CONCLUIDA' || !registro.arquivoId) {
      throw new BusinessException(EXPORTACAO_INDISPONIVEL, 'O arquivo ainda não está pronto', {
        status: 404,
      });
    }
    if (registro.expiraEm && registro.expiraEm.getTime() <= agora.getTime()) {
      throw new BusinessException(
        EXPORTACAO_EXPIRADA,
        'O link desta exportação expirou. Gere uma nova exportação',
        { status: 410 },
      );
    }
    return this.arquivos.ler(registro.arquivoId);
  }

  private async carregar(id: string): Promise<ExportacaoLote> {
    this.exigirVisaoGeral();
    const registro = await this.txHost.tx.exportacaoLote.findUnique({ where: { id } });
    if (!registro) {
      throw new BusinessException('NOT_FOUND', 'Exportação não encontrada', { status: 404 });
    }
    return registro;
  }

  private exigirVisaoGeral(): void {
    if (this.escopo.restrito()) throw semPermissao();
  }

  /** Entradas do ZIP: CSVs, `LEIAME.txt`, os arquivos (um por vez) e o índice `arquivos.csv`. */
  private async *entradas(
    entidade: ExportacaoLoteEntidade,
    agora: Date,
    tabelas: readonly TabelaDoLote[],
    arquivosDoLote: readonly ArquivoDoLote[],
  ): AsyncGenerator<EntradaZip> {
    for (const tabela of tabelas) {
      // A fonte pode agrupar em pastas (`prontuarios/atendimentos`): cada trecho é saneado.
      const caminho = tabela.nome
        .split('/')
        .map((trecho) => nomeSeguroZip(trecho, 'dados'))
        .join('/');
      yield { nome: `${caminho}.csv`, conteudo: tabela.arquivo.buffer };
    }
    yield {
      nome: 'LEIAME.txt',
      conteudo: Buffer.from(leiame(entidade, agora, tabelas.length), 'utf8'),
    };

    const indice: string[] = ['caminho;nome_original;tipo;bytes'];
    const limite = Math.min(
      EXPORTACAO_LOTE_ARQUIVOS_MAX_BYTES,
      ARQUIVO_USOS['exportacao-lote'].maxBytes,
    );
    let total = 0;
    for (const item of arquivosDoLote) {
      const { arquivo, stream } = await this.arquivos.ler(item.arquivoId);
      total += arquivo.tamanho;
      if (total > limite) {
        stream.destroy();
        throw new ArquivosAcimaDoLimite();
      }
      const caminho = `${item.caminho}${extensaoDe(arquivo.nomeOriginal)}`;
      indice.push(
        [caminho, arquivo.nomeOriginal, arquivo.contentType, arquivo.tamanho]
          .map(csvTexto)
          .join(';'),
      );
      yield { nome: caminho, conteudo: stream };
    }
    if (arquivosDoLote.length > 0) {
      yield {
        nome: 'arquivos.csv',
        conteudo: Buffer.from(`${CSV_BOM}${indice.join('\r\n')}\r\n`, 'utf8'),
      };
    }
  }
}

function leiame(entidade: ExportacaoLoteEntidade, agora: Date, tabelas: number): string {
  return [
    `Torres Medical: exportação em lote (${EXPORTACAO_LOTE_ROTULOS[entidade]})`,
    `Gerada em ${agora.toISOString()}`,
    '',
    `Este arquivo traz ${tabelas} planilha(s) CSV (UTF-8, separador ponto e vírgula).`,
    'As colunas "(id)" ligam os registros entre as planilhas e as exportações de outras entidades.',
    'Os arquivos anexados ficam na pasta indicada na planilha; o índice arquivos.csv lista o nome original de cada um.',
    'Contém dados pessoais e de saúde (LGPD): guarde com segurança e apague quando não for mais necessário.',
    '',
  ].join('\r\n');
}

function extensaoDe(nome: string): string {
  const ponto = nome.lastIndexOf('.');
  const extensao = ponto > 0 ? nome.slice(ponto).toLowerCase() : '';
  return /^\.[a-z0-9]{1,8}$/.test(extensao) ? extensao : '';
}

function csvTexto(valor: string | number): string {
  const texto = String(valor);
  const seguro = /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto;
  return /[";\r\n]/.test(seguro) ? `"${seguro.replaceAll('"', '""')}"` : seguro;
}
