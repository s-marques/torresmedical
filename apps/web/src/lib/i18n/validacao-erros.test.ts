import {
  ARQUIVO_USOS,
  loginSchema,
  mensagemObrigatoria,
  periodoShape,
  textoObrigatorio,
  validarArquivo,
} from '@torres/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiRequestError, mensagemDoDetalhe } from '@/lib/api/api-error';
import { errosPorCampo } from '@/lib/api/tratar-erro';
import { formatarData, formatarDataHora } from '@/lib/formatar';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { aplicarIdioma, idiomaAtual, traduzirErroApi, traduzirRotulo } from '.';

function mensagens(schema: z.ZodType, valor: unknown): string[] {
  return schema.safeParse(valor).error?.issues.map((issue) => issue.message) ?? [];
}

describe('validação no idioma do usuário (issue #205)', () => {
  const schema = z.object({ nome: textoObrigatorio('Nome', { max: 3 }), idade: z.number() });

  it('português é o padrão', () => {
    expect(mensagens(schema, { nome: '' })).toEqual(['Nome é obrigatório.', 'Campo obrigatório']);
  });

  it('inglês e espanhol traduzem a mensagem e o rótulo do campo', () => {
    aplicarIdioma('en');
    expect(mensagens(schema, { nome: '' })).toEqual(['Name is required.', 'Required field']);
    expect(mensagens(schema, { nome: 'abcd', idade: 1 })).toEqual([
      'Name must have at most 3 characters',
    ]);

    aplicarIdioma('es');
    expect(mensagens(schema, { nome: '' })).toEqual([
      'Nombre es obligatorio.',
      'Campo obligatorio',
    ]);
    expect(mensagemObrigatoria('Data', 'f')).toBe('Fecha es obligatoria.');
  });

  it('rótulo sem tradução fica em português', () => {
    aplicarIdioma('en');
    expect(traduzirRotulo('Campo novo da tela')).toBe('Campo novo da tela');
    expect(mensagemObrigatoria('Campo novo da tela')).toBe('Campo novo da tela is required.');
  });

  it('login, período e arquivo', () => {
    aplicarIdioma('en');
    expect(mensagens(loginSchema, { email: '', senha: '' })).toEqual([
      'Enter your e-mail',
      'Enter your password',
    ]);
    expect(mensagens(z.object(periodoShape), { de: '2026-13-01', ate: '' })).toEqual([
      'Invalid start date',
      'Enter the end date',
    ]);
    expect(validarArquivo({ nome: 'a.exe', tamanho: 10 }, 'avatar')).toMatch(
      /^File type not allowed\. Send .+ or .+$/,
    );
    expect(validarArquivo({ nome: 'a.png', tamanho: 0 }, 'avatar')).toBe('The file is empty');
    expect(ARQUIVO_USOS.avatar.maxBytes).toBeGreaterThan(0);
  });
});

describe('erros da API no idioma do usuário', () => {
  const corpo = (code: string, message: string) => ({ statusCode: 404, code, message });

  it('português usa a mensagem do servidor', () => {
    expect(new ApiRequestError(404, corpo('NOT_FOUND', 'Empresa não encontrada')).message).toBe(
      'Empresa não encontrada',
    );
  });

  it('inglês traduz pelo code; code sem tradução cai na mensagem do servidor', () => {
    aplicarIdioma('en');
    expect(new ApiRequestError(404, corpo('NOT_FOUND', 'Empresa não encontrada')).message).toBe(
      'Record not found',
    );
    expect(traduzirErroApi('CODIGO_DE_MODULO', 'Mensagem do módulo')).toBe('Mensagem do módulo');
    expect(new ApiRequestError(0, null).message).toBe(
      'Could not complete the operation. Try again',
    );
  });

  it('erros de campo (400) usam a chave quando a API manda `code`', () => {
    aplicarIdioma('es');
    const erro = new ApiRequestError(400, {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Dados inválidos',
      details: [
        {
          field: 'nome',
          message: 'Nome é obrigatório.',
          code: 'validacao.obrigatorio',
          params: { campo: 'Nome', genero: 'm' },
        },
        { field: 'sigla', message: 'Sigla já usada' },
      ],
    });
    expect(errosPorCampo(erro)).toEqual({
      nome: 'Nombre es obligatorio.',
      sigla: 'Sigla já usada',
    });
    expect(
      mensagemDoDetalhe({ field: 'x', message: 'Já existe', code: 'validacao.duplicado' }),
    ).toBe('Ya existe un registro con este valor');
  });
});

describe('datas e números no idioma do usuário (moeda sempre em R$)', () => {
  it('formata conforme o idioma', () => {
    expect(idiomaAtual()).toBe('pt-BR');
    expect(formatarData('2026-10-31')).toBe('31/10/2026');
    expect(formatarMoeda(1234.5)).toBe('R$ 1.234,50');

    aplicarIdioma('en');
    expect(formatarData('2026-10-31')).toBe('10/31/26');
    expect(formatarMoeda(1234.5)).toBe('R$1,234.50');
    expect(formatarDataHora('2026-10-31T14:03:00')).toMatch(/^10\/31\/26, 2:03\sPM$/);

    aplicarIdioma('es');
    expect(formatarData('2026-10-31')).toBe('31/10/26');
  });
});
