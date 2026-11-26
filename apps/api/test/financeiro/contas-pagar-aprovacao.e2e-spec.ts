import type { INestApplication } from '@nestjs/common';
import { contaPagarSchema } from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/financeiro/contas-pagar';
const ENTITY = 'ContaPagar';
const PERMISSOES_LANCADOR = [
  'financeiro.contas-pagar.ver',
  'financeiro.contas-pagar.criar',
  'financeiro.contas-pagar.editar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const NOVA_CONTA = { descricao: 'Aluguel', valor: 500, dataVencimento: '2026-12-10' };

/** Aprovação financeira antes da baixa (issue #164, R §16). */
describe('Contas a Pagar: aprovação antes da baixa (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let lancador: UsuarioTeste;
  let aprovador: UsuarioTeste;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    lancador = await criarUsuarioTeste(app, { permissoes: PERMISSOES_LANCADOR });
    aprovador = await criarUsuarioTeste(app, {
      permissoes: [...PERMISSOES_LANCADOR, 'financeiro.contas-pagar.aprovar'],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  async function lancar(): Promise<string> {
    const res = await comUsuario(app, lancador).post(BASE).send(NOVA_CONTA).expect(201);
    return res.body.id as string;
  }

  describe('lançamento e baixa', () => {
    it('conta nova nasce aguardando aprovação, com quem lançou, e a baixa é recusada (422)', async () => {
      const id = await lancar();
      const conta = await prisma.contaPagar.findUniqueOrThrow({ where: { id } });
      expect(conta).toMatchObject({ aprovacao: 'LANCADA', lancadoPorId: lancador.id });

      const res = await comUsuario(app, lancador)
        .post(`${BASE}/${id}/baixar`)
        .send({ dataPagamento: '2026-11-04', valorPago: 500 })
        .expect(422);
      expect(res.body.code).toBe('CONTA_PAGAR_NAO_APROVADA');
      expect(await prisma.contaPagarBaixa.count()).toBe(0);
      await expectNoAudit(prisma, { entity: ENTITY, entityId: id, action: 'UPDATE' });
    });

    it('não permite criar a conta já como Paga, nem marcá-la Paga sem aprovação', async () => {
      const res = await comUsuario(app, lancador)
        .post(BASE)
        .send({ ...NOVA_CONTA, status: 'PAGO' })
        .expect(422);
      expect(res.body.code).toBe('CONTA_PAGAR_NAO_APROVADA');

      const id = await lancar();
      await comUsuario(app, lancador)
        .patch(`${BASE}/${id}`)
        .send({ ...NOVA_CONTA, status: 'PAGO' })
        .expect(422);
    });
  });

  describe('POST /:id/aprovar', () => {
    it('200: aprova, audita before/after e libera a baixa', async () => {
      const id = await lancar();
      const res = await comUsuario(app, aprovador).post(`${BASE}/${id}/aprovar`).expect(200);
      const parsed = contaPagarSchema.parse(res.body);
      const dono = await prisma.usuario.findUniqueOrThrow({ where: { id: aprovador.id } });
      expect(parsed).toMatchObject({
        aprovacao: 'APROVADA',
        aprovadoPorNome: dono.nome,
        recusadoPorNome: null,
      });
      expect(parsed.aprovadoEm).not.toBeNull();
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: id,
        before: { aprovacao: 'LANCADA', aprovadoPorId: null },
        after: { aprovacao: 'APROVADA', aprovadoPorNome: dono.nome },
        userId: aprovador.id,
      });

      const baixa = await comUsuario(app, lancador)
        .post(`${BASE}/${id}/baixar`)
        .send({ dataPagamento: '2026-11-04', valorPago: 500 })
        .expect(200);
      expect(baixa.body).toMatchObject({ status: 'PAGO', aprovacao: 'APROVADA' });
    });

    it('422: quem lançou não aprova a própria conta (mesmo com a permissão)', async () => {
      const id = await comUsuario(app, aprovador).post(BASE).send(NOVA_CONTA).expect(201);
      const res = await comUsuario(app, aprovador)
        .post(`${BASE}/${id.body.id}/aprovar`)
        .expect(422);
      expect(res.body.code).toBe('CONTA_PAGAR_APROVADOR_IGUAL_LANCADOR');
      await expectNoAudit(prisma, { entity: ENTITY, entityId: id.body.id, action: 'UPDATE' });
    });

    it('422: conta que já foi aprovada não é aprovada de novo', async () => {
      const id = await lancar();
      await comUsuario(app, aprovador).post(`${BASE}/${id}/aprovar`).expect(200);
      const res = await comUsuario(app, aprovador).post(`${BASE}/${id}/aprovar`).expect(422);
      expect(res.body.code).toBe('CONTA_PAGAR_APROVACAO_INVALIDA');
    });

    it('403 sem a permissão aprovar; 404 para inexistente', async () => {
      const id = await lancar();
      await comUsuario(app, lancador).post(`${BASE}/${id}/aprovar`).expect(403);
      await comUsuario(app, aprovador).post(`${BASE}/${INEXISTENTE}/aprovar`).expect(404);
      await expectNoAudit(prisma, { entity: ENTITY, entityId: id, action: 'UPDATE' });
    });
  });

  describe('POST /:id/recusar', () => {
    it('200: recusa com motivo, audita e a baixa continua bloqueada', async () => {
      const id = await lancar();
      const dono = await prisma.usuario.findUniqueOrThrow({ where: { id: aprovador.id } });
      const res = await comUsuario(app, aprovador)
        .post(`${BASE}/${id}/recusar`)
        .send({ motivo: 'Boleto em duplicidade' })
        .expect(200);
      expect(res.body).toMatchObject({
        aprovacao: 'RECUSADA',
        motivoRecusa: 'Boleto em duplicidade',
        aprovadoPorNome: null,
      });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: id,
        before: { aprovacao: 'LANCADA', motivoRecusa: null },
        after: {
          aprovacao: 'RECUSADA',
          motivoRecusa: 'Boleto em duplicidade',
          recusadoPorNome: dono.nome,
        },
        userId: aprovador.id,
      });
      await comUsuario(app, lancador)
        .post(`${BASE}/${id}/baixar`)
        .send({ dataPagamento: '2026-11-04', valorPago: 500 })
        .expect(422);
    });

    it('400 sem motivo; 403 sem a permissão; 404 para inexistente; 422 do próprio lançador', async () => {
      const id = await lancar();
      await comUsuario(app, aprovador).post(`${BASE}/${id}/recusar`).send({}).expect(400);
      await comUsuario(app, aprovador)
        .post(`${BASE}/${id}/recusar`)
        .send({ motivo: '   ' })
        .expect(400);
      await comUsuario(app, lancador)
        .post(`${BASE}/${id}/recusar`)
        .send({ motivo: 'Erro' })
        .expect(403);
      await comUsuario(app, aprovador)
        .post(`${BASE}/${INEXISTENTE}/recusar`)
        .send({ motivo: 'Erro' })
        .expect(404);

      const propria = await comUsuario(app, aprovador).post(BASE).send(NOVA_CONTA).expect(201);
      const res = await comUsuario(app, aprovador)
        .post(`${BASE}/${propria.body.id}/recusar`)
        .send({ motivo: 'Erro' })
        .expect(422);
      expect(res.body.code).toBe('CONTA_PAGAR_APROVADOR_IGUAL_LANCADOR');
    });

    it('editar a conta recusada a reenvia para aprovação, e então ela pode ser aprovada', async () => {
      const id = await lancar();
      await comUsuario(app, aprovador)
        .post(`${BASE}/${id}/recusar`)
        .send({ motivo: 'Valor errado' })
        .expect(200);

      const editada = await comUsuario(app, lancador)
        .patch(`${BASE}/${id}`)
        .send({ ...NOVA_CONTA, valor: 450 })
        .expect(200);
      expect(editada.body).toMatchObject({ aprovacao: 'LANCADA', motivoRecusa: null });

      await comUsuario(app, aprovador).post(`${BASE}/${id}/aprovar`).expect(200);
    });
  });

  describe('edição de conta aprovada', () => {
    it('mudar o valor devolve a conta para aprovação; mudar só a observação mantém', async () => {
      const id = await lancar();
      await comUsuario(app, aprovador).post(`${BASE}/${id}/aprovar`).expect(200);

      const mantida = await comUsuario(app, lancador)
        .patch(`${BASE}/${id}`)
        .send({ ...NOVA_CONTA, observacoes: 'Contrato anual' })
        .expect(200);
      expect(mantida.body.aprovacao).toBe('APROVADA');

      const reenviada = await comUsuario(app, lancador)
        .patch(`${BASE}/${id}`)
        .send({ ...NOVA_CONTA, valor: 900 })
        .expect(200);
      expect(reenviada.body).toMatchObject({ aprovacao: 'LANCADA', aprovadoPorNome: null });
      await comUsuario(app, lancador)
        .post(`${BASE}/${id}/baixar`)
        .send({ dataPagamento: '2026-11-04', valorPago: 900 })
        .expect(422);
    });
  });

  describe('GET (listagem)', () => {
    it('filtra por situação de aprovação', async () => {
      const aguardando = await lancar();
      const aprovada = await lancar();
      await comUsuario(app, aprovador).post(`${BASE}/${aprovada}/aprovar`).expect(200);

      const res = await comUsuario(app, lancador).get(`${BASE}?aprovacao=LANCADA`).expect(200);
      expect(res.body.data.map((c: { id: string }) => c.id)).toEqual([aguardando]);
      await comUsuario(app, lancador).get(`${BASE}?aprovacao=OUTRA`).expect(400);
    });
  });
});
