import type { INestApplication } from '@nestjs/common';
import { prontuarioAcessoPageSchema, type Permissao } from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';

const BASE = '/api/consultorio-assistencial/prontuarios';
const CLINICAS: readonly Permissao[] = [
  'consultorio-assistencial.prontuarios.ver',
  'consultorio-assistencial.prontuarios.criar',
  'consultorio-assistencial.prontuarios.editar',
];
const ACESSOS: Permissao = 'consultorio-assistencial.prontuarios-acessos.ver';
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

const PERFIS_SEM_CLINICO: readonly (readonly [string, readonly Permissao[]])[] = [
  ['recepção', ['comercial-atendimento.agenda.ver', 'comercial-atendimento.pacientes.ver']],
  ['comercial', ['comercial-atendimento.pipeline.ver', 'comercial-atendimento.vendas-pdv.ver']],
  ['financeiro', ['financeiro.contas-receber.ver', 'financeiro.contas-pagar.ver']],
];

/** Issue #150: prontuário privativo do profissional responsável + log de acesso de leitura. */
describe('Prontuários: privacidade por profissional (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let medicoA: UsuarioTeste;
  let medicoB: UsuarioTeste;
  let profA: { id: string };
  let profB: { id: string };
  let paciente: { id: string };

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    profA = await prisma.profissional.create({ data: { nome: 'Dr. Fictício A' } });
    profB = await prisma.profissional.create({ data: { nome: 'Dra. Fictícia B' } });
    paciente = await prisma.paciente.create({ data: { nome: 'Paciente Fictício' } });
    medicoA = await criarUsuarioTeste(app, {
      permissoes: CLINICAS,
      escopoDados: 'PROFISSIONAIS_VINCULADOS',
      profissionalIds: [profA.id],
    });
    medicoB = await criarUsuarioTeste(app, {
      permissoes: CLINICAS,
      escopoDados: 'PROFISSIONAIS_VINCULADOS',
      profissionalIds: [profB.id],
    });
    // Mesmo paciente atendido pelos dois: cada um tem só os seus registros.
    const blocoA = await prisma.receituarioBloco.create({
      data: { tipo: 'BRANCA', numeroInicio: 1, numeroFim: 10, profissionalId: profA.id },
    });
    await prisma.atendimento.createMany({
      data: [
        { pacienteId: paciente.id, profissionalId: profA.id, queixa: 'Queixa A' },
        { pacienteId: paciente.id, profissionalId: profB.id, queixa: 'Queixa B' },
      ],
    });
    await prisma.anamnese.createMany({
      data: [
        { pacienteId: paciente.id, profissionalId: profA.id, queixaPrincipal: 'Anamnese A' },
        { pacienteId: paciente.id, profissionalId: profB.id, queixaPrincipal: 'Anamnese B' },
      ],
    });
    await prisma.prescricao.create({
      data: {
        blocoId: blocoA.id,
        numero: 1,
        pacienteId: paciente.id,
        profissionalId: profA.id,
        medicacao: 'Receita A',
        dataPrescricao: new Date('2026-11-01'),
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const acessosGravados = () =>
    prisma.prontuarioAcesso.findMany({ orderBy: { acessadoEm: 'asc' } });

  it('médico A vê só os registros dele; B não vê os de A', async () => {
    const atendimentosA = await comUsuario(app, medicoA)
      .get(`${BASE}/${paciente.id}/atendimentos`)
      .expect(200);
    expect(atendimentosA.body.data.map((a: { queixa: string }) => a.queixa)).toEqual(['Queixa A']);

    const anamnesesB = await comUsuario(app, medicoB)
      .get(`${BASE}/${paciente.id}/anamneses`)
      .expect(200);
    expect(anamnesesB.body.data.map((a: { queixaPrincipal: string }) => a.queixaPrincipal)).toEqual(
      ['Anamnese B'],
    );

    const receitasA = await comUsuario(app, medicoA)
      .get(`${BASE}/${paciente.id}/receitas`)
      .expect(200);
    expect(receitasA.body.data).toHaveLength(1);
    const receitasB = await comUsuario(app, medicoB)
      .get(`${BASE}/${paciente.id}/receitas`)
      .expect(200);
    expect(receitasB.body.data).toHaveLength(0);

    const historicoB = await comUsuario(app, medicoB)
      .get(`${BASE}/${paciente.id}/historico-clinico`)
      .expect(200);
    expect(historicoB.body.data.map((i: { resumo: string }) => i.resumo).sort()).toEqual([
      'Anamnese B',
      'Queixa B',
    ]);
  });

  it('403 para paciente sem vínculo com o médico, em todos os endpoints', async () => {
    const outro = await prisma.paciente.create({ data: { nome: 'Outro Fictício' } });
    await prisma.atendimento.create({
      data: { pacienteId: outro.id, profissionalId: profB.id, queixa: 'Só do B' },
    });
    for (const rota of [
      '',
      '/paciente',
      '/atendimentos',
      '/anamneses',
      '/receitas',
      '/historico-clinico',
    ]) {
      await comUsuario(app, medicoA).get(`${BASE}/${outro.id}${rota}`).expect(403);
    }
    await comUsuario(app, medicoA)
      .put(`${BASE}/${outro.id}`)
      .send({ alergias: 'Dipirona' })
      .expect(403);
    const lista = await comUsuario(app, medicoA).get(BASE).expect(200);
    expect(lista.body.data.map((p: { id: string }) => p.id)).toEqual([paciente.id]);
    expect(await acessosGravados()).toHaveLength(0);
  });

  it('médico não registra atendimento em nome de outro profissional', async () => {
    await comUsuario(app, medicoA)
      .post(`${BASE}/${paciente.id}/atendimentos`)
      .send({ profissionalId: profB.id })
      .expect(403);
  });

  it('usuário restrito sem profissional vinculado não vê dado clínico', async () => {
    const semVinculo = await criarUsuarioTeste(app, {
      permissoes: CLINICAS,
      escopoDados: 'PROFISSIONAIS_VINCULADOS',
      profissionalIds: [],
    });
    await comUsuario(app, semVinculo).get(`${BASE}/${paciente.id}`).expect(403);
    const lista = await comUsuario(app, semVinculo).get(BASE).expect(200);
    expect(lista.body.data).toEqual([]);
  });

  describe('log de acesso de leitura', () => {
    it('cada abertura grava usuário, paciente e recurso, sem conteúdo clínico', async () => {
      const casos = [
        ['', 'PRONTUARIO'],
        ['/atendimentos', 'ATENDIMENTOS'],
        ['/anamneses', 'ANAMNESES'],
        ['/receitas', 'RECEITAS'],
        ['/historico-clinico', 'HISTORICO_CLINICO'],
      ] as const;
      for (const [rota] of casos) {
        await comUsuario(app, medicoA).get(`${BASE}/${paciente.id}${rota}`).expect(200);
      }
      const registros = await acessosGravados();
      expect(registros.map((r) => r.recurso)).toEqual(casos.map(([, recurso]) => recurso));
      for (const registro of registros) {
        expect(registro).toMatchObject({ usuarioId: medicoA.id, pacienteId: paciente.id });
        expect(registro.requestId).toEqual(expect.any(String));
      }
    });

    it('acesso negado (403/404) não grava', async () => {
      const semAcesso = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, semAcesso).get(`${BASE}/${paciente.id}`).expect(403);
      await comUsuario(app, medicoA).get(`${BASE}/${INEXISTENTE}`).expect(404);
      expect(await acessosGravados()).toHaveLength(0);
    });

    it('administração lista o log com filtros; restrito e perfil comum recebem 403', async () => {
      await comUsuario(app, medicoA).get(`${BASE}/${paciente.id}`).expect(200);
      await comUsuario(app, medicoB).get(`${BASE}/${paciente.id}/anamneses`).expect(200);
      const admin = await criarUsuarioTeste(app, { permissoes: [ACESSOS] });

      const todos = await comUsuario(app, admin).get(`${BASE}/acessos`).expect(200);
      const pagina = prontuarioAcessoPageSchema.parse(todos.body);
      expect(pagina.data).toHaveLength(2);
      expect(pagina.data[0]).toMatchObject({ usuarioId: medicoB.id, recurso: 'ANAMNESES' });

      const filtrado = await comUsuario(app, admin)
        .get(`${BASE}/acessos`)
        .query({ usuarioId: medicoA.id, pacienteId: paciente.id, recurso: 'PRONTUARIO' })
        .expect(200);
      expect(filtrado.body.data).toHaveLength(1);
      // Ler o log não gera novo registro de acesso.
      expect(await acessosGravados()).toHaveLength(2);

      await comUsuario(app, medicoA).get(`${BASE}/acessos`).expect(403);
      const restrito = await criarUsuarioTeste(app, {
        permissoes: [ACESSOS],
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [profA.id],
      });
      await comUsuario(app, restrito).get(`${BASE}/acessos`).expect(403);
      await comUsuario(app, admin).get(`${BASE}/acessos`).query({ pacienteId: 'x' }).expect(400);
    });
  });

  describe('perfis sem conteúdo clínico', () => {
    it.each(PERFIS_SEM_CLINICO)(
      '%s recebe 403 nos endpoints clínicos',
      async (_nome, permissoes) => {
        const usuario = await criarUsuarioTeste(app, { permissoes });
        const http = () => comUsuario(app, usuario);
        for (const rota of [
          '',
          '/paciente',
          '/atendimentos',
          '/anamneses',
          '/receitas',
          '/historico-clinico',
        ]) {
          await http().get(`${BASE}/${paciente.id}${rota}`).expect(403);
        }
        await http().get(BASE).expect(403);
        await http().get(`${BASE}/acessos`).expect(403);
        await http().put(`${BASE}/${paciente.id}`).send({ alergias: 'x' }).expect(403);
        await http().post(`${BASE}/${paciente.id}/anamneses`).send({}).expect(403);
        expect(await acessosGravados()).toHaveLength(0);
      },
    );
  });

  it('administrador (escopo TODOS) vê os registros de todos os profissionais, com log', async () => {
    const admin = await criarUsuarioTeste(app, { permissoes: CLINICAS });
    const res = await comUsuario(app, admin).get(`${BASE}/${paciente.id}/atendimentos`).expect(200);
    expect(res.body.data).toHaveLength(2);
    expect(await acessosGravados()).toMatchObject([
      { usuarioId: admin.id, recurso: 'ATENDIMENTOS' },
    ]);
  });
});
