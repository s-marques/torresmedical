import type { BackupExecucao, BackupOrigem, BackupTipo } from '@torres/shared';
import { readFile, writeFile } from 'node:fs/promises';
import type { BackupAlertaService } from './backup-alerta.service';
import type { DestinoBackup, ObjetoDestino } from './backup-destino';
import type { BackupRegistroService, DadosConclusao } from './backup-registro.service';
import type { BackupConfig } from './backup.config';
import { BackupService } from './backup.service';
import { PostgresFerramentas, type ProcessoRunner } from './postgres-ferramentas';

const CONFIG: BackupConfig = {
  ativo: true,
  chave: 'frase-de-teste-com-mais-de-trinta-e-dois-caracteres',
  retencao: { diarios: 2, semanais: 0, mensais: 0 },
  databaseUrl: 'postgresql://torres:senha@postgres:5432/torres',
  destino: {
    bucket: 'b',
    region: 'r',
    accessKeyId: 'a',
    secretAccessKey: 's',
    prefixo: '',
  },
};

/** Armazenamento em memória que imita o S3 (destino e origem dos arquivos). */
class MemoriaS3 implements DestinoBackup {
  readonly objetos = new Map<string, Buffer>();
  falharEnvio = false;

  preparar(): Promise<void> {
    return Promise.resolve();
  }
  async enviar(chave: string, arquivo: string): Promise<void> {
    if (this.falharEnvio) throw new Error('rede fora');
    this.objetos.set(chave, await readFile(arquivo));
  }
  async baixar(chave: string, arquivo: string): Promise<void> {
    const conteudo = this.objetos.get(chave);
    if (!conteudo) throw new Error('não existe');
    await writeFile(arquivo, conteudo);
  }
  listar(prefixo: string): Promise<ObjetoDestino[]> {
    return Promise.resolve(
      [...this.objetos.entries()]
        .filter(([chave]) => chave.startsWith(prefixo))
        .map(([chave, conteudo]) => ({ chave, tamanho: conteudo.length })),
    );
  }
  apagar(chaves: readonly string[]): Promise<void> {
    for (const chave of chaves) this.objetos.delete(chave);
    return Promise.resolve();
  }
}

class RegistroFalso {
  linhas: BackupExecucao[] = [];
  conclusoes: DadosConclusao[] = [];
  falhas: { codigo: string; detalhes: unknown }[] = [];

  iniciar(tipo: BackupTipo, origem: BackupOrigem): Promise<BackupExecucao> {
    const execucao: BackupExecucao = {
      id: `id-${this.linhas.length + 1}`,
      tipo,
      status: 'EXECUTANDO',
      origem,
      iniciadoEm: new Date().toISOString(),
      finalizadoEm: null,
      tamanhoBytes: null,
      arquivosCopiados: 0,
      checksum: null,
      destinoChave: null,
      erroCodigo: null,
      detalhes: null,
    };
    this.linhas.push(execucao);
    return Promise.resolve(execucao);
  }
  concluir(_id: string, dados: DadosConclusao): Promise<BackupExecucao> {
    this.conclusoes.push(dados);
    return Promise.resolve({} as BackupExecucao);
  }
  falhar(_id: string, codigo: string, detalhes?: unknown): Promise<BackupExecucao> {
    this.falhas.push({ codigo, detalhes });
    return Promise.resolve({} as BackupExecucao);
  }
  encerrarPendentes = jest.fn().mockResolvedValue(0);
}

interface Cenario {
  service: BackupService;
  destino: MemoriaS3;
  origem: MemoriaS3;
  registro: RegistroFalso;
  alerta: { falha: jest.Mock };
  chamadas: { comando: string; args: readonly string[] }[];
  /** Linhas por tabela devolvidas pelo `psql`, na ordem das chamadas de contagem. */
  contagens: string[];
  falharComando: Set<string>;
}

function montar(config: BackupConfig = CONFIG, comOrigem = true): Cenario {
  const destino = new MemoriaS3();
  const origem = new MemoriaS3();
  const registro = new RegistroFalso();
  const alerta = { falha: jest.fn().mockResolvedValue(undefined) };
  const chamadas: Cenario['chamadas'] = [];
  const contagens = ['pacientes,10\nagenda,5', 'pacientes,10\nagenda,6', 'pacientes,10\nagenda,5'];
  const falharComando = new Set<string>();
  const runner: ProcessoRunner = {
    async executar(comando, args) {
      chamadas.push({ comando, args });
      if (falharComando.has(comando)) throw new Error('boom com dado secreto');
      if (comando === 'pg_dump') {
        await writeFile(args[args.indexOf('-f') + 1] as string, 'conteudo-do-dump');
        return '';
      }
      if (comando === 'psql' && args.join(' ').includes('information_schema')) {
        return contagens.shift() ?? '';
      }
      return '';
    },
  };
  const service = new BackupService(
    config,
    registro as unknown as BackupRegistroService,
    alerta as unknown as BackupAlertaService,
    new PostgresFerramentas(runner),
    destino,
    comOrigem ? origem : null,
  );
  return { service, destino, origem, registro, alerta, chamadas, contagens, falharComando };
}

