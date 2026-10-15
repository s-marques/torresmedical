import type { LookupItem, Sort } from '@torres/shared';
import { isUuid } from '../auth/tokens';
import { BusinessException } from '../errors/api.exception';
import { ErrorCode } from '../errors/error-codes';
import { paginate, toOrderBy, type OrderBy, type Page } from '../pagination/paginate';

/**
 * Acesso de um service ao model Prisma da entidade, para as consultas de lookup.
 * Ex.: `{ findMany: (args) => this.txHost.tx.cargo.findMany(args), count: ..., findFirst: ... }`.
 * Quem precisa de relação (ex.: nome da especialidade) acrescenta o `include` aqui.
 */
export interface FonteLookup<W, R extends { id: string }> {
  findMany(args: {
    where: W;
    orderBy: OrderBy<'nome' | 'id'>[];
    skip: number;
    take: number;
  }): Promise<R[]>;
  count(args: { where: W }): Promise<number>;
  findFirst(args: { where: W }): Promise<R | null>;
}

export interface ConsultaLookup {
  page: number;
  pageSize: number;
  sort: Sort<'nome'>;
}

/** Só o que pode ser escolhido num combobox: não excluído e ativo. */
export const SELECIONAVEIS = { deletedAt: null, ativo: true } as const;

/** Lista paginada `{ data, meta }` de itens do combobox. */
export function listarLookup<W, R extends { id: string }>(
  consulta: ConsultaLookup,
  fonte: FonteLookup<W, R>,
  where: W,
  toItem: (registro: R) => LookupItem,
): Promise<Page<LookupItem>> {
  const orderBy = toOrderBy(consulta.sort);
  return paginate(consulta, {
    findMany: async (page) => (await fonte.findMany({ where, orderBy, ...page })).map(toItem),
    count: () => fonte.count({ where }),
  });
}

/**
 * Registro não excluído pelo id (ativo ou inativo, para exibir valores já gravados).
 * Id inválido ou inexistente → 404, sem consultar com filtro vazio.
 */
export async function buscarPorId<W, R extends { id: string }>(
  fonte: FonteLookup<W, R>,
  id: string,
  naoEncontrado: string,
): Promise<R> {
  const registro = isUuid(id)
    ? await fonte.findFirst({ where: { id, deletedAt: null } as W })
    : null;
  if (!registro) throw new BusinessException(ErrorCode.NOT_FOUND, naoEncontrado, { status: 404 });
  return registro;
}

/** Junta as partes preenchidas do texto secundário: `['CRM 123', null, 'Pediatria']` → `CRM 123 · Pediatria`. */
export function juntarDescricao(...partes: Array<string | null | undefined>): string | null {
  const preenchidas = partes.filter((parte): parte is string => Boolean(parte?.trim()));
  return preenchidas.length > 0 ? preenchidas.join(' · ') : null;
}

/**
 * Base dos services das entidades compartilhadas (CLAUDE.md, seção 3): o módulo dono estende
 * e informa como acessar o model, o filtro da busca e o item do combobox. Os outros módulos
 * usam `findById`/`lookup` do service exportado, sem acessar a tabela.
 */
export abstract class EntidadeLookupService<Q extends ConsultaLookup, W, R extends { id: string }> {
  protected abstract readonly fonte: FonteLookup<W, R>;
  /** Mensagem do 404, ex.: `Paciente não encontrado`. */
  protected abstract readonly naoEncontrado: string;
  /** `where` da listagem: selecionáveis + busca + filtros da query. */
  protected abstract filtro(query: Q): W;
  protected abstract toItem(registro: R): LookupItem;

  lookup(query: Q): Promise<Page<LookupItem>> {
    return listarLookup(query, this.fonte, this.filtro(query), (registro) => this.toItem(registro));
  }

  /** Registro não excluído (ativo ou inativo); 404 se não existir. */
  findById(id: string): Promise<R> {
    return buscarPorId(this.fonte, id, this.naoEncontrado);
  }

  async findLookupById(id: string): Promise<LookupItem> {
    return this.toItem(await this.findById(id));
  }
}
