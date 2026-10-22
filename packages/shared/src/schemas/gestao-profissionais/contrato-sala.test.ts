import { describe, expect, it } from 'vitest';
import {
  abreviarDiaSemana,
  cancelarContratoSalaSchema,
  encerrarContratoSalaSchema,
  createContratoSalaSchema,
  descreverDiaContrato,
  descreverValorContrato,
  exportContratosSalaQuerySchema,
  listContratosSalaQuerySchema,
  valorTotalMensal,
} from './contrato-sala';

const SALA = '00000000-0000-4000-8000-0000000000a1';
const LOCATARIO = '00000000-0000-4000-8000-0000000000a2';
const BASE = {
  salaId: SALA,
  locatarioId: LOCATARIO,
  valorUnitario: 1500,
  dataInicio: '2026-10-01',
};

function mensagens(entrada: unknown) {
  const resultado = createContratoSalaSchema.safeParse(entrada);
  return resultado.success
    ? []
    : resultado.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

describe('contratoSalaInputSchema', () => {
  it('aplica os padrões do modal Novo Contrato e normaliza vazios para null', () => {
    expect(
      createContratoSalaSchema.parse({ ...BASE, especialidade: '  ', observacoes: '' }),
    ).toEqual({
      ...BASE,
      modalidade: 'MENSAL',
      locatarioTipo: 'PROFISSIONAL',
      especialidade: null,
      quantidadeMensal: null,
      permuta: false,
      tipoReceita: 'FIXO',
      diaVencimento: 10,
      formaPagamentoId: null,
      indiceReajuste: 'NENHUM',
      dataFim: null,
      dias: [],
      permiteIndicacao: true,
      participaEventos: false,
      observacoes: null,
    });
  });

  it('exige a quantidade em Por Turno (inteira) e em Hora Avulsa', () => {
    expect(mensagens({ ...BASE, modalidade: 'TURNO' })).toContain(
      'quantidadeMensal: Turnos contratados é obrigatório.',
    );
    expect(mensagens({ ...BASE, modalidade: 'HORA' })).toContain(
      'quantidadeMensal: Horas contratadas é obrigatório.',
    );
    expect(mensagens({ ...BASE, modalidade: 'TURNO', quantidadeMensal: 2.5 })).toContain(
      'quantidadeMensal: Os turnos contratados devem ser um número inteiro',
    );
    expect(mensagens({ ...BASE, modalidade: 'HORA', quantidadeMensal: 2.5 })).toEqual([]);
    expect(mensagens({ ...BASE, modalidade: 'TURNO', quantidadeMensal: 0 })).toContain(
      'quantidadeMensal: A quantidade deve ser maior que zero',
    );
  });

  it('mensagens dos obrigatórios em português', () => {
    expect(mensagens({})).toEqual(
      expect.arrayContaining([
        'salaId: Sala é obrigatória.',
        'locatarioId: Locatário é obrigatório.',
        'valorUnitario: Informe o valor',
        'dataInicio: Data de início é obrigatória.',
      ]),
    );
  });

  it('valida a vigência, o vencimento e os índices', () => {
    expect(mensagens({ ...BASE, dataFim: '2026-09-30' })).toContain(
      'dataFim: A data de fim não pode ser anterior à data de início',
    );
    expect(mensagens({ ...BASE, dataFim: '2026-10-01' })).toEqual([]);
    expect(mensagens({ ...BASE, dataFim: '' })).toEqual([]);
    expect(mensagens({ ...BASE, diaVencimento: 32 })).toContain(
      'diaVencimento: O dia de vencimento deve ser de 1 a 31',
    );
    expect(mensagens({ ...BASE, indiceReajuste: 'SELIC' })).toContain(
      'indiceReajuste: Índice de reajuste inválido',
    );
    expect(mensagens({ ...BASE, tipoReceita: 'OUTRO' })).toContain(
      'tipoReceita: Tipo de receita inválido',
    );
  });

  it('valida os dias: sem repetir, horário válido e fim depois do início', () => {
    expect(
      mensagens({
        ...BASE,
        dias: [
          { diaSemana: 2, inicio: '14:00', fim: '12:00' },
          { diaSemana: 2, inicio: '08:00', fim: '09:00' },
          { diaSemana: 7, inicio: '8h', fim: '09:00' },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        'dias.0.fim: A hora final deve ser depois da hora inicial',
        'dias.1.diaSemana: Dia da semana repetido',
        'dias.2.diaSemana: Dia da semana inválido',
        'dias.2.inicio: Hora inicial inválida',
      ]),
    );
  });

  it('rejeita campo fora do formulário', () => {
    const resultado = createContratoSalaSchema.safeParse({ ...BASE, status: 'CANCELADO' });
    expect(resultado.error?.issues[0]?.code).toBe('unrecognized_keys');
  });
});

describe('listContratosSalaQuerySchema e exportação', () => {
  it('ordena por status por padrão e aceita os filtros', () => {
    const query = listContratosSalaQuerySchema.parse({ status: 'ATIVO', salaId: SALA });
    expect(query.sort).toEqual({ field: 'status', direction: 'asc' });
    expect(query).toMatchObject({ status: 'ATIVO', salaId: SALA });
    expect(listContratosSalaQuerySchema.safeParse({ sort: 'sala:asc' }).success).toBe(false);
  });

  it('exportação usa as colunas da tabela', () => {
    const query = exportContratosSalaQuerySchema.parse({ format: 'xlsx', columns: 'sala,valor' });
    expect(query.columns).toEqual(['sala', 'valor']);
    expect(exportContratosSalaQuerySchema.safeParse({ format: 'csv' }).success).toBe(false);
  });
});

describe('helpers de exibição', () => {
  it('calcula o total mensal por modalidade', () => {
    expect(valorTotalMensal('MENSAL', 1500, null)).toBe(1500);
    expect(valorTotalMensal('TURNO', 870, 2)).toBe(1740);
    expect(valorTotalMensal('HORA', 87.5, 4)).toBe(350);
    expect(valorTotalMensal('HORA', 33.33, 3)).toBe(99.99);
  });

  it('descreve valor e dias como na tabela', () => {
    expect(descreverValorContrato({ modalidade: 'TURNO', valorUnitario: 870 })).toMatch(
      /^R\$\s870,00\/turno$/,
    );
    expect(descreverValorContrato({ modalidade: 'MENSAL', valorUnitario: 6750 })).toMatch(
      /6\.750,00\/mês$/,
    );
    expect(descreverValorContrato({ modalidade: 'HORA', valorUnitario: 87.5 })).toMatch(
      /87,50\/hora$/,
    );
    expect(descreverDiaContrato({ diaSemana: 2, inicio: '14:00', fim: '18:00' })).toBe(
      'Ter 14:00-18:00',
    );
    expect(abreviarDiaSemana(0)).toBe('Dom');
    expect(abreviarDiaSemana(6)).toBe('Sáb');
    expect(abreviarDiaSemana(9)).toBe('');
  });
});

describe('encerrarContratoSalaSchema e cancelarContratoSalaSchema', () => {
  it('encerrar: data obrigatória e observação opcional', () => {
    expect(encerrarContratoSalaSchema.parse({ data: '2026-10-22', observacao: ' ' })).toEqual({
      data: '2026-10-22',
      observacao: null,
    });
    const vazio = encerrarContratoSalaSchema.safeParse({ data: '' });
    expect(vazio.error?.issues[0]?.message).toBe('Data de encerramento é obrigatória.');
    expect(
      encerrarContratoSalaSchema.safeParse({ data: '22/10/2026' }).error?.issues[0]?.message,
    ).toBe('Data de encerramento inválida');
  });

  it('cancelar: data obrigatória e motivo opcional', () => {
    expect(cancelarContratoSalaSchema.parse({ data: '2026-10-22', motivo: ' Rescisão ' })).toEqual({
      data: '2026-10-22',
      motivo: 'Rescisão',
    });
    const vazio = cancelarContratoSalaSchema.safeParse({});
    expect(vazio.error?.issues[0]?.message).toBe('Data de cancelamento é obrigatória.');
  });

  it('limita o texto e rejeita campo fora do formulário', () => {
    expect(
      cancelarContratoSalaSchema.safeParse({ data: '2026-10-22', motivo: 'x'.repeat(501) }).success,
    ).toBe(false);
    expect(encerrarContratoSalaSchema.safeParse({ data: '2026-10-22', motivo: 'x' }).success).toBe(
      false,
    );
  });
});
