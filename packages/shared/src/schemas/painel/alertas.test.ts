import { describe, expect, it } from 'vitest';
import {
  DEFINICAO_ALERTA,
  listAlertasQuerySchema,
  rotaAlerta,
  TIPOS_ALERTA,
  tiposVisiveis,
} from './alertas';
import { isPermissao } from '../../auth/permissoes';

describe('catálogo de alertas', () => {
  it('toda definição usa uma permissão que existe no catálogo', () => {
    for (const tipo of TIPOS_ALERTA) {
      expect(isPermissao(DEFINICAO_ALERTA[tipo].permissao)).toBe(true);
    }
  });

  it('a rota abre a lista já filtrada', () => {
    expect(rotaAlerta('CONTAS_PAGAR_VENCENDO', '2026-11-25')).toBe(
      '/pagar?status=PENDENTE&vencimentoDe=2026-11-25&vencimentoAte=2026-11-25',
    );
    expect(rotaAlerta('CONTAS_PAGAR_VENCIDAS', '2026-11-25')).toBe('/pagar?status=VENCIDO');
    expect(rotaAlerta('RECEBIVEIS_VENCIDOS', '2026-11-25')).toBe('/receber?status=VENCIDO');
    expect(rotaAlerta('CONTAS_PAGAR_AGUARDANDO_APROVACAO', '2026-11-25')).toBe(
      '/pagar?status=PENDENTE&aprovacao=LANCADA',
    );
  });
});

describe('tiposVisiveis', () => {
  it('mostra cada tipo só a quem vê a tela de origem', () => {
    const financeiro = new Set(['financeiro.contas-pagar.ver', 'financeiro.contas-receber.ver']);
    // Aguardando aprovação é do aprovador (permissão própria), não de quem só vê a tela.
    expect(tiposVisiveis(financeiro, false)).toEqual(
      TIPOS_ALERTA.filter(
        (tipo) => tipo !== 'CONTAS_PAGAR_AGUARDANDO_APROVACAO' && tipo !== 'COBRANCAS_REGUA',
      ),
    );
    expect(
      tiposVisiveis(
        new Set([...financeiro, 'financeiro.contas-pagar.aprovar', 'financeiro.inadimplencia.ver']),
        false,
      ),
    ).toEqual([...TIPOS_ALERTA]);
    // As cobranças da régua são de quem vê a tela de Inadimplência (issue #166).
    expect(tiposVisiveis(new Set(['financeiro.inadimplencia.ver']), false)).toEqual([
      'COBRANCAS_REGUA',
    ]);
    expect(tiposVisiveis(new Set(['financeiro.contas-pagar.aprovar']), false)).toEqual([
      'CONTAS_PAGAR_AGUARDANDO_APROVACAO',
    ]);
    expect(tiposVisiveis(new Set(['financeiro.contas-receber.ver']), false)).toEqual([
      'RECEBIVEIS_VENCIDOS',
    ]);
    expect(tiposVisiveis(new Set(['painel.painel.ver']), false)).toEqual([]);
  });
});

describe('listAlertasQuerySchema', () => {
  it('não inclui resolvidos por padrão', () => {
    expect(listAlertasQuerySchema.parse({})).toEqual({ incluirResolvidos: false });
    expect(listAlertasQuerySchema.parse({ incluirResolvidos: 'true' })).toEqual({
      incluirResolvidos: true,
    });
  });

  it('rejeita valor inválido', () => {
    expect(listAlertasQuerySchema.safeParse({ incluirResolvidos: 'talvez' }).success).toBe(false);
  });
});
