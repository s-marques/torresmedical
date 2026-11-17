import { describe, expect, it } from 'vitest';
import {
  atividadeNegocioInputSchema,
  exportNegociosQuerySchema,
  listNegociosQuerySchema,
  negocioTelaInputSchema,
  moverNegocioSchema,
  negocioInputSchema,
  perderNegocioSchema,
  quadroQuerySchema,
  situacaoProximaAcao,
} from './negocio';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const VALIDO = { titulo: 'Sala 10 - Clínica geral', estagioId: ID };

const mensagens = (
  schema: {
    safeParse: (d: unknown) => { error?: { issues: { path: PropertyKey[]; message: string }[] } };
  },
  dados: unknown,
) =>
  Object.fromEntries(
    (schema.safeParse(dados).error?.issues ?? []).map((i) => [i.path.join('.'), i.message]),
  );

describe('negocioInputSchema', () => {
  it('exige o título com a mensagem padrão', () => {
    expect(mensagens(negocioInputSchema, { estagioId: ID })).toEqual({
      titulo: 'Título é obrigatório.',
    });
    expect(mensagens(negocioInputSchema, { ...VALIDO, titulo: '   ' })).toEqual({
      titulo: 'Título é obrigatório.',
    });
  });

  it('exige o estágio', () => {
    expect(mensagens(negocioInputSchema, { titulo: 'X' })).toEqual({
      estagioId: 'Estágio é obrigatório.',
    });
  });

  it('os demais campos são opcionais: vazios viram null e o contato padrão é paciente', () => {
    expect(
      negocioInputSchema.parse({
        ...VALIDO,
        valor: null,
        contatoId: '',
        responsavelId: '',
        previsaoFechamento: '',
        origemClienteId: null,
      }),
    ).toEqual({
      ...VALIDO,
      valor: null,
      contatoTipo: 'PACIENTE',
      contatoId: null,
      responsavelId: null,
      previsaoFechamento: null,
      origemClienteId: null,
    });
  });

  it('aceita profissional como contato', () => {
    expect(
      negocioInputSchema.parse({ ...VALIDO, contatoTipo: 'PROFISSIONAL', contatoId: ID }),
    ).toMatchObject({ contatoTipo: 'PROFISSIONAL', contatoId: ID });
  });

  it('rejeita valor negativo, data inválida, ids inválidos e campos extras', () => {
    expect(
      mensagens(negocioInputSchema, {
        ...VALIDO,
        valor: -1,
        previsaoFechamento: '31/12/2026',
        responsavelId: 'x',
      }),
    ).toEqual({
      valor: 'O valor não pode ser negativo',
      previsaoFechamento: 'Data inválida',
      responsavelId: 'Responsável inválido',
    });
    expect(negocioInputSchema.safeParse({ ...VALIDO, status: 'GANHO' }).success).toBe(false);
  });
});

describe('moverNegocioSchema e perderNegocioSchema', () => {
  it('exigem estágio e motivo', () => {
    expect(mensagens(moverNegocioSchema, {})).toEqual({ estagioId: 'Estágio é obrigatório.' });
    expect(mensagens(perderNegocioSchema, {})).toEqual({
      motivoPerdaId: 'Motivo da perda é obrigatório.',
    });
  });
});

describe('atividadeNegocioInputSchema', () => {
  it('exige título, data e hora; tipo padrão é follow-up', () => {
    expect(mensagens(atividadeNegocioInputSchema, {})).toEqual({
      titulo: 'Título é obrigatório.',
      data: 'Data é obrigatória.',
      hora: 'Hora é obrigatória.',
    });
    expect(
      atividadeNegocioInputSchema.parse({ titulo: 'Ligar', data: '2026-11-20', hora: '09:30' }),
    ).toEqual({
      tipo: 'FOLLOW_UP',
      titulo: 'Ligar',
      data: '2026-11-20',
      hora: '09:30',
      responsavelId: null,
    });
  });

  it('rejeita hora inválida', () => {
    expect(
      mensagens(atividadeNegocioInputSchema, { titulo: 'X', data: '2026-11-20', hora: '25:00' }),
    ).toEqual({ hora: 'Hora inválida (HH:MM)' });
  });
});

