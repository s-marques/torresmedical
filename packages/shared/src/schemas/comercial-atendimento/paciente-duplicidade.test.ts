import { describe, expect, it } from 'vitest';
import '../../zod-pt-br';
import { pacienteInputSchema } from './paciente';
import { verificarDuplicidadePacienteSchema } from './paciente-duplicidade';

describe('verificarDuplicidadePacienteSchema', () => {
  it('aceita corpo vazio e normaliza a data vazia para null', () => {
    expect(verificarDuplicidadePacienteSchema.parse({})).toEqual({ dataNascimento: null });
    expect(verificarDuplicidadePacienteSchema.parse({ dataNascimento: '' })).toEqual({
      dataNascimento: null,
    });
  });

  it('apara o nome e mantém os demais campos', () => {
    expect(
      verificarDuplicidadePacienteSchema.parse({
        nome: '  Fulana de Tal ',
        email: 'fulana@exemplo.test',
        telefone: '(65) 3333-0002',
        dataNascimento: '1990-05-17',
      }),
    ).toEqual({
      nome: 'Fulana de Tal',
      email: 'fulana@exemplo.test',
      telefone: '(65) 3333-0002',
      dataNascimento: '1990-05-17',
    });
  });

  it('recusa data inválida, pacienteId que não é uuid e campo desconhecido', () => {
    expect(
      verificarDuplicidadePacienteSchema.safeParse({ dataNascimento: '17/05/1990' }).success,
    ).toBe(false);
    expect(verificarDuplicidadePacienteSchema.safeParse({ pacienteId: 'x' }).success).toBe(false);
    expect(verificarDuplicidadePacienteSchema.safeParse({ cpf: '1' }).success).toBe(false);
  });
});

describe('pacienteInputSchema: duplicidadeConfirmada', () => {
  it('é opcional e só aceita booleano', () => {
    expect(pacienteInputSchema.parse({ nome: 'Ana' }).duplicidadeConfirmada).toBeUndefined();
    expect(
      pacienteInputSchema.parse({ nome: 'Ana', duplicidadeConfirmada: true }).duplicidadeConfirmada,
    ).toBe(true);
    expect(
      pacienteInputSchema.safeParse({ nome: 'Ana', duplicidadeConfirmada: 'sim' }).success,
    ).toBe(false);
  });
});
