import { describe, expect, it } from 'vitest';
import {
  bloqueiosSobrepostos,
  cancelarSalaBloqueioSchema,
  createSalaBloqueioSchema,
  descreverHorarioBloqueio,
  exportSalaBloqueiosQuerySchema,
  listSalaBloqueiosQuerySchema,
  ocorrenciasBloqueio,
  type DefinicaoBloqueio,
} from './sala-bloqueio';

const SALA = '00000000-0000-4000-8000-0000000000a1';
const UNICO = {
  salaId: SALA,
  tipo: 'MANUTENCAO',
  dataInicio: '2026-12-10',
  dataFim: '2026-12-10',
  horaInicio: '08:00',
  horaFim: '12:00',
};
const RECORRENTE = {
  salaId: SALA,
  tipo: 'RESERVA',
  recorrente: true,
  dataInicio: '2026-12-01',
  dataFim: '2026-12-31',
  dias: [{ diaSemana: 1, inicio: '14:00', fim: '18:00' }],
};

function mensagens(entrada: unknown) {
  const resultado = createSalaBloqueioSchema.safeParse(entrada);
  return resultado.success
    ? []
    : resultado.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

const definicao = (d: Partial<DefinicaoBloqueio>): DefinicaoBloqueio => ({
  recorrente: false,
  dataInicio: '2026-12-10',
  dataFim: '2026-12-10',
  horaInicio: '08:00',
  horaFim: '12:00',
  dias: [],
  ...d,
});

describe('salaBloqueioInputSchema', () => {
  it('aceita o período único e zera os dias', () => {
    const r = createSalaBloqueioSchema.parse({
      ...UNICO,
      dias: [{ diaSemana: 1, inicio: '08:00', fim: '09:00' }],
    });
    expect(r).toMatchObject({ recorrente: false, dias: [], profissionalId: null, motivo: null });
  });

  it('aceita o recorrente e zera as horas do período único', () => {
    const r = createSalaBloqueioSchema.parse({
      ...RECORRENTE,
      horaInicio: '08:00',
      horaFim: '09:00',
    });
    expect(r).toMatchObject({ recorrente: true, horaInicio: null, horaFim: null });
  });

  it('campos obrigatórios com a mensagem padrão', () => {
    expect(mensagens({})).toEqual(
      expect.arrayContaining([
        'salaId: Sala é obrigatória.',
        'tipo: Tipo é obrigatório.',
        'dataInicio: Data inicial é obrigatória.',
        'dataFim: Data final é obrigatória.',
      ]),
    );
  });

  it('período único exige as horas, e a final depois da inicial no mesmo dia', () => {
    expect(mensagens({ ...UNICO, horaInicio: '', horaFim: null })).toEqual([
      'horaInicio: Hora inicial é obrigatória.',
      'horaFim: Hora final é obrigatória.',
    ]);
    expect(mensagens({ ...UNICO, horaFim: '08:00' })).toEqual([
      'horaFim: A hora final deve ser depois da inicial',
    ]);
    // Em dias diferentes, o período é contínuo: a hora final pode ser menor.
    expect(mensagens({ ...UNICO, dataFim: '2026-12-11', horaFim: '07:00' })).toEqual([]);
  });

  it('data final antes da inicial', () => {
    expect(mensagens({ ...UNICO, dataFim: '2026-12-09' })).toContain(
      'dataFim: A data inicial deve ser anterior ou igual à final',
    );
  });

  it('recorrente exige dias, sem repetir, com horário coerente', () => {
    expect(mensagens({ ...RECORRENTE, dias: [] })).toEqual([
      'dias: Selecione ao menos um dia da semana',
    ]);
    expect(
      mensagens({
        ...RECORRENTE,
        dias: [
          { diaSemana: 1, inicio: '14:00', fim: '18:00' },
          { diaSemana: 1, inicio: '18:00', fim: '14:00' },
        ],
      }),
    ).toEqual([
      'dias.1.diaSemana: Dia da semana repetido',
      'dias.1.fim: A hora final deve ser depois da inicial',
    ]);
  });

  it('tipo inválido, hora inválida e motivo longo', () => {
    expect(mensagens({ ...UNICO, tipo: 'FERIAS' })).toEqual(['tipo: Opção inválida']);
    expect(mensagens({ ...UNICO, horaInicio: '25:00' })).toEqual(['horaInicio: Hora inválida']);
    expect(mensagens({ ...UNICO, motivo: 'x'.repeat(501) })).toEqual([
      'motivo: Motivo deve ter no máximo 500 caracteres',
    ]);
  });

  it('cancelar exige o motivo da lista; a observação é opcional (issue #162)', () => {
    const r = cancelarSalaBloqueioSchema.safeParse({ motivoId: '' });
    expect(r.success ? [] : r.error.issues.map((i) => i.message)).toEqual([
      'Motivo é obrigatório.',
    ]);
    expect(
      cancelarSalaBloqueioSchema.parse({ motivoId: '00000000-0000-4000-8000-0000000000e1' }),
    ).toMatchObject({ motivoId: '00000000-0000-4000-8000-0000000000e1' });
    expect(cancelarSalaBloqueioSchema.safeParse({ motivo: 'Obra adiada' }).success).toBe(false);
  });
});

describe('listagem e exportação', () => {
  it('filtros e período coerente', () => {
    expect(listSalaBloqueiosQuerySchema.parse({ status: 'ATIVO', de: '2026-12-01' })).toMatchObject(
      { status: 'ATIVO', de: '2026-12-01', sort: { field: 'dataInicio', direction: 'desc' } },
    );
    expect(
      listSalaBloqueiosQuerySchema.safeParse({ de: '2026-12-02', ate: '2026-12-01' }).success,
    ).toBe(false);
    expect(
      exportSalaBloqueiosQuerySchema.safeParse({
        format: 'xlsx',
        de: '2026-12-02',
        ate: '2026-12-01',
      }).success,
    ).toBe(false);
    expect(exportSalaBloqueiosQuerySchema.parse({ format: 'pdf' }).columns).toContain(
      'responsavel',
    );
  });
});

describe('ocorrenciasBloqueio', () => {
  it('período único de vários dias: início, dias inteiros e fim', () => {
    expect(
      ocorrenciasBloqueio(
        definicao({ dataFim: '2026-12-12', horaInicio: '14:00', horaFim: '10:00' }),
        '2026-12-01',
        '2026-12-31',
      ),
    ).toEqual([
      { data: '2026-12-10', inicio: '14:00', fim: '24:00' },
      { data: '2026-12-11', inicio: '00:00', fim: '24:00' },
      { data: '2026-12-12', inicio: '00:00', fim: '10:00' },
    ]);
  });

  it('recorte pela janela e recorrência por dia da semana', () => {
    const rec = definicao({
      recorrente: true,
      dataInicio: '2026-12-01',
      dataFim: '2026-12-31',
      horaInicio: null,
      horaFim: null,
      dias: [{ diaSemana: 1, inicio: '14:00', fim: '18:00' }],
    });
    // Segundas de dezembro de 2026 entre 05 e 20: 07 e 14.
    expect(ocorrenciasBloqueio(rec, '2026-12-05', '2026-12-20').map((o) => o.data)).toEqual([
      '2026-12-07',
      '2026-12-14',
    ]);
  });
});

describe('bloqueiosSobrepostos', () => {
  it('horários que se tocam não se sobrepõem', () => {
    expect(
      bloqueiosSobrepostos(definicao({}), definicao({ horaInicio: '12:00', horaFim: '13:00' })),
    ).toBe(false);
    expect(
      bloqueiosSobrepostos(definicao({}), definicao({ horaInicio: '11:59', horaFim: '13:00' })),
    ).toBe(true);
  });

  it('recorrente x período único só no dia da semana em comum', () => {
    const rec = definicao({
      recorrente: true,
      dataInicio: '2026-12-01',
      dataFim: '2026-12-31',
      horaInicio: null,
      horaFim: null,
      dias: [{ diaSemana: 1, inicio: '09:00', fim: '10:00' }],
    });
    // 10/12/2026 é quinta; 14/12/2026 é segunda.
    expect(bloqueiosSobrepostos(rec, definicao({}))).toBe(false);
    expect(
      bloqueiosSobrepostos(rec, definicao({ dataInicio: '2026-12-14', dataFim: '2026-12-14' })),
    ).toBe(true);
  });

  it('períodos sem datas em comum', () => {
    expect(
      bloqueiosSobrepostos(
        definicao({}),
        definicao({ dataInicio: '2026-12-11', dataFim: '2026-12-11' }),
      ),
    ).toBe(false);
  });
});

describe('descreverHorarioBloqueio', () => {
  it('período único e recorrente', () => {
    expect(descreverHorarioBloqueio(definicao({}))).toBe('08:00-12:00');
    expect(
      descreverHorarioBloqueio(
        definicao({
          recorrente: true,
          dias: [
            { diaSemana: 3, inicio: '14:00', fim: '18:00' },
            { diaSemana: 1, inicio: '08:00', fim: '12:00' },
          ],
        }),
      ),
    ).toBe('Seg 08:00-12:00, Qua 14:00-18:00');
  });
});
