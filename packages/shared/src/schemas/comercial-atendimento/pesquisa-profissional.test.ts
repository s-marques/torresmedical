import { describe, expect, it } from 'vitest';
import {
  PESQUISA_PROFISSIONAL_CONFIG_PADRAO,
  aplicarVariaveisPesquisaProfissional,
  listPesquisasProfissionalQuerySchema,
  pesquisaProfissionalConfigInputSchema,
  respostaPesquisaProfissionalInputSchema,
} from './pesquisa-profissional';

const RESPOSTA = {
  notaEstrutura: 5,
  notaRecepcao: 4,
  notaAgenda: 3,
  notaAtendimento: 1,
  nps: 10,
};

function mensagens(resultado: { success: boolean; error?: { issues: { message: string }[] } }) {
  return resultado.error?.issues.map((i) => i.message) ?? [];
}

describe('respostaPesquisaProfissionalInputSchema', () => {
  it('aceita estrelas de 1 a 5, NPS de 0 a 10 e comentário opcional', () => {
    expect(respostaPesquisaProfissionalInputSchema.parse(RESPOSTA)).toEqual(RESPOSTA);
    expect(respostaPesquisaProfissionalInputSchema.parse({ ...RESPOSTA, nps: 0 }).nps).toBe(0);
    expect(
      respostaPesquisaProfissionalInputSchema.parse({ ...RESPOSTA, comentario: '  Ótimo  ' })
        .comentario,
    ).toBe('Ótimo');
    expect(
      respostaPesquisaProfissionalInputSchema.parse({ ...RESPOSTA, comentario: '   ' }).comentario,
    ).toBeUndefined();
  });

  it.each([0, 6, 2.5])('rejeita estrela %s', (valor) => {
    expect(
      respostaPesquisaProfissionalInputSchema.safeParse({ ...RESPOSTA, notaAgenda: valor }).success,
    ).toBe(false);
  });

  it.each([-1, 11, 7.5])('rejeita NPS %s', (valor) => {
    expect(
      respostaPesquisaProfissionalInputSchema.safeParse({ ...RESPOSTA, nps: valor }).success,
    ).toBe(false);
  });

  it('cada nota faltando dá a mensagem padrão de obrigatório', () => {
    expect(mensagens(respostaPesquisaProfissionalInputSchema.safeParse({}))).toEqual([
      'Nota de Estrutura é obrigatória.',
      'Nota de Recepção é obrigatória.',
      'Nota de Agenda é obrigatória.',
      'Nota de Atendimento é obrigatória.',
      'Nota NPS é obrigatória.',
    ]);
  });

  it('rejeita campos desconhecidos e comentário acima de 1000 caracteres', () => {
    expect(
      respostaPesquisaProfissionalInputSchema.safeParse({ ...RESPOSTA, extra: 1 }).success,
    ).toBe(false);
    expect(
      mensagens(
        respostaPesquisaProfissionalInputSchema.safeParse({
          ...RESPOSTA,
          comentario: 'x'.repeat(1001),
        }),
      ),
    ).toEqual(['O comentário deve ter até 1000 caracteres']);
  });
});

describe('pesquisaProfissionalConfigInputSchema', () => {
  it('o padrão é válido: ativo, semestral e mensagem com {link}', () => {
    expect(
      pesquisaProfissionalConfigInputSchema.parse(PESQUISA_PROFISSIONAL_CONFIG_PADRAO),
    ).toEqual(PESQUISA_PROFISSIONAL_CONFIG_PADRAO);
    expect(PESQUISA_PROFISSIONAL_CONFIG_PADRAO.periodicidadeMeses).toBe(6);
  });

  it.each([1, 3, 24])('aceita periodicidade de %i meses', (periodicidadeMeses) => {
    expect(
      pesquisaProfissionalConfigInputSchema.safeParse({
        ...PESQUISA_PROFISSIONAL_CONFIG_PADRAO,
        periodicidadeMeses,
      }).success,
    ).toBe(true);
  });

  it.each([0, 25, 1.5])('rejeita periodicidade %s', (periodicidadeMeses) => {
    expect(
      pesquisaProfissionalConfigInputSchema.safeParse({
        ...PESQUISA_PROFISSIONAL_CONFIG_PADRAO,
        periodicidadeMeses,
      }).success,
    ).toBe(false);
  });

  it('exige mensagem preenchida e com a variável {link}', () => {
    const base = PESQUISA_PROFISSIONAL_CONFIG_PADRAO;
    expect(
      mensagens(pesquisaProfissionalConfigInputSchema.safeParse({ ...base, mensagem: '   ' })),
    ).toContain('Mensagem é obrigatória.');
    expect(
      mensagens(
        pesquisaProfissionalConfigInputSchema.safeParse({ ...base, mensagem: 'Oi {nome}' }),
      ),
    ).toEqual(['A mensagem deve conter a variável {link}']);
  });
});

describe('aplicarVariaveisPesquisaProfissional', () => {
  it('troca {nome} e {link}, inclusive repetidos', () => {
    expect(
      aplicarVariaveisPesquisaProfissional('Oi {nome}! {link} ({nome})', {
        nome: 'Dra. Ana',
        link: 'https://x/y',
      }),
    ).toBe('Oi Dra. Ana! https://x/y (Dra. Ana)');
  });
});

describe('listPesquisasProfissionalQuerySchema', () => {
  it('ordena por envio decrescente e aceita período, profissional e status', () => {
    const query = listPesquisasProfissionalQuerySchema.parse({
      de: '2026-11-01',
      ate: '2026-11-30',
      profissionalId: '00000000-0000-4000-8000-0000000000a1',
      status: 'RESPONDIDA',
    });
    expect(query.sort).toEqual({ field: 'enviadaEm', direction: 'desc' });
    expect(query.status).toBe('RESPONDIDA');
  });

  it('rejeita data fora do formato, status e campo de ordenação desconhecidos', () => {
    expect(listPesquisasProfissionalQuerySchema.safeParse({ de: '01/11/2026' }).success).toBe(
      false,
    );
    expect(listPesquisasProfissionalQuerySchema.safeParse({ status: 'X' }).success).toBe(false);
    expect(listPesquisasProfissionalQuerySchema.safeParse({ sort: 'comentario:asc' }).success).toBe(
      false,
    );
  });
});
