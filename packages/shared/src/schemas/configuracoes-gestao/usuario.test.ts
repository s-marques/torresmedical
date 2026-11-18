import { describe, expect, it } from 'vitest';
import {
  createUsuarioSchema,
  listUsuariosQuerySchema,
  resetarSenhaUsuarioSchema,
  updateUsuarioSchema,
} from './usuario';

function mensagens(resultado: { success: boolean; error?: { issues: { message: string }[] } }) {
  return resultado.error?.issues.map((i) => i.message);
}

describe('createUsuarioSchema', () => {
  const BASE = { nome: 'Carlos', email: 'carlos@example.com', senha: 'senha-123456' };

  it('aceita só os campos obrigatórios (Nome, Email e Senha), com os demais nulos', () => {
    expect(createUsuarioSchema.parse(BASE)).toEqual({
      nome: 'Carlos',
      email: 'carlos@example.com',
      senha: 'senha-123456',
      telefone: null,
      cargo: null,
      perfilId: null,
      verDadosSensiveis: false,
      profissionalIds: [],
    });
  });

  it('aceita um ou mais profissionais vinculados e descarta repetidos (issue #153)', () => {
    const a = '0b9f6f4e-1d6b-4f2a-9a43-6a0c2b1f8e01';
    const b = '5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
    expect(
      createUsuarioSchema.parse({ ...BASE, profissionalIds: [a, b, a] }).profissionalIds,
    ).toEqual([a, b]);
  });

  it('recusa profissional com id inválido', () => {
    expect(mensagens(createUsuarioSchema.safeParse({ ...BASE, profissionalIds: ['x'] }))).toEqual([
      'Profissional inválido',
    ]);
  });

  it('exige Nome, Email e Senha (confirmado pelo dev, issue #37)', () => {
    expect(mensagens(createUsuarioSchema.safeParse({}))).toEqual(
      expect.arrayContaining(['Nome é obrigatório.', 'Email é obrigatório.', 'Informe a senha']),
    );
  });

  it('email inválido e senha curta são recusados', () => {
    expect(
      createUsuarioSchema.safeParse({ ...BASE, email: 'invalido', senha: '123' }).success,
    ).toBe(false);
  });

  it('normaliza telefone e cargo vazios para null', () => {
    expect(createUsuarioSchema.parse({ ...BASE, telefone: '', cargo: '' })).toMatchObject({
      telefone: null,
      cargo: null,
    });
  });

  it('rejeita campos desconhecidos', () => {
    expect(createUsuarioSchema.safeParse({ ...BASE, role: 'ADMIN' }).success).toBe(false);
  });
});

describe('updateUsuarioSchema', () => {
  const BASE = { nome: 'Carlos', email: 'carlos@example.com' };

  it('não aceita o campo senha (troca só por "Resetar Senha")', () => {
    expect(updateUsuarioSchema.safeParse({ ...BASE, senha: 'senha-123456' }).success).toBe(false);
  });

  it('aceita status ativo/inativo, com padrão ativo', () => {
    expect(updateUsuarioSchema.parse(BASE).status).toBe('ativo');
    expect(updateUsuarioSchema.parse({ ...BASE, status: 'inativo' }).status).toBe('inativo');
  });
});

describe('resetarSenhaUsuarioSchema', () => {
  it('exige a senha nova com as mesmas regras de senhaNovaSchema', () => {
    expect(resetarSenhaUsuarioSchema.safeParse({ senha: '123' }).success).toBe(false);
    expect(resetarSenhaUsuarioSchema.parse({ senha: 'senha-123456' })).toEqual({
      senha: 'senha-123456',
    });
  });
});

describe('listUsuariosQuerySchema', () => {
  it('ordena por nome por padrão e restringe o sort', () => {
    expect(listUsuariosQuerySchema.parse({}).sort).toEqual({ field: 'nome', direction: 'asc' });
    expect(listUsuariosQuerySchema.safeParse({ sort: 'perfilId:asc' }).success).toBe(false);
  });
});
