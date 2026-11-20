import type { INestApplication } from '@nestjs/common';
import { agendaProfissionaisSchema, agendamentoListaSchema, type Permissao } from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectNoAudit } from '../utils/expect-audit';

/**
 * Escopo de dados por profissional (issue #153; requisitos R §14 e §37). O perfil com escopo
 * `PROFISSIONAIS_VINCULADOS` vê só agenda, pacientes, prontuário e salas dos profissionais
 * vinculados ao usuário. Fora do escopo: 403 "Sem permissão" (confirmado pelo dev).
 */
const AGENDA = '/api/comercial-atendimento/agendamentos';
const ATENDIMENTO = '/api/consultorio-assistencial/atendimento-medico';
const PRONTUARIOS = '/api/consultorio-assistencial/prontuarios';
const PACIENTES = '/api/comercial-atendimento/pacientes';
const OCUPACAO = '/api/gestao-profissionais/salas/ocupacao';
const DASHBOARD = '/api/gestao-profissionais/salas/dashboard';
const CONTRATOS = '/api/gestao-profissionais/contratos-sala';

const PERMISSOES: readonly Permissao[] = [
  'comercial-atendimento.agenda.ver',
  'comercial-atendimento.agenda.criar',
  'comercial-atendimento.pacientes.ver',
  'comercial-atendimento.pacientes.editar',
  'consultorio-assistencial.atendimento-medico.ver',
  'consultorio-assistencial.prontuarios.ver',
  'consultorio-assistencial.prontuarios.criar',
  'gestao-profissionais.salas.ver',
];

// 2026-11-17 (terça) às 09:00 e 10:00 no fuso da clínica (UTC-3).
const DIA = '2026-11-17';
const NOVE_HORAS = '2026-11-17T12:00:00Z';
const DEZ_HORAS = '2026-11-17T13:00:00Z';

