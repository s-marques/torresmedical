import { describe, expect, it } from 'vitest';
import {
  createServicoProfissionalSchema,
  listServicosProfissionaisQuerySchema,
  servicoProfissionalStatusSchema,
} from './servico-profissional';

const PROFISSIONAL = '00000000-0000-4000-8000-0000000000a1';

describe('servicoProfissionalInputSchema', () => {
  it('aplica os padrões do modal (valor 0, 30 min) e normaliza vazios para null', () => {
    expect(
      createServicoProfissionalSchema.parse({
        profissionalId: PROFISSIONAL,
        nome: '  Consulta ',
        categoria: '',
        descricao: '  ',
      }),
    ).toEqual({
      profissionalId: PROFISSIONAL,
      nome: 'Consulta',
      categoria: null,
      valor: 0,
      duracaoMinutos: 30,
      descricao: null,
    });
  });

  it('mensagens de validação em português', () => {
    const resultado = createServicoProfissionalSchema.safeParse({
      nome: '',
      valor: -1,
      duracaoMinutos: 0,
    });

    expect(resultado.error?.issues.map((i) => [i.path[0], i.message])).toEqual(
      expect.arrayContaining([
        ['profissionalId', 'Profissional é obrigatório.'],
        ['nome', 'Nome do serviço é obrigatório.'],
        ['valor', 'O valor não pode ser negativo'],
        ['duracaoMinutos', 'A duração deve ser de pelo menos 1 minuto'],
      ]),
    );
  });

  it('rejeita campos desconhecidos', () => {
    expect(
      createServicoProfissionalSchema.safeParse({
        profissionalId: PROFISSIONAL,
        nome: 'X',
        ativo: true,
      }).success,
    ).toBe(false);
  });
});

describe('servicoProfissionalStatusSchema e listagem', () => {
  it('status exige boolean', () => {
    expect(servicoProfissionalStatusSchema.parse({ ativo: false })).toEqual({ ativo: false });
    expect(servicoProfissionalStatusSchema.safeParse({}).success).toBe(false);
  });

  it('listagem aceita filtros e rejeita sort fora da whitelist', () => {
    expect(
      listServicosProfissionaisQuerySchema.parse({ profissionalId: PROFISSIONAL, status: 'ativo' }),
    ).toMatchObject({ profissionalId: PROFISSIONAL, status: 'ativo', sort: { field: 'nome' } });
    expect(listServicosProfissionaisQuerySchema.safeParse({ sort: 'ativo:asc' }).success).toBe(
      false,
    );
  });
});
