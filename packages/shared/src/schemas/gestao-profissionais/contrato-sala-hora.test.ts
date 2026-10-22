import { describe, expect, it } from 'vitest';
import {
  createContratoHoraSchema,
  formatarDuracao,
  listContratoHorasQuerySchema,
  minutosEntre,
  valorDasHoras,
} from './contrato-sala-hora';

const BASE = { data: '2026-10-21', entrada: '08:00', saida: '09:30' };

function mensagens(entrada: unknown) {
  const resultado = createContratoHoraSchema.safeParse(entrada);
  return resultado.success
    ? []
    : resultado.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

describe('contratoHoraInputSchema', () => {
  it('normaliza a observação vazia para null', () => {
    expect(createContratoHoraSchema.parse({ ...BASE, observacao: '  ' })).toEqual({
      ...BASE,
      observacao: null,
    });
    expect(createContratoHoraSchema.parse({ ...BASE, observacao: ' Retorno ' }).observacao).toBe(
      'Retorno',
    );
  });

  it('mensagens dos obrigatórios em português', () => {
    expect(mensagens({})).toEqual(
      expect.arrayContaining([
        'data: Data é obrigatória.',
        'entrada: Hora de entrada é obrigatória.',
        'saida: Hora de saída é obrigatória.',
      ]),
    );
    expect(mensagens({ ...BASE, entrada: '8h' })).toContain('entrada: Hora de entrada inválida');
  });

  it('a saída deve ser depois da entrada', () => {
    expect(mensagens({ ...BASE, saida: '08:00' })).toContain(
      'saida: A saída deve ser depois da entrada',
    );
    expect(mensagens({ ...BASE, saida: '07:00' })).toContain(
      'saida: A saída deve ser depois da entrada',
    );
  });

  it('limita a observação e rejeita campo fora do formulário', () => {
    expect(mensagens({ ...BASE, observacao: 'x'.repeat(301) })).toContain(
      'observacao: A observação deve ter no máximo 300 caracteres',
    );
    expect(createContratoHoraSchema.safeParse({ ...BASE, contratoId: 'x' }).success).toBe(false);
  });
});

describe('listContratoHorasQuerySchema', () => {
  it('aceita AAAA-MM e rejeita o resto', () => {
    expect(listContratoHorasQuerySchema.parse({ mes: '2026-10' })).toEqual({ mes: '2026-10' });
    expect(listContratoHorasQuerySchema.safeParse({ mes: '2026-13' }).success).toBe(false);
    expect(listContratoHorasQuerySchema.safeParse({}).success).toBe(false);
  });
});

describe('helpers de horas', () => {
  it('calcula e formata a duração', () => {
    expect(minutosEntre('08:00', '09:30')).toBe(90);
    expect(minutosEntre('09:00', '08:00')).toBe(0);
    expect(formatarDuracao(90)).toBe('1h30');
    expect(formatarDuracao(120)).toBe('2h');
    expect(formatarDuracao(45)).toBe('0h45');
    expect(formatarDuracao(0)).toBe('0h');
  });

  it('calcula o valor das horas em centavos exatos', () => {
    expect(valorDasHoras(240, 87.5)).toBe(350);
    expect(valorDasHoras(90, 87.5)).toBe(131.25);
    expect(valorDasHoras(20, 100)).toBe(33.33);
    expect(valorDasHoras(0, 87.5)).toBe(0);
  });
});
