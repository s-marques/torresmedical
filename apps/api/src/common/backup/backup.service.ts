import { Inject, Injectable, Logger, Optional, type OnApplicationBootstrap } from '@nestjs/common';
import type { BackupExecucao, BackupErro, BackupOrigem, BackupTipo } from '@torres/shared';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Prisma } from '../../generated/prisma/client';
import { BusinessException } from '../errors/api.exception';
import { BackupAlertaService } from './backup-alerta.service';
import { criptografarArquivo, descriptografarArquivo, sha256Arquivo } from './backup-cripto';
import { BACKUP_DESTINO, type DestinoBackup } from './backup-destino';
import { BackupFalha, codigoDoErro } from './backup-erro';
import { BackupRegistroService, type DadosConclusao } from './backup-registro.service';
import { carimboDaData, dataDaChave, selecionarExpirados } from './backup-retencao';
import { BACKUP_CONFIG, type BackupConfig } from './backup.config';
import { PostgresFerramentas, urlComBanco } from './postgres-ferramentas';

/** Armazenamento de arquivos de produção (MinIO/S3), de onde os anexos são copiados. */
export const BACKUP_ORIGEM_ARQUIVOS = Symbol('BACKUP_ORIGEM_ARQUIVOS');

const PREFIXO_DUMPS = 'postgres/';
const PREFIXO_ARQUIVOS = 'arquivos/';
const SUFIXO_DUMP = '.dump.enc';
const SUFIXO_MANIFESTO = '.manifest.json';

/** Faixa [mínimo, máximo] de linhas de uma tabela durante o dump (o sistema segue gravando). */
type FaixaLinhas = [number, number];

interface Manifesto {
  versao: 1;
  criadoEm: string;
  chaveDump: string;
  sha256: string;
  tamanhoBytes: number;
  tabelas: Record<string, FaixaLinhas>;
}

export interface ExecucaoDisparada {
  execucao: BackupExecucao;
  /** Resolve quando o job termina (nunca rejeita: a falha vai para o registro e o alerta). */
  concluida: Promise<void>;
}

/**
 * Backup do PostgreSQL e dos arquivos do storage, cifrado e enviado a um destino fora do servidor,
 * mais a restauração de teste que prova que o backup volta (issue #157, R §40). Uma execução por
 * vez; cada uma deixa um registro em `backup_execucoes` e, se falhar, um alerta.
 */
