import type { INestApplication } from '@nestjs/common';
import {
  agendamentoSchema,
  contaPagarSchema,
  contaReceberSchema,
  orcamentoSchema,
  paginaRelatorioSchema,
  type Permissao,
  type TipoCancelamento,
} from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';
import { criarMotivo, criarMotivoOutro } from '../utils/motivos-cancelamento';

const INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const PERMISSOES: readonly Permissao[] = [
  'comercial-atendimento.agenda.ver',
  'comercial-atendimento.agenda.editar',
  'comercial-atendimento.orcamentos.ver',
  'comercial-atendimento.orcamentos.editar',
  'financeiro.contas-receber.ver',
  'financeiro.contas-receber.editar',
  'financeiro.contas-pagar.ver',
  'financeiro.contas-pagar.editar',
  'configuracoes-gestao.relatorios.ver',
];

describe('Cancelamentos rastreáveis (e2e, issue #162)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;
  let motivos: Record<TipoCancelamento, { id: string; outroId: string }>;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
    const lista = async (tipo: TipoCancelamento, nome: string) => ({
      id: (await criarMotivo(prisma, tipo, { nome, ordem: 1 })).id,
      outroId: (await criarMotivoOutro(prisma, tipo)).id,
    });
    motivos = {
      CONSULTA: await lista('CONSULTA', 'Paciente desistiu'),
      CONTRATO: await lista('CONTRATO', 'Valor'),
      COBRANCA: await lista('COBRANCA', 'Lançamento duplicado'),
      PERIODO: await lista('PERIODO', 'Manutenção da sala'),
      PROPOSTA: await lista('PROPOSTA', 'Valor'),
    };
  });

  afterAll(async () => {
    await app.close();
  });

  const http = (quem: UsuarioTeste = usuario) => comUsuario(app, quem);
  const somenteLeitura = (...permissoes: Permissao[]) =>
    criarUsuarioTeste(app, { permissoes }).then((u) => comUsuario(app, u));

  /** Cancelamentos gravados para a entidade. */
  const historico = (entidadeId: string) =>
    prisma.cancelamento.findMany({ where: { entidadeId }, orderBy: { canceladoEm: 'asc' } });

  /** Casos de validação comuns a todo cancelamento com motivo da lista. */
  function validacoes(
    url: () => Promise<string>,
    tipo: TipoCancelamento,
    entidade: string,
    fixarStatus: (id: string) => Promise<string>,
  ) {
    it('400 sem motivo, com motivo de outro tipo ou inexistente, e "Outro" sem observação', async () => {
      const alvo = await url();
      const vazio = await http().post(alvo).send({}).expect(400);
      expect(vazio.body.details).toEqual([
        expect.objectContaining({ field: 'motivoId', message: 'Motivo é obrigatório.' }),
      ]);
      const outroTipo: TipoCancelamento = tipo === 'CONSULTA' ? 'PROPOSTA' : 'CONSULTA';
      for (const motivoId of [motivos[outroTipo].id, INEXISTENTE]) {
        const res = await http().post(alvo).send({ motivoId }).expect(400);
        expect(res.body.details).toEqual([{ field: 'motivoId', message: 'Motivo inválido' }]);
      }
      const semTexto = await http()
        .post(alvo)
        .send({ motivoId: motivos[tipo].outroId, observacao: '   ' })
        .expect(400);
      expect(semTexto.body.details).toEqual([
        { field: 'observacao', message: 'Observação é obrigatória.' },
      ]);
      await http().post(alvo).send({ motivoId: motivos[tipo].id, extra: 1 }).expect(400);

      expect(await prisma.cancelamento.count()).toBe(0);
      await expectNoAudit(prisma, { entity: entidade });
      expect(await fixarStatus(alvo.split('/').at(-2) as string)).not.toBe('CANCELADO');
    });

    it('"Outro" com observação grava o texto', async () => {
      const alvo = await url();
      await http()
        .post(alvo)
        .send({ motivoId: motivos[tipo].outroId, observacao: ' Detalhe fictício ' })
        .expect(200);
      const [registro] = await historico(alvo.split('/').at(-2) as string);
      expect(registro).toMatchObject({ motivoNome: 'Outro', observacao: 'Detalhe fictício' });
    });

    it('404 para inexistente, 400 para id inválido', async () => {
      const alvo = await url();
      const base = alvo.slice(0, alvo.lastIndexOf('/', alvo.lastIndexOf('/') - 1));
      await http()
        .post(`${base}/${INEXISTENTE}/cancelar`)
        .send({ motivoId: motivos[tipo].id })
        .expect(404);
      await http().post(`${base}/abc/cancelar`).send({ motivoId: motivos[tipo].id }).expect(400);
    });
  }

  describe('Agenda: POST /agendamentos/:id/cancelar (consulta)', () => {
    const BASE = '/api/comercial-atendimento/agendamentos';

    async function agendar(extra: Record<string, unknown> = {}, profissionalId?: string) {
      const paciente = await prisma.paciente.create({ data: { nome: 'Paciente Fictício' } });
      const prof =
        profissionalId === undefined
          ? await prisma.profissional.create({
              data: { nome: 'Dr. Fictício', corCalendario: 'verde' },
            })
          : { id: profissionalId };
      const agendamento = await prisma.agendamento.create({
        data: {
          pacienteId: paciente.id,
          profissionalId: prof.id,
          inicio: new Date('2026-10-22T19:00:00Z'),
          ...extra,
        },
      });
      return { agendamento, prof, paciente };
    }

    it('cancela, grava quem, quando, motivo e profissional, e audita UPDATE', async () => {
      const { agendamento, prof } = await agendar();

      const res = await http()
        .post(`${BASE}/${agendamento.id}/cancelar`)
        .send({ motivoId: motivos.CONSULTA.id, observacao: 'Viagem' })
        .expect(200);

      expect(agendamentoSchema.parse(res.body)).toMatchObject({
        id: agendamento.id,
        status: 'CANCELADO',
      });
      const [registro] = await historico(agendamento.id);
      expect(registro).toMatchObject({
        tipo: 'CONSULTA',
        entidade: 'Agendamento',
        motivoId: motivos.CONSULTA.id,
        motivoNome: 'Paciente desistiu',
        observacao: 'Viagem',
        canceladoPorId: usuario.id,
        profissionalId: prof.id,
        reagendouParaId: null,
      });
      expect(registro?.canceladoEm).toBeInstanceOf(Date);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Agendamento',
        entityId: agendamento.id,
        before: { status: 'AGENDADO' },
        after: { status: 'CANCELADO' },
        userId: usuario.id,
      });
    });

    it('guarda o link do novo agendamento quando reagendou', async () => {
      const { agendamento, prof, paciente } = await agendar({ status: 'CONFIRMADO' });
      const novo = await prisma.agendamento.create({
        data: {
          pacienteId: paciente.id,
          profissionalId: prof.id,
          inicio: new Date('2026-10-29T19:00:00Z'),
        },
      });

      await http()
        .post(`${BASE}/${agendamento.id}/cancelar`)
        .send({ motivoId: motivos.CONSULTA.id, reagendouParaId: novo.id })
        .expect(200);

      expect((await historico(agendamento.id))[0]?.reagendouParaId).toBe(novo.id);
    });

    it('400 quando o novo agendamento não existe ou é o próprio', async () => {
      const { agendamento } = await agendar();
      for (const reagendouParaId of [INEXISTENTE, agendamento.id]) {
        const res = await http()
          .post(`${BASE}/${agendamento.id}/cancelar`)
          .send({ motivoId: motivos.CONSULTA.id, reagendouParaId })
          .expect(400);
        expect(res.body.details).toEqual([
          { field: 'reagendouParaId', message: 'Novo agendamento inválido' },
        ]);
      }
      expect(await prisma.cancelamento.count()).toBe(0);
    });

    it.each(['CANCELADO', 'ATENDIDO', 'FALTOU', 'CHECK_IN'] as const)(
      '409 quando o agendamento está %s, sem registrar nem auditar',
      async (status) => {
        const { agendamento } = await agendar({ status });
        const res = await http()
          .post(`${BASE}/${agendamento.id}/cancelar`)
          .send({ motivoId: motivos.CONSULTA.id })
          .expect(409);
        expect(res.body.code).toBe('AGENDAMENTO_NAO_CANCELAVEL');
        expect(await prisma.cancelamento.count()).toBe(0);
        await expectNoAudit(prisma, { entity: 'Agendamento' });
      },
    );

    it('cancelar duas vezes: a segunda dá 409 e o histórico fica com um registro', async () => {
      const { agendamento } = await agendar();
      const corpo = { motivoId: motivos.CONSULTA.id };
      await http().post(`${BASE}/${agendamento.id}/cancelar`).send(corpo).expect(200);
      await http().post(`${BASE}/${agendamento.id}/cancelar`).send(corpo).expect(409);
      expect(await historico(agendamento.id)).toHaveLength(1);
    });

    it('403 sem permissão de editar e para profissional fora do escopo', async () => {
      const { agendamento } = await agendar();
      const leitor = await somenteLeitura('comercial-atendimento.agenda.ver');
      await leitor
        .post(`${BASE}/${agendamento.id}/cancelar`)
        .send({ motivoId: motivos.CONSULTA.id })
        .expect(403);

      const outro = await prisma.profissional.create({
        data: { nome: 'Outro', corCalendario: 'azul' },
      });
      const restrito = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [outro.id],
      });
      await http(restrito)
        .post(`${BASE}/${agendamento.id}/cancelar`)
        .send({ motivoId: motivos.CONSULTA.id })
        .expect(403);

      expect(await prisma.cancelamento.count()).toBe(0);
      await expectNoAudit(prisma, { entity: 'Agendamento' });
    });

    it('usuário restrito cancela a consulta do seu profissional', async () => {
      const { agendamento, prof } = await agendar();
      const restrito = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [prof.id],
      });
      await http(restrito)
        .post(`${BASE}/${agendamento.id}/cancelar`)
        .send({ motivoId: motivos.CONSULTA.id })
        .expect(200);
    });

    describe('validações', () => {
      const criar = async () => `${BASE}/${(await agendar()).agendamento.id}/cancelar`;
      validacoes(
        criar,
        'CONSULTA',
        'Agendamento',
        async (id) => (await prisma.agendamento.findUniqueOrThrow({ where: { id } })).status,
      );
    });
  });

  describe('Orçamentos: POST /orcamentos/:id/cancelar (proposta)', () => {
    const BASE = '/api/comercial-atendimento/orcamentos';
    const criarOrcamento = (
      status: 'PENDENTE' | 'APROVADO' | 'CONCLUIDO' | 'CANCELADO' = 'PENDENTE',
    ) => prisma.orcamento.create({ data: { subtotal: 100, total: 100, status } });

    it.each(['PENDENTE', 'APROVADO'] as const)(
      'cancela o orçamento %s, registra o motivo e audita UPDATE',
      async (status) => {
        const orcamento = await criarOrcamento(status);

        const res = await http()
          .post(`${BASE}/${orcamento.id}/cancelar`)
          .send({ motivoId: motivos.PROPOSTA.id, observacao: 'Sem retorno' })
          .expect(200);

        expect(orcamentoSchema.parse(res.body).status).toBe('CANCELADO');
        expect((await historico(orcamento.id))[0]).toMatchObject({
          tipo: 'PROPOSTA',
          entidade: 'Orcamento',
          motivoNome: 'Valor',
          observacao: 'Sem retorno',
          canceladoPorId: usuario.id,
        });
        await expectAudit(prisma, {
          action: 'UPDATE',
          entity: 'Orcamento',
          entityId: orcamento.id,
          before: { status },
          after: { status: 'CANCELADO' },
          userId: usuario.id,
        });
      },
    );

    it.each(['CONCLUIDO', 'CANCELADO'] as const)(
      '409 quando o orçamento está %s',
      async (status) => {
        const orcamento = await criarOrcamento(status);
        const res = await http()
          .post(`${BASE}/${orcamento.id}/cancelar`)
          .send({ motivoId: motivos.PROPOSTA.id })
          .expect(409);
        expect(res.body.code).toBe('ORCAMENTO_NAO_CANCELAVEL');
        expect(await prisma.cancelamento.count()).toBe(0);
        await expectNoAudit(prisma, { entity: 'Orcamento' });
      },
    );

    it('404 para excluído e 403 sem permissão de editar', async () => {
      const excluido = await prisma.orcamento.create({
        data: { subtotal: 1, total: 1, deletedAt: new Date() },
      });
      await http()
        .post(`${BASE}/${excluido.id}/cancelar`)
        .send({ motivoId: motivos.PROPOSTA.id })
        .expect(404);
      const orcamento = await criarOrcamento();
      const leitor = await somenteLeitura('comercial-atendimento.orcamentos.ver');
      await leitor
        .post(`${BASE}/${orcamento.id}/cancelar`)
        .send({ motivoId: motivos.PROPOSTA.id })
        .expect(403);
    });

    describe('validações', () => {
      const criar = async () => `${BASE}/${(await criarOrcamento()).id}/cancelar`;
      validacoes(
        criar,
        'PROPOSTA',
        'Orcamento',
        async (id) => (await prisma.orcamento.findUniqueOrThrow({ where: { id } })).status,
      );
    });
  });

  describe('Contas a Receber: POST /contas-receber/:id/cancelar (cobrança)', () => {
    const BASE = '/api/financeiro/contas-receber';
    const criarConta = (status: 'PENDENTE' | 'RECEBIDO' | 'CANCELADO' = 'PENDENTE') =>
      prisma.contaReceber.create({
        data: {
          descricao: 'Mensalidade fictícia',
          valor: '100.00',
          dataVencimento: new Date('2026-12-10'),
          status,
        },
      });

    it('cancela a conta pendente, registra o motivo e audita UPDATE', async () => {
      const conta = await criarConta();

      const res = await http()
        .post(`${BASE}/${conta.id}/cancelar`)
        .send({ motivoId: motivos.COBRANCA.id })
        .expect(200);

      expect(contaReceberSchema.parse(res.body).status).toBe('CANCELADO');
      expect((await historico(conta.id))[0]).toMatchObject({
        tipo: 'COBRANCA',
        entidade: 'ContaReceber',
        motivoNome: 'Lançamento duplicado',
        canceladoPorId: usuario.id,
      });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'ContaReceber',
        entityId: conta.id,
        before: { status: 'PENDENTE' },
        after: { status: 'CANCELADO' },
        userId: usuario.id,
      });
    });

    it.each(['RECEBIDO', 'CANCELADO'] as const)('409 quando a conta está %s', async (status) => {
      const conta = await criarConta(status);
      const res = await http()
        .post(`${BASE}/${conta.id}/cancelar`)
        .send({ motivoId: motivos.COBRANCA.id })
        .expect(409);
      expect(res.body.code).toBe('CONTA_RECEBER_NAO_PENDENTE');
      expect(await prisma.cancelamento.count()).toBe(0);
    });

    it('404 para excluída e 403 sem permissão de editar', async () => {
      const excluida = await prisma.contaReceber.create({
        data: {
          descricao: 'x',
          valor: '1',
          dataVencimento: new Date('2026-12-10'),
          deletedAt: new Date(),
        },
      });
      await http()
        .post(`${BASE}/${excluida.id}/cancelar`)
        .send({ motivoId: motivos.COBRANCA.id })
        .expect(404);
      const conta = await criarConta();
      const leitor = await somenteLeitura('financeiro.contas-receber.ver');
      await leitor
        .post(`${BASE}/${conta.id}/cancelar`)
        .send({ motivoId: motivos.COBRANCA.id })
        .expect(403);
    });

    describe('validações', () => {
      const criar = async () => `${BASE}/${(await criarConta()).id}/cancelar`;
      validacoes(
        criar,
        'COBRANCA',
        'ContaReceber',
        async (id) => (await prisma.contaReceber.findUniqueOrThrow({ where: { id } })).status,
      );
    });
  });

  describe('Contas a Pagar: POST /contas-pagar/:id/cancelar (cobrança)', () => {
    const BASE = '/api/financeiro/contas-pagar';
    const criarConta = (status: 'PENDENTE' | 'PAGO' | 'CANCELADO' = 'PENDENTE') =>
      prisma.contaPagar.create({
        data: {
          descricao: 'Água fictícia',
          valor: '100.00',
          dataVencimento: new Date('2026-12-10'),
          status,
        },
      });

    it('cancela a conta pendente sem baixa, registra o motivo e audita UPDATE', async () => {
      const conta = await criarConta();

      const res = await http()
        .post(`${BASE}/${conta.id}/cancelar`)
        .send({ motivoId: motivos.COBRANCA.id, observacao: 'Fatura duplicada' })
        .expect(200);

      expect(contaPagarSchema.parse(res.body).status).toBe('CANCELADO');
      expect((await historico(conta.id))[0]).toMatchObject({
        tipo: 'COBRANCA',
        entidade: 'ContaPagar',
        observacao: 'Fatura duplicada',
        canceladoPorId: usuario.id,
      });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'ContaPagar',
        entityId: conta.id,
        before: { status: 'PENDENTE' },
        after: { status: 'CANCELADO' },
        userId: usuario.id,
      });
    });

    it.each(['PAGO', 'CANCELADO'] as const)('409 quando a conta está %s', async (status) => {
      const conta = await criarConta(status);
      const res = await http()
        .post(`${BASE}/${conta.id}/cancelar`)
        .send({ motivoId: motivos.COBRANCA.id })
        .expect(409);
      expect(res.body.code).toBe('CONTA_PAGAR_NAO_PENDENTE');
    });

    it('409 quando há pagamento parcial: cancele a baixa antes', async () => {
      const conta = await criarConta();
      await prisma.contaPagarBaixa.create({
        data: { contaPagarId: conta.id, dataPagamento: new Date('2026-11-20'), valorPago: '40.00' },
      });
      const res = await http()
        .post(`${BASE}/${conta.id}/cancelar`)
        .send({ motivoId: motivos.COBRANCA.id })
        .expect(409);
      expect(res.body.code).toBe('CONTA_PAGAR_COM_BAIXA');
      expect(await prisma.cancelamento.count()).toBe(0);
      await expectNoAudit(prisma, { entity: 'ContaPagar' });
    });

    it('403 sem permissão de editar', async () => {
      const conta = await criarConta();
      const leitor = await somenteLeitura('financeiro.contas-pagar.ver');
      await leitor
        .post(`${BASE}/${conta.id}/cancelar`)
        .send({ motivoId: motivos.COBRANCA.id })
        .expect(403);
    });

    describe('validações', () => {
      const criar = async () => `${BASE}/${(await criarConta()).id}/cancelar`;
      validacoes(
        criar,
        'COBRANCA',
        'ContaPagar',
        async (id) => (await prisma.contaPagar.findUniqueOrThrow({ where: { id } })).status,
      );
    });
  });

  describe('Relatórios de cancelamentos (GES-05 e GES-06)', () => {
    const BASE = '/api/configuracoes-gestao/relatorios';
    const OUTUBRO = { de: '2026-10-01', ate: '2026-10-31' };
    let profA: string;
    let profB: string;

    beforeEach(async () => {
      profA = (await prisma.profissional.create({ data: { nome: 'Dra. Ana' } })).id;
      profB = (await prisma.profissional.create({ data: { nome: 'Dr. Bruno' } })).id;
      await prisma.usuario.update({ where: { id: usuario.id }, data: { nome: 'Gerente Teste' } });
      const base = { entidadeId: INEXISTENTE, entidade: 'Agendamento' };
      await prisma.cancelamento.createMany({
        data: [
          {
            ...base,
            tipo: 'CONSULTA',
            motivoId: motivos.CONSULTA.id,
            motivoNome: 'Paciente desistiu',
            profissionalId: profA,
            canceladoPorId: usuario.id,
            reagendouParaId: INEXISTENTE,
            canceladoEm: new Date('2026-10-10T15:00:00Z'),
          },
          {
            ...base,
            tipo: 'CONSULTA',
            motivoId: motivos.CONSULTA.id,
            motivoNome: 'Paciente desistiu',
            profissionalId: profA,
            canceladoPorId: usuario.id,
            canceladoEm: new Date('2026-10-12T15:00:00Z'),
          },
          {
            ...base,
            tipo: 'CONSULTA',
            motivoId: motivos.CONSULTA.outroId,
            motivoNome: 'Outro',
            observacao: 'Detalhe fictício',
            profissionalId: profB,
            canceladoPorId: usuario.id,
            canceladoEm: new Date('2026-10-14T15:00:00Z'),
          },
          {
            ...base,
            entidade: 'ContaPagar',
            tipo: 'COBRANCA',
            motivoId: motivos.COBRANCA.id,
            motivoNome: 'Lançamento duplicado',
            canceladoEm: new Date('2026-10-20T15:00:00Z'),
          },
          {
            ...base,
            tipo: 'CONSULTA',
            motivoId: motivos.CONSULTA.id,
            motivoNome: 'Paciente desistiu',
            profissionalId: profA,
            canceladoEm: new Date('2026-09-30T15:00:00Z'),
          },
        ],
      });
    });

    it('catálogo traz GES-05 e GES-06 com o filtro de tipo', async () => {
      const res = await http().get(BASE).expect(200);
      const ids = res.body.data.map((r: { id: string }) => r.id);
      expect(ids).toEqual(expect.arrayContaining(['GES-05', 'GES-06']));
      const ges05 = res.body.data.find((r: { id: string }) => r.id === 'GES-05');
      expect(ges05.colunas.map((c: { titulo: string }) => c.titulo)).toEqual([
        'Data/hora',
        'Tipo',
        'Motivo',
        'Profissional',
        'Cancelado por',
        'Reagendou',
        'Observação',
      ]);
      expect(ges05.filtros[0]).toMatchObject({ parametro: 'tipo', rotulo: 'Tipo' });
      expect(ges05.filtros[0].opcoes.map((o: { valor: string }) => o.valor)).toEqual([
        'CONSULTA',
        'CONTRATO',
        'COBRANCA',
        'PERIODO',
        'PROPOSTA',
      ]);
    });

    it('GES-05 lista o período, do mais recente ao mais antigo, com nomes e reagendamento', async () => {
      const res = await http().get(`${BASE}/GES-05`).query(OUTUBRO).expect(200);

      const pagina = paginaRelatorioSchema.parse(res.body);
      expect(pagina.meta.total).toBe(4);
      expect(
        pagina.data.map((l) => [l.tipo, l.motivo, l.profissional, l.canceladoPor, l.reagendou]),
      ).toEqual([
        ['Cobrança', 'Lançamento duplicado', null, 'Sistema', null],
        ['Consulta', 'Outro', 'Dr. Bruno', 'Gerente Teste', 'Não'],
        ['Consulta', 'Paciente desistiu', 'Dra. Ana', 'Gerente Teste', 'Não'],
        ['Consulta', 'Paciente desistiu', 'Dra. Ana', 'Gerente Teste', 'Sim'],
      ]);
      expect(pagina.data[1]?.observacao).toBe('Detalhe fictício');
    });

    it('GES-05 filtra por tipo, ordena por motivo e pagina', async () => {
      const consulta = await http()
        .get(`${BASE}/GES-05`)
        .query({ ...OUTUBRO, tipo: 'CONSULTA' })
        .expect(200);
      expect(consulta.body.meta.total).toBe(3);

      const ordenado = await http()
        .get(`${BASE}/GES-05`)
        .query({ ...OUTUBRO, sort: 'motivo:asc', page: 2, pageSize: 2 })
        .expect(200);
      expect(ordenado.body.data.map((l: { motivo: string }) => l.motivo)).toEqual([
        'Paciente desistiu',
        'Paciente desistiu',
      ]);
      expect(ordenado.body.meta).toMatchObject({ page: 2, pageSize: 2, total: 4, totalPages: 2 });
    });

    it('GES-06 soma por tipo, motivo e profissional', async () => {
      const res = await http().get(`${BASE}/GES-06`).query(OUTUBRO).expect(200);

      expect(
        paginaRelatorioSchema
          .parse(res.body)
          .data.map((l) => [l.tipo, l.motivo, l.profissional, l.quantidade]),
      ).toEqual([
        ['Consulta', 'Paciente desistiu', 'Dra. Ana', 2],
        ['Cobrança', 'Lançamento duplicado', null, 1],
        ['Consulta', 'Outro', 'Dr. Bruno', 1],
      ]);
    });

    it('usuário com escopo restrito só vê os cancelamentos dos seus profissionais', async () => {
      const restrito = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [profB],
      });

      const res = await http(restrito).get(`${BASE}/GES-05`).query(OUTUBRO).expect(200);
      expect(res.body.data.map((l: { profissional: string }) => l.profissional)).toEqual([
        'Dr. Bruno',
      ]);
      const resumo = await http(restrito).get(`${BASE}/GES-06`).query(OUTUBRO).expect(200);
      expect(resumo.body.meta.total).toBe(1);
    });

    it('exportação audita EXPORT com o id do relatório', async () => {
      const exportador = await criarUsuarioTeste(app, {
        permissoes: [...PERMISSOES, 'configuracoes-gestao.relatorios.exportar'],
      });
      await http(exportador)
        .get(`${BASE}/GES-05/export`)
        .query({ ...OUTUBRO, format: 'xlsx' })
        .buffer(true)
        .expect(200);
      await expectAudit(prisma, {
        action: 'EXPORT',
        entity: 'Relatorio',
        entityId: 'GES-05',
        userId: exportador.id,
      });
    });

    it('403 sem a permissão de relatórios e 400 para período inválido', async () => {
      await (
        await somenteLeitura('comercial-atendimento.agenda.ver')
      )
        .get(`${BASE}/GES-05`)
        .query(OUTUBRO)
        .expect(403);
      await http().get(`${BASE}/GES-05`).query({ de: '2026-10-31', ate: '2026-10-01' }).expect(400);
    });
  });

  describe('Desempenho do relatório (critério: menos de 3 s com 12 meses de dados)', () => {
    it('GES-05 e GES-06 respondem em menos de 3 s com 12 meses (~120 mil cancelamentos)', async () => {
      const profissionais = await Promise.all(
        [1, 2, 3, 4, 5].map((n) =>
          prisma.profissional.create({ data: { nome: `Profissional ${n}` } }),
        ),
      );
      const ids = profissionais.map((p) => p.id);
      await prisma.$executeRaw`
        INSERT INTO cancelamentos (tipo, entidade, entidade_id, motivo_id, motivo_nome, cancelado_em, profissional_id)
        SELECT 'CONSULTA', 'Agendamento', gen_random_uuid(), ${motivos.CONSULTA.id}::uuid, 'Paciente desistiu',
               TIMESTAMPTZ '2026-01-01 00:00:00-03' + (g * INTERVAL '4 minutes'),
               (${ids}::uuid[])[1 + (g % 5)]
        FROM generate_series(0, 119999) AS g`;
      await prisma.$executeRaw`ANALYZE cancelamentos`;
      const ANO = { de: '2026-01-01', ate: '2026-12-31' };

      const medir = async (caminho: string, extra: Record<string, unknown> = {}) => {
        const inicio = Date.now();
        const res = await http()
          .get(`${BASE_RELATORIOS}/${caminho}`)
          .query({ ...ANO, ...extra })
          .expect(200);
        return { ms: Date.now() - inicio, total: res.body.meta.total as number };
      };

      const detalhe = await medir('GES-05', { pageSize: 50 });
      const filtrado = await medir('GES-05', {
        pageSize: 50,
        tipo: 'CONSULTA',
        sort: 'motivo:asc',
      });
      const resumo = await medir('GES-06');

      expect(detalhe.total).toBeGreaterThan(100000);
      expect(filtrado.total).toBe(detalhe.total);
      expect(resumo.total).toBe(5);
      expect(detalhe.ms).toBeLessThan(3000);
      expect(filtrado.ms).toBeLessThan(3000);
      expect(resumo.ms).toBeLessThan(3000);
    }, 60000);
  });
});

const BASE_RELATORIOS = '/api/configuracoes-gestao/relatorios';
