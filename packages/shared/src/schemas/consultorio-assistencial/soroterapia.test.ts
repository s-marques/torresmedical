import { describe, expect, it } from 'vitest';
import {
  exportSoroterapiaHistoricoQuerySchema,
  listSoroterapiaEmAndamentoQuerySchema,
  listSoroterapiaHistoricoQuerySchema,
  SOROTERAPIA_EXPORT_COLUMNS,
  soroterapiaChecklistSchema,
  soroterapiaPacoteSchema,
} from './soroterapia';

const ID = '1d9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

describe('listSoroterapiaEmAndamentoQuerySchema', () => {
  it('ordena pela data, mais recente primeiro, e apara a busca', () => {
    expect(listSoroterapiaEmAndamentoQuerySchema.parse({ search: '  ana ' })).toMatchObject({
      page: 1,
      search: 'ana',
      sort: { field: 'data', direction: 'desc' },
    });
  });

  it('aceita as colunas ordenáveis do inventário e recusa as demais', () => {
    for (const field of ['data', 'paciente', 'profissional', 'protocolo', 'status']) {
      expect(
        listSoroterapiaEmAndamentoQuerySchema.safeParse({ sort: `${field}:asc` }).success,
      ).toBe(true);
    }
    expect(listSoroterapiaEmAndamentoQuerySchema.safeParse({ sort: 'duracao:asc' }).success).toBe(
      false,
    );
  });
});

describe('listSoroterapiaHistoricoQuerySchema', () => {
  it('filtra por Finalizado ou Suspenso; Todos é a ausência do filtro', () => {
    expect(listSoroterapiaHistoricoQuerySchema.parse({}).status).toBeUndefined();
    expect(listSoroterapiaHistoricoQuerySchema.parse({ status: 'SUSPENSO' }).status).toBe(
      'SUSPENSO',
    );
  });

  it('recusa Em andamento e valores desconhecidos', () => {
    expect(listSoroterapiaHistoricoQuerySchema.safeParse({ status: 'EM_ANDAMENTO' }).success).toBe(
      false,
    );
    expect(
      listSoroterapiaHistoricoQuerySchema.safeParse({ status: 'x' }).error?.issues[0]?.message,
    ).toBe('Status inválido');
  });
});

describe('exportSoroterapiaHistoricoQuerySchema', () => {
  it('exige o formato, usa todas as colunas por padrão e recusa coluna desconhecida', () => {
    expect(exportSoroterapiaHistoricoQuerySchema.parse({ format: 'xlsx' }).columns).toEqual([
      ...SOROTERAPIA_EXPORT_COLUMNS,
    ]);
    expect(exportSoroterapiaHistoricoQuerySchema.safeParse({}).success).toBe(false);
    expect(
      exportSoroterapiaHistoricoQuerySchema.safeParse({ format: 'pdf', columns: 'nome' }).success,
    ).toBe(false);
  });
});

describe('schemas de resposta', () => {
  it('checklist aceita duração e sinais vitais nulos', () => {
    expect(
      soroterapiaChecklistSchema.safeParse({
        id: ID,
        data: '2026-11-10T13:00:00.000Z',
        pacienteId: ID,
        pacienteNome: null,
        profissionalId: ID,
        profissionalNome: null,
        protocolo: 'Protocolo Alfa',
        sinaisVitaisInicio: null,
        status: 'EM_ANDAMENTO',
        duracaoMinutos: null,
      }).success,
    ).toBe(true);
  });

  it('pacote aceita orçamento sem paciente', () => {
    expect(
      soroterapiaPacoteSchema.safeParse({
        id: ID,
        orcamentoId: ID,
        orcamentoNumero: 7,
        pacienteId: null,
        pacienteNome: null,
        protocolo: 'Protocolo Alfa',
        quantidade: 4,
      }).success,
    ).toBe(true);
  });
});
