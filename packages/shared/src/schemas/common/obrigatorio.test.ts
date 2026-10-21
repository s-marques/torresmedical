import { describe, expect, it } from 'vitest';
import { mensagemObrigatoria, textoObrigatorio } from './obrigatorio';

describe('mensagemObrigatoria', () => {
  it('concorda com o gênero do campo', () => {
    expect(mensagemObrigatoria('Nome')).toBe('Nome é obrigatório.');
    expect(mensagemObrigatoria('Sigla', 'f')).toBe('Sigla é obrigatória.');
  });
});

describe('textoObrigatorio', () => {
  it('apara os espaços e aceita texto preenchido', () => {
    expect(textoObrigatorio('Nome').parse('  Ana ')).toBe('Ana');
  });

  it('vazio, só espaços e ausente usam a mensagem padrão', () => {
    const schema = textoObrigatorio('Nome do serviço');
    for (const valor of ['', '   ', undefined]) {
      expect(schema.safeParse(valor).error?.issues[0]?.message).toBe(
        'Nome do serviço é obrigatório.',
      );
    }
  });

  it('limita o tamanho quando `max` é informado', () => {
    const schema = textoObrigatorio('Nome', { max: 3 });
    expect(schema.safeParse('abcd').error?.issues[0]?.message).toBe(
      'Nome deve ter no máximo 3 caracteres',
    );
    expect(schema.safeParse('abc').success).toBe(true);
  });
});
