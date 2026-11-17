import { describe, expect, it } from 'vitest';
import {
  evolucaoInputSchema,
  EVOLUCAO_TEXTO_MAX,
  listAtendimentoMedicoQuerySchema,
  podeAtender,
} from './atendimento-medico';

function mensagens(resultado: { success: boolean; error?: { issues: { message: string }[] } }) {
  return resultado.error?.issues.map((issue) => issue.message) ?? [];
}

describe('listAtendimentoMedicoQuerySchema', () => {
  it('exige a data e ordena por hora por padrão', () => {
    expect(listAtendimentoMedicoQuerySchema.parse({ data: '2026-11-17' })).toMatchObject({
      data: '2026-11-17',
      sort: { field: 'inicio', direction: 'asc' },
      page: 1,
    });
    expect(mensagens(listAtendimentoMedicoQuerySchema.safeParse({}))).toContain(
      'Data é obrigatória.',
    );
  });

  it('rejeita data inexistente, status fora do filtro e profissional inválido', () => {
    expect(mensagens(listAtendimentoMedicoQuerySchema.safeParse({ data: '2026-02-30' }))).toContain(
      'Data inválida',
    );
    expect(
      listAtendimentoMedicoQuerySchema.safeParse({ data: '2026-11-17', status: 'CANCELADO' })
        .success,
    ).toBe(false);
    expect(
      mensagens(
        listAtendimentoMedicoQuerySchema.safeParse({ data: '2026-11-17', profissionalId: 'x' }),
      ),
    ).toContain('Profissional inválido');
  });

  it('aceita os status do filtro', () => {
    for (const status of ['CONFIRMADO', 'AGUARDANDO', 'EM_ATENDIMENTO', 'ATENDIDO']) {
      expect(
        listAtendimentoMedicoQuerySchema.safeParse({ data: '2026-11-17', status }).success,
      ).toBe(true);
    }
  });
});

describe('evolucaoInputSchema', () => {
  it('usa "Evolução/Anotação" como tipo padrão e apara o texto', () => {
    expect(evolucaoInputSchema.parse({ texto: '  Paciente estável  ' })).toEqual({
      tipo: 'EVOLUCAO',
      texto: 'Paciente estável',
    });
  });

  it('exige o texto, com a mensagem padrão de obrigatório', () => {
    expect(mensagens(evolucaoInputSchema.safeParse({ texto: '   ' }))).toEqual([
      'Evolução é obrigatória.',
    ]);
    expect(mensagens(evolucaoInputSchema.safeParse({}))).toEqual(['Evolução é obrigatória.']);
  });

  it('rejeita tipo inválido, texto longo e campo extra', () => {
    expect(mensagens(evolucaoInputSchema.safeParse({ tipo: 'X', texto: 'a' }))).toEqual([
      'Tipo inválido',
    ]);
    expect(
      evolucaoInputSchema.safeParse({ texto: 'a'.repeat(EVOLUCAO_TEXTO_MAX + 1) }).success,
    ).toBe(false);
    expect(evolucaoInputSchema.safeParse({ texto: 'a', extra: 1 }).success).toBe(false);
  });
});

describe('podeAtender', () => {
  it('só bloqueia agendamento cancelado', () => {
    expect(podeAtender('CANCELADO')).toBe(false);
    expect(podeAtender('AGENDADO')).toBe(true);
    expect(podeAtender('EM_ATENDIMENTO')).toBe(true);
  });
});
