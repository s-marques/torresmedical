import { describe, expect, it } from 'vitest';
import {
  CLASSIFICACAO_MOTIVOS,
  CLASSIFICACAO_PARCEIRO_ROTULOS,
  CLASSIFICACOES_PARCEIRO,
  classificacaoHistoricoSchema,
  estrategicoInputSchema,
  listClassificacoesQuerySchema,
  textoMotivoClassificacao,
} from './profissional-classificacao';
import { listProfissionaisQuerySchema } from './profissional';

describe('classificação do parceiro', () => {
  it('as seis classes do documento do cliente têm rótulo', () => {
    expect(CLASSIFICACOES_PARCEIRO).toHaveLength(6);
    expect(Object.keys(CLASSIFICACAO_PARCEIRO_ROTULOS).sort()).toEqual(
      [...CLASSIFICACOES_PARCEIRO].sort(),
    );
    expect(CLASSIFICACAO_PARCEIRO_ROTULOS.EM_RISCO).toBe('Em risco');
  });

  it('todo motivo tem texto em português', () => {
    for (const motivo of CLASSIFICACAO_MOTIVOS) {
      expect(textoMotivoClassificacao(motivo, { dias: 5 }).length).toBeGreaterThan(0);
    }
  });

  it('o texto do exemplo da issue: "1 de 4 períodos usados em 30 dias"', () => {
    expect(textoMotivoClassificacao('BAIXO_USO', { contratados: 4, utilizados: 1 })).toBe(
      '1 de 4 períodos usados em 30 dias',
    );
  });

  it('a listagem de profissionais aceita o filtro e a ordenação por classificação', () => {
    const query = listProfissionaisQuerySchema.parse({
      classificacao: 'EM_RISCO',
      sort: 'classificacao:desc',
    });
    expect(query).toMatchObject({
      classificacao: 'EM_RISCO',
      sort: { field: 'classificacao', direction: 'desc' },
    });
    expect(listProfissionaisQuerySchema.safeParse({ classificacao: 'QUALQUER' }).success).toBe(
      false,
    );
  });

  it('a marca de estratégico exige um booleano e nenhum outro campo', () => {
    expect(estrategicoInputSchema.safeParse({ estrategico: true }).success).toBe(true);
    expect(estrategicoInputSchema.safeParse({ estrategico: 'sim' }).success).toBe(false);
    expect(estrategicoInputSchema.safeParse({ estrategico: true, extra: 1 }).success).toBe(false);
  });

  it('o histórico pagina com os padrões da API', () => {
    expect(listClassificacoesQuerySchema.parse({})).toEqual({ page: 1, pageSize: 10 });
    expect(listClassificacoesQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });

  it('valida um registro do histórico', () => {
    const registro = {
      id: '00000000-0000-4000-8000-000000000001',
      profissionalId: '00000000-0000-4000-8000-000000000002',
      classificacaoAnterior: null,
      classificacao: 'NOVO',
      motivo: 'CONTRATO_RECENTE',
      parametros: { dias: 10 },
      motivoTexto: 'Contrato iniciado há 10 dias (até 90)',
      origem: 'AUTOMATICO',
      usuarioId: null,
      referencia: '2026-11-24',
      createdAt: '2026-11-24T06:00:00.000Z',
    };
    expect(classificacaoHistoricoSchema.safeParse(registro).success).toBe(true);
    expect(classificacaoHistoricoSchema.safeParse({ ...registro, origem: 'OUTRA' }).success).toBe(
      false,
    );
  });
});