@Injectable()
export class BackupService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BackupService.name);
  private rodando = false;

  constructor(
    @Inject(BACKUP_CONFIG) private readonly config: BackupConfig,
    private readonly registro: BackupRegistroService,
    private readonly alerta: BackupAlertaService,
    private readonly pg: PostgresFerramentas,
    @Optional() @Inject(BACKUP_DESTINO) private readonly destino: DestinoBackup | null,
    @Optional()
    @Inject(BACKUP_ORIGEM_ARQUIVOS)
    private readonly origemArquivos: DestinoBackup | null,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const pendentes = await this.registro.encerrarPendentes();
      if (pendentes > 0)
        this.logger.warn({ pendentes }, 'Execuções interrompidas marcadas como falha');
    } catch (erro) {
      this.logger.error(
        { erro: nomeDoErro(erro) },
        'Não foi possível encerrar execuções pendentes',
      );
    }
  }

  get ativo(): boolean {
    return this.config.ativo && this.destino !== null;
  }

  /** Registra a execução e roda o job em segundo plano. Só uma por vez. */
  async disparar(
    tipo: BackupTipo,
    origem: BackupOrigem,
    usuarioId?: string,
  ): Promise<ExecucaoDisparada> {
    if (!this.ativo) {
      throw new BusinessException(
        'BACKUP_DESATIVADO',
        'O backup está desativado neste ambiente (BACKUP_ATIVO)',
      );
    }
    if (this.rodando) {
      throw new BusinessException(
        'BACKUP_JA_EXECUTANDO',
        'Já existe um backup ou uma restauração de teste em andamento',
        { status: 409 },
      );
    }
    this.rodando = true;
    let execucao: BackupExecucao;
    try {
      execucao = await this.registro.iniciar(tipo, origem, usuarioId);
    } catch (erro) {
      this.rodando = false;
      throw erro;
    }
    const concluida = this.processar(execucao.id, tipo).finally(() => {
      this.rodando = false;
    });
    return { execucao, concluida };
  }

  private async processar(id: string, tipo: BackupTipo): Promise<void> {
    let pasta: string | undefined;
    try {
      pasta = await mkdtemp(join(tmpdir(), 'torres-backup-'));
      const dados =
        tipo === 'BACKUP' ? await this.backup(pasta) : await this.restauracaoTeste(pasta);
      await this.registro.concluir(id, dados);
    } catch (erro) {
      const codigo = codigoDoErro(erro);
      this.logger.error(
        { execucaoId: id, tipo, codigo, erro: nomeDoErro(erro) },
        'Execução falhou',
      );
      await this.registrarFalha(id, tipo, codigo, erro);
    } finally {
      if (pasta) await rm(pasta, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async registrarFalha(
    id: string,
    tipo: BackupTipo,
    codigo: BackupErro,
    erro: unknown,
  ): Promise<void> {
    try {
      const detalhes = erro instanceof BackupFalha ? erro.detalhes : undefined;
      await this.registro.falhar(id, codigo, detalhes as Prisma.InputJsonValue | undefined);
    } catch (erroRegistro) {
      this.logger.error({ erro: nomeDoErro(erroRegistro) }, 'Não foi possível gravar a falha');
    }
    await this.alerta.falha(tipo, codigo, id);
  }

  /** Roda uma etapa e troca qualquer erro por um código estável (sem vazar mensagem). */
  private async etapa<T>(codigo: BackupErro, passo: () => Promise<T>): Promise<T> {
    try {
      return await passo();
    } catch (erro) {
      if (erro instanceof BackupFalha) throw erro;
      this.logger.error({ codigo, erro: nomeDoErro(erro) }, 'Etapa do backup falhou');
      throw new BackupFalha(codigo);
    }
  }

  // ---------------------------------------------------------------- backup

  private async backup(pasta: string): Promise<DadosConclusao> {
    const destino = this.destinoObrigatorio();
    const { databaseUrl, chave } = this.config;
    await this.etapa('BACKUP_ENVIO_FALHOU', () => destino.preparar());

    const carimbo = carimboDaData(new Date());
    const chaveDump = `${PREFIXO_DUMPS}torres-${carimbo}${SUFIXO_DUMP}`;
    const chaveManifesto = `${PREFIXO_DUMPS}torres-${carimbo}${SUFIXO_MANIFESTO}`;
    const dump = join(pasta, 'dump');
    const cifrado = join(pasta, 'dump.enc');

    const antes = await this.etapa('BACKUP_DUMP_FALHOU', () => this.pg.contarLinhas(databaseUrl));
    await this.etapa('BACKUP_DUMP_FALHOU', async () => {
      await this.pg.dump(databaseUrl, dump);
      await criptografarArquivo(dump, cifrado, chave);
    });
    const depois = await this.etapa('BACKUP_DUMP_FALHOU', () => this.pg.contarLinhas(databaseUrl));
    await rm(dump, { force: true });

    const sha256 = await sha256Arquivo(cifrado);
    const { size } = await stat(cifrado);
    const manifesto: Manifesto = {
      versao: 1,
      criadoEm: new Date().toISOString(),
      chaveDump,
      sha256,
      tamanhoBytes: size,
      tabelas: faixas(antes, depois),
    };
    const arquivoManifesto = join(pasta, 'manifesto.json');
    await writeFile(arquivoManifesto, JSON.stringify(manifesto));

    await this.etapa('BACKUP_ENVIO_FALHOU', async () => {
      await destino.enviar(chaveDump, cifrado, 'application/octet-stream');
      await destino.enviar(chaveManifesto, arquivoManifesto, 'application/json');
    });
    await rm(cifrado, { force: true });

    const arquivosCopiados = await this.etapa('BACKUP_ARQUIVOS_FALHOU', () =>
      this.copiarArquivos(pasta),
    );
    const retencao = await this.aplicarRetencao();

    return {
      tamanhoBytes: size,
      arquivosCopiados: arquivosCopiados.copiados,
      checksum: sha256,
      destinoChave: chaveDump,
      detalhes: {
        tabelas: Object.keys(manifesto.tabelas).length,
        arquivosNoStorage: arquivosCopiados.total,
        dumpsRemovidosPelaRetencao: retencao,
      },
    };
  }

  /** Copia (cifrados) os arquivos do storage que ainda não estão no destino. Os anexos não mudam. */
  private async copiarArquivos(pasta: string): Promise<{ copiados: number; total: number }> {
    const destino = this.destinoObrigatorio();
    if (!this.origemArquivos) return { copiados: 0, total: 0 };
    const origem = await this.origemArquivos.listar('');
    const existentes = new Set((await destino.listar(PREFIXO_ARQUIVOS)).map((o) => o.chave));
    const bruto = join(pasta, 'arquivo');
    const cifrado = join(pasta, 'arquivo.enc');
    let copiados = 0;
    for (const objeto of origem) {
      const chaveDestino = `${PREFIXO_ARQUIVOS}${objeto.chave}.enc`;
      if (existentes.has(chaveDestino)) continue;
      await this.origemArquivos.baixar(objeto.chave, bruto);
      await criptografarArquivo(bruto, cifrado, this.config.chave);
      await destino.enviar(chaveDestino, cifrado, 'application/octet-stream');
      await rm(bruto, { force: true });
      await rm(cifrado, { force: true });
      copiados += 1;
    }
    return { copiados, total: origem.length };
  }

  /** Apaga os dumps fora da política de retenção. Falha aqui não invalida o backup que acabou de sair. */
  private async aplicarRetencao(): Promise<number | null> {
    try {
      const destino = this.destinoObrigatorio();
      const dumps = (await destino.listar(PREFIXO_DUMPS))
        .filter((o) => o.chave.endsWith(SUFIXO_DUMP))
        .flatMap((o) => {
          const data = dataDaChave(o.chave);
          return data ? [{ chave: o.chave, data }] : [];
        });
      const expirados = selecionarExpirados(dumps, this.config.retencao);
      if (expirados.length === 0) return 0;
      await destino.apagar(
        expirados.flatMap((c) => [c, c.slice(0, -SUFIXO_DUMP.length) + SUFIXO_MANIFESTO]),
      );
      return expirados.length;
    } catch (erro) {
      this.logger.error({ erro: nomeDoErro(erro) }, 'Falha ao aplicar a retenção dos backups');
      return null;
    }
  }

  // ---------------------------------------------------- restauração de teste

  /**
   * Baixa o dump mais recente, confere o checksum, decifra, restaura num banco descartável e
   * compara as contagens com o manifesto. O banco de teste é sempre removido no fim.
   */
  private async restauracaoTeste(pasta: string): Promise<DadosConclusao> {
    const destino = this.destinoObrigatorio();
    const { chave, databaseUrl } = this.config;

    const dumps = (await this.etapa('RESTAURACAO_FALHOU', () => destino.listar(PREFIXO_DUMPS)))
      .filter((o) => o.chave.endsWith(SUFIXO_DUMP))
      .sort((a, b) => b.chave.localeCompare(a.chave));
    const ultimo = dumps[0];
    if (!ultimo) throw new BackupFalha('RESTAURACAO_SEM_BACKUP');

    const cifrado = join(pasta, 'dump.enc');
    const dump = join(pasta, 'dump');
    const arquivoManifesto = join(pasta, 'manifesto.json');
    const manifesto = await this.etapa('RESTAURACAO_FALHOU', async () => {
      await destino.baixar(
        ultimo.chave.slice(0, -SUFIXO_DUMP.length) + SUFIXO_MANIFESTO,
        arquivoManifesto,
      );
      await destino.baixar(ultimo.chave, cifrado);
      return JSON.parse(await readFile(arquivoManifesto, 'utf8')) as Manifesto;
    });
    if ((await sha256Arquivo(cifrado)) !== manifesto.sha256) {
      throw new BackupFalha('RESTAURACAO_CHECKSUM_DIVERGENTE');
    }
    await this.etapa('RESTAURACAO_FALHOU', () => descriptografarArquivo(cifrado, dump, chave));

    const servidor = this.config.restauracaoUrl ?? urlComBanco(databaseUrl, 'postgres');
    const nome = `torres_restore_${Date.now()}`;
    const urlTeste = urlComBanco(servidor, nome);
    let divergentes: string[];
    let tabelasConferidas: number;
    try {
      await this.etapa('RESTAURACAO_FALHOU', async () => {
        await this.pg.criarBanco(servidor, nome);
        await this.pg.restaurar(urlTeste, dump);
      });
      const restauradas = await this.etapa('RESTAURACAO_FALHOU', () =>
        this.pg.contarLinhas(urlTeste),
      );
      divergentes = Object.entries(manifesto.tabelas)
        .filter(([tabela, [minimo, maximo]]) => {
          const linhas = restauradas[tabela];
          return linhas === undefined || linhas < minimo || linhas > maximo;
        })
        .map(([tabela]) => tabela);
      tabelasConferidas = Object.keys(manifesto.tabelas).length;
    } finally {
      await this.pg.removerBanco(servidor, nome).catch((erro: unknown) => {
        this.logger.error({ erro: nomeDoErro(erro) }, 'Não foi possível remover o banco de teste');
      });
    }
    if (divergentes.length > 0) {
      throw new BackupFalha('RESTAURACAO_CONTAGEM_DIVERGENTE', {
        tabelasConferidas,
        tabelasDivergentes: divergentes,
      });
    }

    const arquivoAmostra = await this.etapa('RESTAURACAO_FALHOU', () =>
      this.conferirAmostra(pasta),
    );
    return {
      checksum: manifesto.sha256,
      destinoChave: ultimo.chave,
      tamanhoBytes: manifesto.tamanhoBytes,
      detalhes: { tabelasConferidas, tabelasDivergentes: [], arquivoAmostra },
    };
  }

  /** Baixa e decifra um arquivo copiado, para provar que os anexos também voltam. */
  private async conferirAmostra(pasta: string): Promise<'ok' | 'nenhum'> {
    const destino = this.destinoObrigatorio();
    const [amostra] = await destino.listar(PREFIXO_ARQUIVOS);
    if (!amostra) return 'nenhum';
    const cifrado = join(pasta, 'amostra.enc');
    await destino.baixar(amostra.chave, cifrado);
    await descriptografarArquivo(cifrado, join(pasta, 'amostra'), this.config.chave);
    return 'ok';
  }

  private destinoObrigatorio(): DestinoBackup {
    if (!this.destino) throw new BackupFalha('BACKUP_SEM_DESTINO');
    return this.destino;
  }
}

function faixas(antes: Record<string, number>, depois: Record<string, number>) {
  const tabelas: Record<string, FaixaLinhas> = {};
  for (const [tabela, linhasAntes] of Object.entries(antes)) {
    const linhasDepois = depois[tabela] ?? linhasAntes;
    tabelas[tabela] = [Math.min(linhasAntes, linhasDepois), Math.max(linhasAntes, linhasDepois)];
  }
  return tabelas;
}

/** Só o nome do erro vai para o log: a mensagem pode trazer trechos de dados. */
function nomeDoErro(erro: unknown): string {
  return erro instanceof Error ? erro.name : 'Erro';
}
