import { randomUUID } from 'node:crypto';
import { toUsuarioAutenticado, type UsuarioComPermissoes } from './sessoes.service';

function usuario(perfil: Partial<NonNullable<UsuarioComPermissoes['perfil']>> | null) {
  const agora = new Date();
  return {
    id: randomUUID(),
    empresaId: randomUUID(),
    perfilId: perfil ? randomUUID() : null,
    nome: 'Pessoa Teste',
    email: 'pessoa@example.com',
    telefone: null,
    senhaHash: 'hash',
    ativo: true,
    ultimoLoginEm: null,
    createdAt: agora,
    updatedAt: agora,
    deletedAt: null,
    perfil: perfil && {
      id: randomUUID(),
      nome: 'Recepção',
      descricao: null,
      ativo: true,
      createdAt: agora,
      updatedAt: agora,
      deletedAt: null,
      permissoes: [
        { permissao: 'financeiro.caixas.ver' },
        { permissao: 'permissao.fora.do-catalogo' },
      ],
      ...perfil,
    },
  } as UsuarioComPermissoes;
}

describe('toUsuarioAutenticado', () => {
  it('usa só as permissões do catálogo e nunca leva o hash da senha', () => {
    const resultado = toUsuarioAutenticado(usuario({}), 'sessao-1');

    expect([...resultado.permissoes]).toEqual(['financeiro.caixas.ver']);
    expect(resultado.sessaoId).toBe('sessao-1');
    expect(JSON.stringify(resultado)).not.toContain('hash');
  });

  it('perfil inativo, excluído ou ausente não concede permissões', () => {
    expect(toUsuarioAutenticado(usuario({ ativo: false }), 's').permissoes.size).toBe(0);
    expect(toUsuarioAutenticado(usuario({ deletedAt: new Date() }), 's').permissoes.size).toBe(0);
    const semPerfil = toUsuarioAutenticado(usuario(null), 's');
    expect(semPerfil.perfil).toBeNull();
    expect(semPerfil.permissoes.size).toBe(0);
  });
});
