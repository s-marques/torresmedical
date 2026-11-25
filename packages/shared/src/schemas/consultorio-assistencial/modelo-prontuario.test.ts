import { describe, expect, it } from 'vitest';
import {
  modeloAtualizacaoSchema,
  modeloCampoSchema,
  modeloPadraoInputSchema,
  modeloProprioInputSchema,
  modeloSecoesSchema,
  normalizarRespostas,
  validarRespostas,
  type ModeloSecao,
} from './modelo-prontuario';

const campo = (extra: Record<string, unknown> = {}) => ({
  chave: 'queixa',
  rotulo: 'Queixa',
  tipo: 'TEXTO',
  ...extra,
});

const secoes = (campos: unknown[]) => [{ titulo: 'Avaliação', campos }];

describe('modeloCampoSchema', () => {
  it('aceita campo de texto e zera o que não é do tipo', () => {
    const r = modeloCampoSchema.parse(campo({ opcoes: ['a', 'b'], min: 1, max: 5 }));
    expect(r).toMatchObject({ obrigatorio: false, opcoes: null, min: null, max: null });
  });

  it('escala assume 0 a 10', () => {
    const r = modeloCampoSchema.parse(campo({ tipo: 'ESCALA', chave: 'dor' }));
    expect(r).toMatchObject({ min: 0, max: 10 });
  });

  it('lista exige ao menos 2 opções, sem repetição', () => {
    expect(modeloCampoSchema.safeParse(campo({ tipo: 'LISTA', opcoes: ['a'] })).success).toBe(
      false,
    );
    expect(modeloCampoSchema.safeParse(campo({ tipo: 'LISTA', opcoes: ['a', 'A'] })).success).toBe(
      false,
    );
    expect(modeloCampoSchema.safeParse(campo({ tipo: 'LISTA', opcoes: ['a', 'b'] })).success).toBe(
      true,
    );
  });

  it('faixa precisa ter máximo maior que mínimo', () => {
    const r = modeloCampoSchema.safeParse(campo({ tipo: 'NUMERO', min: 5, max: 5 }));
    expect(r.success).toBe(false);
  });

  it('rejeita chave fora do padrão e rótulo vazio', () => {
    expect(modeloCampoSchema.safeParse(campo({ chave: 'Queixa Principal' })).success).toBe(false);
    const vazio = modeloCampoSchema.safeParse(campo({ rotulo: ' ' }));
    expect(vazio.success).toBe(false);
    expect(vazio.error?.issues[0]?.message).toBe('Rótulo é obrigatório.');
  });
});

describe('modeloSecoesSchema', () => {
  it('exige seção com campo e chaves únicas', () => {
    expect(modeloSecoesSchema.safeParse([]).success).toBe(false);
    expect(modeloSecoesSchema.safeParse(secoes([])).success).toBe(false);
    expect(modeloSecoesSchema.safeParse(secoes([campo(), campo()])).success).toBe(false);
    expect(modeloSecoesSchema.safeParse(secoes([campo(), campo({ chave: 'outro' })])).success).toBe(
      true,
    );
  });
});

describe('inputs do modelo', () => {
  const base = { nome: 'Anamnese', profissao: 'PSICOLOGO', secoes: secoes([campo()]) };

  it('padrão não aceita profissionalId; próprio exige', () => {
    expect(modeloPadraoInputSchema.safeParse(base).success).toBe(true);
    expect(
      modeloPadraoInputSchema.safeParse({
        ...base,
        profissionalId: '3f0e5a62-8a6b-4c1d-9d33-1f2c3b4a5d6e',
      }).success,
    ).toBe(false);
    expect(modeloProprioInputSchema.safeParse(base).success).toBe(false);
    expect(
      modeloProprioInputSchema.safeParse({
        ...base,
        profissionalId: '3f0e5a62-8a6b-4c1d-9d33-1f2c3b4a5d6e',
      }).success,
    ).toBe(true);
  });

  it('atualização é parcial', () => {
    expect(modeloAtualizacaoSchema.safeParse({ ativo: false }).success).toBe(true);
    expect(modeloAtualizacaoSchema.safeParse({ nome: '' }).success).toBe(false);
  });
});

describe('validarRespostas', () => {
  const definicao: ModeloSecao[] = modeloSecoesSchema.parse(
    secoes([
      campo({ obrigatorio: true }),
      campo({ chave: 'peso', rotulo: 'Peso', tipo: 'NUMERO', min: 1, max: 300 }),
      campo({ chave: 'tipo', rotulo: 'Tipo', tipo: 'LISTA', opcoes: ['A', 'B'] }),
      campo({ chave: 'data', rotulo: 'Data', tipo: 'DATA' }),
      campo({ chave: 'dor', rotulo: 'Dor', tipo: 'ESCALA' }),
    ]),
  );

  it('valida obrigatório, tipo, faixa e chave desconhecida', () => {
    const erros = validarRespostas(definicao, {
      peso: 500,
      tipo: 'C',
      data: '31/02/2026',
      dor: 11,
      extra: 'x',
    });
    expect(erros.map((e) => e.chave).sort()).toEqual(
      ['data', 'dor', 'extra', 'peso', 'queixa', 'tipo'].sort(),
    );
    expect(erros.find((e) => e.chave === 'queixa')?.mensagem).toBe('Queixa é obrigatório.');
  });

  it('aceita respostas válidas', () => {
    expect(
      validarRespostas(definicao, {
        queixa: 'Dor',
        peso: 70.5,
        tipo: 'A',
        data: '2026-11-24',
        dor: 3,
      }),
    ).toEqual([]);
  });

  it('normaliza vazio para null e texto numérico para número', () => {
    expect(normalizarRespostas(definicao, { queixa: ' ', peso: '70.5', dor: 4 })).toEqual({
      queixa: null,
      peso: 70.5,
      dor: 4,
    });
  });
});
