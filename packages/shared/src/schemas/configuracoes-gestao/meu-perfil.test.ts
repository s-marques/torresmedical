import { describe, expect, it } from 'vitest';
import '../../zod-pt-br';
import { meuAvatarInputSchema, meuPerfilInputSchema } from './meu-perfil';
import { USUARIO_CARGO_MAX, USUARIO_NOME_MAX } from './usuario';

function mensagens(result: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return Object.fromEntries(
    (result.error?.issues ?? []).map((i) => [i.path.join('.') || '_', i.message]),
  );
}

describe('meuPerfilInputSchema', () => {
  const base = {
    nome: 'Maria Teste',
    email: 'maria@exemplo.com',
    telefone: '(65) 99999-8888',
    cargo: 'Administrador',
  };

  it('normaliza e-mail, telefone e cargo', () => {
    expect(
      meuPerfilInputSchema.parse({ ...base, email: ' Maria@Exemplo.COM ', cargo: '  ' }),
    ).toEqual({
      nome: 'Maria Teste',
      email: 'maria@exemplo.com',
      telefone: '65999998888',
      cargo: null,
    });
  });

  it('telefone e cargo são opcionais', () => {
    expect(meuPerfilInputSchema.parse({ nome: 'Ana', email: 'a@b.com' })).toEqual({
      nome: 'Ana',
      email: 'a@b.com',
      telefone: null,
      cargo: null,
    });
  });

  it('usa a mensagem padrão nos obrigatórios vazios', () => {
    expect(mensagens(meuPerfilInputSchema.safeParse({ ...base, nome: ' ', email: '' }))).toEqual({
      nome: 'Nome é obrigatório.',
      email: 'E-mail é obrigatório.',
    });
    expect(mensagens(meuPerfilInputSchema.safeParse({}))).toMatchObject({
      nome: 'Nome é obrigatório.',
      email: 'E-mail é obrigatório.',
    });
  });

  it('rejeita formatos e tamanhos inválidos', () => {
    expect(
      mensagens(
        meuPerfilInputSchema.safeParse({
          nome: 'x'.repeat(USUARIO_NOME_MAX + 1),
          email: 'sem-arroba',
          telefone: '123',
          cargo: 'c'.repeat(USUARIO_CARGO_MAX + 1),
        }),
      ),
    ).toEqual({
      nome: `Nome deve ter no máximo ${USUARIO_NOME_MAX} caracteres`,
      email: 'E-mail inválido',
      telefone: 'Telefone inválido',
      cargo: `Cargo deve ter no máximo ${USUARIO_CARGO_MAX} caracteres`,
    });
  });

  it('não aceita campos fora do formulário', () => {
    expect(meuPerfilInputSchema.safeParse({ ...base, perfilId: null }).success).toBe(false);
  });
});

describe('meuAvatarInputSchema', () => {
  it('aceita uuid ou null (remover)', () => {
    const id = '7f1c2a8e-5b9d-4f3e-8a6c-1d2e3f4a5b6c';
    expect(meuAvatarInputSchema.parse({ arquivoId: id })).toEqual({ arquivoId: id });
    expect(meuAvatarInputSchema.parse({ arquivoId: null })).toEqual({ arquivoId: null });
    expect(mensagens(meuAvatarInputSchema.safeParse({ arquivoId: 'x' }))).toEqual({
      arquivoId: 'Arquivo inválido',
    });
  });
});
