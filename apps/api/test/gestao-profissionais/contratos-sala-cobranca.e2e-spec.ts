import type { INestApplication } from '@nestjs/common';
import { contratoSalaSchema, gerarCobrancasMesResumoSchema } from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { competenciaAtual } from '../../src/modules/gestao-profissionais/salas/competencia-cobranca';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';
import { criarMotivoContratoEncerrado } from '../utils/motivos-cancelamento';

const BASE = '/api/gestao-profissionais/contratos-sala';
const PERMISSOES = ['gestao-profissionais.salas.ver', 'gestao-profissionais.salas.editar'] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const COMPETENCIA = competenciaAtual();

describe('Cobranças dos contratos de salas (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;
  let salaId: string;
  let profissionalId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
    salaId = (await prisma.sala.create({ data: { nome: 'Sala 20' } })).id;
    profissionalId = (await prisma.profissional.create({ data: { nome: 'Dr. Cobrança Teste' } }))
      .id;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => comUsuario(app, usuario);

  function criarContrato(dados: {
    modalidade: 'MENSAL' | 'TURNO';
    valorUnitario: number;
    permuta?: boolean;
    status?: 'ATIVO' | 'ENCERRADO' | 'CANCELADO';
  }) {
    return prisma.contratoSala.create({
      data: {
        salaId,
        locatarioTipo: 'PROFISSIONAL',
        profissionalId,
        dataInicio: new Date('2026-01-01T00:00:00Z'),
        quantidadeMensal: dados.modalidade === 'TURNO' ? 10 : null,
        ...dados,
      },
    });
  }

  describe('POST /gerar-cobrancas-mes', () => {
    it('gera a cobrança dos contratos Mensal ativos e lista os Por Turno como sem valor calculável', async () => {
      const mensal = await criarContrato({ modalidade: 'MENSAL', valorUnitario: 1500 });
      const turno = await criarContrato({ modalidade: 'TURNO', valorUnitario: 80 });
      await criarContrato({ modalidade: 'MENSAL', valorUnitario: 900, permuta: true });

      const res = gerarCobrancasMesResumoSchema.parse(
        (await http().post(`${BASE}/gerar-cobrancas-mes`).expect(200)).body,
      );

      expect(res.competencia).toBe(COMPETENCIA);
      expect(res.geradas).toBe(1);
      expect(res.jaExistentes).toBe(0);
      expect(res.semValorCalculavel).toEqual([expect.objectContaining({ contratoId: turno.id })]);

      const conta = await prisma.contaReceber.findFirst({ where: { valor: 1500 } });
      expect(conta).not.toBeNull();
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'ContaReceber',
        entityId: conta?.id as string,
        before: null,
        after: { valor: '1500' },
      });

      const cobranca = await prisma.contratoSalaCobranca.findUnique({
        where: {
          contratoSalaId_competencia: { contratoSalaId: mensal.id, competencia: COMPETENCIA },
        },
      });
      expect(cobranca?.contaReceberId).toBe(conta?.id);
    });

    it('não duplica ao chamar de novo no mesmo mês', async () => {
      await criarContrato({ modalidade: 'MENSAL', valorUnitario: 1500 });

      await http().post(`${BASE}/gerar-cobrancas-mes`).expect(200);
      const segunda = gerarCobrancasMesResumoSchema.parse(
        (await http().post(`${BASE}/gerar-cobrancas-mes`).expect(200)).body,
      );

      expect(segunda.geradas).toBe(0);
      expect(segunda.jaExistentes).toBe(1);
      expect(await prisma.contaReceber.count()).toBe(1);
    });

    it('403 sem permissão', async () => {
      const semPermissao = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, semPermissao).post(`${BASE}/gerar-cobrancas-mes`).expect(403);
    });
  });

  describe('POST /:id/gerar-parcela', () => {
    it('gera a conta a receber manualmente e audita', async () => {
      const turno = await criarContrato({ modalidade: 'TURNO', valorUnitario: 80 });

      const res = contratoSalaSchema.parse(
        (
          await http()
            .post(`${BASE}/${turno.id}/gerar-parcela`)
            .send({ competencia: COMPETENCIA, valor: 640, dataVencimento: '2026-11-10' })
            .expect(200)
        ).body,
      );
      expect(res.id).toBe(turno.id);

      const conta = await prisma.contaReceber.findFirst({ where: { valor: 640 } });
      expect(conta).not.toBeNull();
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'ContaReceber',
        entityId: conta?.id as string,
        before: null,
      });
    });

    it('409 ao repetir no mesmo mês, 409 se o contrato não está ativo, 404 e 403', async () => {
      const turno = await criarContrato({ modalidade: 'TURNO', valorUnitario: 80 });
      const encerrado = await criarContrato({
        modalidade: 'TURNO',
        valorUnitario: 80,
        status: 'ENCERRADO',
      });
      const corpo = { competencia: COMPETENCIA, valor: 640, dataVencimento: '2026-11-10' };

      await http().post(`${BASE}/${turno.id}/gerar-parcela`).send(corpo).expect(200);
      await http().post(`${BASE}/${turno.id}/gerar-parcela`).send(corpo).expect(409);
      await http().post(`${BASE}/${encerrado.id}/gerar-parcela`).send(corpo).expect(409);
      await http().post(`${BASE}/${INEXISTENTE}/gerar-parcela`).send(corpo).expect(404);
      const leitor = await criarUsuarioTeste(app, {
        permissoes: ['gestao-profissionais.salas.ver'],
      });
      await comUsuario(app, leitor)
        .post(`${BASE}/${turno.id}/gerar-parcela`)
        .send(corpo)
        .expect(403);
    });
  });

  describe('POST /:id/confirmar-sem-cobranca', () => {
    it('confirma sem gerar conta a receber, audita e bloqueia nova tentativa no mês', async () => {
      const turno = await criarContrato({ modalidade: 'TURNO', valorUnitario: 80 });

      await http()
        .post(`${BASE}/${turno.id}/confirmar-sem-cobranca`)
        .send({ competencia: COMPETENCIA })
        .expect(204);

      expect(await prisma.contaReceber.count()).toBe(0);
      const cobranca = await prisma.contratoSalaCobranca.findUnique({
        where: {
          contratoSalaId_competencia: { contratoSalaId: turno.id, competencia: COMPETENCIA },
        },
      });
      expect(cobranca?.contaReceberId).toBeNull();
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'ContratoSalaCobranca',
        entityId: cobranca?.id as string,
        before: null,
      });

      await http()
        .post(`${BASE}/${turno.id}/confirmar-sem-cobranca`)
        .send({ competencia: COMPETENCIA })
        .expect(409);
    });
  });

  describe('encerrar/cancelar cancela as parcelas pendentes', () => {
    it('cancela as parcelas pendentes com vencimento futuro e deixa as já vencidas', async () => {
      const motivo = await criarMotivoContratoEncerrado(prisma);
      const contrato = await criarContrato({ modalidade: 'MENSAL', valorUnitario: 1500 });
      const futura = await prisma.contaReceber.create({
        data: { descricao: 'Futura', valor: 1500, dataVencimento: new Date('2026-12-10') },
      });
      const passada = await prisma.contaReceber.create({
        data: { descricao: 'Passada', valor: 1500, dataVencimento: new Date('2026-10-10') },
      });
      await prisma.contratoSalaCobranca.createMany({
        data: [
          { contratoSalaId: contrato.id, competencia: '2026-12', contaReceberId: futura.id },
          { contratoSalaId: contrato.id, competencia: '2026-10', contaReceberId: passada.id },
        ],
      });

      await http()
        .post(`${BASE}/${contrato.id}/encerrar`)
        .send({ data: '2026-11-01', observacao: null })
        .expect(200);

      expect(
        (await prisma.contaReceber.findUniqueOrThrow({ where: { id: futura.id } })).status,
      ).toBe('CANCELADO');
      expect(
        (await prisma.contaReceber.findUniqueOrThrow({ where: { id: passada.id } })).status,
      ).toBe('PENDENTE');
      // O histórico de cancelamentos registra a parcela com o motivo de sistema (issue #162).
      const historico = await prisma.cancelamento.findMany();
      expect(historico).toHaveLength(1);
      expect(historico[0]).toMatchObject({
        tipo: 'COBRANCA',
        entidade: 'ContaReceber',
        entidadeId: futura.id,
        motivoId: motivo.id,
        canceladoPorId: usuario.id,
      });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'ContaReceber',
        entityId: futura.id,
        before: { status: 'PENDENTE' },
        after: { status: 'CANCELADO' },
      });
      await expectNoAudit(prisma, {
        entity: 'ContaReceber',
        entityId: passada.id,
        action: 'UPDATE',
      });
    });
  });
});
