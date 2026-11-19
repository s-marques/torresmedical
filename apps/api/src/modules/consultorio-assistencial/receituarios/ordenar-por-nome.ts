import type { SortDirection } from '@torres/shared';

/** Registro mínimo para ordenar pelo nome de uma entidade de outro módulo (sem FK). */
export interface ChaveOrdenacao {
  id: string;
  /** Id do paciente/profissional cujo nome define a ordem; `null` vai para o fim. */
  refId: string | null;
}

export interface PaginaPorNome {
  /** Ids da página pedida, já na ordem. */
  ids: string[];
  total: number;
}

const COLLATOR = new Intl.Collator('pt-BR', { sensitivity: 'base' });

/**
 * Ordena pelo nome de uma entidade de outro módulo e devolve os ids de uma página. Paciente e
 * profissional não têm FK nas tabelas deste módulo (CLAUDE.md, seção 3): o banco não ordena por
 * esses nomes, então a ordem é montada aqui com os nomes do service dono. Sem nome (registro
 * excluído ou sem médico) fica no fim, em qualquer direção.
 */
export function paginarPorNome(
  chaves: readonly ChaveOrdenacao[],
  nomes: ReadonlyMap<string, string>,
  { page, pageSize, direction }: { page: number; pageSize: number; direction: SortDirection },
): PaginaPorNome {
  const fator = direction === 'asc' ? 1 : -1;
  const nome = (c: ChaveOrdenacao) => (c.refId ? (nomes.get(c.refId) ?? null) : null);
  const ordenadas = [...chaves].sort((a, b) => {
    const na = nome(a);
    const nb = nome(b);
    if (na === null || nb === null) {
      if (na === nb) return a.id.localeCompare(b.id);
      return na === null ? 1 : -1;
    }
    return fator * COLLATOR.compare(na, nb) || a.id.localeCompare(b.id);
  });
  const inicio = (page - 1) * pageSize;
  return { ids: ordenadas.slice(inicio, inicio + pageSize).map((c) => c.id), total: chaves.length };
}

/** Reordena os registros buscados por id na ordem da página. */
export function naOrdem<T extends { id: string }>(ids: readonly string[], registros: T[]): T[] {
  const porId = new Map(registros.map((r) => [r.id, r]));
  return ids.map((id) => porId.get(id)).filter((r): r is T => r !== undefined);
}