async function rodar(c: Cenario, tipo: BackupTipo): Promise<void> {
  const { concluida } = await c.service.disparar(tipo, 'AGENDADO');
  await concluida;
}

describe('BackupService', () => {
  describe('disparar', () => {
    it('recusa quando o backup está desativado', async () => {
      const c = montar({ ...CONFIG, ativo: false });
      await expect(c.service.disparar('BACKUP', 'MANUAL')).rejects.toMatchObject({
        code: 'BACKUP_DESATIVADO',
      });
      expect(c.registro.linhas).toHaveLength(0);
    });

    it('recusa uma segunda execução enquanto a primeira roda e libera depois', async () => {
      const c = montar();
      const primeira = await c.service.disparar('BACKUP', 'MANUAL', 'u1');
      await expect(c.service.disparar('BACKUP', 'MANUAL')).rejects.toMatchObject({
        code: 'BACKUP_JA_EXECUTANDO',
        status: 409,
      });
      await primeira.concluida;
      await expect(c.service.disparar('BACKUP', 'MANUAL')).resolves.toBeDefined();
    });

    it('libera a trava se o registro não puder ser gravado', async () => {
      const c = montar();
      jest.spyOn(c.registro, 'iniciar').mockRejectedValueOnce(new Error('banco fora'));
      await expect(c.service.disparar('BACKUP', 'MANUAL')).rejects.toThrow('banco fora');
      await expect(c.service.disparar('BACKUP', 'MANUAL')).resolves.toBeDefined();
    });

    it('marca como falha, na subida, as execuções que ficaram pendentes', async () => {
      const c = montar();
      c.registro.encerrarPendentes.mockResolvedValueOnce(2);
      await c.service.onApplicationBootstrap();
      expect(c.registro.encerrarPendentes).toHaveBeenCalled();
      c.registro.encerrarPendentes.mockRejectedValueOnce(new Error('sem banco'));
      await expect(c.service.onApplicationBootstrap()).resolves.toBeUndefined();
    });
  });

  describe('backup', () => {
    it('envia dump e manifesto cifrados, copia os arquivos novos e registra o sucesso', async () => {
      const c = montar();
      c.origem.objetos.set('arquivos/a.pdf', Buffer.from('anexo-a'));
      c.origem.objetos.set('arquivos/b.pdf', Buffer.from('anexo-b'));
      c.destino.objetos.set('arquivos/arquivos/a.pdf.enc', Buffer.from('ja-copiado'));

      await rodar(c, 'BACKUP');

      const chaves = [...c.destino.objetos.keys()];
      const dump = chaves.find((k) => k.endsWith('.dump.enc'));
      expect(dump).toMatch(/^postgres\/torres-\d{8}T\d{6}Z\.dump\.enc$/);
      expect(chaves.some((k) => k.endsWith('.manifest.json'))).toBe(true);
      expect(c.destino.objetos.get(dump as string)?.includes(Buffer.from('conteudo-do-dump'))).toBe(
        false,
      );
      // a.pdf já estava no destino e foi pulado; b.pdf entrou cifrado
      expect(c.destino.objetos.get('arquivos/arquivos/a.pdf.enc')?.toString()).toBe('ja-copiado');
      expect(c.destino.objetos.get('arquivos/arquivos/b.pdf.enc')?.includes('anexo-b')).toBe(false);

      expect(c.registro.falhas).toHaveLength(0);
      expect(c.registro.conclusoes[0]).toMatchObject({
        arquivosCopiados: 1,
        destinoChave: dump,
        detalhes: { tabelas: 2, arquivosNoStorage: 2, dumpsRemovidosPelaRetencao: 0 },
      });
      expect(c.registro.conclusoes[0]?.checksum).toMatch(/^[0-9a-f]{64}$/);
      expect(c.alerta.falha).not.toHaveBeenCalled();
    });

    it('funciona sem origem de arquivos (storage local)', async () => {
      const c = montar(CONFIG, false);
      await rodar(c, 'BACKUP');
      expect(c.registro.conclusoes[0]).toMatchObject({
        arquivosCopiados: 0,
        detalhes: { arquivosNoStorage: 0 },
      });
    });

    it('aplica a retenção e apaga dump e manifesto dos fora da política', async () => {
      const c = montar();
      for (const dia of ['20260101', '20260102', '20260103']) {
        c.destino.objetos.set(`postgres/torres-${dia}T020000Z.dump.enc`, Buffer.from('x'));
        c.destino.objetos.set(`postgres/torres-${dia}T020000Z.manifest.json`, Buffer.from('{}'));
      }
      await rodar(c, 'BACKUP');
      const chaves = [...c.destino.objetos.keys()];
      expect(chaves.some((k) => k.includes('20260101'))).toBe(false);
      expect(chaves.some((k) => k.includes('20260102'))).toBe(false);
      expect(chaves.some((k) => k.includes('20260103'))).toBe(true);
      expect(c.registro.conclusoes[0]?.detalhes).toMatchObject({ dumpsRemovidosPelaRetencao: 2 });
    });

    it('não falha o backup se a retenção der erro', async () => {
      const c = montar();
      jest.spyOn(c.destino, 'apagar').mockRejectedValue(new Error('sem permissão'));
      for (const dia of ['20260101', '20260102']) {
        c.destino.objetos.set(`postgres/torres-${dia}T020000Z.dump.enc`, Buffer.from('x'));
      }
      await rodar(c, 'BACKUP');
      expect(c.registro.falhas).toHaveLength(0);
      expect(c.registro.conclusoes[0]?.detalhes).toMatchObject({
        dumpsRemovidosPelaRetencao: null,
      });
    });

    it.each([
      ['pg_dump quebra', (c: Cenario) => c.falharComando.add('pg_dump'), 'BACKUP_DUMP_FALHOU'],
      ['psql quebra', (c: Cenario) => c.falharComando.add('psql'), 'BACKUP_DUMP_FALHOU'],
      [
        'o envio quebra',
        (c: Cenario) => {
          c.destino.falharEnvio = true;
        },
        'BACKUP_ENVIO_FALHOU',
      ],
      [
        'a cópia dos arquivos quebra',
        (c: Cenario) => {
          c.origem.objetos.set('arquivos/x', Buffer.from('x'));
          jest.spyOn(c.origem, 'baixar').mockRejectedValue(new Error('minio fora'));
        },
        'BACKUP_ARQUIVOS_FALHOU',
      ],
    ])('registra a falha e dispara o alerta quando %s', async (_nome, quebrar, codigo) => {
      const c = montar();
      quebrar(c);
      await rodar(c, 'BACKUP');
      expect(c.registro.falhas).toEqual([{ codigo, detalhes: undefined }]);
      expect(c.registro.conclusoes).toHaveLength(0);
      expect(c.alerta.falha).toHaveBeenCalledWith('BACKUP', codigo, 'id-1');
    });

    it('trata erro inesperado como código genérico, sem vazar a mensagem', async () => {
      const c = montar();
      jest.spyOn(c.registro, 'concluir').mockRejectedValue(new Error('CPF 000 vazou'));
      await rodar(c, 'BACKUP');
      expect(c.registro.falhas[0]?.codigo).toBe('BACKUP_ERRO_INESPERADO');
      expect(JSON.stringify(c.alerta.falha.mock.calls)).not.toContain('CPF');
    });

    it('ainda alerta se não conseguir gravar a falha no registro', async () => {
      const c = montar();
      c.falharComando.add('pg_dump');
      jest.spyOn(c.registro, 'falhar').mockRejectedValue(new Error('banco fora'));
      await rodar(c, 'BACKUP');
      expect(c.alerta.falha).toHaveBeenCalledTimes(1);
    });
  });

  describe('restauração de teste', () => {
    async function comBackup(c: Cenario): Promise<void> {
      c.origem.objetos.set('arquivos/a.pdf', Buffer.from('anexo-a'));
      await rodar(c, 'BACKUP');
      c.registro.conclusoes.length = 0;
      c.chamadas.length = 0;
    }

    it('restaura o último backup, confere as contagens e remove o banco de teste', async () => {
      const c = montar();
      await comBackup(c);
      await rodar(c, 'RESTAURACAO_TESTE');

      expect(c.registro.falhas).toHaveLength(0);
      expect(c.registro.conclusoes[0]).toMatchObject({
        detalhes: { tabelasConferidas: 2, tabelasDivergentes: [], arquivoAmostra: 'ok' },
      });
      const comandos = c.chamadas.map((x) => x.comando);
      expect(comandos).toEqual(['psql', 'pg_restore', 'psql', 'psql']);
      expect(c.chamadas[0]?.args.join(' ')).toMatch(/CREATE DATABASE "torres_restore_\d+"/);
      expect(c.chamadas[3]?.args.join(' ')).toMatch(/DROP DATABASE IF EXISTS "torres_restore_\d+"/);
    });

    it('registra "nenhum" como amostra quando não há arquivos copiados', async () => {
      const c = montar(CONFIG, false);
      await rodar(c, 'BACKUP');
      c.registro.conclusoes.length = 0;
      c.contagens.push('pacientes,10\nagenda,5');
      await rodar(c, 'RESTAURACAO_TESTE');
      expect(c.registro.conclusoes[0]?.detalhes).toMatchObject({ arquivoAmostra: 'nenhum' });
    });

    it('falha e alerta sem nenhum backup no destino', async () => {
      const c = montar();
      await rodar(c, 'RESTAURACAO_TESTE');
      expect(c.registro.falhas[0]?.codigo).toBe('RESTAURACAO_SEM_BACKUP');
      expect(c.alerta.falha).toHaveBeenCalledWith(
        'RESTAURACAO_TESTE',
        'RESTAURACAO_SEM_BACKUP',
        'id-1',
      );
    });

    it('detecta dump alterado no destino pelo checksum', async () => {
      const c = montar();
      await comBackup(c);
      const dump = [...c.destino.objetos.keys()].find((k) => k.endsWith('.dump.enc')) as string;
      c.destino.objetos.set(
        dump,
        Buffer.concat([c.destino.objetos.get(dump) as Buffer, Buffer.from('!')]),
      );
      await rodar(c, 'RESTAURACAO_TESTE');
      expect(c.registro.falhas[0]?.codigo).toBe('RESTAURACAO_CHECKSUM_DIVERGENTE');
      expect(c.chamadas).toHaveLength(0);
    });

    it('falha se a frase de cifra não confere', async () => {
      const c = montar();
      await comBackup(c);
      const outra = new BackupService(
        { ...CONFIG, chave: 'outra-frase-de-teste-com-mais-de-trinta-e-dois' },
        c.registro as unknown as BackupRegistroService,
        c.alerta as unknown as BackupAlertaService,
        new PostgresFerramentas({ executar: () => Promise.resolve('') }),
        c.destino,
        null,
      );
      const { concluida } = await outra.disparar('RESTAURACAO_TESTE', 'MANUAL');
      await concluida;
      expect(c.registro.falhas[0]?.codigo).toBe('RESTAURACAO_FALHOU');
    });

    it('aponta as tabelas divergentes e ainda remove o banco de teste', async () => {
      const c = montar();
      await comBackup(c);
      c.contagens.splice(0, c.contagens.length, 'pacientes,9\nagenda,5');
      await rodar(c, 'RESTAURACAO_TESTE');
      expect(c.registro.falhas[0]).toEqual({
        codigo: 'RESTAURACAO_CONTAGEM_DIVERGENTE',
        detalhes: { tabelasConferidas: 2, tabelasDivergentes: ['pacientes'] },
      });
      expect(c.chamadas.at(-1)?.args.join(' ')).toContain('DROP DATABASE');
    });

    it('considera divergente a tabela que não voltou na restauração', async () => {
      const c = montar();
      await comBackup(c);
      c.contagens.splice(0, c.contagens.length, 'pacientes,10');
      await rodar(c, 'RESTAURACAO_TESTE');
      expect(c.registro.falhas[0]?.detalhes).toMatchObject({ tabelasDivergentes: ['agenda'] });
    });

    it('falha se o pg_restore quebrar, mas remove o banco de teste', async () => {
      const c = montar();
      await comBackup(c);
      c.falharComando.add('pg_restore');
      await rodar(c, 'RESTAURACAO_TESTE');
      expect(c.registro.falhas[0]?.codigo).toBe('RESTAURACAO_FALHOU');
      expect(c.chamadas.at(-1)?.args.join(' ')).toContain('DROP DATABASE');
    });

    it('usa o servidor de BACKUP_RESTAURACAO_URL quando informado', async () => {
      const c = montar({ ...CONFIG, restauracaoUrl: 'postgresql://u:p@teste:5432/postgres' });
      await comBackup(c);
      await rodar(c, 'RESTAURACAO_TESTE');
      expect(c.chamadas[0]?.args).toEqual(expect.arrayContaining(['-h', 'teste']));
    });
  });
});
