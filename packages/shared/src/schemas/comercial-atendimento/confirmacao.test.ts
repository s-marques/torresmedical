import { describe, expect, it } from 'vitest';
import {
  aplicarVariaveisConfirmacao,
  CONFIRMACAO_CONFIG_PADRAO,
  confirmacaoConfigInputSchema,
  confirmacaoModeloInputSchema,
  listConfirmacoesQuerySchema,
} from './confirmacao';

const mensagem = (resultado: { success: boolean; error?: { issues: { message: string }[] } }) =>
  resultado.error?.issues[0]?.message;

describe('confirmacaoConfigInputSchema', () => {
  const { ...valida } = CONFIRMACAO_CONFIG_PADRAO;

  it('aceita a configuração padrão', () => {
    expect(confirmacaoConfigInputSchema.safeParse(valida).success).toBe(true);
  });

  it('exige horário no formato HH:MM', () => {
    const r = confirmacaoConfigInputSchema.safeParse({ ...valida, horarioMsg1: '25:00' });
    expect(mensagem(r)).toBe('MSG 1 inválido (HH:MM)');
    const vazio = confirmacaoConfigInputSchema.safeParse({ ...valida, horarioMsg2: '' });
    expect(mensagem(vazio)).toBe('MSG 2 é obrigatório.');
  });

  it('aceita antecedência de 1 ou 2 dias apenas', () => {
    expect(confirmacaoConfigInputSchema.safeParse({ ...valida, antecedenciaDias: 2 }).success).toBe(
      true,
    );
    const r = confirmacaoConfigInputSchema.safeParse({ ...valida, antecedenciaDias: 3 });
    expect(mensagem(r)).toBe('Antecedência deve ser de 1 ou 2 dias');
    expect(
      confirmacaoConfigInputSchema.parse({ ...valida, antecedenciaDias: '2' }).antecedenciaDias,
    ).toBe(2);
  });

  it('exige os textos', () => {
    const r = confirmacaoConfigInputSchema.safeParse({ ...valida, mensagemConfirmada: '  ' });
    expect(mensagem(r)).toBe('A resposta a quem confirma é obrigatório.');
  });
});

describe('confirmacaoModeloInputSchema', () => {
  it('exige o tipo e os cinco textos', () => {
    const r = confirmacaoModeloInputSchema.safeParse({});
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path[0])).toEqual([
      'tipoAgendamentoId',
      'msg1',
      'msg2',
      'msg3',
      'lembreteConfirmado',
      'lembreteNaoConfirmado',
    ]);
  });
});

describe('listConfirmacoesQuerySchema', () => {
  it('usa a ordenação por agendamento e rejeita data inválida', () => {
    expect(listConfirmacoesQuerySchema.parse({}).sort).toEqual({
      field: 'agendamento',
      direction: 'asc',
    });
    expect(listConfirmacoesQuerySchema.safeParse({ dataEnvio: '15/10/2026' }).success).toBe(false);
  });
});

describe('aplicarVariaveisConfirmacao', () => {
  it('troca todas as variáveis', () => {
    expect(
      aplicarVariaveisConfirmacao('{nome}, {data} {hora} com {profissional}. {nome}', {
        nome: 'Ana',
        data: '18/11/2026',
        hora: '14:00',
        profissional: 'Dr. X',
      }),
    ).toBe('Ana, 18/11/2026 14:00 com Dr. X. Ana');
  });
});
