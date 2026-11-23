import { describe, expect, it } from 'vitest';
import '../../zod-pt-br';
import {
  createEncaminhamentoSchema,
  ENCAMINHAMENTO_MOTIVO_MAX,
  exportEncaminhamentosQuerySchema,
  listEncaminhamentosQuerySchema,
  ORIGEM_IGUAL_DESTINO,
  relatorioEncaminhamentosQuerySchema,
} from './encaminhamento';

function messages(result: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return Object.fromEntries(
    (result.error?.issues ?? []).map((i) => [i.path.join('.') || '_', i.message]),
  );
}

const PACIENTE = '11111111-1111-4111-8111-111111111111';
const ORIGEM = '22222222-2222-4222-8222-222222222222';
const DESTINO = '33333333-3333-4333-8333-333333333333';
const ESPECIALIDADE = '44444444-4444-4444-8444-444444444444';

const valido = {
  pacienteId: PACIENTE,
  origemProfissionalId: ORIGEM,
  destinoProfissionalId: DESTINO,
};

describe('createEncaminhamentoSchema', () => {
  it('só paciente, origem e destino são obrigatórios', () => {
    expect(createEncaminhamentoSchema.parse(valido)).toEqual({
      ...valido,
      especialidadeId: null,
      data: null,
      motivo: null,
    });
  });

  it('aceita especialidade, data e motivo, aparando o texto', () => {
    expect(
      createEncaminhamentoSchema.parse({
        ...valido,
        especialidadeId: ESPECIALIDADE,
        data: '2026-11-20',
        motivo: '  Avaliação cardiológica ',
      }),
    ).toMatchObject({
      especialidadeId: ESPECIALIDADE,
      data: '2026-11-20',
      motivo: 'Avaliação cardiológica',
    });
  });

  it('"<Campo> é obrigatório." para paciente, origem e destino vazios', () => {
    expect(
      messages(
        createEncaminhamentoSchema.safeParse({
          pacienteId: '',
          origemProfissionalId: '',
          destinoProfissionalId: '',
        }),
      ),
    ).toEqual({
      pacienteId: 'Paciente é obrigatório.',
      origemProfissionalId: 'Profissional de origem é obrigatório.',
      destinoProfissionalId: 'Profissional de destino é obrigatório.',
    });
    expect(Object.keys(messages(createEncaminhamentoSchema.safeParse({})))).toHaveLength(3);
  });

  it('recusa origem igual ao destino', () => {
    const result = createEncaminhamentoSchema.safeParse({
      ...valido,
      destinoProfissionalId: ORIGEM,
    });
    expect(messages(result)).toEqual({ destinoProfissionalId: ORIGEM_IGUAL_DESTINO });
  });

  it('valida ids, data e tamanho do motivo', () => {
    const result = createEncaminhamentoSchema.safeParse({
      ...valido,
      pacienteId: 'abc',
      especialidadeId: 'abc',
      data: '20/11/2026',
      motivo: 'a'.repeat(ENCAMINHAMENTO_MOTIVO_MAX + 1),
    });
    expect(messages(result)).toEqual({
      pacienteId: 'Paciente inválido',
      especialidadeId: 'Especialidade inválida',
      data: 'Data inválida',
      motivo: `Motivo deve ter no máximo ${ENCAMINHAMENTO_MOTIVO_MAX} caracteres`,
    });
  });

  it('recusa campos desconhecidos', () => {
    expect(createEncaminhamentoSchema.safeParse({ ...valido, situacao: 'ATENDIDO' }).success).toBe(
      false,
    );
  });
});

describe('listEncaminhamentosQuerySchema', () => {
  it('padrão: página 1, data decrescente', () => {
    expect(listEncaminhamentosQuerySchema.parse({})).toMatchObject({
      page: 1,
      pageSize: 10,
      sort: { field: 'data', direction: 'desc' },
    });
  });

  it('aceita situação, profissionais e período', () => {
    const query = listEncaminhamentosQuerySchema.parse({
      situacao: 'AGENDADO',
      origemProfissionalId: ORIGEM,
      destinoProfissionalId: DESTINO,
      de: '2026-11-01',
      ate: '2026-11-30',
      sort: 'situacao:asc',
    });
    expect(query).toMatchObject({ situacao: 'AGENDADO', de: '2026-11-01', ate: '2026-11-30' });
  });

  it('recusa situação, campo de ordenação e período inválidos', () => {
    expect(listEncaminhamentosQuerySchema.safeParse({ situacao: 'X' }).success).toBe(false);
    expect(listEncaminhamentosQuerySchema.safeParse({ sort: 'motivo:asc' }).success).toBe(false);
    expect(
      listEncaminhamentosQuerySchema.safeParse({ de: '2026-11-30', ate: '2026-11-01' }).success,
    ).toBe(false);
  });
});

describe('exportEncaminhamentosQuerySchema', () => {
  it('exige o formato e aceita as colunas do grid', () => {
    expect(exportEncaminhamentosQuerySchema.safeParse({}).success).toBe(false);
    expect(
      exportEncaminhamentosQuerySchema.parse({ format: 'xlsx', columns: 'paciente,situacao' }),
    ).toMatchObject({ format: 'xlsx', columns: ['paciente', 'situacao'] });
  });
});

describe('relatorioEncaminhamentosQuerySchema', () => {
  it('padrão: profissional crescente, período opcional', () => {
    expect(relatorioEncaminhamentosQuerySchema.parse({})).toMatchObject({
      sort: { field: 'profissional', direction: 'asc' },
    });
  });

  it('recusa De maior que Até', () => {
    expect(
      relatorioEncaminhamentosQuerySchema.safeParse({ de: '2026-12-01', ate: '2026-11-01' })
        .success,
    ).toBe(false);
  });
});
