import { describe, expect, it } from 'vitest';
import {
  adendoInputSchema,
  assinaturaInputSchema,
  atendimentoAnexoInputSchema,
  atendimentoAtualizacaoSchema,
  atendimentoDocumentoInputSchema,
} from './prontuario-registros';

const ARQUIVO = '2b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

describe('atendimentoAnexoInputSchema', () => {
  it('normaliza a descrição e aceita só os campos do formulário', () => {
    expect(
      atendimentoAnexoInputSchema.parse({
        tipo: 'EXAME',
        arquivoId: ARQUIVO,
        data: '2026-11-20',
        descricao: '  Hemograma  ',
      }),
    ).toEqual({ tipo: 'EXAME', arquivoId: ARQUIVO, data: '2026-11-20', descricao: 'Hemograma' });
    expect(
      atendimentoAnexoInputSchema.parse({ tipo: 'ANEXO', arquivoId: ARQUIVO, data: '2026-11-20' })
        .descricao,
    ).toBeNull();
  });

  it('exige tipo, arquivo e data válidos', () => {
    expect(atendimentoAnexoInputSchema.safeParse({}).success).toBe(false);
    expect(
      atendimentoAnexoInputSchema.safeParse({ tipo: 'X', arquivoId: ARQUIVO, data: '2026-11-20' })
        .success,
    ).toBe(false);
    expect(
      atendimentoAnexoInputSchema.safeParse({ tipo: 'EXAME', arquivoId: 'x', data: '2026-11-20' })
        .success,
    ).toBe(false);
    expect(
      atendimentoAnexoInputSchema.safeParse({
        tipo: 'EXAME',
        arquivoId: ARQUIVO,
        data: '20/11/2026',
      }).success,
    ).toBe(false);
  });
});

describe('atendimentoDocumentoInputSchema', () => {
  it('exige o texto, com a mensagem padrão de obrigatório', () => {
    const resultado = atendimentoDocumentoInputSchema.safeParse({
      tipo: 'ATESTADO',
      texto: '  ',
      dataEmissao: '2026-11-21',
    });
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.message).toBe('Texto é obrigatório.');
  });

  it('aceita os três tipos', () => {
    for (const tipo of ['ATESTADO', 'DECLARACAO', 'SOLICITACAO_EXAME']) {
      expect(
        atendimentoDocumentoInputSchema.safeParse({ tipo, texto: 'ok', dataEmissao: '2026-11-21' })
          .success,
      ).toBe(true);
    }
  });
});

describe('atendimentoAtualizacaoSchema', () => {
  it('só os campos enviados aparecem; vazio vira null', () => {
    expect(atendimentoAtualizacaoSchema.parse({})).toEqual({});
    expect(atendimentoAtualizacaoSchema.parse({ queixa: '  Nova ', conduta: '' })).toEqual({
      queixa: 'Nova',
      conduta: null,
    });
  });

  it('não aceita status nem profissional', () => {
    expect(atendimentoAtualizacaoSchema.safeParse({ status: 'FINALIZADO' }).success).toBe(false);
    expect(atendimentoAtualizacaoSchema.safeParse({ profissionalId: ARQUIVO }).success).toBe(false);
  });
});

describe('assinaturaInputSchema e adendoInputSchema', () => {
  it('exigem senha e texto', () => {
    expect(assinaturaInputSchema.safeParse({ senha: '' }).error?.issues[0]?.message).toBe(
      'Informe a senha para assinar.',
    );
    expect(assinaturaInputSchema.safeParse({ senha: 'x' }).success).toBe(true);
    expect(adendoInputSchema.safeParse({ texto: ' ' }).success).toBe(false);
    expect(adendoInputSchema.parse({ texto: ' Correção ' })).toEqual({ texto: 'Correção' });
  });
});