describe('Escopo de dados por profissional (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  /** Dois profissionais, um paciente de cada (com agendamento e atendimento). */
  async function cenario() {
    const [medico, outro] = await Promise.all([
      prisma.profissional.create({ data: { nome: 'Dra. Fictícia', corCalendario: 'verde' } }),
      prisma.profissional.create({ data: { nome: 'Dr. Outro Fictício', corCalendario: 'azul' } }),
    ]);
    const [pacienteDoMedico, pacienteDoOutro] = await Promise.all([
      prisma.paciente.create({ data: { nome: 'Paciente do Médico' } }),
      prisma.paciente.create({ data: { nome: 'Paciente do Outro' } }),
    ]);
    const agendamentoDoMedico = await prisma.agendamento.create({
      data: {
        pacienteId: pacienteDoMedico.id,
        profissionalId: medico.id,
        inicio: new Date(NOVE_HORAS),
      },
    });
    const agendamentoDoOutro = await prisma.agendamento.create({
      data: {
        pacienteId: pacienteDoOutro.id,
        profissionalId: outro.id,
        inicio: new Date(DEZ_HORAS),
      },
    });
    await prisma.atendimento.createMany({
      data: [
        { pacienteId: pacienteDoMedico.id, profissionalId: medico.id, queixa: 'Queixa A' },
        { pacienteId: pacienteDoOutro.id, profissionalId: outro.id, queixa: 'Queixa B' },
      ],
    });
    return {
      medico,
      outro,
      pacienteDoMedico,
      pacienteDoOutro,
      agendamentoDoMedico,
      agendamentoDoOutro,
    };
  }

  const restrito = (profissionalIds: string[]): Promise<UsuarioTeste> =>
    criarUsuarioTeste(app, {
      permissoes: PERMISSOES,
      escopoDados: 'PROFISSIONAIS_VINCULADOS',
      profissionalIds,
    });

  describe('Agenda', () => {
    it('usuário médico vê na Agenda só os próprios agendamentos', async () => {
      const c = await cenario();
      const medico = await restrito([c.medico.id]);
      const http = () => comUsuario(app, medico);

      const lista = await http().get(AGENDA).query({ inicio: DIA, fim: DIA }).expect(200);
      expect(agendamentoListaSchema.parse(lista.body).data.map((a) => a.id)).toEqual([
        c.agendamentoDoMedico.id,
      ]);

      const profissionais = await http().get(`${AGENDA}/profissionais`).expect(200);
      expect(agendaProfissionaisSchema.parse(profissionais.body).data.map((p) => p.id)).toEqual([
        c.medico.id,
      ]);

      await http().get(`${AGENDA}/${c.agendamentoDoMedico.id}`).expect(200);
      const negado = await http().get(`${AGENDA}/${c.agendamentoDoOutro.id}`).expect(403);
      expect(negado.body).toMatchObject({ code: 'FORBIDDEN', message: 'Sem permissão' });
      await http()
        .get(AGENDA)
        .query({ inicio: DIA, fim: DIA, profissionalId: c.outro.id })
        .expect(403);
    });

    it('não agenda para outro profissional (403, sem auditar)', async () => {
      const c = await cenario();
      const medico = await restrito([c.medico.id]);
      const sala = await prisma.sala.create({ data: { nome: 'Sala do teste' } });

      await comUsuario(app, medico)
        .post(AGENDA)
        .send({
          pacienteId: c.pacienteDoOutro.id,
          profissionalId: c.outro.id,
          salaId: sala.id,
          data: DIA,
          hora: '11:00',
        })
        .expect(403);
      await expectNoAudit(prisma, { entity: 'Agendamento' });
    });

    it('perfil sem restrição continua vendo todos os profissionais', async () => {
      const c = await cenario();
      const recepcao = await criarUsuarioTeste(app, { permissoes: PERMISSOES });

      const lista = await comUsuario(app, recepcao)
        .get(AGENDA)
        .query({ inicio: DIA, fim: DIA })
        .expect(200);
      expect(lista.body.data).toHaveLength(2);
      await comUsuario(app, recepcao).get(`${AGENDA}/${c.agendamentoDoOutro.id}`).expect(200);
    });

    it('secretária vinculada a dois profissionais vê a agenda dos dois', async () => {
      const c = await cenario();
      const secretaria = await restrito([c.medico.id, c.outro.id]);

      const lista = await comUsuario(app, secretaria)
        .get(AGENDA)
        .query({ inicio: DIA, fim: DIA })
        .expect(200);
      expect(lista.body.data).toHaveLength(2);
    });
  });

  describe('dados clínicos', () => {
    it('usuário com perfil Médico e sem vínculo não acessa dados clínicos', async () => {
      const c = await cenario();
      const semVinculo = await restrito([]);
      const http = () => comUsuario(app, semVinculo);

      const agenda = await http().get(AGENDA).query({ inicio: DIA, fim: DIA }).expect(200);
      expect(agenda.body.data).toEqual([]);
      const atendimentos = await http().get(ATENDIMENTO).query({ data: DIA }).expect(200);
      expect(atendimentos.body.data).toEqual([]);
      await http().get(`${ATENDIMENTO}/${c.agendamentoDoMedico.id}`).expect(403);
      await http().get(`${ATENDIMENTO}/${c.agendamentoDoMedico.id}/evolucoes`).expect(403);

      const prontuarios = await http().get(PRONTUARIOS).expect(200);
      expect(prontuarios.body.data).toEqual([]);
      await http().get(`${PRONTUARIOS}/${c.pacienteDoMedico.id}`).expect(403);
      await http().get(`${PRONTUARIOS}/${c.pacienteDoMedico.id}/atendimentos`).expect(403);
      await http().get(`${PRONTUARIOS}/${c.pacienteDoMedico.id}/historico-clinico`).expect(403);

      const pacientes = await http().get(PACIENTES).expect(200);
      expect(pacientes.body.data).toEqual([]);
      await http().get(`${PACIENTES}/${c.pacienteDoMedico.id}`).expect(403);
    });

    it('médico vê só os pacientes vinculados (com atendimento seu) e o prontuário deles', async () => {
      const c = await cenario();
      const medico = await restrito([c.medico.id]);
      const http = () => comUsuario(app, medico);

      const pacientes = await http().get(PACIENTES).expect(200);
      expect(pacientes.body.data.map((p: { id: string }) => p.id)).toEqual([c.pacienteDoMedico.id]);
      expect(pacientes.body.meta.total).toBe(1);
      await http().get(`${PACIENTES}/${c.pacienteDoMedico.id}`).expect(200);
      await http().get(`${PACIENTES}/${c.pacienteDoOutro.id}`).expect(403);
      await http()
        .patch(`${PACIENTES}/${c.pacienteDoOutro.id}`)
        .send({ nome: 'Alterado' })
        .expect(403);
      await expectNoAudit(prisma, { entity: 'Paciente' });

      const prontuarios = await http().get(PRONTUARIOS).expect(200);
      expect(prontuarios.body.data.map((p: { id: string }) => p.id)).toEqual([
        c.pacienteDoMedico.id,
      ]);
      await http().get(`${PRONTUARIOS}/${c.pacienteDoMedico.id}`).expect(200);
      await http().get(`${PRONTUARIOS}/${c.pacienteDoOutro.id}`).expect(403);
    });

    it('prontuário individual: atendimentos de outro profissional do mesmo paciente ficam ocultos', async () => {
      const c = await cenario();
      await prisma.atendimento.create({
        data: { pacienteId: c.pacienteDoMedico.id, profissionalId: c.outro.id, queixa: 'Outro' },
      });
      const medico = await restrito([c.medico.id]);

      const res = await comUsuario(app, medico)
        .get(`${PRONTUARIOS}/${c.pacienteDoMedico.id}/atendimentos`)
        .expect(200);
      expect(res.body.data.map((a: { profissionalId: string }) => a.profissionalId)).toEqual([
        c.medico.id,
      ]);
    });

    it('Atendimento Médico: lista do dia e detalhe só dos próprios agendamentos', async () => {
      const c = await cenario();
      const medico = await restrito([c.medico.id]);
      const http = () => comUsuario(app, medico);

      const lista = await http().get(ATENDIMENTO).query({ data: DIA }).expect(200);
      expect(lista.body.data.map((a: { id: string }) => a.id)).toEqual([c.agendamentoDoMedico.id]);
      await http().get(`${ATENDIMENTO}/${c.agendamentoDoMedico.id}`).expect(200);
      await http().get(`${ATENDIMENTO}/${c.agendamentoDoOutro.id}`).expect(403);
      await http().get(`${ATENDIMENTO}/${c.agendamentoDoOutro.id}/receitas`).expect(403);
    });
  });

  describe('salas', () => {
    async function contrato(salaId: string, profissionalId: string) {
      return prisma.contratoSala.create({
        data: {
          salaId,
          modalidade: 'MENSAL',
          locatarioTipo: 'PROFISSIONAL',
          profissionalId,
          valorUnitario: 1000,
          dataInicio: new Date('2026-09-01T00:00:00Z'),
          dias: { create: [{ diaSemana: 2, inicio: '08:00', fim: '12:00' }] },
        },
      });
    }

    it('ocupação: só as salas contratadas, com os outros locatários como "Ocupado"', async () => {
      const c = await cenario();
      const [sala1, sala2] = await Promise.all([
        prisma.sala.create({ data: { nome: 'Sala 1' } }),
        prisma.sala.create({ data: { nome: 'Sala 2' } }),
      ]);
      const doMedico = await contrato(sala1.id, c.medico.id);
      await contrato(sala1.id, c.outro.id);
      const doOutro = await contrato(sala2.id, c.outro.id);
      const medico = await restrito([c.medico.id]);
      const http = () => comUsuario(app, medico);

      const ocupacao = await http().get(OCUPACAO).query({ inicio: DIA }).expect(200);
      expect(ocupacao.body.salas).toHaveLength(1);
      expect(ocupacao.body.salas[0].salaId).toBe(sala1.id);
      expect(
        ocupacao.body.salas[0].blocos
          .map((b: { locatarioNome: string }) => b.locatarioNome)
          .sort((a: string, b: string) => a.localeCompare(b)),
      ).toEqual(['Dra. Fictícia', 'Ocupado']);

      await http().get(DASHBOARD).expect(403);
      const contratos = await http().get(CONTRATOS).expect(200);
      expect(contratos.body.data.map((x: { id: string }) => x.id)).toEqual([doMedico.id]);
      await http().get(`${CONTRATOS}/${doMedico.id}`).expect(200);
      await http().get(`${CONTRATOS}/${doOutro.id}`).expect(403);
    });
  });
});
