import { describe, expect, it } from 'vitest';
import { EVOLUCAO_TEXTO_MAX } from './atendimento-medico';
import { evolucaoVozInputSchema, listEvolucaoVozQuerySchema } from './evolucao-voz';

function mensagens(resultado: { success: boolean; error?: { issues: { message: string }[] } }) {
  return resultado.error?.issues.map((issue) => issue.message) ?? [];
}

describe('listEvolucaoVozQuerySchema', () => {
  it('exige a data, apara a busca e ordena por hora por padrão', () => {
    expect(
      listEvolucaoVozQuerySchema.parse({ data: '2026-11-19', search: '  ana ' }),
    ).toMatchObject({
      data: '2026-11-19',
      search: 'ana',
      sort: { field: 'inicio', direction: 'asc' },
    });
    expect(mensagens(listEvolucaoVozQuerySchema.safeParse({}))).toContain('Data é obrigatória.');
  });

  it('rejeita data inexistente e profissional inválido', () => {
    expect(mensagens(listEvolucaoVozQuerySchema.safeParse({ data: '2026-02-30' }))).toContain(
      'Data inválida',
    );
    expect(
      mensagens(listEvolucaoVozQuerySchema.safeParse({ data: '2026-11-19', profissionalId: 'x' })),
    ).toContain('Profissional inválido');
  });
});

describe('evolucaoVozInputSchema', () => {
  it('apara o texto', () => {
    expect(evolucaoVozInputSchema.parse({ texto: '  Paciente relata melhora  ' })).toEqual({
      texto: 'Paciente relata melhora',
    });
  });

  it('exige a transcrição, limita o tamanho e recusa campos extras', () => {
    expect(mensagens(evolucaoVozInputSchema.safeParse({ texto: '   ' }))).toEqual([
      'Transcrição é obrigatória.',
    ]);
    expect(mensagens(evolucaoVozInputSchema.safeParse({}))).toEqual(['Transcrição é obrigatória.']);
    expect(
      evolucaoVozInputSchema.safeParse({ texto: 'a'.repeat(EVOLUCAO_TEXTO_MAX + 1) }).success,
    ).toBe(false);
    expect(evolucaoVozInputSchema.safeParse({ texto: 'a', tipo: 'EVOLUCAO' }).success).toBe(false);
  });
});
