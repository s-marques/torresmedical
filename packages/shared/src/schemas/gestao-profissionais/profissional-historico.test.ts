import { describe, expect, it } from 'vitest';
import {
  HISTORICO_EVENTOS,
  HISTORICO_EVENTO_ROTULOS,
  HISTORICO_EVENTO_TIPO,
  HISTORICO_TIPOS,
  HISTORICO_TIPO_ROTULOS,
  negocioProfissionalInputSchema,
  negocioVinculavelQuerySchema,
  profissionalHistoricoQuerySchema,
} from './profissional-historico';

describe('linha do tempo do profissional', () => {
  it('todo evento tem rótulo e pertence a um tipo conhecido', () => {
    for (const evento of HISTORICO_EVENTOS) {
      expect(HISTORICO_EVENTO_ROTULOS[evento]).toBeTruthy();
      expect(HISTORICO_TIPOS).toContain(HISTORICO_EVENTO_TIPO[evento]);
    }
  });

  it('todo tipo tem rótulo e ao menos um evento', () => {
    for (const tipo of HISTORICO_TIPOS) {
      expect(HISTORICO_TIPO_ROTULOS[tipo]).toBeTruthy();
      expect(HISTORICO_EVENTOS.some((e) => HISTORICO_EVENTO_TIPO[e] === tipo)).toBe(true);
    }
  });

  it('a consulta usa ordem cronológica por padrão e valida o tipo', () => {
    expect(profissionalHistoricoQuerySchema.parse({})).toEqual({ ordem: 'asc' });
    expect(profissionalHistoricoQuerySchema.parse({ tipo: 'CRM', ordem: 'desc' }).tipo).toBe('CRM');
    expect(profissionalHistoricoQuerySchema.safeParse({ tipo: 'OUTRO' }).success).toBe(false);
  });

  it('o vínculo aceita um uuid ou null (desfazer) e recusa o resto', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    expect(negocioProfissionalInputSchema.parse({ profissionalId: id }).profissionalId).toBe(id);
    expect(
      negocioProfissionalInputSchema.parse({ profissionalId: null }).profissionalId,
    ).toBeNull();
    expect(negocioProfissionalInputSchema.safeParse({ profissionalId: 'x' }).success).toBe(false);
    expect(negocioProfissionalInputSchema.safeParse({}).success).toBe(false);
  });

  it('a busca de negócios vinculáveis tem paginação padrão', () => {
    expect(negocioVinculavelQuerySchema.parse({ search: ' ana ' })).toMatchObject({
      page: 1,
      search: 'ana',
    });
  });
});
