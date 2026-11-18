import type { INestApplication } from '@nestjs/common';
import {
  atendimentoEmCursoSchema,
  atendimentoMedicoDetalheSchema,
  atendimentoMedicoPageSchema,
  evolucaoPageSchema,
  evolucaoSchema,
  historicoAtendimentoPageSchema,
  pacienteDadosAtendimentoSchema,
  pagamentoAtendimentoSchema,
  protocoloReceitaPageSchema,
  receitaPageSchema,
  receitaSchema,
  recebimentoSchema,
} from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/consultorio-assistencial/atendimento-medico';
const PERMISSOES = [
  'consultorio-assistencial.atendimento-medico.ver',
  'consultorio-assistencial.atendimento-medico.criar',
  'consultorio-assistencial.atendimento-medico.editar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const DIA = '2026-11-17';

describe('Atendimento Médico (e2e)', () => {
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
  const semPermissao = async () =>
    comUsuario(app, await criarUsuarioTeste(app, { permissoes: [] }));

  async function cenario() {
    const paciente = await prisma.paciente.create({
      data: {
        nome: 'Paciente Fictício',
        documento: '00000000191',
        celular: '11900000000',
        logradouro: 'Rua Fictícia',
        numero: '10',
        cidade: 'Cidade Teste',
        uf: 'MT',
      },
    });
    const profissional = await prisma.profissional.create({ data: { nome: 'Dra. Fictícia' } });
    const outroProfissional = await prisma.profissional.create({ data: { nome: 'Dr. Outro' } });
    const tipo = await prisma.tipoAgendamento.create({
      data: { nome: 'Procedimento', duracaoMinutos: 30 },
    });
    const criar = (inicio: string, extra: Record<string, unknown> = {}) =>
      prisma.agendamento.create({
        data: {
          pacienteId: paciente.id,
          profissionalId: profissional.id,
          inicio: new Date(inicio),
          ...extra,
        },
      });
    // 08:00 e 10:00 no fuso da clínica (UTC-3).
    const confirmado = await criar(`${DIA}T11:00:00.000Z`, {
      status: 'CONFIRMADO',
      tipoAgendamentoId: tipo.id,
    });
    const pago = await criar(`${DIA}T13:00:00.000Z`, {
      profissionalId: outroProfissional.id,
      pagoEm: new Date(),
    });
    const cancelado = await criar(`${DIA}T12:00:00.000Z`, { status: 'CANCELADO' });
    // Outro dia: 23:30 do dia anterior no fuso da clínica.
    await criar(`${DIA}T02:30:00.000Z`);
    return { paciente, profissional, outroProfissional, confirmado, pago, cancelado };
  }

  describe('GET / (lista do dia)', () => {
    it('lista o dia por hora, com procedimento e pagamento', async () => {
      const { confirmado, cancelado, pago } = await cenario();

      const res = await http().get(BASE).query({ data: DIA }).expect(200);
      const pagina = atendimentoMedicoPageSchema.parse(res.body);

      expect(pagina.meta.total).toBe(3);
      expect(pagina.data.map((a) => a.id)).toEqual([confirmado.id, cancelado.id, pago.id]);
      expect(pagina.data[0]).toMatchObject({
        pacienteNome: 'Paciente Fictício',
        profissionalNome: 'Dra. Fictícia',
        procedimento: 'Procedimento',
        status: 'CONFIRMADO',
        pago: false,
      });
      expect(pagina.data[2]).toMatchObject({ procedimento: null, pago: true });
    });

    it('filtra por profissional e status', async () => {
      const { outroProfissional, pago, confirmado } = await cenario();

      const porProfissional = await http()
        .get(BASE)
        .query({ data: DIA, profissionalId: outroProfissional.id })
        .expect(200);
      expect(porProfissional.body.data.map((a: { id: string }) => a.id)).toEqual([pago.id]);

      const porStatus = await http()
        .get(BASE)
        .query({ data: DIA, status: 'CONFIRMADO' })
        .expect(200);
      expect(porStatus.body.data.map((a: { id: string }) => a.id)).toEqual([confirmado.id]);
    });

    it('400 sem data ou com status inválido e 403 sem permissão', async () => {
      const semData = await http().get(BASE).expect(400);
      expect(semData.body.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'data' })]),
      );
      await http().get(BASE).query({ data: DIA, status: 'CANCELADO' }).expect(400);
      await (await semPermissao()).get(BASE).query({ data: DIA }).expect(403);
    });
  });

  describe('GET /:agendamentoId (detalhe)', () => {
    it('200 sem atendimento, 404 inexistente, 400 id inválido e 403 sem permissão', async () => {
      const { confirmado } = await cenario();

      const res = await http().get(`${BASE}/${confirmado.id}`).expect(200);
      expect(atendimentoMedicoDetalheSchema.parse(res.body)).toMatchObject({
        agendamento: { id: confirmado.id, status: 'CONFIRMADO' },
        atendimento: null,
      });
      await http().get(`${BASE}/${INEXISTENTE}`).expect(404);
      await http().get(`${BASE}/abc`).expect(400);
      await (await semPermissao()).get(`${BASE}/${confirmado.id}`).expect(403);
    });
  });

  describe('POST /:agendamentoId/iniciar', () => {
    it('cria o atendimento, grava a entrada, muda o status e audita os dois', async () => {
      const { confirmado, paciente, profissional } = await cenario();

      const res = await http().post(`${BASE}/${confirmado.id}/iniciar`).expect(201);
      const atendimento = atendimentoEmCursoSchema.parse(res.body);
      expect(atendimento).toMatchObject({ agendamentoId: confirmado.id, status: 'EM_ANDAMENTO' });

      const gravado = await prisma.atendimento.findUniqueOrThrow({ where: { id: atendimento.id } });
      expect(gravado).toMatchObject({
        pacienteId: paciente.id,
        profissionalId: profissional.id,
        horario: confirmado.inicio,
      });
      expect(gravado.iniciadoEm).toBeInstanceOf(Date);
      const agendamento = await prisma.agendamento.findUniqueOrThrow({
        where: { id: confirmado.id },
      });
      expect(agendamento.status).toBe('EM_ATENDIMENTO');

      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'Atendimento',
        entityId: atendimento.id,
        before: null,
        after: { agendamentoId: confirmado.id, status: 'EM_ANDAMENTO' },
        userId: usuario.id,
      });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Agendamento',
        entityId: confirmado.id,
        before: { status: 'CONFIRMADO' },
        after: { status: 'EM_ATENDIMENTO' },
        userId: usuario.id,
      });

      const detalhe = await http().get(`${BASE}/${confirmado.id}`).expect(200);
      expect(detalhe.body.atendimento).toMatchObject({ id: atendimento.id });
    });

    it('422 para cancelado ou já iniciado, sem auditar', async () => {
      const { cancelado, confirmado } = await cenario();

      const res = await http().post(`${BASE}/${cancelado.id}/iniciar`).expect(422);
      expect(res.body.code).toBe('AGENDAMENTO_CANCELADO');
      await expectNoAudit(prisma, { entity: 'Atendimento' });

      await http().post(`${BASE}/${confirmado.id}/iniciar`).expect(201);
      const repetido = await http().post(`${BASE}/${confirmado.id}/iniciar`).expect(422);
      expect(repetido.body.code).toBe('ATENDIMENTO_JA_INICIADO');
      expect(await prisma.atendimento.count()).toBe(1);
    });

    it('404 inexistente e 403 sem permissão de criar', async () => {
      const { confirmado } = await cenario();
      await http().post(`${BASE}/${INEXISTENTE}/iniciar`).expect(404);
      const soVer = await criarUsuarioTeste(app, {
        permissoes: ['consultorio-assistencial.atendimento-medico.ver'],
      });
      await comUsuario(app, soVer).post(`${BASE}/${confirmado.id}/iniciar`).expect(403);
      await expectNoAudit(prisma, { entity: 'Atendimento' });
    });
  });

  describe('Evoluções', () => {
    it('POST salva no atendimento em andamento, audita e aparece no histórico', async () => {
      const { confirmado } = await cenario();
      await http().post(`${BASE}/${confirmado.id}/iniciar`).expect(201);

      const res = await http()
        .post(`${BASE}/${confirmado.id}/evolucoes`)
        .send({ tipo: 'DIAGNOSTICO', texto: '  Hipótese fictícia  ' })
        .expect(201);
      const evolucao = evolucaoSchema.parse(res.body);
      expect(evolucao).toMatchObject({
        tipo: 'DIAGNOSTICO',
        texto: 'Hipótese fictícia',
        profissionalNome: 'Dra. Fictícia',
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'AtendimentoEvolucao',
        entityId: evolucao.id,
        before: null,
        after: { tipo: 'DIAGNOSTICO', texto: 'Hipótese fictícia' },
        userId: usuario.id,
      });

      const historico = await http().get(`${BASE}/${confirmado.id}/evolucoes`).expect(200);
      expect(evolucaoPageSchema.parse(historico.body).data.map((e) => e.id)).toEqual([evolucao.id]);
    });

    it('422 antes de iniciar o atendimento e 400 sem texto', async () => {
      const { confirmado } = await cenario();

      const naoIniciado = await http()
        .post(`${BASE}/${confirmado.id}/evolucoes`)
        .send({ texto: 'Texto' })
        .expect(422);
      expect(naoIniciado.body).toMatchObject({
        code: 'ATENDIMENTO_NAO_INICIADO',
        message: 'Inicie o atendimento primeiro.',
      });

      await http().post(`${BASE}/${confirmado.id}/iniciar`).expect(201);
      const semTexto = await http()
        .post(`${BASE}/${confirmado.id}/evolucoes`)
        .send({ texto: ' ' })
        .expect(400);
      expect(semTexto.body.details).toEqual([
        expect.objectContaining({ field: 'texto', message: 'Evolução é obrigatória.' }),
      ]);
      await expectNoAudit(prisma, { entity: 'AtendimentoEvolucao' });
    });

    it('404 inexistente e 403 sem permissão', async () => {
      const { confirmado } = await cenario();
      await http().get(`${BASE}/${INEXISTENTE}/evolucoes`).expect(404);
      await http().post(`${BASE}/${INEXISTENTE}/evolucoes`).send({ texto: 'x' }).expect(404);
      await (await semPermissao()).get(`${BASE}/${confirmado.id}/evolucoes`).expect(403);
      await (
        await semPermissao()
      )
        .post(`${BASE}/${confirmado.id}/evolucoes`)
        .send({ texto: 'x' })
        .expect(403);
    });
  });

  describe('Receitas', () => {
    it('POST salva no atendimento em andamento, audita e aparece nas anteriores', async () => {
      const { confirmado } = await cenario();
      await http().post(`${BASE}/${confirmado.id}/iniciar`).expect(201);

      const res = await http()
        .post(`${BASE}/${confirmado.id}/receitas`)
        .send({
          tipo: 'PRESCRICAO',
          controlada: true,
          validadeDias: 90,
          texto: ' 1) Medicamento fictício - 1x ao dia ',
          observacoes: 'Tomar após as refeições',
        })
        .expect(201);
      const receita = receitaSchema.parse(res.body);
      expect(receita).toMatchObject({
        controlada: true,
        validadeDias: 90,
        texto: '1) Medicamento fictício - 1x ao dia',
        profissionalNome: 'Dra. Fictícia',
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'AtendimentoReceita',
        entityId: receita.id,
        before: null,
        after: { controlada: true, validadeDias: 90 },
        userId: usuario.id,
      });

      const anteriores = await http().get(`${BASE}/${confirmado.id}/receitas`).expect(200);
      expect(receitaPageSchema.parse(anteriores.body).data.map((r) => r.id)).toEqual([receita.id]);
    });

    it('422 antes de iniciar, 400 sem texto ou validade fora do select, sem auditar', async () => {
      const { confirmado } = await cenario();
      const naoIniciado = await http()
        .post(`${BASE}/${confirmado.id}/receitas`)
        .send({ texto: 'x' })
        .expect(422);
      expect(naoIniciado.body.code).toBe('ATENDIMENTO_NAO_INICIADO');

      await http().post(`${BASE}/${confirmado.id}/iniciar`).expect(201);
      const invalida = await http()
        .post(`${BASE}/${confirmado.id}/receitas`)
        .send({ texto: ' ', validadeDias: 45 })
        .expect(400);
      expect(invalida.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'texto', message: 'Receita é obrigatória.' }),
          expect.objectContaining({ field: 'validadeDias', message: 'Validade inválida' }),
        ]),
      );
      await expectNoAudit(prisma, { entity: 'AtendimentoReceita' });
    });

    it('404 inexistente e 403 sem permissão', async () => {
      const { confirmado } = await cenario();
      await http().get(`${BASE}/${INEXISTENTE}/receitas`).expect(404);
      await (await semPermissao()).get(`${BASE}/${confirmado.id}/receitas`).expect(403);
      await (
        await semPermissao()
      )
        .post(`${BASE}/${confirmado.id}/receitas`)
        .send({ texto: 'x' })
        .expect(403);
    });

    it('GET /protocolos lista o cadastro com busca e categoria; 403 sem permissão', async () => {
      await prisma.protocolo.create({
        data: { nome: 'Limpeza de pele', categoria: 'Estética', observacoes: 'Aplicar 2x' },
      });
      await prisma.protocolo.create({ data: { nome: 'Fisioterapia', categoria: 'Reabilitação' } });

      const res = await http()
        .get(`${BASE}/protocolos`)
        .query({ categoria: 'Estética' })
        .expect(200);
      expect(protocoloReceitaPageSchema.parse(res.body).data).toEqual([
        expect.objectContaining({ nome: 'Limpeza de pele', texto: 'Aplicar 2x' }),
      ]);
      const busca = await http().get(`${BASE}/protocolos`).query({ search: 'fisio' }).expect(200);
      expect(busca.body.data.map((p: { nome: string }) => p.nome)).toEqual(['Fisioterapia']);

      const categorias = await http().get(`${BASE}/protocolos/categorias`).expect(200);
      expect(categorias.body).toEqual({ data: ['Estética', 'Reabilitação'] });
      await (await semPermissao()).get(`${BASE}/protocolos`).expect(403);
    });
  });

  describe('Pagamento', () => {
    async function formas() {
      const pix = await prisma.formaPagamento.create({
        data: { nome: 'PIX', finalidade: 'RECEBER', tipo: 'PIX' },
      });
      const cartao = await prisma.formaPagamento.create({
        data: { nome: 'Cartão de Crédito', finalidade: 'RECEBER', tipo: 'CARTAO_CREDITO' },
      });
      await prisma.formaPagamento.create({
        data: { nome: 'Boleto Fornecedor', finalidade: 'PAGAR', tipo: 'BOLETO' },
      });
      return { pix, cartao };
    }

    it('GET mostra valor, saldo e só as formas de receber sem cartão', async () => {
      const { confirmado } = await cenario();
      await prisma.agendamento.update({ where: { id: confirmado.id }, data: { valor: '250' } });
      const { pix } = await formas();

      const res = await http().get(`${BASE}/${confirmado.id}/pagamento`).expect(200);
      expect(pagamentoAtendimentoSchema.parse(res.body)).toEqual({
        valorConsulta: 250,
        recebido: 0,
        saldo: 250,
        pago: false,
        recebimentos: [],
        formasPagamento: [expect.objectContaining({ id: pix.id, label: 'PIX' })],
      });
    });

    it('recebimento parcial e depois o restante: marca pago e audita', async () => {
      const { confirmado } = await cenario();
      await prisma.agendamento.update({ where: { id: confirmado.id }, data: { valor: '250' } });
      const { pix } = await formas();

      const parcial = await http()
        .post(`${BASE}/${confirmado.id}/recebimentos`)
        .send({ valor: 100, formaPagamentoId: pix.id })
        .expect(201);
      const recebimento = recebimentoSchema.parse(parcial.body);
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'AgendamentoRecebimento',
        entityId: recebimento.id,
        before: null,
        after: { valor: 100, formaPagamentoNome: 'PIX' },
        userId: usuario.id,
      });
      await expectNoAudit(prisma, { entity: 'Agendamento' });

      const acima = await http()
        .post(`${BASE}/${confirmado.id}/recebimentos`)
        .send({ valor: 200, formaPagamentoId: pix.id })
        .expect(422);
      expect(acima.body.code).toBe('VALOR_ACIMA_DO_SALDO');

      await http()
        .post(`${BASE}/${confirmado.id}/recebimentos`)
        .send({ valor: 150, formaPagamentoId: pix.id })
        .expect(201);
      const situacao = await http().get(`${BASE}/${confirmado.id}/pagamento`).expect(200);
      expect(situacao.body).toMatchObject({ recebido: 250, saldo: 0, pago: true });
      const agendamento = await prisma.agendamento.findUniqueOrThrow({
        where: { id: confirmado.id },
      });
      expect(agendamento.pagoEm).toBeInstanceOf(Date);
      expect(agendamento.formaPagamentoId).toBe(pix.id);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Agendamento',
        entityId: confirmado.id,
        before: { pagoEm: null },
        after: { formaPagamentoId: pix.id },
        userId: usuario.id,
      });

      const lista = await http().get(BASE).query({ data: DIA }).expect(200);
      expect(lista.body.data.find((a: { id: string }) => a.id === confirmado.id).pago).toBe(true);

      const jaPago = await http()
        .post(`${BASE}/${confirmado.id}/recebimentos`)
        .send({ valor: 1, formaPagamentoId: pix.id })
        .expect(422);
      expect(jaPago.body.code).toBe('AGENDAMENTO_JA_PAGO');
    });

    it('422 para cartão e cancelado; 400 sem valor e forma; 404 forma inexistente', async () => {
      const { confirmado, cancelado } = await cenario();
      const { pix, cartao } = await formas();

      const comCartao = await http()
        .post(`${BASE}/${confirmado.id}/recebimentos`)
        .send({ valor: 10, formaPagamentoId: cartao.id })
        .expect(422);
      expect(comCartao.body.code).toBe('FORMA_PAGAMENTO_CARTAO');
      const comCancelado = await http()
        .post(`${BASE}/${cancelado.id}/recebimentos`)
        .send({ valor: 10, formaPagamentoId: pix.id })
        .expect(422);
      expect(comCancelado.body.code).toBe('AGENDAMENTO_CANCELADO');

      const vazio = await http().post(`${BASE}/${confirmado.id}/recebimentos`).send({}).expect(400);
      expect(vazio.body.details.map((d: { field: string }) => d.field)).toEqual([
        'valor',
        'formaPagamentoId',
      ]);
      await http()
        .post(`${BASE}/${confirmado.id}/recebimentos`)
        .send({ valor: 10, formaPagamentoId: INEXISTENTE })
        .expect(404);
      await expectNoAudit(prisma, { entity: 'AgendamentoRecebimento' });
    });

    it('404 inexistente e 403 sem permissão', async () => {
      const { confirmado } = await cenario();
      await http().get(`${BASE}/${INEXISTENTE}/pagamento`).expect(404);
      await (await semPermissao()).get(`${BASE}/${confirmado.id}/pagamento`).expect(403);
      await (
        await semPermissao()
      )
        .post(`${BASE}/${confirmado.id}/recebimentos`)
        .send({ valor: 1, formaPagamentoId: INEXISTENTE })
        .expect(403);
    });
  });

  describe('Histórico e Finalizar', () => {
    it('finaliza: grava o fim, muda para Atendido, audita os dois e aparece no histórico', async () => {
      const { confirmado } = await cenario();
      const iniciado = await http().post(`${BASE}/${confirmado.id}/iniciar`).expect(201);
      await http()
        .post(`${BASE}/${confirmado.id}/evolucoes`)
        .send({ texto: 'Evolução fictícia' })
        .expect(201);

      const res = await http().post(`${BASE}/${confirmado.id}/finalizar`).expect(201);
      const finalizado = atendimentoEmCursoSchema.parse(res.body);
      expect(finalizado).toMatchObject({ id: iniciado.body.id, status: 'FINALIZADO' });
      expect(finalizado.finalizadoEm).not.toBeNull();

      const agendamento = await prisma.agendamento.findUniqueOrThrow({
        where: { id: confirmado.id },
      });
      expect(agendamento.status).toBe('ATENDIDO');
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Atendimento',
        entityId: finalizado.id,
        before: { status: 'EM_ANDAMENTO', finalizadoEm: null },
        after: { status: 'FINALIZADO' },
        userId: usuario.id,
      });
      // O agendamento tem dois UPDATE (iniciar e finalizar); o mais recente é o do finalizar.
      const [ultimo] = await prisma.auditLog.findMany({
        where: { action: 'UPDATE', entity: 'Agendamento', entityId: confirmado.id },
        orderBy: { occurredAt: 'desc' },
        take: 1,
      });
      expect(ultimo).toMatchObject({
        userId: usuario.id,
        before: expect.objectContaining({ status: 'EM_ATENDIMENTO' }),
        after: expect.objectContaining({ status: 'ATENDIDO' }),
      });

      const historico = await http().get(`${BASE}/${confirmado.id}/historico`).expect(200);
      expect(historicoAtendimentoPageSchema.parse(historico.body).data).toEqual([
        expect.objectContaining({
          id: finalizado.id,
          status: 'FINALIZADO',
          profissionalNome: 'Dra. Fictícia',
          totalReceitas: 0,
          evolucoes: [expect.objectContaining({ texto: 'Evolução fictícia' })],
        }),
      ]);

      const deNovo = await http().post(`${BASE}/${confirmado.id}/finalizar`).expect(422);
      expect(deNovo.body.code).toBe('ATENDIMENTO_FINALIZADO');
      const evolucaoDepois = await http()
        .post(`${BASE}/${confirmado.id}/evolucoes`)
        .send({ texto: 'x' })
        .expect(422);
      expect(evolucaoDepois.body.code).toBe('ATENDIMENTO_FINALIZADO');
    });

    it('422 sem iniciar, 404 inexistente e 403 sem a permissão de editar', async () => {
      const { confirmado } = await cenario();
      const naoIniciado = await http().post(`${BASE}/${confirmado.id}/finalizar`).expect(422);
      expect(naoIniciado.body.code).toBe('ATENDIMENTO_NAO_INICIADO');
      await http().post(`${BASE}/${INEXISTENTE}/finalizar`).expect(404);
      await http().get(`${BASE}/${INEXISTENTE}/historico`).expect(404);

      await http().post(`${BASE}/${confirmado.id}/iniciar`).expect(201);
      const semEditar = await criarUsuarioTeste(app, {
        permissoes: [
          'consultorio-assistencial.atendimento-medico.ver',
          'consultorio-assistencial.atendimento-medico.criar',
        ],
      });
      await comUsuario(app, semEditar).post(`${BASE}/${confirmado.id}/finalizar`).expect(403);
      await (await semPermissao()).get(`${BASE}/${confirmado.id}/historico`).expect(403);
      await expectNoAudit(prisma, { entity: 'Atendimento', action: 'UPDATE' });
    });
  });

  describe('GET /:agendamentoId/paciente (aba Dados)', () => {
    it('200 com os dados do paciente, 404 inexistente e 403 sem permissão', async () => {
      const { confirmado } = await cenario();

      const res = await http().get(`${BASE}/${confirmado.id}/paciente`).expect(200);
      expect(pacienteDadosAtendimentoSchema.parse(res.body)).toMatchObject({
        nome: 'Paciente Fictício',
        telefone: '11900000000',
        endereco: 'Rua Fictícia, 10',
        cidade: 'Cidade Teste',
        uf: 'MT',
      });
      await http().get(`${BASE}/${INEXISTENTE}/paciente`).expect(404);
      await (await semPermissao()).get(`${BASE}/${confirmado.id}/paciente`).expect(403);
    });
  });
});
