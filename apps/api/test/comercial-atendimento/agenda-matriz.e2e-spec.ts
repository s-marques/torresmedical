import type { INestApplication } from '@nestjs/common';
import { agendaMatrizSchema, type AgendaMatriz } from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/comercial-atendimento/agenda-matriz';
const PERMISSOES = ['comercial-atendimento.agenda.ver'] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

/** 22/10/2026 é quinta-feira (dia da semana 4). A semana vai de 19/10 a 25/10. */
const DIA = '2026-10-22';
/** Horário de Brasília (UTC-3): 09:00 locais são 12:00 UTC. */
const as0900 = '2026-10-22T12:00:00Z';

describe('Agenda matricial (e2e)', () => {
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

  const http = (u: UsuarioTeste = usuario) => comUsuario(app, u);
  const consultar = async (query: Record<string, string> = {}): Promise<AgendaMatriz> =>
    agendaMatrizSchema.parse((await http().get(BASE).query(query).expect(200)).body);

  const criarSala = (nome: string) => prisma.sala.create({ data: { nome } });
  const criarProfissional = (nome: string, extra = {}) =>
    prisma.profissional.create({ data: { nome, corCalendario: 'verde', ...extra } });
  const criarPaciente = () => prisma.paciente.create({ data: { nome: 'Paciente Teste' } });

  function contrato(
    salaId: string,
    profissionalId: string,
    dias: Array<[number, string, string]>,
    extra: Record<string, unknown> = {},
  ) {
    return prisma.contratoSala.create({
      data: {
        salaId,
        modalidade: 'MENSAL',
        locatarioTipo: 'PROFISSIONAL',
        profissionalId,
        valorUnitario: 1500,
        dataInicio: new Date('2026-09-01T00:00:00Z'),
        dias: { create: dias.map(([diaSemana, inicio, fim]) => ({ diaSemana, inicio, fim })) },
        ...extra,
      },
    });
  }

  async function agendar(
    salaId: string,
    profissionalId: string,
    inicio: string,
    extra: Record<string, unknown> = {},
  ) {
    const paciente = await criarPaciente();
    return prisma.agendamento.create({
      data: {
        pacienteId: paciente.id,
        profissionalId,
        salaId,
        inicio: new Date(inicio),
        duracaoMinutos: 60,
        ...extra,
      },
    });
  }

  const bloquear = (salaId: string, tipo: string, inicio: string, fim: string, extra = {}) =>
    prisma.salaBloqueio.create({
      data: {
        salaId,
        tipo: tipo as 'MANUTENCAO',
        dataInicio: new Date(`${DIA}T00:00:00Z`),
        dataFim: new Date(`${DIA}T00:00:00Z`),
        horaInicio: inicio,
        horaFim: fim,
        ...extra,
      },
    });

  const celula = (m: AgendaMatriz, sala: string, coluna: string, data = DIA) =>
    m.salas
      .find((s) => s.salaNome === sala)
      ?.celulas.find((c) => c.data === data && c.coluna === coluna);

  describe('GET', () => {
    it('semana: todas as salas, 7 dias e as colunas por turno, sem gravar auditoria', async () => {
      await criarSala('Sala 10');
      await criarSala('Sala 2');
      const m = await consultar({ data: DIA });
      expect(m).toMatchObject({ visao: 'semana', inicio: '2026-10-19', fim: '2026-10-25' });
      expect(m.dias).toHaveLength(7);
      expect(m.colunas.map((c) => [c.chave, c.inicio, c.fim])).toEqual([
        ['MANHA', '00:00', '12:00'],
        ['TARDE', '12:00', '18:00'],
        ['NOITE', '18:00', '24:00'],
      ]);
      expect(m.salas.map((s) => s.salaNome)).toEqual(['Sala 2', 'Sala 10']);
      expect(m.salas[0]?.celulas).toHaveLength(21);
      expect(m.salas[0]?.celulas.every((c) => c.status === 'DISPONIVEL')).toBe(true);
      await expectNoAudit(prisma, { entity: 'Agendamento' });
    });

    it('dia: colunas de 1 h das 07h às 20h e o dia da semana do contrato', async () => {
      const sala = await criarSala('Sala 1');
      const ana = await criarProfissional('Dra. Ana Teste');
      await contrato(sala.id, ana.id, [[4, '08:00', '12:00']]);
      const m = await consultar({ visao: 'dia', data: DIA });
      expect(m.colunas[0]?.chave).toBe('07:00');
      expect(m.colunas.at(-1)).toMatchObject({ chave: '19:00', fim: '20:00' });
      expect(celula(m, 'Sala 1', '07:00')?.status).toBe('DISPONIVEL');
      expect(celula(m, 'Sala 1', '08:00')).toMatchObject({ status: 'CONTRATADO', semUso: true });
      expect(celula(m, 'Sala 1', '08:00')?.itens[0]).toMatchObject({
        tipo: 'CONTRATO',
        nome: 'Dra. Ana Teste',
        valorMensal: 1500,
        inicio: '08:00',
        fim: '12:00',
        oculto: false,
      });
      expect(celula(m, 'Sala 1', '12:00')?.status).toBe('DISPONIVEL');
    });

    it('agendamento dentro do contrato vira Agendado; o resto do período fica sem uso', async () => {
      const sala = await criarSala('Sala 1');
      const ana = await criarProfissional('Dra. Ana Teste');
      await contrato(sala.id, ana.id, [[4, '08:00', '12:00']]);
      await agendar(sala.id, ana.id, as0900);
      const m = await consultar({ visao: 'dia', data: DIA });
      expect(celula(m, 'Sala 1', '08:00')).toMatchObject({ status: 'CONTRATADO', semUso: true });
      expect(celula(m, 'Sala 1', '09:00')).toMatchObject({ status: 'AGENDADO', semUso: false });
      expect(celula(m, 'Sala 1', '09:00')?.itens.map((i) => i.tipo)).toEqual([
        'CONTRATO',
        'AGENDAMENTO',
      ]);
      expect(celula(m, 'Sala 1', '10:00')).toMatchObject({ status: 'CONTRATADO', semUso: true });
      // No turno, o período usado deixa de ser "sem uso".
      const semana = await consultar({ data: DIA });
      expect(celula(semana, 'Sala 1', 'MANHA')).toMatchObject({
        status: 'AGENDADO',
        semUso: false,
      });
    });

    it('agendamento cancelado libera o horário e o status do agendamento aparece no item', async () => {
      const sala = await criarSala('Sala 1');
      const ana = await criarProfissional('Dra. Ana Teste');
      await agendar(sala.id, ana.id, as0900, { status: 'CANCELADO' });
      await agendar(sala.id, ana.id, '2026-10-22T13:00:00Z', { status: 'CONFIRMADO' });
      await agendar(sala.id, ana.id, '2026-10-22T14:00:00Z', { deletedAt: new Date() });
      const m = await consultar({ visao: 'dia', data: DIA });
      expect(celula(m, 'Sala 1', '09:00')?.status).toBe('DISPONIVEL');
      expect(celula(m, 'Sala 1', '10:00')?.itens[0]).toMatchObject({
        tipo: 'AGENDAMENTO',
        agendamentoStatus: 'CONFIRMADO',
        nome: 'Dra. Ana Teste',
      });
      expect(celula(m, 'Sala 1', '11:00')?.status).toBe('DISPONIVEL');
    });

    it('cada tipo de bloqueio aparece com o próprio status e vence o agendamento e o contrato', async () => {
      const sala = await criarSala('Sala 1');
      const ana = await criarProfissional('Dra. Ana Teste');
      await contrato(sala.id, ana.id, [[4, '08:00', '18:00']]);
      await agendar(sala.id, ana.id, as0900);
      await bloquear(sala.id, 'MANUTENCAO', '09:00', '10:00');
      await bloquear(sala.id, 'RESERVA', '10:00', '11:00', { profissionalId: ana.id });
      await bloquear(sala.id, 'CORTESIA', '11:00', '12:00', { profissionalId: ana.id });
      await bloquear(sala.id, 'USO_AVULSO', '12:00', '13:00');
      await bloquear(sala.id, 'BLOQUEIO', '13:00', '14:00', { motivo: 'Obra' });
      const m = await consultar({ visao: 'dia', data: DIA });
      const status = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00'].map(
        (h) => celula(m, 'Sala 1', h)?.status,
      );
      expect(status).toEqual([
        'MANUTENCAO',
        'RESERVA',
        'CORTESIA',
        'USO_AVULSO',
        'BLOQUEIO',
        'CONTRATADO',
      ]);
      expect(celula(m, 'Sala 1', '10:00')?.itens.find((i) => i.tipo === 'BLOQUEIO')).toMatchObject({
        bloqueioTipo: 'RESERVA',
        nome: 'Dra. Ana Teste',
      });
    });

    it('bloqueio cancelado, recorrente e de outro dia seguem as regras do Mapa', async () => {
      const sala = await criarSala('Sala 1');
      await bloquear(sala.id, 'MANUTENCAO', '08:00', '09:00', { canceladoEm: new Date() });
      const recorrente = await prisma.salaBloqueio.create({
        data: {
          salaId: sala.id,
          tipo: 'RESERVA',
          recorrente: true,
          dataInicio: new Date('2026-10-01T00:00:00Z'),
          dataFim: new Date('2026-10-31T00:00:00Z'),
          dias: { create: [{ diaSemana: 4, inicio: '14:00', fim: '16:00' }] },
        },
      });
      const m = await consultar({ visao: 'dia', data: DIA });
      expect(celula(m, 'Sala 1', '08:00')?.status).toBe('DISPONIVEL');
      expect(celula(m, 'Sala 1', '14:00')?.itens[0]?.id).toBe(recorrente.id);
      const sexta = await consultar({ visao: 'dia', data: '2026-10-23' });
      expect(celula(sexta, 'Sala 1', '14:00', '2026-10-23')?.status).toBe('DISPONIVEL');
    });

    it('mostra todas as salas e todos os profissionais com contrato no período (não só dois)', async () => {
      const nomes = ['Dra. Ana', 'Dr. Bruno', 'Dra. Carla', 'Dr. Davi', 'Dra. Eva'];
      for (const [i, nome] of nomes.entries()) {
        const sala = await criarSala(`Sala ${i + 1}`);
        const prof = await criarProfissional(nome);
        await contrato(sala.id, prof.id, [[4, '08:00', '12:00']]);
      }
      const m = await consultar({ data: DIA });
      expect(m.salas).toHaveLength(5);
      const quem = m.salas.flatMap((s) =>
        (s.celulas.find((c) => c.coluna === 'MANHA' && c.data === DIA)?.itens ?? []).map(
          (i) => i.nome,
        ),
      );
      expect(quem.sort()).toEqual([...nomes].sort());
    });

    it('contrato fora da vigência ou cancelado não entra', async () => {
      const sala = await criarSala('Sala 1');
      const ana = await criarProfissional('Dra. Ana Teste');
      await contrato(sala.id, ana.id, [[4, '08:00', '12:00']], { status: 'CANCELADO' });
      await contrato(sala.id, ana.id, [[4, '08:00', '12:00']], {
        dataFim: new Date('2026-10-21T00:00:00Z'),
      });
      const m = await consultar({ visao: 'dia', data: DIA });
      expect(celula(m, 'Sala 1', '08:00')?.status).toBe('DISPONIVEL');
    });

    it('mês: todos os dias do mês civil', async () => {
      await criarSala('Sala 1');
      const m = await consultar({ visao: 'mes', data: DIA });
      expect(m).toMatchObject({ inicio: '2026-10-01', fim: '2026-10-31' });
      expect(m.dias).toHaveLength(31);
    });
  });

  describe('GET: filtros', () => {
    async function cenario() {
      const especialidade = await prisma.especialidade.create({ data: { nome: 'Nutrologia' } });
      const ana = await criarProfissional('Dra. Ana Teste', { especialidadeId: especialidade.id });
      const bia = await criarProfissional('Dra. Bia Teste');
      const sala1 = await criarSala('Sala 1');
      const sala2 = await criarSala('Sala 2');
      await contrato(sala1.id, ana.id, [[4, '08:00', '12:00']]);
      await contrato(sala2.id, bia.id, [[4, '08:00', '12:00']]);
      await agendar(sala2.id, bia.id, as0900);
      return { especialidade, ana, bia, sala1, sala2 };
    }

    it('profissional: esconde o que é de outros e mantém o livre', async () => {
      const { ana } = await cenario();
      const m = await consultar({ visao: 'dia', data: DIA, profissionalId: ana.id });
      expect(celula(m, 'Sala 1', '08:00')?.status).toBe('CONTRATADO');
      expect(celula(m, 'Sala 2', '08:00')).toBeUndefined();
      expect(celula(m, 'Sala 2', '07:00')?.status).toBe('DISPONIVEL');
    });

    it('especialidade: só os profissionais dela; sem profissional na especialidade, nada ocupado', async () => {
      const { especialidade } = await cenario();
      const m = await consultar({ visao: 'dia', data: DIA, especialidadeId: especialidade.id });
      expect(celula(m, 'Sala 1', '08:00')?.status).toBe('CONTRATADO');
      expect(celula(m, 'Sala 2', '08:00')).toBeUndefined();
      const outra = await prisma.especialidade.create({ data: { nome: 'Cardiologia' } });
      const vazio = await consultar({ visao: 'dia', data: DIA, especialidadeId: outra.id });
      expect(vazio.salas.flatMap((s) => s.celulas).every((c) => c.status === 'DISPONIVEL')).toBe(
        true,
      );
    });

    it('sala: só a sala pedida', async () => {
      const { sala2 } = await cenario();
      const m = await consultar({ data: DIA, salaId: sala2.id });
      expect(m.salas.map((s) => s.salaNome)).toEqual(['Sala 2']);
    });

    it('turno: só as colunas do turno, em horas e em turnos', async () => {
      await cenario();
      const tarde = await consultar({ data: DIA, turno: 'TARDE' });
      expect(tarde.colunas.map((c) => c.chave)).toEqual(['TARDE']);
      const horas = await consultar({ visao: 'dia', data: DIA, turno: 'TARDE' });
      expect(horas.colunas.map((c) => c.chave)).toEqual([
        '12:00',
        '13:00',
        '14:00',
        '15:00',
        '16:00',
        '17:00',
      ]);
    });

    it('situação: sem uso, contratado, agendado, disponível, reservado e bloqueado', async () => {
      const { sala1 } = await cenario();
      await bloquear(sala1.id, 'MANUTENCAO', '14:00', '15:00');
      await bloquear(sala1.id, 'CORTESIA', '15:00', '16:00');
      const por = async (situacao: string) =>
        (await consultar({ visao: 'dia', data: DIA, situacao })).salas.flatMap((s) =>
          s.celulas.map((c) => `${s.salaNome}@${c.coluna}`),
        );
      const semUso = await por('SEM_USO');
      expect(semUso).toContain('Sala 1@08:00');
      expect(semUso).toContain('Sala 2@08:00');
      expect(semUso).not.toContain('Sala 2@09:00');
      expect(await por('AGENDADO')).toEqual(['Sala 2@09:00']);
      expect(await por('CONTRATADO')).toContain('Sala 2@09:00');
      expect(await por('BLOQUEADO')).toEqual(['Sala 1@14:00']);
      expect(await por('RESERVADO')).toEqual(['Sala 1@15:00']);
      const livres = await por('DISPONIVEL');
      expect(livres).toContain('Sala 1@07:00');
      expect(livres).not.toContain('Sala 1@14:00');
    });

    it('visão Dia amplia a faixa de horas para caber um agendamento fora dela', async () => {
      const sala = await criarSala('Sala 1');
      const ana = await criarProfissional('Dra. Ana Teste');
      // 05:30 locais: antes das 07h.
      await agendar(sala.id, ana.id, '2026-10-22T08:30:00Z', { duracaoMinutos: 30 });
      const m = await consultar({ visao: 'dia', data: DIA });
      expect(m.colunas[0]?.chave).toBe('05:00');
      expect(celula(m, 'Sala 1', '05:00')?.status).toBe('AGENDADO');
    });
  });

  describe('GET: erros e permissão', () => {
    it('400 para visão, turno, situação e data inválidos', async () => {
      for (const query of [
        { visao: 'ano' },
        { turno: 'MADRUGADA' },
        { situacao: 'X' },
        { data: '22/10/2026' },
        { salaId: 'x' },
        { extra: '1' },
      ]) {
        const res = await http().get(BASE).query(query).expect(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      }
    });

    it('403 sem a permissão da Agenda', async () => {
      const sem = await criarUsuarioTeste(app, { permissoes: [] });
      await http(sem).get(BASE).expect(403);
    });
  });

  describe('GET: usuário restrito (#153)', () => {
    async function restrito() {
      const ana = await criarProfissional('Dra. Ana Teste');
      const bia = await criarProfissional('Dra. Bia Teste');
      const sala1 = await criarSala('Sala 1');
      const sala2 = await criarSala('Sala 2');
      await criarSala('Sala 3');
      await contrato(sala1.id, ana.id, [[4, '08:00', '12:00']]);
      await contrato(sala2.id, bia.id, [[4, '08:00', '12:00']]);
      await agendar(sala1.id, ana.id, as0900);
      await agendar(sala2.id, bia.id, as0900);
      const u = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [ana.id],
      });
      return { u, ana, bia };
    }

    it('vê só as salas com profissional seu; o que é de outros some do período', async () => {
      const { u } = await restrito();
      const m = agendaMatrizSchema.parse(
        (await http(u).get(BASE).query({ visao: 'dia', data: DIA }).expect(200)).body,
      );
      expect(m.salas.map((s) => s.salaNome)).toEqual(['Sala 1']);
      expect(celula(m, 'Sala 1', '09:00')?.itens.map((i) => i.nome)).toEqual([
        'Dra. Ana Teste',
        'Dra. Ana Teste',
      ]);
    });

    it('contrato e agendamento de outro profissional na sala dele vêm ocultos, sem nome nem valor', async () => {
      const { u, bia } = await restrito();
      // Bia também usa a Sala 1 à tarde: a Sala 1 é visível, mas o que é dela fica oculto.
      const sala1 = await prisma.sala.findFirstOrThrow({ where: { nome: 'Sala 1' } });
      await contrato(sala1.id, bia.id, [[4, '14:00', '18:00']]);
      await agendar(sala1.id, bia.id, '2026-10-22T17:00:00Z');
      const m = agendaMatrizSchema.parse(
        (await http(u).get(BASE).query({ visao: 'dia', data: DIA }).expect(200)).body,
      );
      const itens = celula(m, 'Sala 1', '14:00')?.itens ?? [];
      expect(itens).toHaveLength(2);
      expect(itens.every((i) => i.oculto && i.nome === null && i.valorMensal === null)).toBe(true);
      expect(itens.find((i) => i.tipo === 'AGENDAMENTO')?.agendamentoStatus).toBeNull();
      expect(JSON.stringify(m)).not.toContain('Dra. Bia Teste');
    });

    it('403 ao filtrar por profissional fora do escopo; 200 com o seu', async () => {
      const { u, ana, bia } = await restrito();
      await http(u).get(BASE).query({ profissionalId: bia.id }).expect(403);
      await http(u).get(BASE).query({ profissionalId: ana.id }).expect(200);
    });

    it('restrito sem profissional vinculado não vê sala alguma', async () => {
      await criarSala('Sala 1');
      const u = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [],
      });
      const m = agendaMatrizSchema.parse((await http(u).get(BASE).expect(200)).body);
      expect(m.salas).toEqual([]);
    });
  });

  it('sala inexistente no filtro devolve a grade sem salas', async () => {
    await criarSala('Sala 1');
    const m = await consultar({ salaId: INEXISTENTE });
    expect(m.salas).toEqual([]);
  });
});
