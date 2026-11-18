import { describe, expect, it } from 'vitest';
import {
  descreverResumoGerarTitulos,
  descricaoTituloMensalidade,
  gerarTitulosMensalidadesFormularioSchema,
  gerarTitulosMensalidadesSchema,
  listMensalidadesQuerySchema,
  mensalidadeInputSchema,
  mensalidadeVigenteNaCompetencia,
  mudarStatusMensalidadeSchema,
  podeMudarStatusMensalidade,
  vencimentoTituloMensalidade,
} from './mensalidade';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const VALIDO = {
  pacienteId: ID,
  descricao: 'Plano mensal',
  valor: 150,
  diaVencimento: 10,
  dataInicio: '2026-11-01',
};

const mensagens = (dados: unknown) =>
  Object.fromEntries(
    (mensalidadeInputSchema.safeParse(dados).error?.issues ?? []).map((i) => [
      i.path.join('.'),
      i.message,
    ]),
  );

describe('mensalidadeInputSchema', () => {
  it('exige os campos com asterisco com a mensagem padrão', () => {
    expect(mensagens({})).toEqual({
      pacienteId: 'Cliente é obrigatório.',
      descricao: 'Descrição é obrigatória.',
      valor: 'Valor é obrigatório.',
      diaVencimento: 'Dia de vencimento é obrigatório.',
      dataInicio: 'Data de início é obrigatória.',
    });
    expect(mensagens({ ...VALIDO, descricao: '   ', dataInicio: '' })).toEqual({
      descricao: 'Descrição é obrigatória.',
      dataInicio: 'Data de início é obrigatória.',
    });
  });

  it('aceita o mínimo e normaliza os opcionais vazios para null', () => {
    expect(
      mensalidadeInputSchema.parse({
        ...VALIDO,
        descricao: ' Plano mensal ',
        formaPagamentoId: null,
        dataFim: '',
        observacoes: '  ',
      }),
    ).toEqual({
      ...VALIDO,
      formaPagamentoId: null,
      dataFim: null,
      observacoes: null,
    });
  });

  it('valida valor positivo e dia de 1 a 28', () => {
    expect(mensagens({ ...VALIDO, valor: 0 })).toEqual({
      valor: 'O valor deve ser maior que zero',
    });
    for (const dia of [0, 29, 10.5]) {
      expect(mensagens({ ...VALIDO, diaVencimento: dia })).toEqual({
        diaVencimento: 'Informe um dia de 1 a 28',
      });
    }
    expect(mensagens({ ...VALIDO, diaVencimento: 28 })).toEqual({});
  });

  it('não aceita data de fim anterior à de início', () => {
    expect(mensagens({ ...VALIDO, dataFim: '2026-10-31' })).toEqual({
      dataFim: 'A data de fim não pode ser anterior à data de início',
    });
    expect(mensagens({ ...VALIDO, dataFim: '2026-11-01' })).toEqual({});
    expect(mensagens({ ...VALIDO, dataInicio: '2026-13-01' })).toEqual({
      dataInicio: 'Data de início inválida',
    });
  });

  it('rejeita campos desconhecidos (status muda só pelo endpoint próprio)', () => {
    expect(mensalidadeInputSchema.safeParse({ ...VALIDO, status: 'CANCELADO' }).success).toBe(
      false,
    );
  });
});

describe('status', () => {
  it('permite pausar, reativar e cancelar; cancelado é final', () => {
    expect(podeMudarStatusMensalidade('ATIVO', 'PAUSADO')).toBe(true);
    expect(podeMudarStatusMensalidade('PAUSADO', 'ATIVO')).toBe(true);
    expect(podeMudarStatusMensalidade('ATIVO', 'CANCELADO')).toBe(true);
    expect(podeMudarStatusMensalidade('PAUSADO', 'CANCELADO')).toBe(true);
    expect(podeMudarStatusMensalidade('CANCELADO', 'ATIVO')).toBe(false);
    expect(podeMudarStatusMensalidade('ATIVO', 'ATIVO')).toBe(false);
  });

  it('valida o corpo da mudança de status', () => {
    expect(mudarStatusMensalidadeSchema.safeParse({ status: 'PAUSADO' }).success).toBe(true);
    expect(mudarStatusMensalidadeSchema.safeParse({ status: 'X' }).success).toBe(false);
  });
});

describe('listMensalidadesQuerySchema', () => {
  it('aceita filtro de status e ordenação pelas colunas', () => {
    expect(
      listMensalidadesQuerySchema.parse({ status: 'PAUSADO', sort: 'diaVencimento:asc' }),
    ).toMatchObject({ status: 'PAUSADO', sort: { field: 'diaVencimento', direction: 'asc' } });
    expect(listMensalidadesQuerySchema.safeParse({ sort: 'paciente:asc' }).success).toBe(false);
  });
});

describe('gerar títulos', () => {
  it('valida a competência AAAA-MM', () => {
    expect(gerarTitulosMensalidadesSchema.safeParse({ competencia: '2026-11' }).success).toBe(true);
    expect(gerarTitulosMensalidadesSchema.safeParse({ competencia: '2026-13' }).success).toBe(
      false,
    );
  });

  it('converte Mês e Ano do modal em competência', () => {
    expect(gerarTitulosMensalidadesFormularioSchema.parse({ mes: '11', ano: '2026' })).toEqual({
      competencia: '2026-11',
    });
    const erro = gerarTitulosMensalidadesFormularioSchema.safeParse({ mes: '', ano: '' });
    expect(erro.error?.issues.map((i) => i.message)).toEqual([
      'Mês é obrigatório.',
      'Ano é obrigatório.',
    ]);
  });

  it('considera vigente a mensalidade que pega algum dia do mês', () => {
    const vigente = (dataInicio: string, dataFim: string | null) =>
      mensalidadeVigenteNaCompetencia({ dataInicio, dataFim }, '2026-11');
    expect(vigente('2026-11-30', null)).toBe(true);
    expect(vigente('2026-01-01', '2026-11-01')).toBe(true);
    expect(vigente('2026-12-01', null)).toBe(false);
    expect(vigente('2026-01-01', '2026-10-31')).toBe(false);
    expect(
      mensalidadeVigenteNaCompetencia({ dataInicio: '2027-02-28', dataFim: null }, '2027-02'),
    ).toBe(true);
  });

  it('monta vencimento, descrição e resumo', () => {
    expect(vencimentoTituloMensalidade('2026-02', 5)).toBe('2026-02-05');
    expect(descricaoTituloMensalidade('Plano mensal')).toBe('Mensalidade - Plano mensal');
    expect(
      descreverResumoGerarTitulos({ competencia: '2026-11', geradas: 3, jaExistentes: 2 }),
    ).toBe('3 título(s) gerado(s) para 11/2026; 2 mensalidade(s) já tinham título no mês.');
  });
});
