import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import '../zod-pt-br';
import { erroObrigatorio, textoObrigatorio } from '../schemas/common/obrigatorio';
import {
  codificarMensagemValidacao,
  comTradutorValidacao,
  decodificarMensagemValidacao,
  definirTradutorValidacao,
  traduzirPtBr,
  traduzirValidacao,
} from './validacao';

afterEach(() => definirTradutorValidacao());

describe('traduzirPtBr', () => {
  it('interpola, escolhe o feminino e o plural', () => {
    expect(traduzirPtBr({ chave: 'validacao.obrigatorio', params: { campo: 'Nome' } })).toBe(
      'Nome é obrigatório.',
    );
    expect(
      traduzirPtBr({ chave: 'validacao.obrigatorio', params: { campo: 'Sigla', genero: 'f' } }),
    ).toBe('Sigla é obrigatória.');
    expect(traduzirPtBr({ chave: 'validacao.textoMin', params: { count: 1 } })).toBe(
      'Deve ter no mínimo 1 caractere',
    );
    expect(traduzirPtBr({ chave: 'validacao.itensMax', params: { count: 3 } })).toBe(
      'Deve ter no máximo 3 itens',
    );
  });

  it('sem variante feminina, usa a forma comum', () => {
    expect(
      traduzirPtBr({
        chave: 'validacao.campoMax',
        params: { campo: 'Sigla', genero: 'f', count: 2 },
      }),
    ).toBe('Sigla deve ter no máximo 2 caracteres');
  });

  it('chaves aninhadas e chave desconhecida', () => {
    expect(traduzirPtBr({ chave: 'validacao.formato.email' })).toBe('E-mail inválido');
    expect(traduzirPtBr({ chave: 'validacao.naoExiste' })).toBe('validacao.naoExiste');
    expect(traduzirPtBr({ chave: 'validacao.formato' })).toBe('validacao.formato');
  });

  it('mantém o marcador quando falta o parâmetro', () => {
    expect(traduzirPtBr({ chave: 'validacao.obrigatorio' })).toBe('{{campo}} é obrigatório.');
  });
});

describe('tradutor registrado', () => {
  const ingles = ({ chave, params }: { chave: string; params?: Record<string, unknown> }) =>
    `en:${chave}:${JSON.stringify(params ?? {})}`;

  it('as mensagens dos schemas usam o tradutor da hora da validação', () => {
    const schema = z.object({ nome: textoObrigatorio('Nome', { max: 3 }), idade: z.number() });
    definirTradutorValidacao(ingles);
    const erros = schema.safeParse({ nome: 'abcd' }).error?.issues.map((i) => i.message);
    expect(erros).toEqual([
      'en:validacao.campoMax:{"campo":"Nome","count":3}',
      'en:validacao.campoObrigatorio:{}',
    ]);
    definirTradutorValidacao();
    expect(schema.safeParse({ nome: '' }).error?.issues[0]?.message).toBe('Nome é obrigatório.');
  });

  it('erroObrigatorio calcula o texto só quando chamado', () => {
    const erro = erroObrigatorio('Data', 'f');
    expect(erro()).toBe('Data é obrigatória.');
    definirTradutorValidacao(ingles);
    expect(erro()).toBe('en:validacao.obrigatorio:{"campo":"Data","genero":"f"}');
  });

  it('comTradutorValidacao troca o tradutor só durante a execução, mesmo com erro', () => {
    expect(comTradutorValidacao(ingles, () => traduzirValidacao('validacao.valorInvalido'))).toBe(
      'en:validacao.valorInvalido:{}',
    );
    expect(() =>
      comTradutorValidacao(ingles, () => {
        throw new Error('falha');
      }),
    ).toThrow('falha');
    expect(traduzirValidacao('validacao.valorInvalido')).toBe('Valor inválido');
  });
});

describe('mensagem codificada', () => {
  it('codifica e decodifica chave e parâmetros', () => {
    const texto = codificarMensagemValidacao({
      chave: 'validacao.obrigatorio',
      params: { campo: 'Nome' },
    });
    expect(decodificarMensagemValidacao(texto)).toEqual({
      chave: 'validacao.obrigatorio',
      params: { campo: 'Nome' },
    });
  });

  it('texto comum ou corrompido devolve null', () => {
    expect(decodificarMensagemValidacao('Nome é obrigatório.')).toBeNull();
    const codificado = codificarMensagemValidacao({ chave: 'x' });
    expect(decodificarMensagemValidacao(codificado.slice(0, -2))).toBeNull();
    expect(decodificarMensagemValidacao(codificado.replace('"x"', '1'))).toBeNull();
  });
});
