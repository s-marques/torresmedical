import type { INestApplication } from '@nestjs/common';
import {
  agendaProfissionaisSchema,
  agendamentoListaSchema,
  agendamentoSchema,
  salaSugeridaSchema,
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
  'comercial-atendimento.agenda.editar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

/** 22/10/2026 é quinta-feira; 16:00 no fuso da clínica (UTC-3) são 19:00 UTC. */
const DIA = '2026-10-22';
const ISO_1600 = '2026-10-22T19:00:00.000Z';

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
  const criarSala = (nome = 'Sala 1', extra = {}) =>
    prisma.sala.create({ data: { nome, ...extra } });

  /** Profissional atende todos os dias das 08:00 às 18:00 (horário semanal). */
  const atender = (profissionalId: string, extra = {}) =>
    prisma.horarioAtendimento.createMany({
      data: [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
        profissionalId,
        tipo: 'SEMANAL' as const,
        diaSemana,
        inicio: '08:00',
        fim: '18:00',
        ...extra,
      })),
    });

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

  /** Paciente, profissional que atende o dia todo e sala, prontos para agendar. */
  async function cenario() {
    const paciente = await criarPaciente();
    const prof = await criarProfissional();
    await atender(prof.id);
    const sala = await criarSala();
    return { paciente, prof, sala };
  }

  const corpo = (
    c: { paciente: { id: string }; prof: { id: string }; sala: { id: string } },
    extra: Record<string, unknown> = {},
  ) => ({
    pacienteId: c.paciente.id,
    profissionalId: c.prof.id,
    salaId: c.sala.id,
    data: DIA,
    hora: '16:00',
    ...extra,
  });

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

    it('traz a sala de cada agendamento (nula nos antigos, sem sala)', async () => {
      const paciente = await criarPaciente();
      const prof = await criarProfissional();
      const sala = await criarSala('Sala Azul');
      await agendar(paciente.id, prof.id, '2026-10-21T11:00:00Z', { salaId: sala.id });
      await agendar(paciente.id, prof.id, '2026-10-21T13:00:00Z');

      const res = await http()
        .get(BASE)
        .query({ inicio: '2026-10-19', fim: '2026-10-25' })
        .expect(200);

      const { data } = agendamentoListaSchema.parse(res.body);
      expect(data.map((a) => [a.salaId, a.salaNome])).toEqual([
        [sala.id, 'Sala Azul'],
        [null, null],
      ]);
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

  describe('GET /sala-sugerida', () => {
    const SEXTA = '2026-11-20'; // diaSemana 5

    async function contrato(
      salaId: string,
      profissionalId: string,
      dias: Array<{ diaSemana: number; inicio: string; fim: string }>,
      extra: Record<string, unknown> = {},
    ) {
      return prisma.contratoSala.create({
        data: {
          salaId,
          modalidade: 'TURNO',
          locatarioTipo: 'PROFISSIONAL',
          profissionalId,
          dataInicio: new Date('2026-01-01'),
          dias: { create: dias },
          ...extra,
        },
      });
    }

    const consultar = (profissionalId: string, hora: string, data = SEXTA) =>
      http().get(`${BASE}/sala-sugerida`).query({ profissionalId, data, hora });

    it('sugere a sala do contrato ativo que cobre o dia e o horário', async () => {
      const prof = await criarProfissional();
      const outra = await criarSala('Sala Outra');
      const sala = await criarSala('Sala do Contrato');
      await contrato(outra.id, prof.id, [{ diaSemana: 2, inicio: '08:00', fim: '18:00' }]);
      await contrato(sala.id, prof.id, [{ diaSemana: 5, inicio: '13:00', fim: '18:00' }]);

      const res = await consultar(prof.id, '14:00').expect(200);

      expect(salaSugeridaSchema.parse(res.body)).toEqual({
        salaId: sala.id,
        salaNome: 'Sala do Contrato',
      });
    });

    it('sem contrato que cubra o horário (ou contrato encerrado), devolve nulos', async () => {
      const prof = await criarProfissional();
      const sala = await criarSala();
      await contrato(sala.id, prof.id, [{ diaSemana: 5, inicio: '13:00', fim: '18:00' }]);
      const outroProf = await criarProfissional('Outro');
      const outraSala = await criarSala('Sala 2');
      await contrato(
        outraSala.id,
        outroProf.id,
        [{ diaSemana: 5, inicio: '08:00', fim: '18:00' }],
        { status: 'ENCERRADO' },
      );

      // 13:00 é o início do turno e 18:00 o fim (exclusivo); 10:00 está fora dele.
      expect((await consultar(prof.id, '10:00').expect(200)).body).toEqual({
        salaId: null,
        salaNome: null,
      });
      expect((await consultar(prof.id, '18:00').expect(200)).body.salaId).toBeNull();
      expect((await consultar(prof.id, '13:00').expect(200)).body.salaId).toBe(sala.id);
      expect((await consultar(outroProf.id, '10:00').expect(200)).body.salaId).toBeNull();
    });

    it('400 sem os parâmetros e 403 sem a permissão ou fora do escopo', async () => {
      const prof = await criarProfissional();
      const outro = await criarProfissional('Outro');
      await http().get(`${BASE}/sala-sugerida`).expect(400);

      const restrito = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [prof.id],
      });
      await comUsuario(app, restrito)
        .get(`${BASE}/sala-sugerida`)
        .query({ profissionalId: outro.id, data: SEXTA, hora: '14:00' })
        .expect(403);
      await comUsuario(app, restrito)
        .get(`${BASE}/sala-sugerida`)
        .query({ profissionalId: prof.id, data: SEXTA, hora: '14:00' })
        .expect(200);
    });
  });

  describe('GET /:id', () => {
    it('devolve o detalhe com o número do agendamento e a sala', async () => {
      const paciente = await criarPaciente();
      const prof = await criarProfissional();
      const sala = await criarSala('Sala Azul');
      const ag = await agendar(paciente.id, prof.id, '2026-10-21T12:00:00Z', {
        convenio: true,
        observacoes: 'Obs',
        salaId: sala.id,
      });

      const res = await http().get(`${BASE}/${ag.id}`).expect(200);

      expect(agendamentoSchema.parse(res.body)).toMatchObject({
        id: ag.id,
        numero: ag.numero,
        convenio: true,
        observacoes: 'Obs',
        salaId: sala.id,
        salaNome: 'Sala Azul',
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
    it('cria como Agendado, com a sala, converte data/hora do fuso da clínica e audita', async () => {
      const c = await cenario();
      const tipo = await criarTipo();

      const res = await http()
        .post(BASE)
        .send(
          corpo(c, {
            duracaoMinutos: 45,
            tipoAgendamentoId: tipo.id,
            valor: 120,
            convenio: false,
            observacoes: 'Primeira consulta',
          }),
        )
        .expect(201);

      const criado = agendamentoSchema.parse(res.body);
      expect(criado).toMatchObject({
        status: 'AGENDADO',
        inicio: ISO_1600,
        duracaoMinutos: 45,
        valor: 120,
        tipoNome: 'Consulta',
        observacoes: 'Primeira consulta',
        salaId: c.sala.id,
        salaNome: 'Sala 1',
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: criado.id,
        before: null,
        after: {
          pacienteId: c.paciente.id,
          profissionalId: c.prof.id,
          salaId: c.sala.id,
          status: 'AGENDADO',
        },
        userId: usuario.id,
      });
    });

    it('usa os padrões: 30 minutos, sem valor, sem convênio', async () => {
      const c = await cenario();

      const res = await http()
        .post(BASE)
        .send(corpo(c, { hora: '09:00' }))
        .expect(201);

      expect(res.body).toMatchObject({ duracaoMinutos: 30, valor: null, convenio: false });
    });

    it('400 com as mensagens do inventário para paciente, profissional e sala vazios, sem auditar', async () => {
      const res = await http()
        .post(BASE)
        .send({ pacienteId: '', profissionalId: '', salaId: '', data: DIA, hora: '09:00' })
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'pacienteId', message: 'Selecione o paciente.' }),
          expect.objectContaining({
            field: 'profissionalId',
            message: 'Selecione o profissional.',
          }),
          expect.objectContaining({ field: 'salaId', message: 'Sala é obrigatória.' }),
        ]),
      );
      expect(await prisma.agendamento.count()).toBe(0);
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('400 sem a sala (obrigatória) e para status no corpo (a criação é sempre Agendado)', async () => {
      const c = await cenario();
      const { salaId, ...semSala } = corpo(c);
      expect(salaId).toBe(c.sala.id);

      const res = await http().post(BASE).send(semSala).expect(400);
      expect(res.body.details).toEqual([
        expect.objectContaining({ field: 'salaId', message: 'Sala é obrigatória.' }),
      ]);
      await http()
        .post(BASE)
        .send(corpo(c, { status: 'CONFIRMADO' }))
        .expect(400);
      expect(await prisma.agendamento.count()).toBe(0);
    });

    it('404 quando paciente, profissional, sala ou tipo não existem, sem auditar', async () => {
      const c = await cenario();
      const excluida = await criarSala('Sala Excluída', { deletedAt: new Date() });

      await http()
        .post(BASE)
        .send(corpo(c, { pacienteId: INEXISTENTE }))
        .expect(404);
      await http()
        .post(BASE)
        .send(corpo(c, { profissionalId: INEXISTENTE }))
        .expect(404);
      await http()
        .post(BASE)
        .send(corpo(c, { salaId: INEXISTENTE }))
        .expect(404);
      await http()
        .post(BASE)
        .send(corpo(c, { salaId: excluida.id }))
        .expect(404);
      await http()
        .post(BASE)
        .send(corpo(c, { tipoAgendamentoId: INEXISTENTE }))
        .expect(404);
      expect(await prisma.agendamento.count()).toBe(0);
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    describe('dupla ocupação da sala', () => {
      it('o segundo agendamento sobreposto na mesma sala é recusado com 409 e mensagem de conflito', async () => {
        const c = await cenario();
        const outro = await criarProfissional('Outro Profissional');
        await atender(outro.id);
        await http()
          .post(BASE)
          .send(corpo(c, { hora: '16:00', duracaoMinutos: 30 }))
          .expect(201);

        const res = await http()
          .post(BASE)
          .send(corpo({ ...c, prof: outro }, { hora: '16:15', duracaoMinutos: 30 }))
          .expect(409);

        expect(res.body).toMatchObject({
          code: 'AGENDA_SALA_CONFLITO',
          message: 'A sala Sala 1 já tem agendamento em 22/10/2026, das 16:00 às 16:30.',
        });
        expect(res.body.message).not.toContain('Paciente');
        expect(await prisma.agendamento.count()).toBe(1);
        expect(await prisma.auditLog.count({ where: { entity: ENTITY, action: 'CREATE' } })).toBe(
          1,
        );
      });

      it('em salas diferentes o mesmo horário passa', async () => {
        const c = await cenario();
        const outro = await criarProfissional('Outro Profissional');
        await atender(outro.id);
        const outraSala = await criarSala('Sala 2');
        await http().post(BASE).send(corpo(c)).expect(201);

        await http()
          .post(BASE)
          .send(corpo({ ...c, prof: outro, sala: outraSala }))
          .expect(201);
      });

      it('agendamentos encostados (um termina quando o outro começa) passam', async () => {
        const c = await cenario();
        const outro = await criarProfissional('Outro Profissional');
        await atender(outro.id);
        await http()
          .post(BASE)
          .send(corpo(c, { hora: '16:00' }))
          .expect(201);

        await http()
          .post(BASE)
          .send(corpo({ ...c, prof: outro }, { hora: '16:30' }))
          .expect(201);
        await http()
          .post(BASE)
          .send(corpo({ ...c, prof: outro }, { hora: '15:30' }))
          .expect(201);
      });

      it('agendamento cancelado libera a sala; os demais status continuam ocupando', async () => {
        const c = await cenario();
        const outro = await criarProfissional('Outro Profissional');
        await atender(outro.id);
        const ocupado = await agendar(c.paciente.id, c.prof.id, ISO_1600, {
          salaId: c.sala.id,
          status: 'CANCELADO',
        });

        await http()
          .post(BASE)
          .send(corpo({ ...c, prof: outro }))
          .expect(201);

        const ocupantes = await prisma.agendamento.count({ where: { id: ocupado.id } });
        expect(ocupantes).toBe(1);
        for (const status of ['FALTOU', 'REAGENDAR', 'ATENDIDO'] as const) {
          await prisma.agendamento.updateMany({ where: { salaId: c.sala.id }, data: { status } });
          await http().post(BASE).send(corpo(c)).expect(409);
        }
      });

      it('agendamento excluído não ocupa a sala', async () => {
        const c = await cenario();
        await agendar(c.paciente.id, c.prof.id, ISO_1600, {
          salaId: c.sala.id,
          deletedAt: new Date(),
        });

        await http().post(BASE).send(corpo(c)).expect(201);
      });

      it('sala inativa é recusada com 409', async () => {
        const c = await cenario();
        const inativa = await criarSala('Sala Inativa', { ativo: false });

        const res = await http()
          .post(BASE)
          .send(corpo({ ...c, sala: inativa }))
          .expect(409);

        expect(res.body).toMatchObject({ code: 'SALA_INATIVA' });
      });
    });

    describe('choque de horário do profissional', () => {
      it('dois agendamentos sobrepostos do mesmo profissional: o segundo é recusado com 409', async () => {
        const c = await cenario();
        const outraSala = await criarSala('Sala 2');
        await http()
          .post(BASE)
          .send(corpo(c, { hora: '16:00', duracaoMinutos: 60 }))
          .expect(201);

        const res = await http()
          .post(BASE)
          .send(corpo({ ...c, sala: outraSala }, { hora: '16:30' }))
          .expect(409);

        expect(res.body).toMatchObject({
          code: 'AGENDA_PROFISSIONAL_CONFLITO',
          message: 'Profissional Teste já tem agendamento em 22/10/2026, das 16:00 às 17:00.',
        });
        expect(await prisma.agendamento.count()).toBe(1);
      });

      it('não há exceção para encaixe: o mesmo horário exato também é recusado', async () => {
        const c = await cenario();
        const outraSala = await criarSala('Sala 2');
        const outroPaciente = await criarPaciente('Outro Paciente');
        await http().post(BASE).send(corpo(c)).expect(201);

        await http()
          .post(BASE)
          .send(corpo({ ...c, paciente: outroPaciente, sala: outraSala }))
          .expect(409);
      });

      it('agendamento cancelado do profissional não conflita', async () => {
        const c = await cenario();
        const outraSala = await criarSala('Sala 2');
        await agendar(c.paciente.id, c.prof.id, ISO_1600, {
          salaId: c.sala.id,
          status: 'CANCELADO',
        });

        await http()
          .post(BASE)
          .send(corpo({ ...c, sala: outraSala }))
          .expect(201);
      });
    });

    describe('horário de atendimento e bloqueios do profissional', () => {
      it('profissional sem horário de atendimento cadastrado: recusado', async () => {
        const paciente = await criarPaciente();
        const prof = await criarProfissional();
        const sala = await criarSala();

        const res = await http().post(BASE).send(corpo({ paciente, prof, sala })).expect(409);

        expect(res.body).toMatchObject({ code: 'AGENDA_SEM_HORARIO' });
      });

      it.each([
        ['antes do início do atendimento', '07:30', '08:30'],
        ['depois do fim do atendimento', '17:45', '18:15'],
      ])('fora do horário de atendimento (%s): recusado', async (_nome, hora) => {
        const c = await cenario();

        const res = await http()
          .post(BASE)
          .send(corpo(c, { hora, duracaoMinutos: 30 }))
          .expect(409);

        expect(res.body.code).toBe('AGENDA_FORA_DO_HORARIO');
        expect(res.body.message).toContain('fora do horário de atendimento');
        expect(await prisma.agendamento.count()).toBe(0);
      });

      it('no limite do expediente passa (08:00 e término às 18:00)', async () => {
        const c = await cenario();

        await http()
          .post(BASE)
          .send(corpo(c, { hora: '08:00' }))
          .expect(201);
        await http()
          .post(BASE)
          .send(corpo(c, { hora: '17:30' }))
          .expect(201);
      });

      it('horário "Por Data" substitui o semanal daquele dia', async () => {
        const c = await cenario();
        await prisma.horarioAtendimento.create({
          data: {
            profissionalId: c.prof.id,
            tipo: 'POR_DATA',
            data: new Date(DIA),
            inicio: '09:00',
            fim: '12:00',
          },
        });

        // 16:00 caberia no semanal (08–18), mas naquele dia só vale o Por Data.
        const res = await http().post(BASE).send(corpo(c)).expect(409);
        expect(res.body.code).toBe('AGENDA_FORA_DO_HORARIO');
        await http()
          .post(BASE)
          .send(corpo(c, { hora: '10:00' }))
          .expect(201);
      });

      it('o almoço do profissional não recebe agendamento', async () => {
        const paciente = await criarPaciente();
        const prof = await criarProfissional();
        const sala = await criarSala();
        await atender(prof.id, { almocoInicio: '12:00', almocoFim: '13:00' });

        const res = await http()
          .post(BASE)
          .send(corpo({ paciente, prof, sala }, { hora: '11:45' }))
          .expect(409);
        expect(res.body.message).toContain('coincide com o almoço');
        await http()
          .post(BASE)
          .send(corpo({ paciente, prof, sala }, { hora: '11:30' }))
          .expect(201);
      });

      it('bloqueio de dia inteiro do profissional: recusado, com o motivo', async () => {
        const c = await cenario();
        await prisma.bloqueioAgenda.create({
          data: {
            profissionalId: c.prof.id,
            dataInicio: new Date('2026-10-20'),
            dataFim: new Date('2026-10-24'),
            tipo: 'DIA_INTEIRO',
            motivo: 'FERIAS',
          },
        });

        const res = await http().post(BASE).send(corpo(c)).expect(409);

        expect(res.body).toMatchObject({ code: 'AGENDA_PROFISSIONAL_BLOQUEADO' });
        expect(res.body.message).toContain('Férias');
        await http()
          .post(BASE)
          .send(corpo(c, { data: '2026-10-26' }))
          .expect(201);
      });

      it('bloqueio por horário do profissional só recusa o que o atinge', async () => {
        const c = await cenario();
        await prisma.bloqueioAgenda.create({
          data: {
            profissionalId: c.prof.id,
            dataInicio: new Date(DIA),
            dataFim: new Date(DIA),
            tipo: 'HORARIO',
            horaInicio: '15:00',
            horaFim: '17:00',
            motivo: 'REUNIAO',
          },
        });

        await http()
          .post(BASE)
          .send(corpo(c, { hora: '16:30' }))
          .expect(409);
        await http()
          .post(BASE)
          .send(corpo(c, { hora: '17:00' }))
          .expect(201);
      });

      it('bloqueio removido (exclusão lógica) não impede', async () => {
        const c = await cenario();
        await prisma.bloqueioAgenda.create({
          data: {
            profissionalId: c.prof.id,
            dataInicio: new Date(DIA),
            dataFim: new Date(DIA),
            tipo: 'DIA_INTEIRO',
            motivo: 'FOLGA',
            deletedAt: new Date(),
          },
        });

        await http().post(BASE).send(corpo(c)).expect(201);
      });
    });

    describe('bloqueios da sala (#138)', () => {
      const bloqueio = (salaId: string, extra: Record<string, unknown> = {}) =>
        prisma.salaBloqueio.create({
          data: {
            salaId,
            tipo: 'MANUTENCAO',
            dataInicio: new Date(DIA),
            dataFim: new Date(DIA),
            horaInicio: '15:00',
            horaFim: '17:00',
            ...extra,
          },
        });

      it('bloqueio de manutenção impede agendar a sala no intervalo', async () => {
        const c = await cenario();
        await bloqueio(c.sala.id);

        const res = await http()
          .post(BASE)
          .send(corpo(c, { hora: '16:30' }))
          .expect(409);

        expect(res.body).toMatchObject({ code: 'AGENDA_SALA_BLOQUEADA' });
        expect(res.body.message).toBe(
          'A sala Sala 1 tem manutenção em 22/10/2026, das 16:30 às 17:00 e não pode receber agendamentos.',
        );
        expect(await prisma.agendamento.count()).toBe(0);
        // Fora do intervalo bloqueado, a mesma sala aceita.
        await http()
          .post(BASE)
          .send(corpo(c, { hora: '17:00' }))
          .expect(201);
      });

      it('bloqueio recorrente por dia da semana também impede', async () => {
        const c = await cenario();
        await bloqueio(c.sala.id, {
          recorrente: true,
          dataInicio: new Date('2026-10-01'),
          dataFim: new Date('2026-10-31'),
          horaInicio: null,
          horaFim: null,
          dias: { create: [{ diaSemana: 4, inicio: '14:00', fim: '18:00' }] },
        });

        await http().post(BASE).send(corpo(c)).expect(409);
      });

      it('bloqueio cancelado não impede', async () => {
        const c = await cenario();
        await bloqueio(c.sala.id, { canceladoEm: new Date(), motivoCancelamento: 'Concluída' });

        await http().post(BASE).send(corpo(c)).expect(201);
      });

      it('reserva em nome do próprio profissional libera; em nome de outro impede', async () => {
        const c = await cenario();
        const outro = await criarProfissional('Outro Profissional');
        await atender(outro.id);
        await bloqueio(c.sala.id, { tipo: 'RESERVA', profissionalId: c.prof.id });

        await http().post(BASE).send(corpo(c)).expect(201);
        const res = await http()
          .post(BASE)
          .send(corpo({ ...c, prof: outro }, { hora: '15:00' }))
          .expect(409);
        expect(res.body).toMatchObject({ code: 'AGENDA_SALA_BLOQUEADA' });
      });

      it('manutenção impede até quando está no nome do próprio profissional', async () => {
        const c = await cenario();
        await bloqueio(c.sala.id, { tipo: 'MANUTENCAO', profissionalId: c.prof.id });

        await http().post(BASE).send(corpo(c)).expect(409);
      });
    });

    describe('concorrência', () => {
      it('gravações simultâneas na mesma sala e horário: só uma passa', async () => {
        const c = await cenario();
        const profissionais = [c.prof];
        for (const nome of ['Prof B', 'Prof C', 'Prof D', 'Prof E']) {
          const p = await criarProfissional(nome);
          await atender(p.id);
          profissionais.push(p);
        }

        const respostas = await Promise.all(
          profissionais.map((prof) =>
            http()
              .post(BASE)
              .send(corpo({ ...c, prof })),
          ),
        );

        expect(respostas.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409]);
        expect(
          respostas
            .filter((r) => r.status === 409)
            .every((r) => r.body.code === 'AGENDA_SALA_CONFLITO'),
        ).toBe(true);
        expect(await prisma.agendamento.count({ where: { salaId: c.sala.id } })).toBe(1);
        expect(await prisma.auditLog.count({ where: { entity: ENTITY, action: 'CREATE' } })).toBe(
          1,
        );
      });

      it('gravações simultâneas do mesmo profissional em salas diferentes: só uma passa', async () => {
        const c = await cenario();
        const salas = [c.sala];
        for (const nome of ['Sala B', 'Sala C', 'Sala D']) salas.push(await criarSala(nome));

        const respostas = await Promise.all(
          salas.map((sala) =>
            http()
              .post(BASE)
              .send(corpo({ ...c, sala })),
          ),
        );

        expect(respostas.map((r) => r.status).sort()).toEqual([201, 409, 409, 409]);
        expect(
          respostas
            .filter((r) => r.status === 409)
            .every((r) => r.body.code === 'AGENDA_PROFISSIONAL_CONFLITO'),
        ).toBe(true);
        expect(await prisma.agendamento.count({ where: { profissionalId: c.prof.id } })).toBe(1);
      });

      it('horários diferentes na mesma sala não se bloqueiam entre si', async () => {
        const c = await cenario();
        const horas = ['08:00', '09:00', '10:00', '11:00'];

        const respostas = await Promise.all(
          horas.map((hora) => http().post(BASE).send(corpo(c, { hora }))),
        );

        expect(respostas.map((r) => r.status)).toEqual([201, 201, 201, 201]);
      });
    });

    it('usuário restrito só agenda para os profissionais vinculados (403), sem auditar', async () => {
      const c = await cenario();
      const outro = await criarProfissional('Outro Profissional');
      const restrito = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [outro.id],
      });

      await comUsuario(app, restrito).post(BASE).send(corpo(c)).expect(403);

      expect(await prisma.agendamento.count()).toBe(0);
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('PATCH (reagendamento)', () => {
    /** Agendamento criado pela API em 16:00–16:30 na sala do cenário. */
    async function existente() {
      const c = await cenario();
      const res = await http().post(BASE).send(corpo(c)).expect(201);
      return { c, id: res.body.id as string };
    }

    it('troca a sala e o horário, devolve o detalhe e audita com antes e depois', async () => {
      const { c, id } = await existente();
      const nova = await criarSala('Sala 2');

      const res = await http()
        .patch(`${BASE}/${id}`)
        .send({ salaId: nova.id, hora: '10:00', duracaoMinutos: 45 })
        .expect(200);

      expect(agendamentoSchema.parse(res.body)).toMatchObject({
        id,
        salaId: nova.id,
        salaNome: 'Sala 2',
        inicio: '2026-10-22T13:00:00.000Z',
        duracaoMinutos: 45,
        status: 'AGENDADO',
        pacienteId: c.paciente.id,
      });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: id,
        before: { salaId: c.sala.id, inicio: ISO_1600, duracaoMinutos: 30 },
        after: { salaId: nova.id, inicio: '2026-10-22T13:00:00.000Z', duracaoMinutos: 45 },
        userId: usuario.id,
      });
    });

    it('só a sala: mantém data, hora e duração', async () => {
      const { id } = await existente();
      const nova = await criarSala('Sala 2');

      const res = await http().patch(`${BASE}/${id}`).send({ salaId: nova.id }).expect(200);

      expect(res.body).toMatchObject({ salaId: nova.id, inicio: ISO_1600, duracaoMinutos: 30 });
    });

    it('um agendamento não conflita consigo mesmo (alterar só a duração)', async () => {
      const { id } = await existente();

      const res = await http().patch(`${BASE}/${id}`).send({ duracaoMinutos: 60 }).expect(200);

      expect(res.body.duracaoMinutos).toBe(60);
    });

    it('409 ao mover para a sala ou o horário já ocupados, sem auditar nem gravar', async () => {
      // A: profissional do cenário, 16:00 na Sala 1 (já criado por `existente`).
      const { c, id } = await existente();
      // B: outro profissional, 10:00 na Sala 1.
      const outro = await criarProfissional('Outro Profissional');
      await atender(outro.id);
      await http()
        .post(BASE)
        .send(corpo({ ...c, prof: outro }, { hora: '10:00' }))
        .expect(201);
      // C: o profissional do cenário, 12:00 na Sala 2.
      const outraSala = await criarSala('Sala 2');
      const resC = await http()
        .post(BASE)
        .send(corpo({ ...c, sala: outraSala }, { hora: '12:00' }))
        .expect(201);
      const idC = resC.body.id as string;

      // A vai para 10:15: o profissional está livre, mas a Sala 1 tem o B.
      const sala = await http().patch(`${BASE}/${id}`).send({ hora: '10:15' }).expect(409);
      expect(sala.body.code).toBe('AGENDA_SALA_CONFLITO');
      // C vai para 16:15: a Sala 2 está livre, mas o profissional já tem o A.
      const profissional = await http().patch(`${BASE}/${idC}`).send({ hora: '16:15' }).expect(409);
      expect(profissional.body.code).toBe('AGENDA_PROFISSIONAL_CONFLITO');

      const gravado = await prisma.agendamento.findUniqueOrThrow({ where: { id } });
      expect(gravado.inicio.toISOString()).toBe(ISO_1600);
      expect(await prisma.auditLog.count({ where: { entity: ENTITY, action: 'UPDATE' } })).toBe(0);
    });

    it('409 ao mover para fora do horário de atendimento ou para a sala em manutenção', async () => {
      const { c, id } = await existente();
      const bloqueada = await criarSala('Sala Bloqueada');
      await prisma.salaBloqueio.create({
        data: {
          salaId: bloqueada.id,
          tipo: 'MANUTENCAO',
          dataInicio: new Date(DIA),
          dataFim: new Date(DIA),
          horaInicio: '00:00',
          horaFim: '23:59',
        },
      });

      const fora = await http().patch(`${BASE}/${id}`).send({ hora: '19:00' }).expect(409);
      expect(fora.body.code).toBe('AGENDA_FORA_DO_HORARIO');
      const manutencao = await http()
        .patch(`${BASE}/${id}`)
        .send({ salaId: bloqueada.id })
        .expect(409);
      expect(manutencao.body.code).toBe('AGENDA_SALA_BLOQUEADA');
      expect((await prisma.agendamento.findUniqueOrThrow({ where: { id } })).salaId).toBe(
        c.sala.id,
      );
    });

    it('agendamento cancelado não ocupa sala nem horário: a alteração é gravada', async () => {
      const { c, id } = await existente();
      await prisma.agendamento.update({ where: { id }, data: { status: 'CANCELADO' } });
      const outro = await criarProfissional('Outro Profissional');
      await atender(outro.id);
      await http()
        .post(BASE)
        .send(corpo({ ...c, prof: outro }, { hora: '10:00' }))
        .expect(201);

      await http().patch(`${BASE}/${id}`).send({ hora: '10:00' }).expect(200);
    });

    it('agendamento antigo, sem sala: exige a sala (400) e aceita quando ela vem', async () => {
      const c = await cenario();
      const antigo = await agendar(c.paciente.id, c.prof.id, ISO_1600);

      const res = await http().patch(`${BASE}/${antigo.id}`).send({ hora: '10:00' }).expect(400);
      expect(res.body.details).toEqual([
        expect.objectContaining({ field: 'salaId', message: 'Sala é obrigatória.' }),
      ]);
      await expectNoAudit(prisma, { entity: ENTITY, action: 'UPDATE' });

      const ok = await http().patch(`${BASE}/${antigo.id}`).send({ salaId: c.sala.id }).expect(200);
      expect(ok.body).toMatchObject({ salaId: c.sala.id, salaNome: 'Sala 1' });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: antigo.id,
        before: { salaId: null },
        after: { salaId: c.sala.id },
      });
    });

    it('400 para corpo vazio, campo desconhecido e valores inválidos, sem auditar', async () => {
      const { id } = await existente();

      await http().patch(`${BASE}/${id}`).send({}).expect(400);
      await http().patch(`${BASE}/${id}`).send({ status: 'CANCELADO' }).expect(400);
      await http().patch(`${BASE}/${id}`).send({ pacienteId: INEXISTENTE }).expect(400);
      await http().patch(`${BASE}/${id}`).send({ hora: '25:00' }).expect(400);
      await http().patch(`${BASE}/${id}`).send({ duracaoMinutos: 0 }).expect(400);
      await http().patch(`${BASE}/${id}`).send({ salaId: 'abc' }).expect(400);
      await expectNoAudit(prisma, { entity: ENTITY, action: 'UPDATE' });
    });

    it('404 para agendamento inexistente ou excluído e para sala inexistente; 400 para id inválido', async () => {
      const { c, id } = await existente();
      const excluido = await agendar(c.paciente.id, c.prof.id, '2026-10-23T19:00:00Z', {
        deletedAt: new Date(),
      });

      await http().patch(`${BASE}/${INEXISTENTE}`).send({ hora: '10:00' }).expect(404);
      await http().patch(`${BASE}/${excluido.id}`).send({ hora: '10:00' }).expect(404);
      await http().patch(`${BASE}/${id}`).send({ salaId: INEXISTENTE }).expect(404);
      await http().patch(`${BASE}/abc`).send({ hora: '10:00' }).expect(400);
      await expectNoAudit(prisma, { entity: ENTITY, action: 'UPDATE' });
    });

    it('usuário restrito só altera os agendamentos dos profissionais vinculados (403)', async () => {
      const { c, id } = await existente();
      const restrito = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [(await criarProfissional('Outro Profissional')).id],
      });
      const vinculado = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [c.prof.id],
      });

      await comUsuario(app, restrito).patch(`${BASE}/${id}`).send({ hora: '10:00' }).expect(403);
      await expectNoAudit(prisma, { entity: ENTITY, action: 'UPDATE' });
      await comUsuario(app, vinculado).patch(`${BASE}/${id}`).send({ hora: '10:00' }).expect(200);
    });

    it('duas alterações simultâneas para o mesmo horário e sala: só uma passa', async () => {
      const c = await cenario();
      const profissionais = [c.prof];
      for (const nome of ['Prof B', 'Prof C']) {
        const p = await criarProfissional(nome);
        await atender(p.id);
        profissionais.push(p);
      }
      const ids: string[] = [];
      for (const [i, prof] of profissionais.entries()) {
        const res = await http()
          .post(BASE)
          .send(corpo({ ...c, prof }, { hora: ['08:00', '09:00', '10:00'][i] }))
          .expect(201);
        ids.push(res.body.id);
      }

      const respostas = await Promise.all(
        ids.map((id) => http().patch(`${BASE}/${id}`).send({ hora: '15:00' })),
      );

      expect(respostas.map((r) => r.status).sort()).toEqual([200, 409, 409]);
      expect(
        await prisma.agendamento.count({ where: { inicio: new Date('2026-10-22T18:00:00Z') } }),
      ).toBe(1);
      expect(await prisma.auditLog.count({ where: { entity: ENTITY, action: 'UPDATE' } })).toBe(1);
    });
  });

  describe('permissões', () => {
    const ROTAS = [
      { metodo: 'get', caminho: `${BASE}?inicio=2026-10-19&fim=2026-10-25`, permissao: 'ver' },
      { metodo: 'get', caminho: `${BASE}/profissionais`, permissao: 'ver' },
      { metodo: 'get', caminho: `${BASE}/sala-sugerida`, permissao: 'criar' },
      { metodo: 'get', caminho: `${BASE}/${INEXISTENTE}`, permissao: 'ver' },
      { metodo: 'post', caminho: BASE, permissao: 'criar' },
      { metodo: 'patch', caminho: `${BASE}/${INEXISTENTE}`, permissao: 'editar' },
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
