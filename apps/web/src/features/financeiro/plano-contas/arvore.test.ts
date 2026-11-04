import type { PlanoConta } from '@torres/shared';
import { describe, expect, it } from 'vitest';
import { idsComFilhas, linhasVisiveis } from './arvore';

function conta(id: string, codigo: string, contaPaiId: string | null = null): PlanoConta {
  return {
    id,
    codigo,
    nome: codigo,
    tipo: 'DESPESA',
    nivel: codigo.split('.').length,
    contaPaiId,
    ativo: true,
    createdAt: '2026-10-01T12:00:00.000Z',
    updatedAt: '2026-10-01T12:00:00.000Z',
  };
}

const CONTAS = [
  conta('c', '6.1.01', 'b'),
  conta('d', '1'),
  conta('b', '6.1', 'a'),
  conta('a', '6'),
];

describe('linhasVisiveis', () => {
  it('recolhida mostra só as raízes, marcando as que têm subcontas', () => {
    const linhas = linhasVisiveis(CONTAS, new Set(), false);
    expect(linhas.map((l) => [l.conta.codigo, l.temFilhas])).toEqual([
      ['1', false],
      ['6', true],
    ]);
  });

  it('expandir mostra as subcontas logo abaixo do pai', () => {
    const linhas = linhasVisiveis(CONTAS, new Set(['a', 'b']), false);
    expect(linhas.map((l) => l.conta.codigo)).toEqual(['1', '6', '6.1', '6.1.01']);
  });

  it('plana lista tudo em ordem de código, sem controle de expandir', () => {
    const linhas = linhasVisiveis(CONTAS, new Set(), true);
    expect(linhas.map((l) => l.conta.codigo)).toEqual(['1', '6', '6.1', '6.1.01']);
    expect(linhas.some((l) => l.temFilhas)).toBe(false);
  });
});

describe('idsComFilhas', () => {
  it('retorna os pais', () => {
    expect([...idsComFilhas(CONTAS)].sort()).toEqual(['a', 'b']);
  });
});
