import { describe, expect, it } from 'vitest';
import {
  esqueciSenhaSchema,
  loginSchema,
  redefinirSenhaFormSchema,
  redefinirSenhaSchema,
  sessaoSchema,
} from './auth';
import { PREFERENCIAS_PADRAO } from '../configuracoes-gestao/preferencias';

function mensagens(resultado: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return Object.fromEntries(
    (resultado.error?.issues ?? []).map((issue) => [issue.path.join('.'), issue.message]),
  );
}

describe('loginSchema', () => {
  it('normaliza o e-mail', () => {
    expect(loginSchema.parse({ email: '  Pessoa@Example.COM ', senha: 'x' })).toEqual({
      email: 'pessoa@example.com',
      senha: 'x',
    });
  });

  it('exige e-mail válido e senha', () => {
    expect(mensagens(loginSchema.safeParse({}))).toEqual({
      email: 'Informe o e-mail',
      senha: 'Informe a senha',
    });
    expect(mensagens(loginSchema.safeParse({ email: ' ', senha: '' }))).toEqual({
      email: 'Informe o e-mail',
      senha: 'Informe a senha',
    });
    expect(mensagens(loginSchema.safeParse({ email: 'nao-e-email', senha: 'x' }))).toEqual({
      email: 'E-mail inválido',
    });
  });

  it('recusa campos extras', () => {
    expect(loginSchema.safeParse({ email: 'a@example.com', senha: 'x', admin: true }).success).toBe(
      false,
    );
  });
});

describe('redefinição de senha', () => {
  it('exige senha com no mínimo 8 caracteres, letras e números', () => {
    expect(mensagens(redefinirSenhaSchema.safeParse({ token: 't', senha: 'a1' }))).toEqual({
      senha: 'A senha deve ter no mínimo 8 caracteres',
    });
    expect(
      mensagens(redefinirSenhaSchema.safeParse({ token: 't', senha: 'somenteletras' })),
    ).toEqual({ senha: 'A senha deve ter letras e números' });
    expect(mensagens(redefinirSenhaSchema.safeParse({ token: 't', senha: '12345678' }))).toEqual({
      senha: 'A senha deve ter letras e números',
    });
    expect(redefinirSenhaSchema.safeParse({ token: 't', senha: 'senhaboa1' }).success).toBe(true);
  });

  it('exige o token', () => {
    expect(mensagens(redefinirSenhaSchema.safeParse({ token: '', senha: 'senhaboa1' }))).toEqual({
      token: 'Link de redefinição inválido',
    });
  });

  it('confere a confirmação no formulário', () => {
    expect(
      mensagens(
        redefinirSenhaFormSchema.safeParse({ senha: 'senhaboa1', confirmacao: 'outra1234' }),
      ),
    ).toEqual({ confirmacao: 'As senhas não conferem' });
    expect(
      redefinirSenhaFormSchema.safeParse({ senha: 'senhaboa1', confirmacao: 'senhaboa1' }).success,
    ).toBe(true);
  });

  it('esqueci a senha só pede o e-mail', () => {
    expect(esqueciSenhaSchema.parse({ email: 'A@EXAMPLE.COM' })).toEqual({
      email: 'a@example.com',
    });
  });
});

describe('sessaoSchema', () => {
  it('valida a sessão e as permissões pelo catálogo', () => {
    const base = {
      accessToken: 'jwt',
      expiraEm: '2026-10-15T12:15:00.000Z',
      usuario: {
        id: '00000000-0000-4000-8000-000000000001',
        nome: 'Pessoa Teste',
        email: 'pessoa@example.com',
        perfil: null,
        permissoes: ['financeiro.caixas.ver'],
        avatarArquivoId: null,
        preferencias: PREFERENCIAS_PADRAO,
      },
    };
    expect(sessaoSchema.safeParse(base).success).toBe(true);
    expect(
      sessaoSchema.safeParse({ ...base, usuario: { ...base.usuario, permissoes: ['x.y.z'] } })
        .success,
    ).toBe(false);
  });
});
