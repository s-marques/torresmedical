import type { INestApplication } from '@nestjs/common';
import {
  exportacaoLoteSchema,
  EXPORTACAO_LOTE_ENTIDADES,
  type ExportacaoLote,
  type Permissao,
} from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { ExportacaoLoteService } from '../../src/modules/configuracoes-gestao/exportacao-lote/exportacao-lote.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit } from '../utils/expect-audit';
import { respostaBinaria } from '../utils/resposta-binaria';

const BASE = '/api/configuracoes-gestao/exportacoes-lote';
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
const PERMISSOES: readonly Permissao[] = [
  'configuracoes-gestao.exportacao-lote.ver',
  'configuracoes-gestao.exportacao-lote.executar',
  'configuracoes-gestao.dados-pessoais.exportar',
  'consultorio-assistencial.prontuarios.criar',
];

/** Issue #158: exportação em lote por entidade (ZIP com CSV e arquivos), gerada em fila. */
describe('Exportação em lote (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let servico: ExportacaoLoteService;
  let admin: UsuarioTeste;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    servico = app.get(ExportacaoLoteService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    admin = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
  });

  afterAll(async () => {
    await app.close();
  });

  async function solicitar(corpo: object, usuario = admin): Promise<ExportacaoLote> {
    const res = await comUsuario(app, usuario).post(BASE).send(corpo).expect(202);
    return exportacaoLoteSchema.parse(res.body);
  }

  /** Processa o pedido (o consumidor real pode chegar primeiro) e espera a conclusão. */
  async function concluir(id: string): Promise<ExportacaoLote> {
    await servico.processar(id);
    for (let tentativa = 0; tentativa < 50; tentativa++) {
      const res = await comUsuario(app, admin).get(`${BASE}/${id}`).expect(200);
      const lote = exportacaoLoteSchema.parse(res.body);
      if (lote.status === 'CONCLUIDA' || lote.status === 'FALHOU') return lote;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error('A exportação não terminou a tempo');
  }

  const baixar = (id: string, usuario = admin) =>
    respostaBinaria(comUsuario(app, usuario).get(`${BASE}/${id}/download`));

  it('lista as entidades disponíveis para exportar', async () => {
    const res = await comUsuario(app, admin).get(`${BASE}/entidades`).expect(200);
    const ids = (res.body as { id: string }[]).map((e) => e.id);
    expect(ids).toEqual([...EXPORTACAO_LOTE_ENTIDADES]);
    expect(
      (res.body as { id: string; comArquivos: boolean }[]).find((e) => e.id === 'prontuarios'),
    ).toMatchObject({ comArquivos: true });
  });

  it('pede, gera, baixa o ZIP e audita cada passo', async () => {
    await prisma.paciente.create({ data: { nome: 'Paciente Fictício Lote' } });

    const pedido = await solicitar({ entidade: 'pacientes' });
    expect(pedido).toMatchObject({ entidade: 'pacientes', status: 'PENDENTE', disponivel: false });
    await expectAudit(prisma, {
      action: 'CREATE',
      entity: 'ExportacaoLote',
      entityId: pedido.id,
      userId: admin.id,
    });

    const pronto = await concluir(pedido.id);
    expect(pronto).toMatchObject({ status: 'CONCLUIDA', disponivel: true, erroCodigo: null });
    expect(pronto.expiraEm).not.toBeNull();
    expect(pronto.tamanhoBytes).toBeGreaterThan(0);

    const zip = await baixar(pedido.id).expect(200);
    expect(zip.headers['content-type']).toBe('application/zip');
    const nomes = (zip.body as Buffer).toString('latin1');
    expect(nomes).toContain('pacientes.csv');
    expect(nomes).toContain('LEIAME.txt');
    await expectAudit(prisma, {
      action: 'EXPORT',
      entity: 'ExportacaoLote',
      entityId: pedido.id,
      userId: admin.id,
    });
    // A conclusão foi auditada pelo consumidor (UPDATE).
    expect(
      await prisma.auditLog.count({
        where: { action: 'UPDATE', entity: 'ExportacaoLote', entityId: pedido.id },
      }),
    ).toBe(1);
  });

  it('inclui os anexos do prontuário e o índice de arquivos no ZIP', async () => {
    const profissional = await prisma.profissional.create({ data: { nome: 'Dr. Fictício' } });
    const paciente = await prisma.paciente.create({ data: { nome: 'Paciente Fictício' } });
    const atendimento = await prisma.atendimento.create({
      data: { pacienteId: paciente.id, profissionalId: profissional.id, queixa: 'Queixa fictícia' },
    });
    const enviado = await comUsuario(app, admin)
      .post('/api/arquivos')
      .query({ uso: 'anexo-atendimento' })
      .attach('arquivo', PDF, { filename: 'exame.pdf', contentType: 'application/pdf' })
      .expect(201);
    const anexo = await prisma.atendimentoAnexo.create({
      data: {
        atendimentoId: atendimento.id,
        tipo: 'EXAME',
        arquivoId: (enviado.body as { id: string }).id,
        data: new Date('2026-11-20'),
      },
    });

    const pedido = await solicitar({ entidade: 'prontuarios', incluirArquivos: true });
    expect(pedido.incluirArquivos).toBe(true);
    await concluir(pedido.id);

    const nomes = ((await baixar(pedido.id).expect(200)).body as Buffer).toString('latin1');
    expect(nomes).toContain('prontuarios/atendimentos.csv');
    expect(nomes).toContain('prontuarios/anamneses.csv');
    expect(nomes).toContain(`anexos/${anexo.id}.pdf`);
    expect(nomes).toContain('arquivos.csv');
  });

  it('sem arquivos, o ZIP não leva anexos; entidade sem arquivos ignora o pedido', async () => {
    const pedido = await solicitar({ entidade: 'pacientes', incluirArquivos: true });
    expect(pedido.incluirArquivos).toBe(false);
    await concluir(pedido.id);

    const nomes = ((await baixar(pedido.id).expect(200)).body as Buffer).toString('latin1');
    expect(nomes).not.toContain('arquivos.csv');
  });

  it('409 enquanto houver pedido da mesma entidade em andamento', async () => {
    await prisma.exportacaoLote.create({ data: { entidade: 'agendamentos' } });

    const res = await comUsuario(app, admin)
      .post(BASE)
      .send({ entidade: 'agendamentos' })
      .expect(409);

    expect((res.body as { code: string }).code).toBe('EXPORTACAO_EM_ANDAMENTO');
    expect(await prisma.exportacaoLote.count({ where: { entidade: 'agendamentos' } })).toBe(1);
  });

  it('400 para entidade inválida e 404 para pedido inexistente', async () => {
    await comUsuario(app, admin).post(BASE).send({ entidade: 'usuarios' }).expect(400);
    await comUsuario(app, admin).post(BASE).send({}).expect(400);
    await comUsuario(app, admin).get(`${BASE}/${INEXISTENTE}`).expect(404);
    await baixar(INEXISTENTE).expect(404);
  });

  it('404 no download antes de o arquivo estar pronto e 410 depois da validade', async () => {
    const pendente = await prisma.exportacaoLote.create({ data: { entidade: 'profissionais' } });
    await baixar(pendente.id).expect(404);

    const pedido = await solicitar({ entidade: 'contas-receber' });
    await concluir(pedido.id);
    await prisma.exportacaoLote.update({
      where: { id: pedido.id },
      data: { expiraEm: new Date(Date.now() - 1000) },
    });

    const res = await baixar(pedido.id).expect(410);
    expect(JSON.parse((res.body as Buffer).toString()).code).toBe('EXPORTACAO_EXPIRADA');
    const lote = await comUsuario(app, admin).get(`${BASE}/${pedido.id}`).expect(200);
    expect((lote.body as ExportacaoLote).disponivel).toBe(false);
  });

  it('403 sem a permissão do lote, sem exportar dados pessoais ou com escopo restrito', async () => {
    const semExecutar = await criarUsuarioTeste(app, {
      permissoes: [
        'configuracoes-gestao.exportacao-lote.ver',
        'configuracoes-gestao.dados-pessoais.exportar',
      ],
    });
    const semDadosPessoais = await criarUsuarioTeste(app, {
      permissoes: [
        'configuracoes-gestao.exportacao-lote.ver',
        'configuracoes-gestao.exportacao-lote.executar',
      ],
    });
    const profissional = await prisma.profissional.create({ data: { nome: 'Dr. Restrito' } });
    const restrito = await criarUsuarioTeste(app, {
      permissoes: PERMISSOES,
      escopoDados: 'PROFISSIONAIS_VINCULADOS',
      profissionalIds: [profissional.id],
    });
    const pedido = await solicitar({ entidade: 'pacientes' });
    await concluir(pedido.id);

    await comUsuario(app, semExecutar).post(BASE).send({ entidade: 'pacientes' }).expect(403);
    await comUsuario(app, semDadosPessoais).post(BASE).send({ entidade: 'pacientes' }).expect(403);
    await baixar(pedido.id, semDadosPessoais).expect(403);
    await comUsuario(app, restrito).post(BASE).send({ entidade: 'pacientes' }).expect(403);
    await comUsuario(app, restrito).get(BASE).expect(403);
    await baixar(pedido.id, restrito).expect(403);
  });

  it('lista o histórico com paginação e filtro por status', async () => {
    const pedido = await solicitar({ entidade: 'contratos-sala' });
    await concluir(pedido.id);
    await prisma.exportacaoLote.create({ data: { entidade: 'agendamentos' } });

    const todos = await comUsuario(app, admin).get(BASE).query({ pageSize: 1 }).expect(200);
    expect((todos.body as { meta: { total: number } }).meta.total).toBe(2);
    const concluidas = await comUsuario(app, admin)
      .get(BASE)
      .query({ status: 'CONCLUIDA' })
      .expect(200);
    expect((concluidas.body as { data: { id: string }[] }).data.map((e) => e.id)).toEqual([
      pedido.id,
    ]);
  });

  it('processar é idempotente: o mesmo pedido não gera um segundo arquivo', async () => {
    const pedido = await solicitar({ entidade: 'profissionais' });
    await concluir(pedido.id);

    expect(await servico.processar(pedido.id)).toBe(false);
    expect(await prisma.arquivo.count({ where: { uso: 'exportacao-lote' } })).toBe(1);
  });
});
