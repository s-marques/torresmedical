import { randomUUID } from 'node:crypto';
import { toUsuarioAutenticado, type UsuarioComPermissoes } from './sessoes.service';

function usuario(
  perfil: Partial<NonNullable<UsuarioComPermissoes['perfil']>> | null,
  profissionalIds: string[] = [],
) {
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
    profissionais: profissionalIds.map((profissionalId) => ({ profissionalId })),
    perfil: perfil && {
      id: randomUUID(),
      nome: 'Recepção',
      descricao: null,
      escopoDados: 'TODOS',
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

describe('toUsuarioAutenticado: escopo de dados (issue #153)', () => {
  const PROF = randomUUID();

  it('perfil sem restrição vê todos, mesmo com vínculo', () => {
    expect(toUsuarioAutenticado(usuario({}, [PROF]), 's').escopo).toEqual({ tipo: 'TODOS' });
  });

  it('perfil restrito usa os profissionais vinculados', () => {
    expect(
      toUsuarioAutenticado(usuario({ escopoDados: 'PROFISSIONAIS_VINCULADOS' }, [PROF]), 's')
        .escopo,
    ).toEqual({ tipo: 'PROFISSIONAIS', profissionalIds: [PROF] });
  });

  it('perfil restrito sem vínculo não enxerga nenhum profissional', () => {
    expect(
      toUsuarioAutenticado(usuario({ escopoDados: 'PROFISSIONAIS_VINCULADOS' }), 's').escopo,
    ).toEqual({ tipo: 'PROFISSIONAIS', profissionalIds: [] });
  });

  it('perfil restrito inativo não concede permissão nem escopo', () => {
    const resultado = toUsuarioAutenticado(
      usuario({ escopoDados: 'PROFISSIONAIS_VINCULADOS', ativo: false }, [PROF]),
      's',
    );
    expect(resultado.permissoes.size).toBe(0);
    expect(resultado.escopo).toEqual({ tipo: 'TODOS' });
  });
});
