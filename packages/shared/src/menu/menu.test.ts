import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { encontrarTelaPorRota, filtrarMenu, MENU, TELAS } from './menu';

interface ModuloInventario {
  nome: string;
  telas: { nome: string; rota: string }[];
}

/** Lê módulos e telas (nome e URL) do índice do inventário, na ordem em que aparecem. */
function lerInventario(): ModuloInventario[] {
  const readme = readFileSync(
    new URL('../../../../docs/inventario/README.md', import.meta.url),
    'utf8',
  );
  const modulos: ModuloInventario[] = [];
  for (const linha of readme.split('\n')) {
    const titulo = /^## (.+)$/.exec(linha);
    if (titulo?.[1] === 'Telas não inventariadas') break;
    if (titulo?.[1]) {
      modulos.push({ nome: titulo[1], telas: [] });
      continue;
    }
    const tela = /^\| (.+?) \| `(.+?)` \|/.exec(linha);
    if (tela?.[1] && tela[2]) modulos.at(-1)?.telas.push({ nome: tela[1], rota: tela[2] });
  }
  return modulos;
}

describe('MENU', () => {
  it('tem os 9 módulos e as 70 telas do inventário, com os mesmos nomes, URLs e ordem', () => {
    const inventario = lerInventario();
    const menu = MENU.map((modulo) => ({
      nome: modulo.nome,
      telas: modulo.telas.map(({ nome, rota }) => ({ nome, rota })),
    }));

    expect(MENU).toHaveLength(9);
    expect(TELAS).toHaveLength(70);
    expect(menu).toEqual(inventario);
  });

  it('não repete rota, id nem permissão', () => {
    expect(new Set(TELAS.map((t) => t.rota)).size).toBe(TELAS.length);
    expect(new Set(TELAS.map((t) => t.id)).size).toBe(TELAS.length);
    expect(new Set(TELAS.map((t) => t.permissao)).size).toBe(TELAS.length);
  });

  it('usa permissões no formato <modulo>.<recurso>.ver, do próprio módulo', () => {
    for (const tela of TELAS) {
      expect(tela.permissao).toMatch(/^[a-z0-9-]+\.[a-z0-9-]+\.ver$/);
      expect(tela.permissao).toBe(`${tela.id}.ver`);
      expect(tela.id.startsWith(`${tela.modulo}.`)).toBe(true);
    }
  });

  it('usa o exemplo de permissão do CLAUDE.md para Contas a Receber', () => {
    expect(encontrarTelaPorRota('/receber')?.permissao).toBe('financeiro.contas-receber.ver');
  });
});

describe('encontrarTelaPorRota', () => {
  it('encontra a tela pela rota exata', () => {
    expect(encontrarTelaPorRota('/clientes')?.id).toBe('comercial-atendimento.pacientes');
    expect(encontrarTelaPorRota('/crm/relatorios')?.id).toBe('comercial-atendimento.relatorios');
  });

  it('devolve undefined para rota desconhecida', () => {
    expect(encontrarTelaPorRota('/nao-existe')).toBeUndefined();
  });
});

describe('filtrarMenu', () => {
  it('devolve o menu inteiro sem lista de permissões', () => {
    expect(filtrarMenu(MENU)).toBe(MENU);
  });

  it('mantém só as telas permitidas e remove módulos vazios', () => {
    const filtrado = filtrarMenu(MENU, ['painel.painel.ver', 'financeiro.contas-receber.ver']);

    expect(filtrado.map((m) => m.id)).toEqual(['painel', 'financeiro']);
    expect(filtrado.flatMap((m) => m.telas.map((t) => t.nome))).toEqual([
      'Painel',
      'Contas a Receber',
    ]);
  });

  it('esconde tudo com lista vazia', () => {
    expect(filtrarMenu(MENU, [])).toEqual([]);
  });
});
