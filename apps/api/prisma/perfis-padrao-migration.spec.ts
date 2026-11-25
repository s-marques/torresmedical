import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isPermissao,
  PERFIL_ADMINISTRADOR,
  PERFIS_PADRAO,
  PERFIS_SEM_ACESSO_CLINICO,
  PERMISSOES_CLINICAS,
  permissoesDoPerfilPadrao,
} from '@torres/shared';

/**
 * Garante que a migration dos perfis padrão (issue #154) segue a definição de `packages/shared`:
 * Recepção, Comercial e Financeiro nunca recebem permissão clínica, nem por SQL.
 */
const PASTA = join(__dirname, 'migrations');
const pasta = readdirSync(PASTA).find((nome) => nome.endsWith('_perfis_padrao'));
const sql = readFileSync(join(PASTA, pasta ?? '', 'migration.sql'), 'utf8');

const PARES = /^\s*\('([^']+)', '([^']+)'\),?$/gm;

function permissoesNoSql(): Map<string, string[]> {
  const porPerfil = new Map<string, string[]>();
  const bloco = sql.slice(sql.indexOf('INSERT INTO "perfis_permissoes"'));
  for (const [, perfil = '', permissao = ''] of bloco.matchAll(PARES)) {
    porPerfil.set(perfil, [...(porPerfil.get(perfil) ?? []), permissao]);
  }
  return porPerfil;
}

describe('migration perfis_padrao', () => {
  const noSql = permissoesNoSql();

  it('existe e traz os 6 perfis', () => {
    expect(pasta).toBeDefined();
    expect([...noSql.keys()].sort()).toEqual(PERFIS_PADRAO.map((p) => p.nome).sort());
  });

  it.each(PERFIS_PADRAO.filter((p) => p.nome !== PERFIL_ADMINISTRADOR))(
    '$nome: as permissões do SQL são as da definição',
    (perfil) => {
      expect((noSql.get(perfil.nome) ?? []).sort()).toEqual(
        permissoesDoPerfilPadrao(perfil).sort(),
      );
    },
  );

  it('o Administrador recebe só permissões válidas do catálogo', () => {
    const permissoes = noSql.get(PERFIL_ADMINISTRADOR) ?? [];
    expect(permissoes.length).toBeGreaterThan(0);
    expect(permissoes.every((permissao) => isPermissao(permissao))).toBe(true);
  });

  it.each(PERFIS_SEM_ACESSO_CLINICO)('%s não recebe permissão clínica no SQL', (nome) => {
    const clinicas = (noSql.get(nome) ?? []).filter((p) =>
      (PERMISSOES_CLINICAS as readonly string[]).includes(p),
    );
    expect(clinicas).toEqual([]);
  });
});