describe('quadroQuerySchema', () => {
  it('exige pipeline e trata busca vazia como ausente', () => {
    expect(quadroQuerySchema.parse({ pipelineId: ID, search: '  ' })).toEqual({
      pipelineId: ID,
      search: undefined,
    });
    expect(quadroQuerySchema.safeParse({}).success).toBe(false);
  });
});

describe('situacaoProximaAcao', () => {
  const agora = new Date('2026-11-14T12:00:00Z');

  it('sem atividade pendente é SEM_ACAO', () => {
    expect(situacaoProximaAcao(null, agora)).toBe('SEM_ACAO');
  });

  it('atividade no passado é ATRASADA; no futuro, EM_DIA', () => {
    expect(situacaoProximaAcao({ dataHora: '2026-11-14T11:59:00Z' }, agora)).toBe('ATRASADA');
    expect(situacaoProximaAcao({ dataHora: '2026-11-14T12:01:00Z' }, agora)).toBe('EM_DIA');
  });
});

describe('atividadeNegocioInputSchema: hora vazia', () => {
  it('mostra só a mensagem de obrigatória', () => {
    const issues = atividadeNegocioInputSchema.safeParse({
      titulo: 'X',
      data: '2026-11-20',
      hora: '',
    }).error?.issues;
    expect(issues?.map((i) => i.message)).toEqual(['Hora é obrigatória.']);
  });
});

describe('negocioTelaInputSchema (tela Negócios)', () => {
  it('só o título é obrigatório; o status padrão é Aberto', () => {
    expect(negocioTelaInputSchema.parse({ titulo: 'Sala 10' })).toMatchObject({
      titulo: 'Sala 10',
      status: 'ABERTO',
      pipelineId: null,
      estagioId: null,
      motivoPerdaId: null,
    });
    expect(mensagens(negocioTelaInputSchema, { titulo: '' })).toEqual({
      titulo: 'Título é obrigatório.',
    });
  });

  it('negócio perdido exige o motivo da perda', () => {
    expect(mensagens(negocioTelaInputSchema, { titulo: 'A', status: 'PERDIDO' })).toEqual({
      motivoPerdaId: 'Motivo da perda é obrigatório.',
    });
    expect(
      negocioTelaInputSchema.safeParse({ titulo: 'A', status: 'PERDIDO', motivoPerdaId: ID })
        .success,
    ).toBe(true);
  });

  it('limita as observações e aceita vazio como nulo', () => {
    expect(negocioTelaInputSchema.parse({ titulo: 'A', observacoes: '  ' }).observacoes).toBeNull();
    expect(negocioTelaInputSchema.parse({ titulo: 'A' }).observacoes).toBeUndefined();
    expect(
      negocioTelaInputSchema.safeParse({ titulo: 'A', observacoes: 'x'.repeat(2001) }).success,
    ).toBe(false);
  });
});

describe('listNegociosQuerySchema', () => {
  it('padrão: página 1, 10 por página, ordenado por título', () => {
    expect(listNegociosQuerySchema.parse({})).toMatchObject({
      page: 1,
      pageSize: 10,
      sort: { field: 'titulo', direction: 'asc' },
    });
  });

  it('aceita as colunas do grid, o status e o pipeline; recusa o resto', () => {
    expect(
      listNegociosQuerySchema.safeParse({
        sort: 'motivoPerda:desc',
        status: 'GANHO',
        pipelineId: ID,
      }).success,
    ).toBe(true);
    expect(listNegociosQuerySchema.safeParse({ sort: 'senha:asc' }).success).toBe(false);
    expect(listNegociosQuerySchema.safeParse({ status: 'OUTRO' }).success).toBe(false);
    expect(listNegociosQuerySchema.safeParse({ pipelineId: 'x' }).success).toBe(false);
  });

  it('exportação aceita só as colunas do grid', () => {
    expect(
      exportNegociosQuerySchema.safeParse({ format: 'xlsx', columns: 'titulo,status' }).success,
    ).toBe(true);
    expect(exportNegociosQuerySchema.safeParse({ format: 'xlsx', columns: 'senha' }).success).toBe(
      false,
    );
  });
});
