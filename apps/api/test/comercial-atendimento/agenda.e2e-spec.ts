import type { INestApplication } from '@nestjs/common';
import {
  agendaProfissionaisSchema,
  agendamentoListaSchema,
  agendamentoSchema,
} from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/comercial-atendimento/agendamentos';
const ENTITY = 'Agendamento';
const PERMISSOES = [
  'comercial-atendimento.agenda.ver',
  'comercial-atendimento.agenda.criar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe('Agenda (e2e)', () => {
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
  const criarPaciente = (nome = 'Paciente Teste') => prisma.paciente.create({ data: { nome } });
  const criarProfissional = (nome = 'Profissional Teste', extra = {}) =>
    prisma.profissional.create({ data: { nome, corCalendario: 'verde', ...extra } });
  const criarTipo = (nome = 'Consulta') =>
    prisma.tipoAgendamento.create({ data: { nome, duracaoMinutos: 30 } });

  async function agendar(
    pacienteId: string,
    profissionalId: string,
    inicio: string,
    extra: Record<string, unknown> = {},
  ) {
    return prisma.agendamento.create({
      data: { pacienteId, profissionalId, inicio: new Date(inicio), ...extra },
    });
  }

  describe('GET (calendário)', () => {
    it('lista o período em ordem de horário, sem excluídos, com nomes e cor', async () => {
      const paciente = await criarPaciente('Ana Fictícia');
      const prof = await criarProfissional('Dr. Fictício');
      const tipo = await criarTipo('Retorno');
      // 08:00 e 14:00 de 21/10 (UTC-3) e um fora do período.
      await agendar(paciente.id, prof.id, '2026-10-21T17:00:00Z', { tipoAgendamentoId: tipo.id });
      await agendar(paciente.id, prof.id, '2026-10-21T11:00:00Z', { valor: 250.5 });
      await agendar(paciente.id, prof.id, '2026-10-21T12:00:00Z', { deletedAt: new Date() });
      await agendar(paciente.id, prof.id, '2026-10-30T12:00:00Z');

      const res = await http()
        .get(BASE)
        .query({ inicio: '2026-10-19', fim: '2026-10-25' })
        .expect(200);

      const { data } = agendamentoListaSchema.parse(res.body);
      expect(data.map((a) => [a.inicio, a.valor, a.tipoNome])).toEqual([
        ['2026-10-21T11:00:00.000Z', 250.5, null],
        ['2026-10-21T17:00:00.000Z', null, 'Retorno'],
      ]);
      expect(data[0]).toMatchObject({
        pacienteNome: 'Ana Fictícia',
        profissionalNome: 'Dr. Fictício',
        profissionalCor: 'verde',
        status: 'AGENDADO',
        duracaoMinutos: 30,
      });
    });

    it('o último dia do período entra inteiro (até 23:59 local)', async () => {
      const paciente = await criarPaciente();
      const prof = await criarProfissional();
      await agendar(paciente.id, prof.id, '2026-10-26T02:30:00Z'); // 25/10 23:30 local
      await agendar(paciente.id, prof.id, '2026-10-26T03:00:00Z'); // 26/10 00:00 local

      const res = await http()
        .get(BASE)
        .query({ inicio: '2026-10-25', fim: '2026-10-25' })
        .expect(200);

      expect(agendamentoListaSchema.parse(res.body).data).toHaveLength(1);
    });

    it('filtra por profissional', async () => {
      const paciente = await criarPaciente();
      const a = await criarProfissional('Profissional A');
      const b = await criarProfissional('Profissional B');
      await agendar(paciente.id, a.id, '2026-10-21T12:00:00Z');
      await agendar(paciente.id, b.id, '2026-10-21T13:00:00Z');

      const res = await http()
        .get(BASE)
        .query({ inicio: '2026-10-19', fim: '2026-10-25', profissionalId: b.id })
        .expect(200);

      expect(agendamentoListaSchema.parse(res.body).data.map((x) => x.profissionalNome)).toEqual([
        'Profissional B',
      ]);
    });

    it('400 sem período, período invertido ou maior que 31 dias', async () => {
      await http().get(BASE).expect(400);
      await http().get(BASE).query({ inicio: '2026-10-25', fim: '2026-10-19' }).expect(400);
      await http().get(BASE).query({ inicio: '2026-10-01', fim: '2026-12-01' }).expect(400);
    });
  });

  describe('GET /profissionais', () => {
    it('traz só os ativos, em ordem alfabética, com cor e especialidade', async () => {
      const esp = await prisma.especialidade.create({ data: { nome: 'Nutrologia' } });
      await criarProfissional('Zeca', { corCalendario: 'azul' });
      await criarProfissional('Ana', { especialidadeId: esp.id });
      await criarProfissional('Inativo', { ativo: false });
      await criarProfissional('Excluído', { deletedAt: new Date() });

      const res = await http().get(`${BASE}/profissionais`).expect(200);

      const { data } = agendaProfissionaisSchema.parse(res.body);
      expect(data.map((p) => [p.nome, p.cor, p.especialidade])).toEqual([
        ['Ana', 'verde', 'Nutrologia'],
        ['Zeca', 'azul', null],
      ]);
    });
  });

  describe('GET /:id', () => {
    it('devolve o detalhe com o número do agendamento', async () => {
      const paciente = await criarPaciente();
      const prof = await criarProfissional();
      const ag = await agendar(paciente.id, prof.id, '2026-10-21T12:00:00Z', {
        convenio: true,
        observacoes: 'Obs',
      });

      const res = await http().get(`${BASE}/${ag.id}`).expect(200);

      expect(agendamentoSchema.parse(res.body)).toMatchObject({
        id: ag.id,
        numero: ag.numero,
        convenio: true,
        observacoes: 'Obs',
      });
    });

    it('404 para inexistente ou excluído e 400 para id inválido', async () => {
      const paciente = await criarPaciente();
      const prof = await criarProfissional();
      const ag = await agendar(paciente.id, prof.id, '2026-10-21T12:00:00Z', {
        deletedAt: new Date(),
      });

      await http().get(`${BASE}/${INEXISTENTE}`).expect(404);
      await http().get(`${BASE}/${ag.id}`).expect(404);
      await http().get(`${BASE}/abc`).expect(400);
    });
  });

  describe('POST', () => {
    it('cria como Agendado, converte data/hora do fuso da clínica e audita', async () => {
      const paciente = await criarPaciente();
      const prof = await criarProfissional();
      const tipo = await criarTipo();

      const res = await http()
        .post(BASE)
        .send({
          pacienteId: paciente.id,
          profissionalId: prof.id,
          data: '2026-10-22',
          hora: '16:00',
          duracaoMinutos: 45,
          tipoAgendamentoId: tipo.id,
          valor: 120,
          convenio: false,
          observacoes: 'Primeira consulta',
        })
        .expect(201);

      const criado = agendamentoSchema.parse(res.body);
      expect(criado).toMatchObject({
        status: 'AGENDADO',
        inicio: '2026-10-22T19:00:00.000Z',
        duracaoMinutos: 45,
        valor: 120,
        tipoNome: 'Consulta',
        observacoes: 'Primeira consulta',
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: criado.id,
        before: null,
        after: { pacienteId: paciente.id, profissionalId: prof.id, status: 'AGENDADO' },
        userId: usuario.id,
      });
    });

    it('usa os padrões: 30 minutos, sem valor, sem convênio', async () => {
      const paciente = await criarPaciente();
      const prof = await criarProfissional();

      const res = await http()
        .post(BASE)
        .send({
          pacienteId: paciente.id,
          profissionalId: prof.id,
          data: '2026-10-22',
          hora: '09:00',
        })
        .expect(201);

      expect(res.body).toMatchObject({ duracaoMinutos: 30, valor: null, convenio: false });
    });

    it('400 com mensagens do inventário para paciente e profissional vazios, sem auditar', async () => {
      const res = await http()
        .post(BASE)
        .send({ pacienteId: '', profissionalId: '', data: '2026-10-22', hora: '09:00' })
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.details).toEqual(
        expect.arrayContaining([
          { field: 'pacienteId', message: 'Selecione o paciente.' },
          { field: 'profissionalId', message: 'Selecione o profissional.' },
        ]),
      );
      expect(await prisma.agendamento.count()).toBe(0);
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('400 para status no corpo (a criação é sempre Agendado)', async () => {
      const paciente = await criarPaciente();
      const prof = await criarProfissional();
      await http()
        .post(BASE)
        .send({
          pacienteId: paciente.id,
          profissionalId: prof.id,
          data: '2026-10-22',
          hora: '09:00',
          status: 'CONFIRMADO',
        })
        .expect(400);
    });

    it('404 quando paciente, profissional ou tipo não existem, sem auditar', async () => {
      const paciente = await criarPaciente();
      const prof = await criarProfissional();
      const corpo = {
        pacienteId: paciente.id,
        profissionalId: prof.id,
        data: '2026-10-22',
        hora: '09:00',
      };

      await http()
        .post(BASE)
        .send({ ...corpo, pacienteId: INEXISTENTE })
        .expect(404);
      await http()
        .post(BASE)
        .send({ ...corpo, profissionalId: INEXISTENTE })
        .expect(404);
      await http()
        .post(BASE)
        .send({ ...corpo, tipoAgendamentoId: INEXISTENTE })
        .expect(404);
      expect(await prisma.agendamento.count()).toBe(0);
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('permissões', () => {
    const ROTAS = [
      { metodo: 'get', caminho: `${BASE}?inicio=2026-10-19&fim=2026-10-25`, permissao: 'ver' },
      { metodo: 'get', caminho: `${BASE}/profissionais`, permissao: 'ver' },
      { metodo: 'get', caminho: `${BASE}/${INEXISTENTE}`, permissao: 'ver' },
      { metodo: 'post', caminho: BASE, permissao: 'criar' },
    ] as const;

    it.each(ROTAS)(
      '$metodo $caminho sem a permissão $permissao responde 403, sem auditar',
      async ({ metodo, caminho, permissao }) => {
        const outras = PERMISSOES.filter((p) => !p.endsWith(`.${permissao}`));
        const semPermissao = await criarUsuarioTeste(app, { permissoes: outras });

        const res = await comUsuario(app, semPermissao)[metodo](caminho).send({}).expect(403);

        expect(res.body).toMatchObject({ code: 'FORBIDDEN', message: 'Sem permissão' });
        await expectNoAudit(prisma, { entity: ENTITY });
      },
    );
  });
});
