import { Test } from '@nestjs/testing';
import { applySeed, buildSeedData } from '../prisma/seed-data';
import { PrismaModule } from '../src/common/prisma/prisma.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { truncateAll } from './utils/database';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('Banco: migration e tabelas estruturais (e2e)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule] }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function criarEmpresa(documento = '11222333000181') {
    return prisma.empresa.create({ data: { nome: 'Empresa Teste', documento } });
  }

  it('aplicou todas as migrations sem pendências', async () => {
    const pendentes = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) AS total FROM _prisma_migrations
      WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL`;
    expect(Number(pendentes[0]?.total)).toBe(0);
  });

  it('cria as tabelas estruturais com nomes em snake_case', async () => {
    const tabelas = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
      ORDER BY table_name`;
    expect(tabelas.map((t) => t.table_name)).toEqual([
      'arquivos',
      'audit_log',
      'empresas',
      'unidades',
      'usuarios',
    ]);
  });

  it('gera uuid no banco e preenche created_at/updated_at; deleted_at começa nulo', async () => {
    const [linha] = await prisma.$queryRaw<
      { id: string; created_at: Date; updated_at: Date; deleted_at: Date | null }[]
    >`
      INSERT INTO empresas (nome, documento, updated_at)
      VALUES ('Direto no SQL', '99888777000100', now())
      RETURNING id, created_at, updated_at, deleted_at`;

    expect(linha?.id).toMatch(UUID);
    expect(linha?.created_at).toBeInstanceOf(Date);
    expect(linha?.deleted_at).toBeNull();

    const empresa = await criarEmpresa();
    expect(empresa.id).toMatch(UUID);
    expect(empresa.updatedAt).toBeInstanceOf(Date);
  });

  it('impede documento de empresa duplicado (P2002)', async () => {
    await criarEmpresa();
    await expect(criarEmpresa()).rejects.toMatchObject({ code: 'P2002' });
  });

  it('impede e-mail de usuário duplicado (P2002)', async () => {
    const empresa = await criarEmpresa();
    const usuario = { empresaId: empresa.id, nome: 'Usuário', email: 'dup@example.com' };
    await prisma.usuario.create({ data: usuario });
    await expect(prisma.usuario.create({ data: usuario })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('exige empresa existente em unidades e usuários (FK)', async () => {
    const empresaId = '00000000-0000-4000-8000-000000000000';
    await expect(
      prisma.unidade.create({ data: { empresaId, nome: 'Sem empresa' } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.usuario.create({ data: { empresaId, nome: 'Sem empresa', email: 'x@example.com' } }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('não apaga empresa que tem unidades (ON DELETE RESTRICT)', async () => {
    const empresa = await criarEmpresa();
    await prisma.unidade.create({ data: { empresaId: empresa.id, nome: 'Matriz' } });
    await expect(prisma.empresa.delete({ where: { id: empresa.id } })).rejects.toThrow();
  });

  it('grava audit_log com before/after em jsonb e ação do enum', async () => {
    const registro = await prisma.auditLog.create({
      data: {
        userId: 'system',
        action: 'UPDATE',
        entity: 'Empresa',
        entityId: '1',
        before: { nome: 'Antes' },
        after: { nome: 'Depois' },
        requestId: 'req-1',
        ip: '127.0.0.1',
      },
    });

    expect(registro.id).toMatch(UUID);
    expect(registro.occurredAt).toBeInstanceOf(Date);

    const [tipos] = await prisma.$queryRaw<{ before: string; after: string }[]>`
      SELECT jsonb_typeof(before) AS before, jsonb_typeof(after) AS after
      FROM audit_log WHERE id = ${registro.id}::uuid`;
    expect(tipos).toEqual({ before: 'object', after: 'object' });

    await expect(
      prisma.$executeRaw`INSERT INTO audit_log (user_id, action, entity, entity_id)
        VALUES ('system', 'INVALIDA', 'Empresa', '1')`,
    ).rejects.toThrow();
  });

  it('seed grava os dados fictícios e é idempotente', async () => {
    const esperado = buildSeedData();

    await applySeed(prisma);
    await applySeed(prisma);

    expect(await prisma.empresa.count()).toBe(1);
    expect(await prisma.unidade.count()).toBe(esperado.unidades.length);
    const usuarios = await prisma.usuario.findMany({ select: { email: true } });
    expect(usuarios).toHaveLength(esperado.usuarios.length);
    expect(usuarios.every((u) => u.email.endsWith('@example.com'))).toBe(true);
  });
});
