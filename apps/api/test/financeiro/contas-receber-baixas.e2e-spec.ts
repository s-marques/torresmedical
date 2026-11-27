import type { INestApplication } from '@nestjs/common';
import {
  contaReceberBaixaSchema,
  contaReceberPageSchema,
  contaReceberSchema,
  statusExibicaoContaReceber,
} from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { competenciaAtual } from '../../src/modules/gestao-profissionais/salas/competencia-cobranca';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit } from '../utils/expect-audit';

const BASE = '/api/financeiro/contas-receber';
const CONTRATOS = '/api/gestao-profissionais/contratos-sala';
const ENTITY = 'ContaReceber';
const PERMISSOES = [
  'financeiro.contas-receber.ver',
  'financeiro.contas-receber.criar',
  'financeiro.contas-receber.editar',
  'financeiro.contas-receber.excluir',
  'gestao-profissionais.salas.ver',
  'gestao-profissionais.salas.editar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe('Contas a Receber: contrato, baixa parcial e renegociação (e2e, #165)', () => {
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

  function criarNoBanco(valor = '100.00', dataVencimento = '2099-12-10') {
    return prisma.contaReceber.create({
      data: { descricao: 'Aluguel', valor, dataVencimento: new Date(dataVencimento) },
    });
  }

  /** Último UPDATE auditado do título (há vários: cada baixa e a renegociação auditam). */
  async function ultimoUpdate(id: string) {
    const log = await prisma.auditLog.findFirst({
      where: { entity: ENTITY, entityId: id, action: 'UPDATE' },
      orderBy: { occurredAt: 'desc' },
    });
    expect(log?.userId).toBe(usuario.id);
    return log;
  }

  const baixar = (id: string, corpo: Record<string, unknown>) =>
    http()
      .post(`${BASE}/${id}/baixar`)
      .send({ dataRecebimento: '2026-12-05', ...corpo });

  describe('cobrança gerada por contrato', () => {
    it('mostra o profissional locatário, o contrato e a competência', async () => {
      const sala = await prisma.sala.create({ data: { nome: 'Sala 30' } });
      const profissional = await prisma.profissional.create({ data: { nome: 'Dr. Locatário' } });
      const contrato = await prisma.contratoSala.create({
        data: {
          salaId: sala.id,
          locatarioTipo: 'PROFISSIONAL',
          profissionalId: profissional.id,
          modalidade: 'MENSAL',
          valorUnitario: 1500,
          dataInicio: new Date('2026-01-01T00:00:00Z'),
        },
      });

      await http().post(`${CONTRATOS}/gerar-cobrancas-mes`).expect(200);

      const lista = await http().get(BASE).expect(200);
      const [conta] = contaReceberPageSchema.parse(lista.body).data;
      expect(conta).toMatchObject({
        profissionalSacadoId: profissional.id,
        profissionalSacadoNome: 'Dr. Locatário',
        contratoSalaId: contrato.id,
        contratoSalaNumero: contrato.numero,
        competencia: competenciaAtual(),
        pacienteId: null,
        status: 'PENDENTE',
        valor: '1500',
        saldo: '1500.00',
      });
      // Receita do profissional (#55) é outra coisa: a cobrança continua em Contas a Receber.
      expect(await prisma.contaReceber.count({ where: { profissionalId: null } })).toBe(1);

      const busca = await http().get(BASE).query({ search: 'locatário' }).expect(200);
      expect(busca.body.data).toHaveLength(1);
    });
  });

  describe('POST (sacado e competência)', () => {
    it('201: aceita o profissional sacado e a competência; audita CREATE', async () => {
      const profissional = await prisma.profissional.create({ data: { nome: 'Dra. Sacada' } });
      const res = await http()
        .post(BASE)
        .send({
          descricao: 'Aluguel',
          valor: 300,
          dataVencimento: '2026-12-10',
          profissionalSacadoId: profissional.id,
          competencia: '2026-11',
        })
        .expect(201);
      expect(contaReceberSchema.parse(res.body)).toMatchObject({
        profissionalSacadoNome: 'Dra. Sacada',
        competencia: '2026-11',
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { profissionalSacadoId: profissional.id, competencia: '2026-11' },
      });
    });

    it('a competência padrão é o mês do vencimento', async () => {
      const res = await http()
        .post(BASE)
        .send({ descricao: 'Aluguel', valor: 300, dataVencimento: '2026-12-10' })
        .expect(201);
      expect(res.body.competencia).toBe('2026-12');
    });

    it('400 com paciente e profissional ao mesmo tempo ou competência inválida', async () => {
      const base = { descricao: 'Aluguel', valor: 300, dataVencimento: '2026-12-10' };
      await http()
        .post(BASE)
        .send({ ...base, pacienteId: INEXISTENTE, profissionalSacadoId: INEXISTENTE })
        .expect(400);
      await http()
        .post(BASE)
        .send({ ...base, competencia: '2026-13' })
        .expect(400);
      await http()
        .post(BASE)
        .send({ ...base, status: 'PARCIAL' })
        .expect(400);
    });
  });

  describe('POST /:id/baixar', () => {
    it('duas baixas parciais que somam o total levam o título a Pago; audita cada baixa', async () => {
      const conta = await criarNoBanco('150.50');

      const primeira = await baixar(conta.id, { valorRecebido: 100 }).expect(200);
      expect(contaReceberSchema.parse(primeira.body)).toMatchObject({
        status: 'PARCIAL',
        valorRecebido: '100.00',
        saldo: '50.50',
        dataRecebimento: '2026-12-05',
      });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: conta.id,
        before: { status: 'PENDENTE' },
        after: { status: 'PARCIAL' },
        userId: usuario.id,
      });

      const segunda = await baixar(conta.id, {
        valorRecebido: 50.5,
        dataRecebimento: '2026-12-09',
      }).expect(200);
      expect(contaReceberSchema.parse(segunda.body)).toMatchObject({
        status: 'RECEBIDO',
        valorRecebido: '150.50',
        saldo: '0.00',
        dataRecebimento: '2026-12-09',
      });
      expect(statusExibicaoContaReceber(segunda.body)).toBe('RECEBIDO');

      const historico = await http().get(`${BASE}/${conta.id}/baixas`).expect(200);
      const baixas = (historico.body as unknown[]).map((b) => contaReceberBaixaSchema.parse(b));
      expect(baixas.map((b) => b.valorRecebido)).toEqual(['50.5', '100']);
    });

    it('registra forma de pagamento, conta bancária, documento e observações na baixa', async () => {
      const banco = await prisma.contaBancaria.create({ data: { nome: 'Banco Teste' } });
      const forma = await prisma.formaPagamento.create({
        data: { nome: 'PIX', finalidade: 'RECEBER', tipo: 'PIX' },
      });
      const conta = await criarNoBanco();
      await baixar(conta.id, {
        valorRecebido: 40,
        contaBancariaId: banco.id,
        formaPagamentoId: forma.id,
        documento: 'REC-1',
        observacoes: 'Entrada',
      }).expect(200);

      const [baixa] = (await http().get(`${BASE}/${conta.id}/baixas`).expect(200)).body;
      expect(contaReceberBaixaSchema.parse(baixa)).toMatchObject({
        contaBancariaNome: 'Banco Teste',
        formaPagamentoNome: 'PIX',
        documento: 'REC-1',
        observacoes: 'Entrada',
      });
    });

    it('o grid filtra por Parcial e mostra o saldo', async () => {
      const conta = await criarNoBanco();
      await criarNoBanco();
      await baixar(conta.id, { valorRecebido: 30 }).expect(200);

      const parcial = await http().get(BASE).query({ status: 'PARCIAL' }).expect(200);
      expect(parcial.body.data).toHaveLength(1);
      expect(parcial.body.data[0]).toMatchObject({ id: conta.id, saldo: '70.00' });
    });

    it('422 com valor acima do saldo, sem gravar baixa nem auditar', async () => {
      const conta = await criarNoBanco();
      await baixar(conta.id, { valorRecebido: 60 }).expect(200);

      const res = await baixar(conta.id, { valorRecebido: 40.01 }).expect(422);
      expect(res.body.code).toBe('CONTA_RECEBER_BAIXA_EXCEDE_SALDO');
      expect(await prisma.contaReceberBaixa.count({ where: { contaReceberId: conta.id } })).toBe(1);
    });

    it('422 em título pago, cancelado ou renegociado', async () => {
      const paga = await criarNoBanco();
      await baixar(paga.id, { valorRecebido: 100 }).expect(200);
      await baixar(paga.id, { valorRecebido: 1 }).expect(422);

      const cancelada = await prisma.contaReceber.create({
        data: {
          descricao: 'X',
          valor: '10',
          dataVencimento: new Date('2099-01-01'),
          status: 'CANCELADO',
        },
      });
      await baixar(cancelada.id, { valorRecebido: 1 }).expect(422);
    });

    it('400 com valor zero, data ausente ou campo fora do schema', async () => {
      const conta = await criarNoBanco();
      await baixar(conta.id, { valorRecebido: 0 }).expect(400);
      await http().post(`${BASE}/${conta.id}/baixar`).send({ valorRecebido: 10 }).expect(400);
      await baixar(conta.id, { valorRecebido: 10, extra: 'x' }).expect(400);
    });

    it('404 para conta, conta bancária e forma de pagamento inexistentes', async () => {
      const conta = await criarNoBanco();
      await baixar(INEXISTENTE, { valorRecebido: 10 }).expect(404);
      await baixar(conta.id, { valorRecebido: 10, contaBancariaId: INEXISTENTE }).expect(404);
      await baixar(conta.id, { valorRecebido: 10, formaPagamentoId: INEXISTENTE }).expect(404);
      await http().get(`${BASE}/${INEXISTENTE}/baixas`).expect(404);
    });

    it('404 para receita de profissional (fica fora de Contas a Receber)', async () => {
      const profissional = await prisma.profissional.create({ data: { nome: 'Dr. Receita' } });
      const receita = await prisma.contaReceber.create({
        data: {
          descricao: 'Receita',
          valor: '10',
          dataVencimento: new Date('2099-01-01'),
          profissionalId: profissional.id,
        },
      });
      await baixar(receita.id, { valorRecebido: 10 }).expect(404);
    });

    it('403 sem a permissão de editar', async () => {
      const conta = await criarNoBanco();
      const leitor = await criarUsuarioTeste(app, {
        permissoes: ['financeiro.contas-receber.ver'],
      });
      await comUsuario(app, leitor)
        .post(`${BASE}/${conta.id}/baixar`)
        .send({ dataRecebimento: '2026-12-05', valorRecebido: 10 })
        .expect(403);
      await comUsuario(app, leitor).post(`${BASE}/${conta.id}/cancelar-baixa`).expect(403);
      await comUsuario(app, leitor)
        .post(`${BASE}/${conta.id}/renegociar`)
        .send({ parcelas: [{ valor: 10, dataVencimento: '2027-01-01' }] })
        .expect(403);
    });
  });

  describe('POST /:id/cancelar-baixa', () => {
    it('exclui a baixa mais recente, recalcula o status e audita', async () => {
      const conta = await criarNoBanco();
      await baixar(conta.id, { valorRecebido: 60 }).expect(200);
      await baixar(conta.id, { valorRecebido: 40 }).expect(200);

      const res = await http().post(`${BASE}/${conta.id}/cancelar-baixa`).expect(200);
      expect(contaReceberSchema.parse(res.body)).toMatchObject({
        status: 'PARCIAL',
        valorRecebido: '60.00',
        saldo: '40.00',
      });
      expect(
        await prisma.contaReceberBaixa.count({
          where: { contaReceberId: conta.id, deletedAt: { not: null } },
        }),
      ).toBe(1);

      const ultima = await http().post(`${BASE}/${conta.id}/cancelar-baixa`).expect(200);
      expect(ultima.body).toMatchObject({ status: 'PENDENTE', dataRecebimento: null });
      const log = await ultimoUpdate(conta.id);
      expect(log?.before).toMatchObject({ status: 'PARCIAL' });
      expect(log?.after).toMatchObject({ status: 'PENDENTE' });
    });

    it('422 sem baixa para cancelar e 404 para inexistente', async () => {
      const conta = await criarNoBanco();
      await http().post(`${BASE}/${conta.id}/cancelar-baixa`).expect(422);
      await http().post(`${BASE}/${INEXISTENTE}/cancelar-baixa`).expect(404);
    });
  });

  describe('POST /:id/renegociar', () => {
    const PARCELAS = [
      { valor: 30, dataVencimento: '2027-01-10' },
      { valor: 30, dataVencimento: '2027-02-10' },
    ];

    it('o título original fica Renegociado e rastreável; os novos nascem ligados a ele', async () => {
      const profissional = await prisma.profissional.create({ data: { nome: 'Dr. Devedor' } });
      const conta = await prisma.contaReceber.create({
        data: {
          descricao: 'Aluguel',
          valor: '100.00',
          dataVencimento: new Date('2026-10-10'),
          profissionalSacadoId: profissional.id,
          competencia: '2026-10',
        },
      });
      await baixar(conta.id, { valorRecebido: 40 }).expect(200);

      const res = await http()
        .post(`${BASE}/${conta.id}/renegociar`)
        .send({ parcelas: PARCELAS, observacoes: 'Acordo' })
        .expect(200);
      const original = contaReceberSchema.parse(res.body);
      expect(original).toMatchObject({
        status: 'RENEGOCIADO',
        saldo: '0.00',
        valorRecebido: '40.00',
      });
      expect(original.renegociadoParaNumeros).toHaveLength(2);

      const novas = await prisma.contaReceber.findMany({
        where: { renegociadoDeId: conta.id },
        orderBy: { numero: 'asc' },
      });
      expect(novas).toHaveLength(2);
      expect(novas.map((n) => n.valor.toString())).toEqual(['30', '30']);
      expect(novas[0]).toMatchObject({
        status: 'PENDENTE',
        profissionalSacadoId: profissional.id,
        competencia: '2026-10',
        observacoes: 'Acordo',
      });
      expect(novas.map((n) => n.numero)).toEqual(original.renegociadoParaNumeros);

      // O novo título mostra de onde veio.
      const detalhe = await http().get(`${BASE}/${novas[0]?.id}`).expect(200);
      expect(detalhe.body).toMatchObject({
        renegociadoDeId: conta.id,
        renegociadoDeNumero: conta.numero,
        profissionalSacadoNome: 'Dr. Devedor',
      });

      const log = await ultimoUpdate(conta.id);
      expect(log?.before).toMatchObject({ status: 'PARCIAL' });
      expect(log?.after).toMatchObject({ status: 'RENEGOCIADO' });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: novas[0]?.id as string,
        before: null,
        after: { renegociadoDeId: conta.id, status: 'PENDENTE' },
      });

      const filtro = await http().get(BASE).query({ status: 'RENEGOCIADO' }).expect(200);
      expect(filtro.body.data.map((c: { id: string }) => c.id)).toEqual([conta.id]);
    });

    it('422 quando as parcelas não somam o saldo em aberto, sem criar nada', async () => {
      const conta = await criarNoBanco();
      const res = await http()
        .post(`${BASE}/${conta.id}/renegociar`)
        .send({ parcelas: [{ valor: 99, dataVencimento: '2027-01-10' }] })
        .expect(422);
      expect(res.body.code).toBe('CONTA_RECEBER_RENEGOCIACAO_SOMA');
      expect(await prisma.contaReceber.count()).toBe(1);
    });

    it('422 ao renegociar de novo ou título pago; o renegociado não é editado nem excluído', async () => {
      const conta = await criarNoBanco();
      await http()
        .post(`${BASE}/${conta.id}/renegociar`)
        .send({ parcelas: [{ valor: 100, dataVencimento: '2027-01-10' }] })
        .expect(200);
      await http()
        .post(`${BASE}/${conta.id}/renegociar`)
        .send({ parcelas: [{ valor: 100, dataVencimento: '2027-01-10' }] })
        .expect(422);
      await http()
        .patch(`${BASE}/${conta.id}`)
        .send({ descricao: 'X', valor: 100, dataVencimento: '2027-01-10' })
        .expect(422);
      await http().delete(`${BASE}/${conta.id}`).expect(422);

      const paga = await criarNoBanco();
      await baixar(paga.id, { valorRecebido: 100 }).expect(200);
      await http()
        .post(`${BASE}/${paga.id}/renegociar`)
        .send({ parcelas: [{ valor: 100, dataVencimento: '2027-01-10' }] })
        .expect(422);
    });

    it('400 sem parcelas, com valor inválido ou data inválida; 404 para inexistente', async () => {
      const conta = await criarNoBanco();
      const url = `${BASE}/${conta.id}/renegociar`;
      await http().post(url).send({ parcelas: [] }).expect(400);
      await http().post(url).send({}).expect(400);
      await http()
        .post(url)
        .send({ parcelas: [{ valor: 0, dataVencimento: '2027-01-10' }] })
        .expect(400);
      await http()
        .post(url)
        .send({ parcelas: [{ valor: 100, dataVencimento: 'ontem' }] })
        .expect(400);
      await http()
        .post(`${BASE}/${INEXISTENTE}/renegociar`)
        .send({ parcelas: [{ valor: 100, dataVencimento: '2027-01-10' }] })
        .expect(404);
    });
  });

  describe('status A vencer e Vencido (calculados)', () => {
    it('divide as contas pendentes pelo vencimento de hoje', async () => {
      const futura = await criarNoBanco('10', '2099-01-01');
      const vencida = await criarNoBanco('10', '2020-01-01');

      const aVencer = await http().get(BASE).query({ status: 'A_VENCER' }).expect(200);
      expect(aVencer.body.data.map((c: { id: string }) => c.id)).toEqual([futura.id]);
      const vencidas = await http().get(BASE).query({ status: 'VENCIDO' }).expect(200);
      expect(vencidas.body.data.map((c: { id: string }) => c.id)).toEqual([vencida.id]);
      await http().get(BASE).query({ status: 'PENDENTE' }).expect(400);
    });
  });
});
