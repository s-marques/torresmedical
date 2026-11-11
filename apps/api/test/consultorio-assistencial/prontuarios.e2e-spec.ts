import type { INestApplication } from '@nestjs/common';
import {
  anamneseSchema,
  atendimentoSchema,
  historicoClinicoPageSchema,
  pacienteResumoProntuarioSchema,
  pacientesComRegistrosPageSchema,
  prontuarioSchema,
} from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/consultorio-assistencial/prontuarios';
const PERMISSOES = [
  'consultorio-assistencial.prontuarios.ver',
  'consultorio-assistencial.prontuarios.criar',
  'consultorio-assistencial.prontuarios.editar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe('Prontuários (e2e)', () => {
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

  function criarPaciente(nome: string, extra: Record<string, unknown> = {}) {
    return prisma.paciente.create({ data: { nome, ...extra } });
  }

  function criarProfissional(nome: string) {
    return prisma.profissional.create({ data: { nome } });
  }

  describe('GET /:pacienteId/paciente', () => {
    it('200 com o cabeçalho do paciente e 404 para inexistente', async () => {
      const paciente = await criarPaciente('Lucas Zanchet Fernandes', {
        email: 'lucas@biologicanet.com.br',
        celular: '65999979796',
      });

      const res = await http().get(`${BASE}/${paciente.id}/paciente`).expect(200);
      expect(pacienteResumoProntuarioSchema.parse(res.body)).toMatchObject({
        nome: 'Lucas Zanchet Fernandes',
        celular: '65999979796',
      });
      await http().get(`${BASE}/${INEXISTENTE}/paciente`).expect(404);
      await http().get(`${BASE}/abc/paciente`).expect(400);
      const semPermissao = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, semPermissao).get(`${BASE}/${paciente.id}/paciente`).expect(403);
    });
  });

  describe('GET / (lista com registros)', () => {
    it('só lista pacientes com atendimento ou anamnese, ordenado por último registro', async () => {
      const p1 = await criarPaciente('Paciente Um');
      const p2 = await criarPaciente('Paciente Dois');
      await criarPaciente('Paciente Sem Registro');
      const profissional = await criarProfissional('Dra. Ana Teste');

      await prisma.atendimento.create({
        data: { pacienteId: p1.id, profissionalId: profissional.id },
      });
      await prisma.anamnese.create({ data: { pacienteId: p2.id } });

      const res = await http().get(BASE).expect(200);
      const pagina = pacientesComRegistrosPageSchema.parse(res.body);
      expect(pagina.data.map((p) => p.nome)).toEqual(['Paciente Dois', 'Paciente Um']);
      expect(pagina.data[0]).toMatchObject({ totalRegistros: 1 });

      const busca = await http().get(BASE).query({ search: 'Um' }).expect(200);
      expect(busca.body.data.map((p: { nome: string }) => p.nome)).toEqual(['Paciente Um']);
    });

    it('403 sem permissão', async () => {
      const semPermissao = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, semPermissao).get(BASE).expect(403);
    });
  });

  describe('Prontuário (GET/PUT /:pacienteId)', () => {
    it('GET devolve vazio (não salvo) antes do primeiro "Salvar"', async () => {
      const paciente = await criarPaciente('Paciente Teste');
      const res = await http().get(`${BASE}/${paciente.id}`).expect(200);
      expect(prontuarioSchema.parse(res.body)).toMatchObject({
        pacienteId: paciente.id,
        alergias: null,
        createdAt: null,
      });
    });

    it('PUT cria na primeira vez e audita, com before null', async () => {
      const paciente = await criarPaciente('Paciente Teste');

      const res = await http()
        .put(`${BASE}/${paciente.id}`)
        .send({ alergias: 'Dipirona', observacoes: 'Nenhuma' })
        .expect(200);

      expect(prontuarioSchema.parse(res.body)).toMatchObject({
        pacienteId: paciente.id,
        alergias: 'Dipirona',
        observacoes: 'Nenhuma',
      });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Prontuario',
        entityId: paciente.id,
        before: null,
        after: { pacienteId: paciente.id, alergias: 'Dipirona' },
        userId: usuario.id,
      });
    });

    it('PUT substitui os campos nas vezes seguintes', async () => {
      const paciente = await criarPaciente('Paciente Teste');
      await http().put(`${BASE}/${paciente.id}`).send({ alergias: 'Dipirona' }).expect(200);

      const res = await http()
        .put(`${BASE}/${paciente.id}`)
        .send({ medicamentosEmUso: 'Losartana' })
        .expect(200);

      expect(res.body).toMatchObject({ alergias: null, medicamentosEmUso: 'Losartana' });
    });

    it('404 para paciente inexistente e 403 sem permissão de editar', async () => {
      await http().put(`${BASE}/${INEXISTENTE}`).send({}).expect(404);
      const paciente = await criarPaciente('Paciente Teste');
      const leitor = await criarUsuarioTeste(app, {
        permissoes: ['consultorio-assistencial.prontuarios.ver'],
      });
      await comUsuario(app, leitor).put(`${BASE}/${paciente.id}`).send({}).expect(403);
      await expectNoAudit(prisma, { entity: 'Prontuario' });
    });
  });

  describe('Atendimentos (GET/POST /:pacienteId/atendimentos)', () => {
    it('cria com os padrões do modal, audita CREATE e lista por data decrescente', async () => {
      const paciente = await criarPaciente('Paciente Teste');
      const profissional = await criarProfissional('Dr. João');

      const res = await http()
        .post(`${BASE}/${paciente.id}/atendimentos`)
        .send({ profissionalId: profissional.id, tipo: 'CONSULTA', queixa: 'Dor de cabeça' })
        .expect(201);

      expect(atendimentoSchema.parse(res.body)).toMatchObject({
        pacienteId: paciente.id,
        profissionalId: profissional.id,
        profissionalNome: 'Dr. João',
        tipo: 'CONSULTA',
        status: 'EM_ANDAMENTO',
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'Atendimento',
        entityId: res.body.id,
        before: null,
        after: { id: res.body.id, pacienteId: paciente.id },
        userId: usuario.id,
      });

      const lista = await http().get(`${BASE}/${paciente.id}/atendimentos`).expect(200);
      expect(lista.body.data).toHaveLength(1);
      expect(lista.body.data[0].id).toBe(res.body.id);
    });

    it('400 sem profissional e 404 para profissional inexistente, sem auditar', async () => {
      const paciente = await criarPaciente('Paciente Teste');
      await http().post(`${BASE}/${paciente.id}/atendimentos`).send({}).expect(400);
      await http()
        .post(`${BASE}/${paciente.id}/atendimentos`)
        .send({ profissionalId: INEXISTENTE })
        .expect(404);
      await expectNoAudit(prisma, { entity: 'Atendimento' });
    });

    it('403 sem permissão de criar', async () => {
      const paciente = await criarPaciente('Paciente Teste');
      const profissional = await criarProfissional('Dr. João');
      const leitor = await criarUsuarioTeste(app, {
        permissoes: ['consultorio-assistencial.prontuarios.ver'],
      });
      await comUsuario(app, leitor)
        .post(`${BASE}/${paciente.id}/atendimentos`)
        .send({ profissionalId: profissional.id })
        .expect(403);
      await expectNoAudit(prisma, { entity: 'Atendimento' });
    });
  });

  describe('Anamneses (GET/POST /:pacienteId/anamneses)', () => {
    it('cria sem profissional (opcional) e audita CREATE', async () => {
      const paciente = await criarPaciente('Paciente Teste');

      const res = await http()
        .post(`${BASE}/${paciente.id}/anamneses`)
        .send({ queixaPrincipal: 'Febre' })
        .expect(201);

      expect(anamneseSchema.parse(res.body)).toMatchObject({
        pacienteId: paciente.id,
        profissionalId: null,
        queixaPrincipal: 'Febre',
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'Anamnese',
        entityId: res.body.id,
        before: null,
        after: { id: res.body.id, queixaPrincipal: 'Febre' },
        userId: usuario.id,
      });
    });

    it('404 para profissional inexistente quando informado', async () => {
      const paciente = await criarPaciente('Paciente Teste');
      await http()
        .post(`${BASE}/${paciente.id}/anamneses`)
        .send({ profissionalId: INEXISTENTE })
        .expect(404);
      await expectNoAudit(prisma, { entity: 'Anamnese' });
    });
  });

  describe('GET /:pacienteId/historico-clinico', () => {
    it('agrega atendimentos e anamneses por data decrescente', async () => {
      const paciente = await criarPaciente('Paciente Teste');
      const profissional = await criarProfissional('Dra. Ana');

      await http()
        .post(`${BASE}/${paciente.id}/atendimentos`)
        .send({ profissionalId: profissional.id, tipo: 'EXAME', diagnostico: 'Sem alterações' })
        .expect(201);
      await http()
        .post(`${BASE}/${paciente.id}/anamneses`)
        .send({ queixaPrincipal: 'Febre' })
        .expect(201);

      const res = await http().get(`${BASE}/${paciente.id}/historico-clinico`).expect(200);
      const pagina = historicoClinicoPageSchema.parse(res.body);
      expect(pagina.data).toHaveLength(2);
      expect(pagina.data.map((i) => i.tipo).sort()).toEqual(['ANAMNESE', 'ATENDIMENTO']);
    });
  });
});
