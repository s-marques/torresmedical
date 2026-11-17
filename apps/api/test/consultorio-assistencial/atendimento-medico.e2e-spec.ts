import type { INestApplication } from '@nestjs/common';
import {
  atendimentoEmCursoSchema,
  atendimentoMedicoDetalheSchema,
  atendimentoMedicoPageSchema,
  evolucaoPageSchema,
  evolucaoSchema,
  pacienteDadosAtendimentoSchema,
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
