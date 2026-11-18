import { describe, expect, it } from 'vitest';
import {
  evolucaoInputSchema,
  EVOLUCAO_TEXTO_MAX,
  listAtendimentoMedicoQuerySchema,
  podeAtender,
  receitaInputSchema,
  recebimentoInputSchema,
  listProtocolosReceitaQuerySchema,
  textoDoProtocolo,
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

describe('receitaInputSchema', () => {
  it('aplica os padrões do formulário e limpa observações vazias', () => {
    expect(receitaInputSchema.parse({ texto: ' 1) Dipirona ', observacoes: '  ' })).toEqual({
      tipo: 'EVOLUCAO',
      controlada: false,
      validadeDias: 30,
      texto: '1) Dipirona',
      observacoes: null,
    });
  });

  it('exige o texto e aceita só as validades do select', () => {
    expect(mensagens(receitaInputSchema.safeParse({ texto: '   ' }))).toContain(
      'Receita é obrigatória.',
    );
    expect(mensagens(receitaInputSchema.safeParse({ texto: 'x', validadeDias: 45 }))).toContain(
      'Validade inválida',
    );
    expect(
      receitaInputSchema.parse({ texto: 'x', validadeDias: 365, controlada: true }),
    ).toMatchObject({ validadeDias: 365, controlada: true });
    expect(receitaInputSchema.safeParse({ texto: 'x', extra: 1 }).success).toBe(false);
  });
});

describe('recebimentoInputSchema', () => {
  it('exige valor positivo e forma de pagamento', () => {
    expect(mensagens(recebimentoInputSchema.safeParse({}))).toEqual([
      'Valor a receber é obrigatório.',
      'Forma de pagamento é obrigatória.',
    ]);
    expect(
      mensagens(
        recebimentoInputSchema.safeParse({
          valor: 0,
          formaPagamentoId: '00000000-0000-4000-8000-000000000000',
        }),
      ),
    ).toContain('O valor a receber deve ser maior que zero');
  });
});

describe('protocolos da receita', () => {
  it('ordena por nome e filtra por categoria', () => {
    expect(listProtocolosReceitaQuerySchema.parse({ categoria: 'Estética' })).toMatchObject({
      categoria: 'Estética',
      sort: { field: 'nome', direction: 'asc' },
    });
  });

  it('monta o texto com o nome e as observações do protocolo', () => {
    expect(textoDoProtocolo({ nome: 'Limpeza de pele', texto: 'Aplicar 2x' })).toBe(
      'Limpeza de pele\nAplicar 2x',
    );
    expect(textoDoProtocolo({ nome: 'Limpeza de pele', texto: null })).toBe('Limpeza de pele');
  });
});

describe('receitaInputSchema: validade vinda do select', () => {
  it('converte o texto do select em número', () => {
    expect(receitaInputSchema.parse({ texto: 'x', validadeDias: '180' }).validadeDias).toBe(180);
  });
});
