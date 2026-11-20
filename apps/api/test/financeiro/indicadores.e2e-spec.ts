import type { INestApplication } from '@nestjs/common';
import { apiErrorSchema, indicadoresFinanceirosSchema } from '@torres/shared';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/financeiro/indicadores';

describe('Financeiro: Indicadores (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: ['financeiro.indicadores.ver'] });
  });

  afterAll(async () => {
    await app.close();
  });

  const http = (quem: UsuarioTeste = usuario) => comUsuario(app, quem);
  const valor = (corpo: { indicadores: { id: string; valor: number | null }[] }, id: string) =>
    corpo.indicadores.find((i) => i.id === id)?.valor;

  it('GET: 200 com os 10 cards no contrato, mês e mês anterior', async () => {
    const res = await http().get(BASE).query({ mes: '2026-10' }).expect(200);

    const corpo = indicadoresFinanceirosSchema.parse(res.body);
    expect(corpo).toMatchObject({ mes: '2026-10', mesAnterior: '2026-09' });
    expect(corpo.indicadores).toHaveLength(10);
    expect(valor(corpo, 'faturamento-total')).toBe(0);
    expect(valor(corpo, 'taxa-ocupacao')).toBeNull();
    await expectNoAudit(prisma, { entity: 'Indicadores' });
  });

  it('GET sem mês: usa o mês atual', async () => {
    const res = await http().get(BASE).expect(200);

    expect(indicadoresFinanceirosSchema.parse(res.body).mes).toMatch(/^\d{4}-\d{2}$/);
  });

  it('GET: confere os números com dados conhecidos (competência, só do Torres)', async () => {
    const profissional = await prisma.profissional.create({
      data: { nome: 'Profissional Teste' },
    });
    const conta = (extra: Record<string, unknown>) =>
      prisma.contaReceber.create({
        data: { descricao: 'Receita teste', valor: '100.00', ...extra } as never,
      });
    // Outubro: 100 recebida + 200 pendente + 50 cancelada (fora) + 999 de profissional (fora).
    await conta({
      dataVencimento: new Date('2026-10-05'),
      status: 'RECEBIDO',
      dataRecebimento: new Date('2026-10-06'),
    });
    await conta({ dataVencimento: new Date('2026-10-20'), valor: '200.00' });
    await conta({ dataVencimento: new Date('2026-10-10'), valor: '50.00', status: 'CANCELADO' });
    await conta({
      dataVencimento: new Date('2026-10-10'),
      valor: '999.00',
      profissionalId: profissional.id,
    });
    // Setembro: 150.
    await conta({ dataVencimento: new Date('2026-09-15'), valor: '150.00' });
    // Despesa paga em outubro: 40.
    const pagar = await prisma.contaPagar.create({
      data: { descricao: 'Despesa teste', valor: '40.00', dataVencimento: new Date('2026-10-08') },
    });
    await prisma.contaPagarBaixa.create({
      data: { contaPagarId: pagar.id, dataPagamento: new Date('2026-10-08'), valorPago: '40.00' },
    });

    const res = await http().get(BASE).query({ mes: '2026-10' }).expect(200);

    const corpo = indicadoresFinanceirosSchema.parse(res.body);
    expect(valor(corpo, 'faturamento-total')).toBe(300);
    expect(valor(corpo, 'receita-recorrente')).toBe(0);
    expect(valor(corpo, 'receita-avulsa')).toBe(300);
    expect(valor(corpo, 'resultado-operacional')).toBe(60);
    expect(valor(corpo, 'despesas-pagas')).toBe(40);
    expect(corpo.indicadores.find((i) => i.id === 'faturamento-total')).toMatchObject({
      anterior: 150,
      variacao: 100,
    });
  });

  it('GET: 400 com mês inválido', async () => {
    const res = await http().get(BASE).query({ mes: '2026-13' }).expect(400);

    expect(apiErrorSchema.parse(res.body).code).toBe('VALIDATION_ERROR');
  });

  it('GET: 403 sem permissão', async () => {
    const semPermissao = await criarUsuarioTeste(app, { permissoes: [] });

    await http(semPermissao).get(BASE).expect(403);
  });

  it('GET: 401 sem autenticação', async () => {
    await request(app.getHttpServer()).get(BASE).expect(401);
  });
});
