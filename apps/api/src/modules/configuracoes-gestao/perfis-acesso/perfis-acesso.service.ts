import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  ACAO_VER,
  PERFIL_ADMINISTRADOR,
  permissaoDaPagina,
  PERFIL_NOME_MAX,
  TELAS,
  TOTAL_PAGINAS_SISTEMA,
  type CreatePerfilInput,
  type ExportPerfisQuery,
  type ListPerfisQuery,
  type Perfil as PerfilDto,
  type PerfilExportColumn,
  type UpdatePerfilInput,
} from '@torres/shared';
import type { Prisma } from '../../../generated/prisma/client';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { ExportService, selectColumns } from '../../../common/export/export.service';
import type { ExportColumn, ExportFile } from '../../../common/export/export.types';
import { paginate, searchWhere, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

const PAGINAS: ReadonlySet<string> = new Set(TELAS.map((tela) => tela.id));
const SUFIXO_VER = `.${ACAO_VER}`;

/** Id da tela quando a permissão é o `.ver` de uma página do menu; senão `undefined`. */
function paginaDaPermissao(permissao: string): string | undefined {
  if (!permissao.endsWith(SUFIXO_VER)) return undefined;
  const pagina = permissao.slice(0, -SUFIXO_VER.length);
  return PAGINAS.has(pagina) ? pagina : undefined;
}

const PREFIXO_COPIA = 'Cópia de ';

const INCLUDE = { permissoes: true } satisfies Prisma.PerfilInclude;
type PerfilComPermissoes = Prisma.PerfilGetPayload<{ include: typeof INCLUDE }>;

/** Colunas exportáveis, iguais às do grid. */
export const PERFIL_EXPORT_DEFINITIONS: readonly ExportColumn<PerfilDto, PerfilExportColumn>[] = [
  { key: 'nome', header: 'Nome', value: (p) => p.nome, width: 3 },
  { key: 'descricao', header: 'Descrição', value: (p) => p.descricao ?? '', width: 3 },
  {
    key: 'paginas',
    header: 'Páginas',
    value: (p) => `${p.paginasPermitidas.length} de ${TOTAL_PAGINAS_SISTEMA} páginas`,
    width: 2,
  },
  { key: 'status', header: 'Status', value: (p) => (p.ativo ? 'Ativo' : 'Inativo') },
];

/**
 * Perfis de Acesso (`/perfis`): o conjunto de páginas (permissão `.ver`) que um perfil libera
 * para os seus usuários. Cada página marcada vira uma linha em `PerfilPermissao`.
 */
@Injectable()
export class PerfisAcessoService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly exportService: ExportService,
  ) {}

  list(query: ListPerfisQuery): Promise<Page<PerfilDto>> {
    const where = this.where(query);
    const orderBy = toOrderBy(query.sort);
    return paginate(query, {
      findMany: async (page) => {
        const perfis = await this.txHost.tx.perfil.findMany({
          where,
          orderBy,
          include: INCLUDE,
          ...page,
        });
        return perfis.map((perfil) => this.toDto(perfil));
      },
      count: () => this.txHost.tx.perfil.count({ where }),
    });
  }

  async findById(id: string): Promise<PerfilDto> {
    return this.toDto(await this.buscar(id));
  }

  async create(input: CreatePerfilInput): Promise<PerfilDto> {
    const criado = await this.txHost.tx.perfil.create({
      data: {
        nome: input.nome,
        descricao: input.descricao,
        escopoDados: input.escopoDados,
        permissoes: { create: this.permissoes(input.paginasPermitidas) },
      },
      include: INCLUDE,
    });
    return this.toDto(criado);
  }

  /**
   * A tela edita só as páginas (`.ver`). As demais ações do perfil (criar, editar, excluir,
   * exportar e permissões extras) são mantidas para as páginas que continuam liberadas.
   */
  async update(id: string, input: UpdatePerfilInput): Promise<PerfilDto> {
    const atual = await this.buscar(id);
    this.garantirAdministradorIntacto(atual, input);
    const paginas = new Set<string>(input.paginasPermitidas);
    const mantidas = atual.permissoes
      .map((item) => item.permissao)
      .filter((permissao) => {
        if (paginaDaPermissao(permissao)) return false;
        const pagina = permissao.split('.').slice(0, 2).join('.');
        return !PAGINAS.has(pagina) || paginas.has(pagina);
      });
    const alterado = await this.txHost.tx.perfil.update({
      where: { id },
      data: {
        nome: input.nome,
        descricao: input.descricao,
        escopoDados: input.escopoDados,
        permissoes: {
          deleteMany: {},
          create: [
            ...this.permissoes(input.paginasPermitidas),
            ...mantidas.map((permissao) => ({ permissao })),
          ],
        },
      },
      include: INCLUDE,
    });
    return this.toDto(alterado);
  }

  /** Copia um perfil (inclusive um padrão) com todas as permissões, para a gerência ajustar. */
  async duplicar(id: string): Promise<PerfilDto> {
    const origem = await this.buscar(id);
    const copia = await this.txHost.tx.perfil.create({
      data: {
        nome: await this.nomeDaCopia(origem.nome),
        descricao: origem.descricao,
        escopoDados: origem.escopoDados,
        permissoes: {
          create: origem.permissoes.map((item) => ({ permissao: item.permissao })),
        },
      },
      include: INCLUDE,
    });
    return this.toDto(copia);
  }

  /** Exclusão lógica: perfis em uso (`onDelete: Restrict`) mantêm a referência ao excluído. */
  async remove(id: string): Promise<PerfilDto> {
    const perfil = await this.buscar(id);
    if (perfil.padrao) {
      throw new BusinessException(
        'PERFIL_PADRAO_NAO_EXCLUIVEL',
        'Perfis padrão não podem ser excluídos. Duplique o perfil para ajustar.',
      );
    }
    const removido = await this.txHost.tx.perfil.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: INCLUDE,
    });
    return this.toDto(removido);
  }

  async export(query: ExportPerfisQuery): Promise<ExportFile> {
    const where = this.where(query);
    this.exportService.ensureWithinLimit(await this.txHost.tx.perfil.count({ where }));
    const perfis = await this.txHost.tx.perfil.findMany({
      where,
      orderBy: toOrderBy(query.sort),
      include: INCLUDE,
    });
    return this.exportService.export({
      format: query.format,
      title: 'Perfis de Acesso',
      filename: 'perfis',
      columns: selectColumns(PERFIL_EXPORT_DEFINITIONS, query.columns),
      rows: perfis.map((perfil) => this.toDto(perfil)),
    });
  }

  private permissoes(
    paginas: CreatePerfilInput['paginasPermitidas'],
  ): Prisma.PerfilPermissaoCreateWithoutPerfilInput[] {
    return paginas.map((pagina) => ({ permissao: permissaoDaPagina(pagina) }));
  }

  private toDto(perfil: PerfilComPermissoes): PerfilDto {
    return {
      id: perfil.id,
      nome: perfil.nome,
      descricao: perfil.descricao,
      paginasPermitidas: perfil.permissoes.flatMap(
        (item) => paginaDaPermissao(item.permissao) ?? [],
      ),
      escopoDados: perfil.escopoDados,
      padrao: perfil.padrao,
      ativo: perfil.ativo,
      createdAt: perfil.createdAt.toISOString(),
      updatedAt: perfil.updatedAt.toISOString(),
    };
  }

  /** O Administrador sempre tem todas as páginas e o escopo de todos os dados. */
  private garantirAdministradorIntacto(atual: PerfilComPermissoes, input: UpdatePerfilInput): void {
    if (!atual.padrao || atual.nome !== PERFIL_ADMINISTRADOR) return;
    const atuais = new Set(
      atual.permissoes.flatMap((item) => paginaDaPermissao(item.permissao) ?? []),
    );
    const mudouPaginas =
      atuais.size !== input.paginasPermitidas.length ||
      input.paginasPermitidas.some((pagina) => !atuais.has(pagina));
    if (mudouPaginas || input.escopoDados !== atual.escopoDados || input.nome !== atual.nome) {
      throw new BusinessException(
        'PERFIL_ADMINISTRADOR_PROTEGIDO',
        'O perfil Administrador não pode ter nome, páginas ou escopo alterados. Duplique o perfil para ajustar.',
      );
    }
  }

  private async nomeDaCopia(nome: string): Promise<string> {
    const base = `${PREFIXO_COPIA}${nome}`.slice(0, PERFIL_NOME_MAX - 5);
    for (let n = 1; ; n++) {
      const candidato = n === 1 ? base : `${base} (${n})`;
      // Inclui os excluídos: o nome é único mesmo na exclusão lógica.
      if (!(await this.txHost.tx.perfil.findUnique({ where: { nome: candidato } })))
        return candidato;
    }
  }

  private async buscar(id: string): Promise<PerfilComPermissoes> {
    const perfil = await this.txHost.tx.perfil.findFirst({
      where: { id, deletedAt: null },
      include: INCLUDE,
    });
    if (!perfil) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Perfil não encontrado', { status: 404 });
    }
    return perfil;
  }

  private where(query: Pick<ListPerfisQuery, 'search' | 'status'>): Prisma.PerfilWhereInput {
    return {
      deletedAt: null,
      ativo: query.status ? query.status === 'ativo' : undefined,
      ...searchWhere(query.search, ['nome']),
    };
  }
}
