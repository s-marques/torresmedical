import { describe, expect, it } from 'vitest';
import {
  AGENTE_ALERTA_NUMERO_INVALIDO,
  AGENTE_INSTRUCAO_TRANSICOES,
  AGENTE_REGRA_NOME_FORMATO,
  createAgenteAlertaDestinoSchema,
  createAgenteInstrucaoExtraSchema,
  createAgenteInstrucaoSchema,
  createAgenteRegraSchema,
  listAgenteRegraQuerySchema,
} from './agente-instrucao';

const INSTRUCAO = {
  nome: ' Atendimento ',
  modelo: 'gpt-4.1-mini',
  temperatura: 0.7,
  maxTokens: 1500,
  ativo: false,
  systemPrompt: 'Você é um assistente.',
};

describe('instrução do agente', () => {
  it('exige Nome e System Prompt, com a mensagem padrão', () => {
    const r = createAgenteInstrucaoSchema.safeParse({ ...INSTRUCAO, nome: ' ', systemPrompt: '' });
    expect(r.error?.issues.map((i) => i.message)).toEqual([
      'Nome é obrigatório.',
      'System Prompt é obrigatório.',
    ]);
  });

  it('apara o nome e valida temperatura e tokens', () => {
    expect(createAgenteInstrucaoSchema.parse(INSTRUCAO).nome).toBe('Atendimento');
    expect(createAgenteInstrucaoSchema.safeParse({ ...INSTRUCAO, temperatura: 3 }).success).toBe(
      false,
    );
    expect(createAgenteInstrucaoSchema.safeParse({ ...INSTRUCAO, maxTokens: 0 }).success).toBe(
      false,
    );
    expect(createAgenteInstrucaoSchema.safeParse({ ...INSTRUCAO, maxTokens: 1.5 }).success).toBe(
      false,
    );
  });

  it('só permite avançar um passo por vez no ciclo de aprovação', () => {
    expect(AGENTE_INSTRUCAO_TRANSICOES.RASCUNHO).toEqual(['EM_TESTE']);
    expect(AGENTE_INSTRUCAO_TRANSICOES.APROVADO).toContain('PUBLICADO');
    expect(AGENTE_INSTRUCAO_TRANSICOES.RASCUNHO).not.toContain('PUBLICADO');
  });
});

describe('instrução extra', () => {
  it('exige título e descrição', () => {
    const r = createAgenteInstrucaoExtraSchema.safeParse({
      titulo: '',
      descricao: '',
      ativo: true,
    });
    expect(r.error?.issues.map((i) => i.message)).toEqual([
      'Título é obrigatório.',
      'Descrição é obrigatória.',
    ]);
  });
});

describe('destino de alerta', () => {
  it('normaliza o número para dígitos e rejeita número curto', () => {
    expect(
      createAgenteAlertaDestinoSchema.parse({
        tipo: 'NUMERO',
        nome: 'Recepção',
        numero: '+55 (65) 99999-0000',
      }).numero,
    ).toBe('5565999990000');
    const r = createAgenteAlertaDestinoSchema.safeParse({
      tipo: 'NUMERO',
      nome: 'A',
      numero: '12',
    });
    expect(r.error?.issues.map((i) => i.message)).toContain(AGENTE_ALERTA_NUMERO_INVALIDO);
  });

  it('exige o número com a mensagem padrão', () => {
    const r = createAgenteAlertaDestinoSchema.safeParse({ tipo: 'NUMERO', nome: 'A', numero: ' ' });
    expect(r.error?.issues.map((i) => i.message)).toEqual(['Número WhatsApp é obrigatório.']);
  });
});

describe('regra do agente', () => {
  const REGRA = {
    nome: 'uma_pergunta_por_vez',
    descricao: 'Limita a uma pergunta.',
    tipo: 'POS_RESPOSTA',
    gatilho: 'qualquer',
    acao: 'BLOQUEAR',
    ativo: true,
  };

  it('aceita o formato do inventário e rejeita nome fora do padrão', () => {
    expect(createAgenteRegraSchema.safeParse(REGRA).success).toBe(true);
    const r = createAgenteRegraSchema.safeParse({ ...REGRA, nome: 'Uma Pergunta' });
    expect(r.error?.issues.map((i) => i.message)).toEqual([AGENTE_REGRA_NOME_FORMATO]);
  });

  it('listagem: valida sort e filtros de tipo e ação', () => {
    expect(listAgenteRegraQuerySchema.parse({}).sort).toEqual({
      field: 'createdAt',
      direction: 'asc',
    });
    expect(listAgenteRegraQuerySchema.safeParse({ sort: 'ativo:asc' }).success).toBe(false);
    expect(listAgenteRegraQuerySchema.safeParse({ tipo: 'X' }).success).toBe(false);
    expect(listAgenteRegraQuerySchema.parse({ acao: 'ALERTAR' }).acao).toBe('ALERTAR');
  });
});
