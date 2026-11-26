import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';

/**
 * O histórico dos cancelamentos que já existiam é criado pela própria migration (issue #162,
 * R §34: nada some do relatório). Aqui o SQL do histórico roda sobre registros fictícios, no
 * banco de teste, para conferir colunas, vínculos e o que entra no histórico.
 */
const PASTA = join(__dirname, '../../prisma/migrations');
const nome = readdirSync(PASTA).find((n) => n.endsWith('_criar_cancelamentos')) ?? '';
const SQL = readFileSync(join(PASTA, nome, 'migration.sql'), 'utf8');
const INICIO_MOTIVOS = SQL.indexOf('-- Motivos iniciais');
const INICIO_PERMISSOES = SQL.indexOf('-- Tela Motivos de Cancelamento');
/** Motivos iniciais e histórico dos cancelamentos antigos, sem a concessão de permissões. */
const BACKFILL = SQL.slice(INICIO_MOTIVOS, INICIO_PERMISSOES);

function comandos(sql: string): string[] {
  return sql
    .split('\n')
    .filter((linha) => !linha.trimStart().startsWith('--'))
    .join('\n')
    .split(/;\s*\n/)
    .map((c) => c.trim())
    .filter(Boolean);
}

describe('migration criar_cancelamentos: histórico dos cancelamentos existentes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  async function executarBackfill() {
    for (const comando of comandos(BACKFILL)) await prisma.$executeRawUnsafe(comando);
  }

  it('o SQL existe e tem os comandos esperados', () => {
    expect(nome).not.toBe('');
    expect(INICIO_MOTIVOS).toBeGreaterThan(0);
    expect(comandos(BACKFILL).length).toBe(8);
  });

  it('cria os motivos e o histórico de cada tipo de cancelamento já registrado', async () => {
    const sala = await prisma.sala.create({ data: { nome: 'Sala 1' } });
    const prof = await prisma.profissional.create({ data: { nome: 'Dr. Fictício' } });
    const paciente = await prisma.paciente.create({ data: { nome: 'Paciente Fictício' } });
    const usuarioId = '00000000-0000-4000-8000-000000000099';

    const contrato = await prisma.contratoSala.create({
      data: {
        salaId: sala.id,
        modalidade: 'MENSAL',
        locatarioTipo: 'PROFISSIONAL',
        profissionalId: prof.id,
        valorUnitario: 100,
        dataInicio: new Date('2026-01-01'),
        status: 'CANCELADO',
        encerradoEm: new Date('2026-06-15'),
        motivoEncerramento: 'Mudou de cidade',
      },
    });
    const contratoAtivo = await prisma.contratoSala.create({
      data: {
        salaId: sala.id,
        modalidade: 'MENSAL',
        locatarioTipo: 'PROFISSIONAL',
        profissionalId: prof.id,
        valorUnitario: 100,
        dataInicio: new Date('2026-01-01'),
      },
    });
    const bloqueio = await prisma.salaBloqueio.create({
      data: {
        salaId: sala.id,
        tipo: 'MANUTENCAO',
        dataInicio: new Date('2026-08-01'),
        dataFim: new Date('2026-08-01'),
        profissionalId: prof.id,
        canceladoEm: new Date('2026-07-20T12:00:00Z'),
        canceladoPorId: usuarioId,
        motivoCancelamento: 'Obra adiada',
      },
    });
    const motivoPerda = await prisma.motivoPerda.create({
      data: { nome: 'Preço', codigo: 'preco', ordem: 1 },
    });
    const pipeline = await prisma.pipeline.create({ data: { nome: 'Pipeline', ordem: 1 } });
    const estagio = await prisma.estagioPipeline.create({
      data: { pipelineId: pipeline.id, nome: 'Contato', ordem: 1, cor: '#3b82f6' },
    });
    const negocio = await prisma.negocio.create({
      data: {
        pipelineId: pipeline.id,
        estagioId: estagio.id,
        titulo: 'Negócio fictício',
        contatoTipo: 'PACIENTE',
        contatoId: paciente.id,
        status: 'PERDIDO',
        motivoPerdaId: motivoPerda.id,
        fechadoEm: new Date('2026-09-10T15:00:00Z'),
      },
    });
    const agendamento = await prisma.agendamento.create({
      data: {
        pacienteId: paciente.id,
        profissionalId: prof.id,
        inicio: new Date('2026-10-01T12:00:00Z'),
        status: 'CANCELADO',
      },
    });
    const agendado = await prisma.agendamento.create({
      data: {
        pacienteId: paciente.id,
        profissionalId: prof.id,
        inicio: new Date('2026-10-02T12:00:00Z'),
      },
    });
    const orcamento = await prisma.orcamento.create({
      data: { subtotal: 10, total: 10, status: 'CANCELADO' },
    });
    const receber = await prisma.contaReceber.create({
      data: {
        descricao: 'Mensalidade',
        valor: '100',
        dataVencimento: new Date('2026-12-10'),
        status: 'CANCELADO',
        profissionalId: prof.id,
      },
    });
    const pagar = await prisma.contaPagar.create({
      data: {
        descricao: 'Água',
        valor: '50',
        dataVencimento: new Date('2026-12-10'),
        status: 'CANCELADO',
      },
    });
    const excluido = await prisma.orcamento.create({
      data: { subtotal: 1, total: 1, status: 'CANCELADO', deletedAt: new Date() },
    });

    await executarBackfill();

    expect(await prisma.motivoCancelamento.count()).toBe(29);
    const historico = await prisma.cancelamento.findMany();
    expect(historico).toHaveLength(7);
    const de = (entidadeId: string) => historico.find((h) => h.entidadeId === entidadeId);

    expect(de(contrato.id)).toMatchObject({
      tipo: 'CONTRATO',
      entidade: 'ContratoSala',
      motivoNome: 'Outro',
      observacao: 'Mudou de cidade',
      profissionalId: prof.id,
    });
    expect(de(contrato.id)?.canceladoEm.toISOString()).toBe('2026-06-15T00:00:00.000Z');
    expect(de(bloqueio.id)).toMatchObject({
      tipo: 'PERIODO',
      entidade: 'SalaBloqueio',
      motivoNome: 'Outro',
      observacao: 'Obra adiada',
      canceladoPorId: usuarioId,
      profissionalId: prof.id,
    });
    expect(de(bloqueio.id)?.canceladoEm.toISOString()).toBe('2026-07-20T12:00:00.000Z');
    expect(de(negocio.id)).toMatchObject({
      tipo: 'PROPOSTA',
      entidade: 'Negocio',
      motivoId: null,
      motivoNome: 'Preço',
    });
    expect(de(negocio.id)?.canceladoEm.toISOString()).toBe('2026-09-10T15:00:00.000Z');
    expect(de(agendamento.id)).toMatchObject({
      tipo: 'CONSULTA',
      entidade: 'Agendamento',
      motivoNome: 'Outro',
      profissionalId: prof.id,
    });
    expect(de(orcamento.id)).toMatchObject({ tipo: 'PROPOSTA', entidade: 'Orcamento' });
    expect(de(receber.id)).toMatchObject({
      tipo: 'COBRANCA',
      entidade: 'ContaReceber',
      profissionalId: prof.id,
    });
    expect(de(pagar.id)).toMatchObject({ tipo: 'COBRANCA', entidade: 'ContaPagar' });

    // Ativos, não cancelados e excluídos não entram no histórico.
    for (const naoEntra of [contratoAtivo.id, agendado.id, excluido.id]) {
      expect(de(naoEntra)).toBeUndefined();
    }
    // Todo registro com motivo da lista aponta para um motivo do mesmo tipo.
    const comMotivo = await prisma.cancelamento.findMany({
      where: { motivoId: { not: null } },
      include: { motivo: true },
    });
    expect(comMotivo.length).toBe(6);
    for (const h of comMotivo) expect(h.motivo?.tipo).toBe(h.tipo);
  });

  it('sem cancelamentos anteriores, só cria os motivos', async () => {
    await executarBackfill();
    expect(await prisma.motivoCancelamento.count()).toBe(29);
    expect(await prisma.cancelamento.count()).toBe(0);
  });
});
