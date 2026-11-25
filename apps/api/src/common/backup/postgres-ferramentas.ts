import { spawn } from 'node:child_process';

export const PROCESSO_RUNNER = Symbol('PROCESSO_RUNNER');

/** Executa um programa externo (pg_dump, pg_restore, psql) e devolve a saída padrão. */
export interface ProcessoRunner {
  executar(comando: string, args: readonly string[], env: Record<string, string>): Promise<string>;
}

const LIMITE_SAIDA = 8 * 1024 * 1024;

/**
 * Roda o processo sem shell. A saída de erro é descartada de propósito: ela pode trazer trechos
 * de dados do banco (CLAUDE.md, seção 6). O chamador só recebe o código de saída.
 */
export class SpawnProcessoRunner implements ProcessoRunner {
  executar(comando: string, args: readonly string[], env: Record<string, string>): Promise<string> {
    return new Promise((resolve, reject) => {
      const filho = spawn(comando, [...args], {
        env: { ...process.env, ...env },
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const partes: Buffer[] = [];
      let tamanho = 0;
      filho.stdout.on('data', (pedaco: Buffer) => {
        tamanho += pedaco.length;
        if (tamanho <= LIMITE_SAIDA) partes.push(pedaco);
      });
      filho.on('error', () => reject(new Error(`${comando}: não foi possível executar`)));
      filho.on('close', (codigo) => {
        if (codigo === 0) resolve(Buffer.concat(partes).toString('utf8'));
        else reject(new Error(`${comando}: saiu com código ${codigo}`));
      });
    });
  }
}

export interface ConexaoPostgres {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

export function lerConexao(url: string): ConexaoPostgres {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port || '5432',
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.replace(/^\//, '')),
  };
}

/** A mesma URL apontando para outro banco do servidor. */
export function urlComBanco(url: string, banco: string): string {
  const u = new URL(url);
  u.pathname = `/${banco}`;
  u.search = '';
  return u.toString();
}

const NOME_BANCO_RESTAURACAO = /^torres_restore_\d{10,}$/;

const SQL_CONTAGEM = `SELECT table_name || ',' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1`;

/** Chamadas ao cliente do PostgreSQL (pg_dump, pg_restore, psql). A senha vai por variável de ambiente. */
export class PostgresFerramentas {
  constructor(private readonly runner: ProcessoRunner) {}

  private args(conexao: ConexaoPostgres): string[] {
    return ['-h', conexao.host, '-p', conexao.port, '-U', conexao.user];
  }

  private env(conexao: ConexaoPostgres): Record<string, string> {
    return { PGPASSWORD: conexao.password };
  }

  /** Dump em formato custom (`pg_restore` lê). Sem dono e sem privilégios: restaura em qualquer servidor. */
  async dump(url: string, arquivo: string): Promise<void> {
    const c = lerConexao(url);
    await this.runner.executar(
      'pg_dump',
      [...this.args(c), '-d', c.database, '-Fc', '--no-owner', '--no-privileges', '-f', arquivo],
      this.env(c),
    );
  }

  /** Quantidade de linhas por tabela do schema `public`. */
  async contarLinhas(url: string): Promise<Record<string, number>> {
    const c = lerConexao(url);
    const saida = await this.runner.executar(
      'psql',
      [...this.args(c), '-d', c.database, '-At', '-v', 'ON_ERROR_STOP=1', '-c', SQL_CONTAGEM],
      this.env(c),
    );
    const contagens: Record<string, number> = {};
    for (const linha of saida.split('\n')) {
      const posicao = linha.lastIndexOf(',');
      if (posicao <= 0) continue;
      contagens[linha.slice(0, posicao)] = Number(linha.slice(posicao + 1));
    }
    return contagens;
  }

  /** Cria o banco descartável da restauração de teste. Só aceita o nome gerado por nós. */
  async criarBanco(urlServidor: string, nome: string): Promise<void> {
    this.validarNome(nome);
    const c = lerConexao(urlServidor);
    await this.runner.executar(
      'psql',
      [
        ...this.args(c),
        '-d',
        c.database,
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        `CREATE DATABASE "${nome}"`,
      ],
      this.env(c),
    );
  }

  async removerBanco(urlServidor: string, nome: string): Promise<void> {
    this.validarNome(nome);
    const c = lerConexao(urlServidor);
    await this.runner.executar(
      'psql',
      [
        ...this.args(c),
        '-d',
        c.database,
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        `DROP DATABASE IF EXISTS "${nome}" WITH (FORCE)`,
      ],
      this.env(c),
    );
  }

  async restaurar(urlBanco: string, arquivo: string): Promise<void> {
    const c = lerConexao(urlBanco);
    this.validarNome(c.database);
    await this.runner.executar(
      'pg_restore',
      [
        ...this.args(c),
        '-d',
        c.database,
        '--no-owner',
        '--no-privileges',
        '--exit-on-error',
        arquivo,
      ],
      this.env(c),
    );
  }

  /** Impede que um nome fora do padrão (ex.: o banco de produção) chegue ao CREATE/DROP/restore. */
  private validarNome(nome: string): void {
    if (!NOME_BANCO_RESTAURACAO.test(nome)) throw new Error('Nome de banco de teste inválido');
  }
}
