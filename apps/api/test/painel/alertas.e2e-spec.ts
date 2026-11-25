import type { INestApplication } from '@nestjs/common';
import {
  alertaSchema,
  alertasResumoSchema,
  apiErrorSchema,
  type AlertasResumo,
} from '@torres/shared';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { hojeEmSaoPaulo } from '../../src/modules/gestao-profissionais/salas/data-local';
import { AlertasAgendador } from '../../src/modules/painel/alertas/alertas.agendador';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const URL = '/api/painel/alertas';
const ID_INEXISTENTE = '00000000-0000-4000-8000-00000000dead';

function somarDias(dia: string, dias: number): Date {
  const data = new Date(`${dia}T00:00:00.000Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data;
}

describe('Painel: central de alertas (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let financeiro: UsuarioTeste;
  let semOrigem: UsuarioTeste;
  const hoje = hojeEmSaoPaulo();

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    financeiro = await criarUsuarioTeste(app, {
      permissoes: [
        'painel.painel.ver',
        'financeiro.contas-pagar.ver',
        'financeiro.contas-receber.ver',
      ],
    });
    semOrigem = await criarUsuarioTeste(app, { permissoes: ['painel.painel.ver'] });
  });

  afterAll(async () => {
    await app.close();
  });

  /** 1 conta a pagar que vence hoje, 2 vencidas, 3 recebíveis vencidos (um é de profissional e não conta). */
  async function semear(): Promise<void> {
    const pagar = (dias: number, status: 'PENDENTE' | 'PAGO' = 'PENDENTE') =>
      prisma.contaPagar.create({
        data: {
          descricao: 'Conta fictícia',
          valor: '100.00',
          dataVencimento: somarDias(hoje, dias),
          status,
        },
      });
    await pagar(0);
    await pagar(-1);
    await pagar(-5);
    await pagar(-2, 'PAGO');
    const receber = (dias: number, extra: Record<string, unknown> = {}) =>
      prisma.contaReceber.create({
        data: {
          descricao: 'Recebível fictício',
          valor: '50.00',
          dataVencimento: somarDias(hoje, dias),
          ...extra,
        },
      });
    await receber(-1);
    await receber(-3);
    await receber(3);
    await app.get(AlertasAgendador).rodar(new Date());
  }

  const listar = async (quem = financeiro, query = ''): Promise<AlertasResumo> =>
    alertasResumoSchema.parse((await comUsuario(app, quem).get(`${URL}${query}`).expect(200)).body);

  it('GET: cada usuário recebe os contadores do dia e a lista já filtrada', async () => {
    await semear();
    const resumo = await listar();

    expect(resumo.data.map((a) => [a.tipo, a.quantidade, a.rota])).toEqual([
      [
        'CONTAS_PAGAR_VENCENDO',
        1,
        `/pagar?status=PENDENTE&vencimentoDe=${hoje}&vencimentoAte=${hoje}`,
      ],
      ['CONTAS_PAGAR_VENCIDAS', 2, '/pagar?status=VENCIDO'],
      ['RECEBIVEIS_VENCIDOS', 2, '/receber?status=VENCIDO'],
    ]);
    expect(resumo.naoLidos).toBe(3);
    await expectNoAudit(prisma, { entity: 'AlertaUsuario' });
  });

  it('GET: cada tipo aparece só para quem vê a tela de origem', async () => {
    await semear();
    expect(await listar(semOrigem)).toEqual({ data: [], naoLidos: 0 });

    const soReceber = await criarUsuarioTeste(app, {
      permissoes: ['painel.painel.ver', 'financeiro.contas-receber.ver'],
    });
    expect((await listar(soReceber)).data.map((a) => a.tipo)).toEqual(['RECEBIVEIS_VENCIDOS']);
  });

  it('GET: tipo sem registros no dia não aparece', async () => {
    await app.get(AlertasAgendador).rodar(new Date());
    expect(await listar()).toEqual({ data: [], naoLidos: 0 });
  });

  it('GET: 403 sem acesso ao Painel e 401 sem login', async () => {
    const semPainel = await criarUsuarioTeste(app, { permissoes: ['financeiro.contas-pagar.ver'] });
    const erro = apiErrorSchema.parse((await comUsuario(app, semPainel).get(URL).expect(403)).body);
    expect(erro.statusCode).toBe(403);
    await request(app.getHttpServer()).get(URL).expect(401);
  });

  it('GET: 400 com parâmetro inválido', async () => {
    const erro = apiErrorSchema.parse(
      (await comUsuario(app, financeiro).get(`${URL}?incluirResolvidos=talvez`).expect(400)).body,
    );
    expect(erro.code).toBe('VALIDATION_ERROR');
  });

  it('PATCH lido: grava o estado do usuário e o audit_log; os outros usuários não são afetados', async () => {
    await semear();
    const alvo = (await listar()).data[0]!;

    const resposta = alertaSchema.parse(
      (await comUsuario(app, financeiro).patch(`${URL}/${alvo.id}/lido`).expect(200)).body,
    );
    expect(resposta).toMatchObject({ id: alvo.id, lido: true, resolvido: false });

    const estado = await prisma.alertaUsuario.findFirstOrThrow({
      where: { alertaId: alvo.id, usuarioId: financeiro.id },
    });
    await expectAudit(prisma, {
      action: 'CREATE',
      entity: 'AlertaUsuario',
      entityId: estado.id,
      before: null,
      after: { alertaId: alvo.id, usuarioId: financeiro.id },
      userId: financeiro.id,
    });
    expect((await listar()).naoLidos).toBe(2);

    const outro = await criarUsuarioTeste(app, {
      permissoes: ['painel.painel.ver', 'financeiro.contas-pagar.ver'],
    });
    expect((await listar(outro)).data.find((a) => a.id === alvo.id)?.lido).toBe(false);
  });

  it('PATCH resolvido: some da lista, volta com incluirResolvidos e audita o UPDATE', async () => {
    await semear();
    const alvo = (await listar()).data[1]!;
    await comUsuario(app, financeiro).patch(`${URL}/${alvo.id}/lido`).expect(200);
    await comUsuario(app, financeiro).patch(`${URL}/${alvo.id}/resolvido`).expect(200);

    const estado = await prisma.alertaUsuario.findFirstOrThrow({
      where: { alertaId: alvo.id, usuarioId: financeiro.id },
    });
    expect(estado.resolvidoEm).not.toBeNull();
    await expectAudit(prisma, {
      action: 'UPDATE',
      entity: 'AlertaUsuario',
      entityId: estado.id,
      before: { resolvidoEm: null },
      userId: financeiro.id,
    });

    expect((await listar()).data.map((a) => a.id)).not.toContain(alvo.id);
    const todos = await listar(financeiro, '?incluirResolvidos=true');
    expect(todos.data.find((a) => a.id === alvo.id)).toMatchObject({ lido: true, resolvido: true });
  });

  it('PATCH: 404 para alerta inexistente, 400 para id inválido e 403 para tipo que o usuário não vê', async () => {
    await semear();
    const alvo = (await listar()).data[0]!;

    await comUsuario(app, financeiro).patch(`${URL}/${ID_INEXISTENTE}/lido`).expect(404);
    await comUsuario(app, financeiro).patch(`${URL}/abc/lido`).expect(400);
    await comUsuario(app, semOrigem).patch(`${URL}/${alvo.id}/lido`).expect(403);
    await request(app.getHttpServer()).patch(`${URL}/${alvo.id}/lido`).expect(401);
    expect(await prisma.alertaUsuario.count()).toBe(0);
    await expectNoAudit(prisma, { entity: 'AlertaUsuario' });
  });
});
