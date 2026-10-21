import { describe, expect, it } from 'vitest';
import { createBandeiraSchema } from './bandeira';

describe('createBandeiraSchema', () => {
  it('aplica o ícone padrão do modal "Nova Bandeira"', () => {
    expect(createBandeiraSchema.parse({ nome: '  Visa ' })).toEqual({
      nome: 'Visa',
      icone: 'fa-credit-card',
    });
  });

  it('ícone vazio volta ao padrão e aceita classes FontAwesome', () => {
    expect(createBandeiraSchema.parse({ nome: 'Elo', icone: '' }).icone).toBe('fa-credit-card');
    expect(createBandeiraSchema.parse({ nome: 'Visa', icone: 'fa-cc-visa' }).icone).toBe(
      'fa-cc-visa',
    );
  });

  it('exige o nome e rejeita ícone com formato inválido', () => {
    const vazio = createBandeiraSchema.safeParse({ nome: '' });
    expect(vazio.error?.issues.map((i) => i.message)).toEqual(['Nome é obrigatório.']);
    expect(createBandeiraSchema.safeParse({ nome: 'X', icone: 'fa credit' }).success).toBe(false);
  });
});
