import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  CONTRATO_MODALIDADE_ROTULOS,
  descreverDiaContrato,
  descreverValorContrato,
  valorTotalMensal,
  type ContratoExportColumn,
  type ContratoSala as ContratoSalaDto,
  type CreateContratoSalaInput,
  type ExportContratosSalaQuery,
  type ListContratosSalaQuery,
  type UpdateContratoSalaInput,
} from '@torres/shared';
import { isUuid } from '../../../common/auth/tokens';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import { paginate, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { ArquivosService } from '../../../common/storage/arquivos.service';
import type { Prisma } from '../../../generated/prisma/client';
import { PacientesService } from '../../comercial-atendimento/pacientes/pacientes.service';
import { FormasPagamentoService } from '../../financeiro/formas-pagamento/formas-pagamento.service';
import { ProfissionaisService } from '../profissionais/profissionais.service';
import type { SalaEmUsoVerificador } from './sala-em-uso';

const NAO_EXCLUIDOS = { deletedAt: null } as const;

const INCLUDE = {
  sala: { select: { nome: true, numero: true } },
  profissional: { select: { nome: true } },
  dias: { orderBy: { diaSemana: 'asc' } },
} satisfies Prisma.ContratoSalaInclude;

type ContratoComRelacoes = Prisma.ContratoSalaGetPayload<{ include: typeof INCLUDE }>;

/** Nomes que vêm de outros módulos, já resolvidos para a página. */
interface Nomes {
  pacientes: ReadonlyMap<string, string>;
  formas: ReadonlyMap<string, string>;
  pdfs: ReadonlyMap<string, string>;
}

const REMOVIDO = 'Cadastro removido';

const diaDoContrato = (dias: ContratoSalaDto['dias']) => dias.map(descreverDiaContrato).join(', ');

/** Colunas exportáveis, iguais às da tabela. */
export const CONTRATO_EXPORT_DEFINITIONS: readonly ExportColumn<
  ContratoSalaDto,
  ContratoExportColumn
>[] = [
  { key: 'sala', header: 'Sala', value: (c) => c.salaNome, width: 2 },
  { key: 'locatario', header: 'Locatário', value: (c) => c.locatarioNome, width: 3 },
  {
    key: 'modalidade',
    header: 'Tipo',
    value: (c) => CONTRATO_MODALIDADE_ROTULOS[c.modalidade],
    width: 2,
  },
  { key: 'dias', header: 'Dias', value: (c) => diaDoContrato(c.dias), width: 4 },
  { key: 'valor', header: 'Valor', value: (c) => descreverValorContrato(c), width: 2 },
  {
    key: 'vigencia',
    header: 'Vigência',
    value: (c) => (c.dataFim ? `${c.dataInicio} a ${c.dataFim}` : `${c.dataInicio} em diante`),
    width: 3,
  },
  { key: 'status', header: 'Status', value: (c) => c.status.toLowerCase() },
];

const diaISO = (data: Date) => data.toISOString().slice(0, 10);
const paraData = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/**
 * Contratos de aluguel de sala (aba Contratos da tela Salas). Também é o verificador da regra
 * "sala com contrato não pode ser excluída".
 */
@Injectable()
export class ContratosSalaService implements SalaEmUsoVerificador {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly profissionais: ProfissionaisService,
    private readonly pacientes: PacientesService,
    private readonly formasPagamento: FormasPagamentoService,
    private readonly arquivos: ArquivosService,
    private readonly exportService: ExportService,
  ) {}

  async emUso(ids: readonly string[]): Promise<ReadonlySet<string>> {
    const contratos = await this.txHost.tx.contratoSala.findMany({
      where: { salaId: { in: [...ids] }, ...NAO_EXCLUIDOS },
      select: { salaId: true },
      distinct: ['salaId'],
    });
    return new Set(contratos.map((c) => c.salaId));
  }

  async list(query: ListContratosSalaQuery): Promise<Page<ContratoSalaDto>> {
    const where = this.where(query);
    const page = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.contratoSala.findMany({
          where,
          orderBy: toOrderBy(query.sort),
          include: INCLUDE,
          ...p,
        }),
      count: () => this.txHost.tx.contratoSala.count({ where }),
    });
    const nomes = await this.resolverNomes(page.data);
    return { ...page, data: page.data.map((c) => this.toDto(c, nomes)) };
  }

  async findById(id: string): Promise<ContratoSalaDto> {
    const contrato = await this.buscar(id);
    return this.toDto(contrato, await this.resolverNomes([contrato]));
  }

  async create(input: CreateContratoSalaInput): Promise<ContratoSalaDto> {
    await this.validar(input);
    const criado = await this.txHost.tx.contratoSala.create({
      data: { ...this.dados(input), dias: { create: input.dias } },
      include: INCLUDE,
    });
    return this.toDto(criado, await this.resolverNomes([criado]));
  }

  async update(id: string, input: UpdateContratoSalaInput): Promise<ContratoSalaDto> {
    await this.buscar(id);
    await this.validar(input);
    const alterado = await this.txHost.tx.contratoSala.update({
      where: { id },
      data: { ...this.dados(input), dias: { deleteMany: {}, create: input.dias } },
      include: INCLUDE,
    });
    return this.toDto(alterado, await this.resolverNomes([alterado]));
  }

  /** Grava (ou remove, com `null`) o PDF do contrato, já enviado em `/api/arquivos`. */
  async definirPdf(id: string, arquivoId: string | null): Promise<ContratoSalaDto> {
    await this.buscar(id);
    if (arquivoId) {
      const arquivo = await this.arquivos.findById(arquivoId);
      if (arquivo.uso !== 'contrato-sala') {
        throw new BusinessException('ARQUIVO_USO_INVALIDO', 'Arquivo inválido para este campo', {
          status: 400,
          details: [{ field: 'arquivoId', message: 'O arquivo enviado não é do tipo esperado' }],
        });
      }
    }
    const alterado = await this.txHost.tx.contratoSala.update({
      where: { id },
      data: { pdfArquivoId: arquivoId },
      include: INCLUDE,
    });
    return this.toDto(alterado, await this.resolverNomes([alterado]));
  }

  /** Exclusão lógica: cobranças e o histórico continuam apontando para o contrato. */
  async remove(id: string): Promise<ContratoSalaDto> {
    await this.buscar(id);
    const excluido = await this.txHost.tx.contratoSala.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: INCLUDE,
    });
    return this.toDto(excluido, await this.resolverNomes([excluido]));
  }

  async export(query: ExportContratosSalaQuery): Promise<ExportFile> {
    const where = this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.contratoSala.count({ where }));
    const rows = await this.txHost.tx.contratoSala.findMany({
      where,
      orderBy: toOrderBy(query.sort),
      include: INCLUDE,
    });
    const nomes = await this.resolverNomes(rows);
    return this.exportService.export({
      format: query.format,
      title: 'Contratos de salas',
      filename: 'contratos-salas',
      columns: selectColumns(CONTRATO_EXPORT_DEFINITIONS, query.columns),
      rows: rows.map((c) => this.toDto(c, nomes)),
    });
  }

  private where(query: Pick<ListContratosSalaQuery, 'status' | 'salaId'>) {
    return {
      ...NAO_EXCLUIDOS,
      sala: { deletedAt: null },
      status: query.status,
      salaId: query.salaId,
    } satisfies Prisma.ContratoSalaWhereInput;
  }

  private async buscar(id: string): Promise<ContratoComRelacoes> {
    const contrato = isUuid(id)
      ? await this.txHost.tx.contratoSala.findFirst({
          where: { id, ...NAO_EXCLUIDOS },
          include: INCLUDE,
        })
      : null;
    if (!contrato) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Contrato não encontrado', { status: 404 });
    }
    return contrato;
  }

  /** Sala, locatário e forma de pagamento precisam existir (os dois últimos são de outros módulos). */
  private async validar(input: CreateContratoSalaInput): Promise<void> {
    const sala = await this.txHost.tx.sala.count({ where: { id: input.salaId, ...NAO_EXCLUIDOS } });
    if (sala === 0) this.invalido('salaId', 'Sala inválida');
    try {
      if (input.locatarioTipo === 'PROFISSIONAL') {
        await this.profissionais.garantirExiste(input.locatarioId);
      } else {
        await this.pacientes.findLookupById(input.locatarioId);
      }
    } catch (erro) {
      if (erro instanceof BusinessException && erro.getStatus() === 404) {
        this.invalido('locatarioId', 'Locatário inválido');
      }
      throw erro;
    }
    if (input.formaPagamentoId) {
      try {
        await this.formasPagamento.findLookupById(input.formaPagamentoId);
      } catch (erro) {
        if (erro instanceof BusinessException && erro.getStatus() === 404) {
          this.invalido('formaPagamentoId', 'Forma de pagamento inválida');
        }
        throw erro;
      }
    }
  }

  private invalido(field: string, message: string): never {
    throw new BusinessException('CONTRATO_INVALIDO', message, {
      status: 400,
      details: [{ field, message }],
    });
  }

  private dados(input: CreateContratoSalaInput) {
    const profissional = input.locatarioTipo === 'PROFISSIONAL';
    return {
      salaId: input.salaId,
      modalidade: input.modalidade,
      locatarioTipo: input.locatarioTipo,
      profissionalId: profissional ? input.locatarioId : null,
      pacienteId: profissional ? null : input.locatarioId,
      especialidade: input.especialidade,
      valorUnitario: input.valorUnitario,
      quantidadeMensal: input.modalidade === 'MENSAL' ? null : input.quantidadeMensal,
      permuta: input.permuta,
      tipoReceita: input.tipoReceita,
      diaVencimento: input.diaVencimento,
      formaPagamentoId: input.formaPagamentoId,
      indiceReajuste: input.indiceReajuste,
      dataInicio: paraData(input.dataInicio),
      dataFim: input.dataFim ? paraData(input.dataFim) : null,
      permiteIndicacao: input.permiteIndicacao,
      participaEventos: input.participaEventos,
      observacoes: input.observacoes,
    } satisfies Prisma.ContratoSalaUncheckedCreateWithoutDiasInput;
  }

  /** Nomes de pacientes, formas de pagamento e PDFs da página (dos módulos donos, sem tabela direta). */
  private async resolverNomes(contratos: readonly ContratoComRelacoes[]): Promise<Nomes> {
    const unicos = (ids: Array<string | null>) => [...new Set(ids.filter((id) => id !== null))];
    const resolver = async (
      ids: string[],
      buscar: (id: string) => Promise<string>,
    ): Promise<Map<string, string>> =>
      new Map(
        await Promise.all(
          ids.map(async (id): Promise<[string, string]> => {
            try {
              return [id, await buscar(id)];
            } catch (erro) {
              if (erro instanceof BusinessException && erro.getStatus() === 404) {
                return [id, REMOVIDO];
              }
              throw erro;
            }
          }),
        ),
      );
    const [pacientes, formas, pdfs] = await Promise.all([
      resolver(
        unicos(contratos.map((c) => c.pacienteId)),
        async (id) => (await this.pacientes.findLookupById(id)).label,
      ),
      resolver(
        unicos(contratos.map((c) => c.formaPagamentoId)),
        async (id) => (await this.formasPagamento.findLookupById(id)).label,
      ),
      resolver(
        unicos(contratos.map((c) => c.pdfArquivoId)),
        async (id) => (await this.arquivos.findById(id)).nomeOriginal,
      ),
    ]);
    return { pacientes, formas, pdfs };
  }

  private toDto(contrato: ContratoComRelacoes, nomes: Nomes): ContratoSalaDto {
    const profissional = contrato.locatarioTipo === 'PROFISSIONAL';
    const locatarioId = (profissional ? contrato.profissionalId : contrato.pacienteId) ?? '';
    const valorUnitario = Number(contrato.valorUnitario);
    const quantidadeMensal =
      contrato.quantidadeMensal === null ? null : Number(contrato.quantidadeMensal);
    return {
      id: contrato.id,
      modalidade: contrato.modalidade,
      salaId: contrato.salaId,
      salaNome: contrato.sala.nome,
      salaNumero: contrato.sala.numero,
      locatarioTipo: contrato.locatarioTipo,
      locatarioId,
      locatarioNome: profissional
        ? (contrato.profissional?.nome ?? REMOVIDO)
        : (nomes.pacientes.get(locatarioId) ?? REMOVIDO),
      especialidade: contrato.especialidade,
      valorUnitario,
      quantidadeMensal,
      valorTotalMensal: valorTotalMensal(contrato.modalidade, valorUnitario, quantidadeMensal),
      permuta: contrato.permuta,
      tipoReceita: contrato.tipoReceita,
      diaVencimento: contrato.diaVencimento,
      formaPagamentoId: contrato.formaPagamentoId,
      formaPagamentoNome: contrato.formaPagamentoId
        ? (nomes.formas.get(contrato.formaPagamentoId) ?? null)
        : null,
      indiceReajuste: contrato.indiceReajuste,
      dataInicio: diaISO(contrato.dataInicio),
      dataFim: contrato.dataFim ? diaISO(contrato.dataFim) : null,
      dias: contrato.dias.map(({ diaSemana, inicio, fim }) => ({ diaSemana, inicio, fim })),
      permiteIndicacao: contrato.permiteIndicacao,
      participaEventos: contrato.participaEventos,
      observacoes: contrato.observacoes,
      status: contrato.status,
      pdfArquivoId: contrato.pdfArquivoId,
      pdfNome: contrato.pdfArquivoId ? (nomes.pdfs.get(contrato.pdfArquivoId) ?? null) : null,
      createdAt: contrato.createdAt.toISOString(),
      updatedAt: contrato.updatedAt.toISOString(),
    };
  }
}
