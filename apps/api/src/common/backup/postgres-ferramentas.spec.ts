import {
  lerConexao,
  PostgresFerramentas,
  urlComBanco,
  type ProcessoRunner,
} from './postgres-ferramentas';

const URL_BANCO = 'postgresql://torres:s%40nha@postgres:5433/torres';

function runnerFalso(saida = '') {
  const chamadas: { comando: string; args: readonly string[]; env: Record<string, string> }[] = [];
  const runner: ProcessoRunner = {
    executar: (comando, args, env) => {
      chamadas.push({ comando, args, env });
      return Promise.resolve(saida);
    },
  };
  return { runner, chamadas };
}

describe('lerConexao e urlComBanco', () => {
  it('separa host, porta, usuário, senha (decodificada) e banco', () => {
    expect(lerConexao(URL_BANCO)).toEqual({
      host: 'postgres',
      port: '5433',
      user: 'torres',
      password: 's@nha',
      database: 'torres',
    });
  });

  it('assume a porta 5432 e troca só o banco', () => {
    expect(lerConexao('postgresql://u:p@h/db').port).toBe('5432');
    expect(lerConexao(urlComBanco(`${URL_BANCO}?schema=x`, 'outro')).database).toBe('outro');
    expect(urlComBanco(`${URL_BANCO}?schema=x`, 'outro')).not.toContain('schema');
  });
});

describe('PostgresFerramentas', () => {
  it('dump usa formato custom, sem dono, e passa a senha só por variável de ambiente', async () => {
    const { runner, chamadas } = runnerFalso();
    await new PostgresFerramentas(runner).dump(URL_BANCO, '/tmp/d');
    const [chamada] = chamadas;
    expect(chamada?.comando).toBe('pg_dump');
    expect(chamada?.args).toEqual(
      expect.arrayContaining(['-Fc', '--no-owner', '-d', 'torres', '-f', '/tmp/d']),
    );
    expect(chamada?.args.join(' ')).not.toContain('s@nha');
    expect(chamada?.env).toEqual({ PGPASSWORD: 's@nha' });
  });

  it('contarLinhas lê "tabela,quantidade" e ignora linhas vazias', async () => {
    const { runner } = runnerFalso('pacientes,12\nprisma_migrations,3\n\n');
    const contagens = await new PostgresFerramentas(runner).contarLinhas(URL_BANCO);
    expect(contagens).toEqual({ pacientes: 12, prisma_migrations: 3 });
  });

  it('cria, restaura e remove só o banco com o nome gerado pela restauração de teste', async () => {
    const { runner, chamadas } = runnerFalso();
    const pg = new PostgresFerramentas(runner);
    const nome = 'torres_restore_1764000000000';
    await pg.criarBanco(URL_BANCO, nome);
    await pg.restaurar(urlComBanco(URL_BANCO, nome), '/tmp/d');
    await pg.removerBanco(URL_BANCO, nome);
    expect(chamadas.map((c) => c.comando)).toEqual(['psql', 'pg_restore', 'psql']);
    expect(chamadas[0]?.args.join(' ')).toContain(`CREATE DATABASE "${nome}"`);
    expect(chamadas[2]?.args.join(' ')).toContain(`DROP DATABASE IF EXISTS "${nome}"`);
  });

  it('recusa criar, restaurar ou remover banco fora do padrão (ex.: o de produção)', async () => {
    const { runner, chamadas } = runnerFalso();
    const pg = new PostgresFerramentas(runner);
    await expect(pg.criarBanco(URL_BANCO, 'torres')).rejects.toThrow('inválido');
    await expect(pg.removerBanco(URL_BANCO, 'torres')).rejects.toThrow('inválido');
    await expect(pg.removerBanco(URL_BANCO, 'torres_restore_1; DROP')).rejects.toThrow('inválido');
    await expect(pg.restaurar(URL_BANCO, '/tmp/d')).rejects.toThrow('inválido');
    expect(chamadas).toHaveLength(0);
  });
});
