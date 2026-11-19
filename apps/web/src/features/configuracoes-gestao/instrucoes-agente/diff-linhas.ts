export interface LinhaDiff {
  tipo: 'igual' | 'removida' | 'adicionada';
  texto: string;
}

/** Diferença linha a linha entre dois textos (LCS), para comparar versões de uma instrução. */
export function diffLinhas(antes: string, depois: string): LinhaDiff[] {
  const a = antes.split('\n');
  const b = depois.split('\n');
  const tabela = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      tabela[i]![j] =
        a[i] === b[j]
          ? tabela[i + 1]![j + 1]! + 1
          : Math.max(tabela[i + 1]![j]!, tabela[i]![j + 1]!);
    }
  }
  const resultado: LinhaDiff[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      resultado.push({ tipo: 'igual', texto: a[i]! });
      i++;
      j++;
    } else if (tabela[i + 1]![j]! >= tabela[i]![j + 1]!) {
      resultado.push({ tipo: 'removida', texto: a[i++]! });
    } else {
      resultado.push({ tipo: 'adicionada', texto: b[j++]! });
    }
  }
  while (i < a.length) resultado.push({ tipo: 'removida', texto: a[i++]! });
  while (j < b.length) resultado.push({ tipo: 'adicionada', texto: b[j++]! });
  return resultado;
}
