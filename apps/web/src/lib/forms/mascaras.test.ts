import { describe, expect, it } from 'vitest';
import {
  apenasDigitos,
  digitosDaMascara,
  formatarMascara,
  formatarMoeda,
  moedaDoTexto,
  type TipoMascara,
} from './mascaras';

describe('máscaras', () => {
  it('remove tudo que não é dígito', () => {
    expect(apenasDigitos('(65) 9.1-a')).toBe('6591');
  });

  // [tipo, dígitos, formatado]
  const casos: [TipoMascara, string, string][] = [
    ['cpf', '12345678901', '123.456.789-01'],
    ['cpf', '1234', '123.4'],
    ['cnpj', '12345678000195', '12.345.678/0001-95'],
    ['cpf-cnpj', '12345678901', '123.456.789-01'],
    ['cpf-cnpj', '123456780001', '12.345.678/0001'],
    ['telefone', '6533334444', '(65) 3333-4444'],
    ['telefone', '65999998888', '(65) 99999-8888'],
    ['telefone', '65', '(65'],
    ['cep', '78000123', '78000-123'],
  ];

  it.each(casos)('%s: %s → %s', (tipo, digitos, formatado) => {
    expect(formatarMascara(tipo, digitos)).toBe(formatado);
  });

  it('formata vazio e limita os dígitos digitados', () => {
    expect(formatarMascara('cpf', null)).toBe('');
    expect(digitosDaMascara('cep', '78.000-1234')).toBe('78000123');
  });
});

describe('moeda', () => {
  it('formata em reais', () => {
    expect(formatarMoeda(1234.5)).toMatch(/^R\$\s1\.234,50$/);
    expect(formatarMoeda(null)).toBe('');
  });

  it('lê os dígitos como centavos', () => {
    expect(moedaDoTexto('1')).toBe(0.01);
    expect(moedaDoTexto('R$ 1.234,56')).toBe(1234.56);
    expect(moedaDoTexto('R$ 0,00')).toBe(0);
    expect(moedaDoTexto('')).toBeNull();
  });
});
