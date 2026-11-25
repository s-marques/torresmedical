import type { INestApplication } from '@nestjs/common';
import type { Permissao } from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit } from '../utils/expect-audit';
import { respostaBinaria } from '../utils/resposta-binaria';

const BASE = '/api/consultorio-assistencial/prontuarios';
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
const CLINICAS: readonly Permissao[] = [
  'consultorio-assistencial.prontuarios.ver',
  'consultorio-assistencial.prontuarios.criar',
  'consultorio-assistencial.prontuarios.exportar',
  'configuracoes-gestao.dados-pessoais.exportar',
];

/** Issue #158: prontuário completo do paciente em PDF (ou ZIP com os anexos). */
describe('Prontuários: exportação completa (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let medicoA: UsuarioTeste;
  let admin: UsuarioTeste;
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
    admin = await criarUsuarioTeste(app, { permissoes: CLINICAS });
    await prisma.atendimento.createMany({
      data: [
        { pacienteId: paciente.id, profissionalId: profA.id, queixa: 'Queixa A' },
        { pacienteId: paciente.id, profissionalId: profB.id, queixa: 'Queixa B' },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const exportar = (usuario: UsuarioTeste, id = paciente.id, query: object = {}) =>
    respostaBinaria(comUsuario(app, usuario).get(`${BASE}/${id}/exportar`).query(query));

  async function anexar(usuario: UsuarioTeste, profissionalId: string, nome: string) {
    const atendimento = await prisma.atendimento.findFirstOrThrow({
      where: { pacienteId: paciente.id, profissionalId },
    });
    const enviado = await comUsuario(app, usuario)
      .post('/api/arquivos')
      .query({ uso: 'anexo-atendimento' })
      .attach('arquivo', PDF, { filename: nome, contentType: 'application/pdf' })
      .expect(201);
    await prisma.atendimentoAnexo.create({
      data: {
        atendimentoId: atendimento.id,
        tipo: 'EXAME',
        arquivoId: (enviado.body as { id: string }).id,
        data: new Date('2026-11-20'),
      },
    });
  }

  it('exporta o PDF do médico, audita a exportação e registra o acesso', async () => {
    const res = await exportar(medicoA).expect(200);

    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain('prontuario-');
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    await expectAudit(prisma, {
      action: 'EXPORT',
      entity: 'Prontuario',
      entityId: paciente.id,
      userId: medicoA.id,
    });
    const acessos = await prisma.prontuarioAcesso.findMany({ where: { recurso: 'EXPORTACAO' } });
    expect(acessos).toHaveLength(1);
    expect(acessos[0]).toMatchObject({ pacienteId: paciente.id, usuarioId: medicoA.id });
  });

  it('o ZIP com anexos traz só os arquivos do profissional do escopo', async () => {
    await anexar(medicoA, profA.id, 'exame-do-a.pdf');
    const medicoB = await criarUsuarioTeste(app, {
      permissoes: CLINICAS,
      escopoDados: 'PROFISSIONAIS_VINCULADOS',
      profissionalIds: [profB.id],
    });
    await anexar(medicoB, profB.id, 'exame-do-b.pdf');

    const zipA = await exportar(medicoA, paciente.id, { incluirAnexos: 'true' }).expect(200);
    const nomesA = (zipA.body as Buffer).toString('latin1');
    expect(zipA.headers['content-type']).toBe('application/zip');
    expect(nomesA).toContain('prontuario.pdf');
    expect(nomesA).toContain('exame-do-a.pdf');
    expect(nomesA).not.toContain('exame-do-b.pdf');

    // Administração (escopo TODOS) escolhe um profissional.
    const zipB = await exportar(admin, paciente.id, {
      incluirAnexos: 'true',
      profissionalId: profB.id,
    }).expect(200);
    const nomesB = (zipB.body as Buffer).toString('latin1');
    expect(nomesB).toContain('exame-do-b.pdf');
    expect(nomesB).not.toContain('exame-do-a.pdf');
  });

  it('403 para profissional fora do escopo e para paciente sem vínculo', async () => {
    await exportar(medicoA, paciente.id, { profissionalId: profB.id }).expect(403);

    const outro = await prisma.paciente.create({ data: { nome: 'Outro Fictício' } });
    await prisma.atendimento.create({
      data: { pacienteId: outro.id, profissionalId: profB.id, queixa: 'Só do B' },
    });
    await exportar(medicoA, outro.id).expect(403);
    expect(await prisma.auditLog.count({ where: { action: 'EXPORT' } })).toBe(0);
  });

  it('403 sem a permissão da tela ou sem a de exportar dados pessoais', async () => {
    const semTela = await criarUsuarioTeste(app, {
      permissoes: [
        'consultorio-assistencial.prontuarios.ver',
        'configuracoes-gestao.dados-pessoais.exportar',
      ],
    });
    const semDadosPessoais = await criarUsuarioTeste(app, {
      permissoes: [
        'consultorio-assistencial.prontuarios.ver',
        'consultorio-assistencial.prontuarios.exportar',
      ],
    });

    await exportar(semTela).expect(403);
    await exportar(semDadosPessoais).expect(403);
  });

  it('401 sem login, 404 para paciente inexistente e 400 para filtros inválidos', async () => {
    await respostaBinaria(
      (await import('supertest'))
        .default(app.getHttpServer())
        .get(`${BASE}/${paciente.id}/exportar`),
    ).expect(401);
    await exportar(admin, INEXISTENTE).expect(404);
    await exportar(admin, paciente.id, { profissionalId: 'x' }).expect(400);
    await exportar(admin, paciente.id, { incluirAnexos: 'talvez' }).expect(400);
  });
});
