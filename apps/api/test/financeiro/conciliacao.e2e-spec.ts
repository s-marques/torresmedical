import type { INestApplication } from '@nestjs/common';
import {
  contaBancariaListaSchema,
  contaBancariaSchema,
  lancamentoConciliacaoPageSchema,
  resumoConciliacaoSchema,
} from '@torres/shared';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const CONTAS = '/api/financeiro/contas-bancarias';
const LANCAMENTOS = '/api/financeiro/conciliacao/lancamentos';
const RESUMO = '/api/financeiro/conciliacao/resumo';
const ENTITY = 'ContaBancaria';
const PERMISSOES = [
  'financeiro.conciliacao.ver',
  'financeiro.conciliacao.criar',
  'financeiro.conciliacao.excluir',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const PERIODO = { de: '2026-09-30', ate: '2026-10-30' };

describe('Conciliação (e2e)', () => {
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

  function http() {
    return comUsuario(app, usuario);
  }

  function criarContaBancaria(
    nome: string,
    extra: { saldoInicial?: string; deletedAt?: Date } = {},
  ) {
    return prisma.contaBancaria.create({ data: { nome, ...extra } });
  }

  function criarPagar(
    descricao: string,
    extra: { status?: 'PENDENTE' | 'PAGO' | 'CANCELADO'; dataVencimento?: Date } = {},
  ) {
    return prisma.contaPagar.create({
      data: { descricao, valor: '100.00', dataVencimento: new Date('2026-10-10'), ...extra },
    });
  }

  function baixar(
    contaPagarId: string,
    dataPagamento: string,
    extra: { valorPago?: string; contaBancariaId?: string; deletedAt?: Date } = {},
  ) {
    return prisma.contaPagarBaixa.create({
      data: { contaPagarId, dataPagamento: new Date(dataPagamento), valorPago: '100.00', ...extra },
    });
  }

  function criarReceber(
    descricao: string,
    extra: {
      valor?: string;
      status?: 'PENDENTE' | 'RECEBIDO' | 'CANCELADO';
      dataVencimento?: Date;
      dataRecebimento?: Date;
      contaBancariaId?: string;
      deletedAt?: Date;
    } = {},
  ) {
    return prisma.contaReceber.create({
      data: { descricao, valor: '100.00', dataVencimento: new Date('2026-10-10'), ...extra },
    });
  }

  describe('Contas bancárias', () => {
    it('GET lista as não excluídas, ordenadas pelo nome, com o saldo calculado', async () => {
      const banco = await criarContaBancaria('Banco B', { saldoInicial: '1000.00' });
      await criarContaBancaria('Banco A');
      await criarContaBancaria('Excluída', { deletedAt: new Date() });
      await criarReceber('Recebida', {
        status: 'RECEBIDO',
        dataRecebimento: new Date('2026-10-01'),
        contaBancariaId: banco.id,
        valor: '250.00',
      });
      const pagar = await criarPagar('Paga', { status: 'PAGO' });
      await baixar(pagar.id, '2026-10-02', { valorPago: '400.50', contaBancariaId: banco.id });
      await baixar(pagar.id, '2026-10-03', {
        valorPago: '999.00',
        contaBancariaId: banco.id,
        deletedAt: new Date(),
      });

      const res = await http().get(CONTAS).expect(200);
      const lista = contaBancariaListaSchema.parse(res.body);
      expect(lista.data.map((c) => c.nome)).toEqual(['Banco A', 'Banco B']);
      expect(lista.data[1]).toMatchObject({ saldo: '849.5', tipo: 'CORRENTE' });
    });

    it('GET aceita quem vê Contas a Pagar ou a Receber (comboboxes); 403 sem nenhuma', async () => {
      const pagar = await criarUsuarioTeste(app, { permissoes: ['financeiro.contas-pagar.ver'] });
      await comUsuario(app, pagar).get(CONTAS).expect(200);
      const receber = await criarUsuarioTeste(app, {
        permissoes: ['financeiro.contas-receber.ver'],
      });
      await comUsuario(app, receber).get(CONTAS).expect(200);
      const sem = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, sem).get(CONTAS).expect(403);
    });

    it('POST 201 cria (Nova Conta) e audita CREATE', async () => {
      const res = await http()
        .post(CONTAS)
        .send({
          nome: ' Conta Teste ',
          tipo: 'POUPANCA',
          banco: 'Banco Teste',
          agencia: '0001',
          conta: '12345-6',
          saldoInicial: -150.25,
          dataSaldoInicial: '2026-09-01',
        })
        .expect(201);
      expect(contaBancariaSchema.parse(res.body)).toMatchObject({
        nome: 'Conta Teste',
        tipo: 'POUPANCA',
        saldoInicial: '-150.25',
        dataSaldoInicial: '2026-09-01',
        saldo: '-150.25',
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { nome: 'Conta Teste', tipo: 'POUPANCA' },
        userId: usuario.id,
      });
    });

    it('POST 400 com nome e tipo ausentes (mensagem padrão), sem auditar', async () => {
      const res = await http().post(CONTAS).send({}).expect(400);
      expect(res.body.details).toEqual([
        { field: 'nome', message: 'Nome é obrigatório.' },
        { field: 'tipo', message: 'Tipo é obrigatório.' },
      ]);
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('POST 403 sem a permissão de criar', async () => {
      const so = await criarUsuarioTeste(app, { permissoes: ['financeiro.conciliacao.ver'] });
      await comUsuario(app, so).post(CONTAS).send({ nome: 'X', tipo: 'CAIXA' }).expect(403);
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('DELETE 200: exclusão lógica, some da lista; audita DELETE; 404 depois', async () => {
      const conta = await criarContaBancaria('Conta Teste');
      await http().delete(`${CONTAS}/${conta.id}`).expect(200);
      expect(
        (await prisma.contaBancaria.findUnique({ where: { id: conta.id } }))?.deletedAt,
      ).not.toBeNull();
      const lista = await http().get(CONTAS).expect(200);
      expect(lista.body.total).toBe(0);
      await expectAudit(prisma, {
        action: 'DELETE',
        entity: ENTITY,
        entityId: conta.id,
        before: { nome: 'Conta Teste' },
        userId: usuario.id,
      });
      await http().delete(`${CONTAS}/${conta.id}`).expect(404);
      await http().delete(`${CONTAS}/${INEXISTENTE}`).expect(404);
    });

    it('DELETE 403 sem a permissão de excluir', async () => {
      const conta = await criarContaBancaria('Conta Teste');
      const so = await criarUsuarioTeste(app, { permissoes: ['financeiro.conciliacao.ver'] });
      await comUsuario(app, so).delete(`${CONTAS}/${conta.id}`).expect(403);
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('GET lancamentos', () => {
    it('A Pagar: pagos pela data da baixa, demais pelo vencimento, filtro de conta', async () => {
      const banco = await criarContaBancaria('Banco');
      const paga = await criarPagar('Paga no período', {
        status: 'PAGO',
        dataVencimento: new Date('2026-08-01'),
      });
      await baixar(paga.id, '2026-10-05', { contaBancariaId: banco.id });
      const pagaFora = await criarPagar('Paga fora', { status: 'PAGO' });
      await baixar(pagaFora.id, '2026-11-15');
      await criarPagar('Pendente', { dataVencimento: new Date('2026-10-12') });
      await criarPagar('Pendente fora', { dataVencimento: new Date('2026-12-01') });

      const res = await http()
        .get(LANCAMENTOS)
        .query({ ...PERIODO, tipo: 'PAGAR' })
        .expect(200);
      const pagina = lancamentoConciliacaoPageSchema.parse(res.body);
      expect(pagina.data.map((l) => [l.descricao, l.data, l.status])).toEqual([
        ['Paga no período', '2026-10-05', 'PAGO'],
        ['Pendente', '2026-10-12', 'PENDENTE'],
      ]);

      const porConta = await http()
        .get(LANCAMENTOS)
        .query({ ...PERIODO, tipo: 'PAGAR', contaBancariaId: banco.id })
        .expect(200);
      expect(porConta.body.data.map((l: { descricao: string }) => l.descricao)).toEqual([
        'Paga no período',
      ]);
    });

    it('A Receber: recebidos pela data do recebimento, com o cliente', async () => {
      const banco = await criarContaBancaria('Banco');
      await criarReceber('Recebida', {
        status: 'RECEBIDO',
        dataVencimento: new Date('2026-12-01'),
        dataRecebimento: new Date('2026-10-01'),
        contaBancariaId: banco.id,
      });
      await criarReceber('Cancelada', { status: 'CANCELADO' });
      await criarReceber('Excluída', { deletedAt: new Date() });

      const res = await http()
        .get(LANCAMENTOS)
        .query({ ...PERIODO, tipo: 'RECEBER' })
        .expect(200);
      expect(
        res.body.data.map((l: { descricao: string; data: string }) => [l.descricao, l.data]),
      ).toEqual([
        ['Cancelada', '2026-10-10'],
        ['Recebida', '2026-10-01'],
      ]);
      const porConta = await http()
        .get(LANCAMENTOS)
        .query({ ...PERIODO, tipo: 'RECEBER', contaBancariaId: banco.id })
        .expect(200);
      expect(porConta.body.meta.total).toBe(1);
    });

    it('400 sem período, com período invertido ou tipo inválido; 403 sem permissão', async () => {
      const semPeriodo = await http().get(LANCAMENTOS).expect(400);
      expect(semPeriodo.body.details).toEqual(
        expect.arrayContaining([{ field: 'de', message: 'Data inicial é obrigatória.' }]),
      );
      await http().get(LANCAMENTOS).query({ de: '2026-10-30', ate: '2026-10-01' }).expect(400);
      await http()
        .get(LANCAMENTOS)
        .query({ ...PERIODO, tipo: 'X' })
        .expect(400);
      const sem = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, sem).get(LANCAMENTOS).query(PERIODO).expect(403);
    });
  });

  describe('GET resumo', () => {
    it('Saldo Sistema: recebido − pago no período, pelas datas de recebimento e pagamento', async () => {
      await criarReceber('Recebida', {
        status: 'RECEBIDO',
        dataRecebimento: new Date('2026-10-01'),
        valor: '9070.00',
      });
      await criarReceber('Recebida fora', {
        status: 'RECEBIDO',
        dataRecebimento: new Date('2026-11-01'),
      });
      await criarReceber('Pendente');
      const pagar = await criarPagar('Paga', { status: 'PAGO' });
      await baixar(pagar.id, '2026-10-05', { valorPago: '14679.45' });
      await baixar(pagar.id, '2026-10-06', { valorPago: '50.00', deletedAt: new Date() });

      const res = await http().get(RESUMO).query(PERIODO).expect(200);
      expect(resumoConciliacaoSchema.parse(res.body)).toEqual({
        recebido: '9070.00',
        pago: '14679.45',
        saldo: '-5609.45',
      });
    });

    it('400 sem período; 403 sem permissão', async () => {
      await http().get(RESUMO).expect(400);
      const sem = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, sem).get(RESUMO).query(PERIODO).expect(403);
    });
  });

  it('rotas exigem login', async () => {
    await request(app.getHttpServer()).get(RESUMO).query(PERIODO).expect(401);
  });
});
