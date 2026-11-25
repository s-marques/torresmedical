import { describe, expect, it } from 'vitest';
import '../../zod-pt-br';
import {
  consultaRelatorioSchema,
  exportRelatorioSchema,
  paginaRelatorioSchema,
  PERIODO_INVALIDO,
  periodoRelatorioSchema,
  selecaoRelatorioSchema,
  type OpcoesConsultaRelatorio,
} from './relatorio';

const OPCOES: OpcoesConsultaRelatorio = {
  colunas: ['nome', 'status', 'createdAt'],
  ordenaveis: ['nome', 'createdAt'],
  ordenacaoPadrao: 'nome:asc',
  filtros: [
    {
      tipo: 'select',
      parametro: 'status',
      rotulo: 'Status',
      opcoes: [
        { valor: 'ativo', rotulo: 'Ativo' },
        { valor: 'inativo', rotulo: 'Inativo' },
      ],
    },
  ],
};

function mensagens(resultado: { success: boolean; error?: { issues: readonly unknown[] } }) {
  return (resultado.error?.issues ?? []).map((issue) => {
    const { path, message } = issue as { path: PropertyKey[]; message: string };
    return [path.join('.'), message];
  });
}

describe('periodoRelatorioSchema', () => {
  it('aceita De anterior ou igual a Até', () => {
    expect(periodoRelatorioSchema.parse({ de: '2026-09-16', ate: '2026-10-16' })).toEqual({
      de: '2026-09-16',
      ate: '2026-10-16',
    });
    expect(periodoRelatorioSchema.safeParse({ de: '2026-10-16', ate: '2026-10-16' }).success).toBe(
      true,
    );
  });

  it('rejeita De depois de Até, com o erro no campo "Até"', () => {
    const resultado = periodoRelatorioSchema.safeParse({ de: '2026-10-17', ate: '2026-10-16' });

    expect(mensagens(resultado)).toEqual([['ate', PERIODO_INVALIDO]]);
  });

  it('exige as duas datas e valida o calendário', () => {
    expect(mensagens(periodoRelatorioSchema.safeParse({}))).toEqual([
      ['de', 'Informe a data inicial'],
      ['ate', 'Informe a data final'],
    ]);
    expect(mensagens(periodoRelatorioSchema.safeParse({ de: '', ate: ' ' }))).toEqual([
      ['de', 'Informe a data inicial'],
      ['ate', 'Informe a data final'],
    ]);
    expect(
      mensagens(periodoRelatorioSchema.safeParse({ de: '2026-02-30', ate: '16/10/2026' })),
    ).toEqual([
      ['de', 'Data inicial inválida'],
      ['ate', 'Data final inválida'],
    ]);
  });
});

describe('selecaoRelatorioSchema', () => {
  it('aceita a tela sem relatório escolhido, mas valida o período', () => {
    expect(
      selecaoRelatorioSchema.parse({ relatorio: '', de: '2026-10-01', ate: '2026-10-02' }),
    ).toEqual({ relatorio: '', de: '2026-10-01', ate: '2026-10-02' });
    const invertido = selecaoRelatorioSchema.safeParse({
      relatorio: 'EX-01',
      de: '2026-10-03',
      ate: '2026-10-02',
    });
    expect(mensagens(invertido)).toEqual([['ate', PERIODO_INVALIDO]]);
  });
});

describe('consultaRelatorioSchema', () => {
  const schema = consultaRelatorioSchema(OPCOES);

  it('pagina, ordena pela whitelist e valida os filtros do relatório', () => {
    expect(
      schema.parse({
        de: '2026-10-01',
        ate: '2026-10-31',
        sort: 'createdAt:desc',
        status: 'ativo',
      }),
    ).toEqual({
      page: 1,
      pageSize: 10,
      de: '2026-10-01',
      ate: '2026-10-31',
      sort: { field: 'createdAt', direction: 'desc' },
      status: 'ativo',
    });
  });

  it('rejeita ordenação fora da whitelist, filtro inválido e período invertido', () => {
    const invalido = schema.safeParse({
      de: '2026-10-31',
      ate: '2026-10-01',
      sort: 'status:asc',
      status: 'todos',
    });
    expect(mensagens(invalido).map(([campo]) => campo)).toEqual(['sort', 'status']);

    const invertido = schema.safeParse({ de: '2026-10-31', ate: '2026-10-01' });
    expect(mensagens(invertido)).toEqual([['ate', PERIODO_INVALIDO]]);
  });

  it('sem colunas ordenáveis, não há sort', () => {
    const semOrdenacao = consultaRelatorioSchema({ ...OPCOES, ordenaveis: [], filtros: [] });

    expect(semOrdenacao.parse({ de: '2026-10-01', ate: '2026-10-01', sort: 'x' })).toEqual({
      page: 1,
      pageSize: 10,
      de: '2026-10-01',
      ate: '2026-10-01',
    });
  });
});

describe('exportRelatorioSchema', () => {
  const schema = exportRelatorioSchema(OPCOES);

  it('exige o formato e aceita só as colunas do relatório', () => {
    expect(
      schema.parse({ de: '2026-10-01', ate: '2026-10-31', format: 'pdf', columns: 'status,nome' }),
    ).toEqual({
      de: '2026-10-01',
      ate: '2026-10-31',
      sort: { field: 'nome', direction: 'asc' },
      format: 'pdf',
      columns: ['status', 'nome'],
    });
    expect(
      mensagens(
        schema.safeParse({ de: '2026-10-01', ate: '2026-10-31', format: 'docx', columns: 'x' }),
      ).map(([campo]) => campo),
    ).toEqual(['format', 'columns']);
  });

  it('valida o período como a consulta', () => {
    const resultado = schema.safeParse({ de: '2026-11-01', ate: '2026-10-31', format: 'xlsx' });

    expect(mensagens(resultado)).toEqual([['ate', PERIODO_INVALIDO]]);
  });
});

describe('paginaRelatorioSchema', () => {
  it('aceita linhas com qualquer coluna no contrato { data, meta }', () => {
    const pagina = {
      data: [{ nome: 'Centro', createdAt: '2026-10-01T12:00:00.000Z', valor: '10.50' }],
      meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    };

    expect(paginaRelatorioSchema.parse(pagina)).toEqual(pagina);
  });
});
