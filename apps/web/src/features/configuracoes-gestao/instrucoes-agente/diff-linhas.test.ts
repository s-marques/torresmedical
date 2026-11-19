import { describe, expect, it } from 'vitest';
import { diffLinhas } from './diff-linhas';

describe('diffLinhas', () => {
  it('marca linhas iguais, removidas e adicionadas na ordem', () => {
    expect(diffLinhas('a\nb\nc', 'a\nx\nc\nd')).toEqual([
      { tipo: 'igual', texto: 'a' },
      { tipo: 'removida', texto: 'b' },
      { tipo: 'adicionada', texto: 'x' },
      { tipo: 'igual', texto: 'c' },
      { tipo: 'adicionada', texto: 'd' },
    ]);
  });

  it('textos idênticos não geram diferenças', () => {
    expect(diffLinhas('a\nb', 'a\nb').every((l) => l.tipo === 'igual')).toBe(true);
  });

  it('texto removido por completo', () => {
    expect(diffLinhas('a', '')).toEqual([
      { tipo: 'removida', texto: 'a' },
      { tipo: 'adicionada', texto: '' },
    ]);
  });
});
