import { describe, expect, it } from 'vitest';
import { TELAS } from '../menu/menu';
import { ACOES, isPermissao, PERMISSOES, PERMISSOES_EXTRAS, permissaoSchema } from './permissoes';

describe('catálogo de permissões', () => {
  it('tem cada tela × cada ação, mais as extras, sem repetição', () => {
    expect(PERMISSOES).toHaveLength(TELAS.length * ACOES.length + PERMISSOES_EXTRAS.length);
    expect(new Set(PERMISSOES).size).toBe(PERMISSOES.length);
  });

  it('segue o formato <modulo>.<recurso>.<acao>', () => {
    for (const permissao of PERMISSOES) {
      expect(permissao).toMatch(
        /^[a-z0-9-]+\.[a-z0-9-]+\.(ver|criar|editar|excluir|exportar|validar|assinar|gerir)$/,
      );
    }
  });

  it('inclui a permissão de menu de todas as telas', () => {
    for (const tela of TELAS) expect(isPermissao(tela.permissao)).toBe(true);
    expect(PERMISSOES).toContain('financeiro.contas-receber.criar');
  });

  it('valida permissões pelo catálogo', () => {
    expect(isPermissao('configuracoes-gestao.auditoria.ver')).toBe(true);
    expect(isPermissao('financeiro.nao-existe.ver')).toBe(false);
    expect(permissaoSchema.safeParse('financeiro.caixas.excluir').success).toBe(true);
    expect(permissaoSchema.safeParse('financeiro.caixas.apagar').error?.issues[0]?.message).toBe(
      'Permissão inválida',
    );
  });
});
