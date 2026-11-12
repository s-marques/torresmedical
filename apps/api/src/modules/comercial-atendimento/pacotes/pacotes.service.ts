import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  PACOTE_ROTULO_STATUS,
  somarItensPacote,
  statusExibicaoPacote,
  type CatalogoPacoteItem,
  type CatalogoPacoteQuery,
  type ExportPacotesQuery,
  type ListPacotesQuery,
  type Pacote,
  type PacoteExportColumn,
  type PacoteInput,
  type PacoteItem,
  type RegistrarUsoPacoteInput,
} from '@torres/shared';
import type { Prisma } from '../../../generated/prisma/client';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import { EXPORT_TIME_ZONE } from '../../../common/export/export-values';
import { paginate, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { ProdutosService } from '../../compras-estoque/produtos/produtos.service';
import { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import { PacientesService } from '../pacientes/pacientes.service';

const INCLUDE = {
  paciente: { select: { nome: true } },
  profissional: { select: { nome: true } },
  itens: { orderBy: { posicao: 'asc' } },
  usos: {
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: { profissional: { select: { nome: true } } },
  },
} satisfies Prisma.PacoteInclude;
type PacoteCompleto = Prisma.PacoteGetPayload<{ include: typeof INCLUDE }>;

const NAO_EXCLUIDOS = { deletedAt: null } as const;

/** Hoje (`AAAA-MM-DD`) no fuso da clínica, para decidir se o pacote está vencido. */
export function hojeNaClinica(agora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: EXPORT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);
}

const paraData = (valor: string | null): Date | null =>
  valor ? new Date(`${valor}T00:00:00Z`) : null;
const deData = (valor: Date | null): string | null => valor?.toISOString().slice(0, 10) ?? null;

/** Os usos abatem os itens na ordem em que foram cadastrados (o modal de uso não escolhe item). */
function distribuirUsos(itens: readonly { quantidade: number }[], sessoesUsadas: number): number[] {
  let restante = sessoesUsadas;
  return itens.map((item) => {
    const usadas = Math.min(item.quantidade, restante);
    restante -= usadas;
    return usadas;
  });
}

export function toPacote(p: PacoteCompleto, hoje = hojeNaClinica()): Pacote {
  const saldo = p.sessoesTotal - p.sessoesUsadas;
  const dataVencimento = deData(p.dataVencimento);
  const usadasPorItem = distribuirUsos(p.itens, p.sessoesUsadas);
  return {
    id: p.id,
    pacienteId: p.pacienteId,
    cliente: p.paciente.nome,
    nome: p.nome,
    descricao: p.descricao,
    valorTotal: p.valorTotal.toString(),
    dataInicio: deData(p.dataInicio),
    dataVencimento,
    profissionalId: p.profissionalId,
    profissional: p.profissional?.nome ?? null,
    observacoes: p.observacoes,
    sessoesTotal: p.sessoesTotal,
    sessoesUsadas: p.sessoesUsadas,
    saldo,
    status: statusExibicaoPacote({ gravado: p.status, saldo, dataVencimento }, hoje),
    itens: p.itens.map((i, indice): PacoteItem => ({
      id: i.id,
      produtoId: i.produtoId,
      descricao: i.descricao,
      quantidade: i.quantidade,
      valorUnitario: i.valorUnitario.toString(),
      usadas: usadasPorItem[indice] ?? 0,
    })),
    usos: p.usos.map((u) => ({
      id: u.id,
      profissionalId: u.profissionalId,
      profissional: u.profissional.nome,
      quantidade: u.quantidade,
      observacoes: u.observacoes,
      data: u.createdAt.toISOString(),
    })),
  };
}

/** Colunas exportáveis, iguais às do grid. */
export const PACOTE_EXPORT_DEFINITIONS: readonly ExportColumn<Pacote, PacoteExportColumn>[] = [
  { key: 'cliente', header: 'Cliente', value: (p) => p.cliente, width: 3 },
  { key: 'nome', header: 'Pacote', value: (p) => p.nome, width: 3 },
  { key: 'sessoes', header: 'Sessões', type: 'number', value: (p) => p.sessoesTotal },
  { key: 'saldo', header: 'Saldo', type: 'number', value: (p) => p.saldo },
  { key: 'valor', header: 'Valor', type: 'currency', value: (p) => p.valorTotal },
  { key: 'vencimento', header: 'Vencimento', type: 'date', value: (p) => p.dataVencimento },
  { key: 'status', header: 'Status', value: (p) => PACOTE_ROTULO_STATUS[p.status] },
];

/** Pacotes de sessões do Comercial/Atendimento (tela `/pacotes`). */
@Injectable()
export class PacotesService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
    private readonly pacientes: PacientesService,
    private readonly profissionais: ProfissionaisService,
    private readonly produtos: ProdutosService,
  ) {}

  async list(query: ListPacotesQuery): Promise<Page<Pacote>> {
    const where = this.where(query);
    const orderBy = this.orderBy(query.sort);
    const hoje = hojeNaClinica();
    const page = await paginate(query, {
      findMany: (p) => this.txHost.tx.pacote.findMany({ where, orderBy, include: INCLUDE, ...p }),
      count: () => this.txHost.tx.pacote.count({ where }),
    });
    return { ...page, data: page.data.map((p) => toPacote(p, hoje)) };
  }

  async findById(id: string): Promise<Pacote> {
    return toPacote(await this.buscar(id));
  }

  async create(input: PacoteInput): Promise<Pacote> {
    await this.validarReferencias(input);
    const itens = await this.montarItens(input);
    const criado = await this.txHost.tx.pacote.create({
      data: {
        ...this.dados(input, itens),
        itens: { create: itens },
      },
      include: INCLUDE,
    });
    return toPacote(criado);
  }

  /** Substitui os itens. O total de sessões não pode ficar abaixo das já usadas. */
  async update(id: string, input: PacoteInput): Promise<Pacote> {
    const atual = await this.buscar(id);
    await this.validarReferencias(input);
    const itens = await this.montarItens(input);
    const dados = this.dados(input, itens);
    if (dados.sessoesTotal < atual.sessoesUsadas) {
      throw new BusinessException(
        ErrorCode.BUSINESS_RULE,
        `O pacote já tem ${atual.sessoesUsadas} sessão(ões) usada(s): o total de sessões dos itens não pode ser menor.`,
      );
    }
    const atualizado = await this.txHost.tx.pacote.update({
      where: { id },
      data: { ...dados, itens: { deleteMany: {}, create: itens } },
      include: INCLUDE,
    });
    return toPacote(atualizado);
  }

  /** Exclusão lógica: histórico comercial. */
  async remove(id: string): Promise<Pacote> {
    await this.buscar(id);
    const excluido = await this.txHost.tx.pacote.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: INCLUDE,
    });
    return toPacote(excluido);
  }

  /** Modal "Registrar Uso de Sessão": baixa a quantidade do saldo do pacote. */
  async registrarUso(id: string, input: RegistrarUsoPacoteInput): Promise<Pacote> {
    const pacote = await this.buscar(id);
    if (pacote.status === 'CANCELADO') {
      throw new BusinessException(
        ErrorCode.BUSINESS_RULE,
        'Não é possível usar sessão de um pacote cancelado.',
      );
    }
    const saldo = pacote.sessoesTotal - pacote.sessoesUsadas;
    if (input.quantidade > saldo) {
      throw new BusinessException(
        ErrorCode.BUSINESS_RULE,
        `O pacote tem apenas ${saldo} sessão(ões) de saldo.`,
      );
    }
    await this.profissionais.garantirExiste(input.profissionalId);

    await this.txHost.tx.pacoteUso.create({
      data: {
        pacoteId: id,
        profissionalId: input.profissionalId,
        quantidade: input.quantidade,
        observacoes: input.observacoes,
      },
    });
    const atualizado = await this.txHost.tx.pacote.update({
      where: { id },
      data: { sessoesUsadas: { increment: input.quantidade } },
      include: INCLUDE,
    });
    // Duas requisições ao mesmo tempo: a transação do @Audit desfaz a que passar do total.
    if (atualizado.sessoesUsadas > atualizado.sessoesTotal) {
      throw new BusinessException(ErrorCode.BUSINESS_RULE, 'O pacote não tem saldo suficiente.');
    }
    return toPacote(atualizado);
  }

  /** Remove um uso do histórico (botão X) e devolve a quantidade ao saldo. */
  async removerUso(id: string, usoId: string): Promise<Pacote> {
    await this.buscar(id);
    const uso = await this.txHost.tx.pacoteUso.findFirst({ where: { id: usoId, pacoteId: id } });
    if (!uso) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Uso de sessão não encontrado', {
        status: 404,
      });
    }
    await this.txHost.tx.pacoteUso.delete({ where: { id: usoId } });
    const atualizado = await this.txHost.tx.pacote.update({
      where: { id },
      data: { sessoesUsadas: { decrement: uso.quantidade } },
      include: INCLUDE,
    });
    return toPacote(atualizado);
  }

  async export(query: ExportPacotesQuery): Promise<ExportFile> {
    const where = this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.pacote.count({ where }));
    const rows = await this.txHost.tx.pacote.findMany({
      where,
      orderBy: this.orderBy(query.sort),
      include: INCLUDE,
    });
    const hoje = hojeNaClinica();
    return this.exportService.export({
      format: query.format,
      title: 'Pacotes de Sessões',
      filename: 'pacotes',
      columns: selectColumns(PACOTE_EXPORT_DEFINITIONS, query.columns),
      rows: rows.map((p) => toPacote(p, hoje)),
    });
  }

  /** Produtos e procedimentos ativos para a busca do modal, com o preço de venda. */
  async catalogo(query: CatalogoPacoteQuery): Promise<Page<CatalogoPacoteItem>> {
    const r = await this.produtos.vendaveis(query);
    return {
      ...r,
      data: r.data.map((p) => ({
        id: p.id,
        nome: p.nome,
        categoria: p.categoria,
        valor: p.precoVenda,
      })),
    };
  }

  private async buscar(id: string): Promise<PacoteCompleto> {
    const pacote = await this.txHost.tx.pacote.findFirst({
      where: { id, ...NAO_EXCLUIDOS },
      include: INCLUDE,
    });
    if (!pacote) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Pacote não encontrado', { status: 404 });
    }
    return pacote;
  }

  private async validarReferencias(input: PacoteInput): Promise<void> {
    await this.pacientes.findLookupById(input.pacienteId);
    if (input.profissionalId) await this.profissionais.garantirExiste(input.profissionalId);
  }

  /** Nome e preço unitário vêm sempre do cadastro do produto, nunca do front. */
  private async montarItens(
    input: PacoteInput,
  ): Promise<Prisma.PacoteItemUncheckedCreateWithoutPacoteInput[]> {
    const itens: Prisma.PacoteItemUncheckedCreateWithoutPacoteInput[] = [];
    for (const [posicao, item] of input.itens.entries()) {
      const produto = await this.produtos.findById(item.produtoId);
      itens.push({
        produtoId: produto.id,
        descricao: produto.nome,
        quantidade: item.quantidade,
        valorUnitario: produto.precoVenda,
        posicao,
      });
    }
    return itens;
  }

  private dados(
    input: PacoteInput,
    itens: readonly Prisma.PacoteItemUncheckedCreateWithoutPacoteInput[],
  ) {
    const soma = somarItensPacote(
      itens.map((i) => ({ quantidade: i.quantidade, valorUnitario: Number(i.valorUnitario) })),
    );
    return {
      pacienteId: input.pacienteId,
      nome: input.nome,
      descricao: input.descricao,
      valorTotal: input.valorTotal ?? soma,
      dataInicio: paraData(input.dataInicio),
      dataVencimento: paraData(input.dataVencimento),
      profissionalId: input.profissionalId,
      observacoes: input.observacoes,
      sessoesTotal: itens.reduce((total, i) => total + i.quantidade, 0),
    };
  }

  /**
   * Chips: Cancelado é gravado; Finalizado (saldo zerado) e Vencido (passou a data, com saldo)
   * são calculados; Ativo é o restante.
   */
  private where(query: Pick<ListPacotesQuery, 'search' | 'status'>): Prisma.PacoteWhereInput {
    const { sessoesTotal } = this.txHost.tx.pacote.fields;
    const hoje = new Date(`${hojeNaClinica()}T00:00:00Z`);
    const comSaldo: Prisma.PacoteWhereInput = { sessoesUsadas: { lt: sessoesTotal } };
    const porStatus: Record<NonNullable<ListPacotesQuery['status']>, Prisma.PacoteWhereInput> = {
      cancelado: { status: 'CANCELADO' },
      finalizado: { status: 'ATIVO', sessoesUsadas: { gte: sessoesTotal } },
      vencido: { status: 'ATIVO', ...comSaldo, dataVencimento: { lt: hoje } },
      ativo: {
        status: 'ATIVO',
        ...comSaldo,
        OR: [{ dataVencimento: null }, { dataVencimento: { gte: hoje } }],
      },
    };
    return {
      ...NAO_EXCLUIDOS,
      ...(query.status && porStatus[query.status]),
      ...(query.search && {
        AND: [
          {
            OR: [
              { nome: { contains: query.search, mode: 'insensitive' } },
              { paciente: { nome: { contains: query.search, mode: 'insensitive' } } },
            ],
          },
        ],
      }),
    };
  }

  private orderBy(sort: ListPacotesQuery['sort']): Prisma.PacoteOrderByWithRelationInput[] {
    const { field, direction } = sort;
    let principal: Prisma.PacoteOrderByWithRelationInput;
    if (field === 'cliente') principal = { paciente: { nome: direction } };
    else if (field === 'valor') principal = { valorTotal: direction };
    else if (field === 'vencimento') principal = { dataVencimento: direction };
    else if (field === 'criacao') principal = { createdAt: direction };
    else principal = { [field]: direction };
    return [principal, { id: direction }];
  }
}
