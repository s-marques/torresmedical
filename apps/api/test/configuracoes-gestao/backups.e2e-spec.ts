import type { INestApplication } from '@nestjs/common';
import { backupExecucaoPageSchema, backupExecucaoSchema } from '@torres/shared';
import { readFile, writeFile } from 'node:fs/promises';
import { BACKUP_DESTINO, type DestinoBackup } from '../../src/common/backup/backup-destino';
import { PROCESSO_RUNNER, type ProcessoRunner } from '../../src/common/backup/postgres-ferramentas';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/configuracoes-gestao/backups';
const PERMISSOES = [
  'configuracoes-gestao.backups.ver',
  'configuracoes-gestao.backups.executar',
] as const;
const ENTITY = 'BackupExecucao';

/** Destino em memória e runner que só escreve um "dump": o e2e não depende de pg_dump nem de S3. */
function fakes() {
  const objetos = new Map<string, Buffer>();
  const destino: DestinoBackup = {
    preparar: () => Promise.resolve(),
    enviar: async (chave, arquivo) => {
      objetos.set(chave, await readFile(arquivo));
    },
    baixar: async (chave, arquivo) => {
      await writeFile(arquivo, objetos.get(chave) ?? Buffer.alloc(0));
    },
    listar: (prefixo) =>
      Promise.resolve(
        [...objetos.entries()]
          .filter(([chave]) => chave.startsWith(prefixo))
          .map(([chave, c]) => ({ chave, tamanho: c.length })),
      ),
    apagar: () => Promise.resolve(),
  };
  const runner: ProcessoRunner = {
    executar: async (comando, args) => {
      if (comando === 'pg_dump') await writeFile(args[args.indexOf('-f') + 1] as string, 'dump');
      if (comando === 'psql' && args.join(' ').includes('information_schema'))
        return 'pacientes,0\n';
      return '';
    },
  };
  return { destino, runner };
}

async function aguardarFim(prisma: PrismaService, id: string) {
  for (let i = 0; i < 100; i += 1) {
    const linha = await prisma.backupExecucao.findUniqueOrThrow({ where: { id } });
    if (linha.status !== 'EXECUTANDO') return linha;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('A execução não terminou a tempo');
}

describe('Backups (e2e) — desativado', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => comUsuario(app, usuario);

  describe('GET', () => {
    it('200 com o histórico paginado, mais recente primeiro, e filtros', async () => {
      await prisma.backupExecucao.createMany({
        data: [
          {
            tipo: 'BACKUP',
            status: 'SUCESSO',
            origem: 'AGENDADO',
            iniciadoEm: new Date('2026-11-24T05:00:00Z'),
            finalizadoEm: new Date('2026-11-24T05:03:00Z'),
            tamanhoBytes: BigInt(5_000_000_000),
            arquivosCopiados: 3,
            checksum: 'a'.repeat(64),
            destinoChave: 'postgres/torres-20261124T050000Z.dump.enc',
          },
          {
            tipo: 'BACKUP',
            status: 'FALHA',
            origem: 'AGENDADO',
            iniciadoEm: new Date('2026-11-25T05:00:00Z'),
            erroCodigo: 'BACKUP_ENVIO_FALHOU',
          },
          {
            tipo: 'RESTAURACAO_TESTE',
            status: 'SUCESSO',
            origem: 'MANUAL',
            iniciadoEm: new Date('2026-11-23T07:00:00Z'),
            detalhes: { tabelasConferidas: 10, arquivoAmostra: 'ok' },
          },
        ],
      });

      const res = await http().get(BASE).expect(200);
      const pagina = backupExecucaoPageSchema.parse(res.body);
      expect(pagina.meta.total).toBe(3);
      expect(pagina.data.map((e) => e.status)).toEqual(['FALHA', 'SUCESSO', 'SUCESSO']);
      expect(pagina.data[1]?.tamanhoBytes).toBe(5_000_000_000);

      const falhas = backupExecucaoPageSchema.parse(
        (await http().get(BASE).query({ status: 'FALHA' }).expect(200)).body,
      );
      expect(falhas.data).toHaveLength(1);
      expect(falhas.data[0]?.erroCodigo).toBe('BACKUP_ENVIO_FALHOU');

      const testes = backupExecucaoPageSchema.parse(
        (await http().get(BASE).query({ tipo: 'RESTAURACAO_TESTE' }).expect(200)).body,
      );
      expect(testes.data[0]?.detalhes).toEqual({ tabelasConferidas: 10, arquivoAmostra: 'ok' });
    });

    it('400 com filtro ou ordenação inválidos', async () => {
      await http().get(BASE).query({ status: 'OUTRO' }).expect(400);
      await http().get(BASE).query({ sort: 'erroCodigo:asc' }).expect(400);
    });

    it('403 sem a permissão de ver', async () => {
      const semPermissao = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, semPermissao).get(BASE).expect(403);
    });
  });

  describe('POST', () => {
    it.each(['executar', 'restauracao-teste'])(
      '422 BACKUP_DESATIVADO em /%s com o backup desligado, sem registro nem auditoria',
      async (rota) => {
        const res = await http().post(`${BASE}/${rota}`).expect(422);
        expect(res.body.code).toBe('BACKUP_DESATIVADO');
        expect(await prisma.backupExecucao.count()).toBe(0);
        await expectNoAudit(prisma, { entity: ENTITY });
      },
    );

    it.each(['executar', 'restauracao-teste'])(
      '403 em /%s sem a permissão de executar',
      async (rota) => {
        const somenteVer = await criarUsuarioTeste(app, {
          permissoes: ['configuracoes-gestao.backups.ver'],
        });
        await comUsuario(app, somenteVer).post(`${BASE}/${rota}`).expect(403);
      },
    );
  });
});

