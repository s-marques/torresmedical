import { compararCodigosConta, type PlanoConta } from '@torres/shared';

export interface LinhaArvore {
  conta: PlanoConta;
  temFilhas: boolean;
}

/** Ids das contas que têm subcontas na lista. */
export function idsComFilhas(contas: readonly PlanoConta[]): Set<string> {
  const pais = new Set<string>();
  for (const conta of contas) if (conta.contaPaiId) pais.add(conta.contaPaiId);
  return pais;
}

/**
 * Linhas visíveis da árvore: as raízes e, abaixo de cada conta expandida, as suas subcontas, em
 * ordem natural de código. Com `plana`, mostra todas as contas (resultado de busca ou filtro).
 */
export function linhasVisiveis(
  contas: readonly PlanoConta[],
  expandidas: ReadonlySet<string>,
  plana: boolean,
): LinhaArvore[] {
  const ordenadas = [...contas].sort((a, b) => compararCodigosConta(a.codigo, b.codigo));
  const pais = idsComFilhas(ordenadas);
  if (plana) {
    return ordenadas.map((conta) => ({ conta, temFilhas: false }));
  }

  const filhasDe = new Map<string | null, PlanoConta[]>();
  for (const conta of ordenadas) {
    filhasDe.set(conta.contaPaiId, [...(filhasDe.get(conta.contaPaiId) ?? []), conta]);
  }
  const linhas: LinhaArvore[] = [];
  const visitar = (paiId: string | null) => {
    for (const conta of filhasDe.get(paiId) ?? []) {
      linhas.push({ conta, temFilhas: pais.has(conta.id) });
      if (expandidas.has(conta.id)) visitar(conta.id);
    }
  };
  visitar(null);
  return linhas;
}
