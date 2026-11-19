import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  PRESTADOR_CATEGORIA_ROTULOS,
  PRESTADOR_STATUS_ROTULOS,
  rotuloNotaPrestador,
  type CreatePrestadorInput,
  type ExportPrestadoresQuery,
  type ListPrestadoresQuery,
  type Prestador as PrestadorDto,
  type PrestadorExportColumn,
  type UpdatePrestadorInput,
} from '@torres/shared';
import { isUuid } from '../../../common/auth/tokens';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import { paginate, searchWhere, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { Prestador, Prisma } from '../../../generated/prisma/client';

const NAO_EXCLUIDOS = { deletedAt: null } as const;

/** Colunas Urgência e Avaliação do grid: `atendeUrgencia` e a nota de qualidade. */
const CAMPO_ORDENACAO = { urgencia: 'atendeUrgencia', avaliacao: 'notaQualidade' } as const;

const numeroOuNull = (valor: { toString(): string } | null) =>
  valor === null ? null : Number(valor);

export function toDto(prestador: Prestador): PrestadorDto {
  return {
    id: prestador.id,
    nome: prestador.nome,
    nomeFantasia: prestador.nomeFantasia,
    tipoPessoa: prestador.tipoPessoa,
    documento: prestador.documento,
    telefone: prestador.telefone,
    email: prestador.email,
    status: prestador.status,
    endereco: prestador.endereco,
    categoria: prestador.categoria,
    descricaoServico: prestador.descricaoServico,
    atendeUrgencia: prestador.atendeUrgencia,
    atendeFimSemana: prestador.atendeFimSemana,
    formaPagamento: prestador.formaPagamento,
    chavePix: prestador.chavePix,
    valorHora: numeroOuNull(prestador.valorHora),
    valorDiaria: numeroOuNull(prestador.valorDiaria),
    emiteNotaFiscal: prestador.emiteNotaFiscal,
    notaQualidade: prestador.notaQualidade,
    notaPontualidade: prestador.notaPontualidade,
    avaliacaoPreco: prestador.avaliacaoPreco,
    observacoes: prestador.observacoes,
    createdAt: prestador.createdAt.toISOString(),
    updatedAt: prestador.updatedAt.toISOString(),
  };
}

/** Colunas exportáveis, iguais às do grid. */
export const PRESTADOR_EXPORT_DEFINITIONS: readonly ExportColumn<
  Prestador,
  PrestadorExportColumn
>[] = [
  { key: 'nome', header: 'Nome', value: (p) => p.nome, width: 3 },
  {
    key: 'categoria',
    header: 'Categoria',
    value: (p) => PRESTADOR_CATEGORIA_ROTULOS[p.categoria],
    width: 2,
  },
  { key: 'telefone', header: 'Telefone', value: (p) => p.telefone ?? '' },
  { key: 'urgencia', header: 'Urgência', value: (p) => (p.atendeUrgencia ? 'Sim' : 'Não') },
  { key: 'avaliacao', header: 'Avaliação', value: (p) => rotuloNotaPrestador(p.notaQualidade) },
  { key: 'status', header: 'Status', value: (p) => PRESTADOR_STATUS_ROTULOS[p.status] },
];

/** Prestadores de serviço de manutenção (tela Prestadores, `/prestadores`, issue #40). */
@Injectable()
export class PrestadoresService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
  ) {}

  async list(query: ListPrestadoresQuery): Promise<Page<PrestadorDto>> {
    const where = this.where(query);
    const orderBy = toOrderBy(query.sort, CAMPO_ORDENACAO);
    const page = await paginate(query, {
      findMany: (p) => this.txHost.tx.prestador.findMany({ where, orderBy, ...p }),
      count: () => this.txHost.tx.prestador.count({ where }),
    });
    return { ...page, data: page.data.map(toDto) };
  }

  async findById(id: string): Promise<PrestadorDto> {
    return toDto(await this.buscar(id));
  }

  /** CPF/CNPJ repetido é permitido, como em Fornecedores. */
  async create(input: CreatePrestadorInput): Promise<PrestadorDto> {
    return toDto(await this.txHost.tx.prestador.create({ data: input }));
  }

  /** Substitui todos os campos: o modal Editar envia o formulário inteiro. */
  async update(id: string, input: UpdatePrestadorInput): Promise<PrestadorDto> {
    await this.buscar(id);
    return toDto(await this.txHost.tx.prestador.update({ where: { id }, data: input }));
  }

  /** Exclusão lógica. */
  async remove(id: string): Promise<PrestadorDto> {
    await this.buscar(id);
    return toDto(
      await this.txHost.tx.prestador.update({ where: { id }, data: { deletedAt: new Date() } }),
    );
  }

  async export(query: ExportPrestadoresQuery): Promise<ExportFile> {
    const where = this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.prestador.count({ where }));
    const rows = await this.txHost.tx.prestador.findMany({
      where,
      orderBy: toOrderBy(query.sort, CAMPO_ORDENACAO),
    });
    return this.exportService.export({
      format: query.format,
      title: 'Prestadores de Serviço',
      filename: 'prestadores',
      columns: selectColumns(PRESTADOR_EXPORT_DEFINITIONS, query.columns),
      rows,
    });
  }

  /**
   * "Buscar prestador..." (`nome`) procura no nome e no nome fantasia; a busca do grid
   * (`search`) também no telefone e no CPF/CNPJ. As duas valem juntas.
   */
  private where(
    query: Pick<ListPrestadoresQuery, 'search' | 'status' | 'categoria' | 'nome'>,
  ): Prisma.PrestadorWhereInput {
    const buscas = [
      searchWhere(query.nome, ['nome', 'nomeFantasia']),
      searchWhere(query.search, ['nome', 'nomeFantasia', 'telefone', 'documento']),
    ].filter((busca) => busca !== undefined);
    return {
      ...NAO_EXCLUIDOS,
      status: query.status,
      categoria: query.categoria,
      ...(buscas.length > 0 && { AND: buscas }),
    };
  }

  private async buscar(id: string): Promise<Prestador> {
    const prestador = isUuid(id)
      ? await this.txHost.tx.prestador.findFirst({ where: { id, ...NAO_EXCLUIDOS } })
      : null;
    if (!prestador) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Prestador não encontrado', {
        status: 404,
      });
    }
    return prestador;
  }
}