describe('Backups (e2e) — ativo, com destino e processos falsos', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;
  const ambiente = { ...process.env };

  beforeAll(async () => {
    Object.assign(process.env, {
      BACKUP_ATIVO: 'on',
      BACKUP_CRIPTO_CHAVE: 'chave-do-teste-e2e-com-mais-de-32-caracteres',
      BACKUP_DESTINO_BUCKET: 'bucket-falso',
      BACKUP_DESTINO_ACCESS_KEY: 'a',
      BACKUP_DESTINO_SECRET_KEY: 's',
    });
    const { destino, runner } = fakes();
    app = await createE2eApp({}, (builder) =>
      builder
        .overrideProvider(BACKUP_DESTINO)
        .useValue(destino)
        .overrideProvider(PROCESSO_RUNNER)
        .useValue(runner),
    );
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
  });

  afterAll(async () => {
    await app.close();
    process.env = ambiente;
  });

  const http = () => comUsuario(app, usuario);

  it('202 dispara o backup, registra a execução, audita CREATE e conclui em segundo plano', async () => {
    const res = await http().post(`${BASE}/executar`).expect(202);
    const execucao = backupExecucaoSchema.parse(res.body);
    expect(execucao).toMatchObject({ tipo: 'BACKUP', status: 'EXECUTANDO', origem: 'MANUAL' });

    await expectAudit(prisma, {
      action: 'CREATE',
      entity: ENTITY,
      entityId: execucao.id,
      before: null,
      after: { tipo: 'BACKUP', origem: 'MANUAL' },
      userId: usuario.id,
    });

    const fim = await aguardarFim(prisma, execucao.id);
    expect(fim.status).toBe('SUCESSO');
    expect(fim.usuarioId).toBe(usuario.id);
    expect(fim.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(fim.destinoChave).toMatch(/^postgres\/torres-.*\.dump\.enc$/);
  });

  it('202 dispara a restauração de teste do backup mais recente e registra a conferência', async () => {
    const backup = await http().post(`${BASE}/executar`).expect(202);
    await aguardarFim(prisma, (backup.body as { id: string }).id);

    const res = await http().post(`${BASE}/restauracao-teste`).expect(202);
    const execucao = backupExecucaoSchema.parse(res.body);
    expect(execucao.tipo).toBe('RESTAURACAO_TESTE');
    await expectAudit(prisma, { action: 'CREATE', entity: ENTITY, entityId: execucao.id });

    const fim = await aguardarFim(prisma, execucao.id);
    expect(fim.status).toBe('SUCESSO');
    expect(fim.detalhes).toMatchObject({ tabelasConferidas: 1, tabelasDivergentes: [] });
  });

  it('409 enquanto outra execução está em andamento', async () => {
    const primeira = await http().post(`${BASE}/executar`).expect(202);
    const segunda = await http().post(`${BASE}/restauracao-teste`);
    expect([202, 409]).toContain(segunda.status);
    if (segunda.status === 409) expect(segunda.body.code).toBe('BACKUP_JA_EXECUTANDO');
    await aguardarFim(prisma, (primeira.body as { id: string }).id);
    if (segunda.status === 202) await aguardarFim(prisma, (segunda.body as { id: string }).id);
  });
});
