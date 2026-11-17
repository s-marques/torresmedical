import { describe, expect, it } from 'vitest';
import {
  ATIVIDADE_DESCRICAO_MAX,
  atividadeInputSchema,
  exportAtividadesQuerySchema,
  leadsSemFollowUpQuerySchema,
  listAtividadesQuerySchema,
  resumoAtividadesQuerySchema,
} from './atividade';
import { ATIVIDADE_TIPO_ROTULO, ATIVIDADE_TIPOS } from './negocio';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const VALIDO = { titulo: 'Ligar para o lead', data: '2026-11-20', hora: '09:30' };

const mensagens = (
  schema: {
    safeParse: (d: unknown) => { error?: { issues: { path: PropertyKey[]; message: string }[] } };
  },
  dados: unknown,
) =>
  Object.fromEntries(
    (schema.safeParse(dados).error?.issues ?? []).map((i) => [i.path.join('.'), i.message]),
  );

describe('ATIVIDADE_TIPOS', () => {
  it('reúne os tipos do inventário e os dos requisitos do cliente, com rótulo', () => {
    expect(ATIVIDADE_TIPOS.map((t) => ATIVIDADE_TIPO_ROTULO[t])).toEqual([
      'Ligação',
      'E-mail',
      'Reunião',
      'Tarefa',
      'WhatsApp',
      'Nota',
      'Follow-up',
      'Visita',
      'Envio de proposta',
    ]);
  });
});

describe('atividadeInputSchema', () => {
  it('formulário vazio: título, data e hora obrigatórios com a mensagem padrão', () => {
    expect(mensagens(atividadeInputSchema, {})).toEqual({
      titulo: 'Título é obrigatório.',
      data: 'Data é obrigatória.',
      hora: 'Hora é obrigatória.',
    });
    expect(mensagens(atividadeInputSchema, { titulo: '  ', data: '', hora: '' })).toEqual({
      titulo: 'Título é obrigatório.',
      data: 'Data é obrigatória.',
      hora: 'Hora é obrigatória.',
    });
  });

  it('tipo padrão Tarefa; negócio, responsável e descrição vazios viram null', () => {
    expect(
      atividadeInputSchema.parse({ ...VALIDO, negocioId: '', responsavelId: '', descricao: ' ' }),
    ).toEqual({
      ...VALIDO,
      tipo: 'TAREFA',
      negocioId: null,
      responsavelId: null,
      descricao: null,
    });
  });

  it('aceita negócio e descrição', () => {
    expect(
      atividadeInputSchema.parse({ ...VALIDO, tipo: 'LIGACAO', negocioId: ID, descricao: ' Obs ' }),
    ).toMatchObject({ tipo: 'LIGACAO', negocioId: ID, descricao: 'Obs' });
  });

  it('rejeita tipo, negócio, hora e descrição inválidos', () => {
    expect(
      mensagens(atividadeInputSchema, {
        ...VALIDO,
        tipo: 'OUTRO',
        negocioId: 'x',
        hora: '24:00',
        descricao: 'a'.repeat(ATIVIDADE_DESCRICAO_MAX + 1),
      }),
    ).toEqual({
      tipo: 'Tipo é obrigatório.',
      negocioId: 'Negócio inválido',
      hora: 'Hora inválida (HH:MM)',
      descricao: `A descrição deve ter no máximo ${ATIVIDADE_DESCRICAO_MAX} caracteres`,
    });
  });

  it('não aceita campos fora do formulário', () => {
    expect(atividadeInputSchema.safeParse({ ...VALIDO, status: 'CONCLUIDA' }).success).toBe(false);
  });
});

describe('listAtividadesQuerySchema', () => {
  it('padrão: página 1, ordenado pela data do agendamento', () => {
    expect(listAtividadesQuerySchema.parse({})).toMatchObject({
      page: 1,
      pageSize: 10,
      sort: { field: 'dataHora', direction: 'asc' },
    });
  });

  it('filtra por tipo e status e rejeita valores fora da lista', () => {
    expect(listAtividadesQuerySchema.parse({ tipo: 'NOTA', status: 'CANCELADA' })).toMatchObject({
      tipo: 'NOTA',
      status: 'CANCELADA',
    });
    expect(
      Object.keys(mensagens(listAtividadesQuerySchema, { tipo: 'X', status: 'Y', sort: 'id:asc' })),
    ).toEqual(['sort', 'tipo', 'status']);
  });

  it('resumo aceita busca e tipo', () => {
    expect(resumoAtividadesQuerySchema.parse({ search: ' ', tipo: 'EMAIL' })).toEqual({
      search: undefined,
      tipo: 'EMAIL',
    });
  });

  it('exportação aceita só as colunas do grid', () => {
    expect(
      exportAtividadesQuerySchema.safeParse({ format: 'xlsx', columns: 'titulo,status' }).success,
    ).toBe(true);
    expect(exportAtividadesQuerySchema.safeParse({ format: 'xlsx', columns: 'id' }).success).toBe(
      false,
    );
  });

  it('leads sem follow-up: padrão pelos mais antigos e filtro por responsável', () => {
    expect(leadsSemFollowUpQuerySchema.parse({ responsavelId: ID })).toMatchObject({
      sort: { field: 'createdAt', direction: 'asc' },
      responsavelId: ID,
    });
    expect(leadsSemFollowUpQuerySchema.safeParse({ responsavelId: 'x' }).success).toBe(false);
  });
});
