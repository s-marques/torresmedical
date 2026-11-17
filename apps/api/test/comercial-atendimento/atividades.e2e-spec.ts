import type { INestApplication } from '@nestjs/common';
import {
  atividadePageSchema,
  atividadeSchema,
  negocioPageSchema,
  responsavelListaSchema,
  resumoAtividadesSchema,
} from '@torres/shared';
import { Workbook } from 'exceljs';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/comercial-atendimento/atividades';
const ENTITY = 'AtividadeNegocio';
const PERMISSOES = [
  'comercial-atendimento.atividades.ver',
  'comercial-atendimento.atividades.criar',
  'comercial-atendimento.atividades.editar',
  'comercial-atendimento.atividades.excluir',
  'comercial-atendimento.atividades.exportar',
] as const;
const SO_VER = ['comercial-atendimento.atividades.ver'] as const;
const INEXISTENTE = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

describe('Atividades (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;
  let pipelineId: string;
  let estagioId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
    pipelineId = (await prisma.pipeline.create({ data: { nome: 'Pipeline Torres', ordem: 1 } })).id;
    estagioId = (
      await prisma.estagioPipeline.create({
        data: { pipelineId, nome: 'Contato inicial', cor: '#3b82f6', ordem: 1 },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => comUsuario(app, usuario);
  const soVer = async () => comUsuario(app, await criarUsuarioTeste(app, { permissoes: SO_VER }));
  const negocio = async (
    extra: { titulo?: string; status?: 'GANHO'; responsavelId?: string } = {},
  ) =>
    prisma.negocio.create({
      data: { titulo: 'Sala 10', pipelineId, estagioId, ...extra },
    });
  const usuarioChamado = async (nome: string) => {
    const { id } = await criarUsuarioTeste(app);
    await prisma.usuario.update({ where: { id }, data: { nome } });
    return { id };
  };
  const corpo = (extra: Record<string, unknown> = {}) => ({
    titulo: 'Ligar para o lead',
    data: '2026-11-20',
    hora: '09:00',
    ...extra,
  });
  const criar = async (extra: Record<string, unknown> = {}) =>
    atividadeSchema.parse((await http().post(BASE).send(corpo(extra)).expect(201)).body);

  describe('GET / (listagem)', () => {
    it('200: colunas do grid, busca, tipo, status e ordenação', async () => {
      const n = await negocio({ titulo: 'Clínica Alfa' });
      await criar({ titulo: 'Bravo', tipo: 'LIGACAO', negocioId: n.id, data: '2026-11-22' });
      await criar({
        titulo: 'Alfa',
        tipo: 'EMAIL',
        descricao: 'mandar tabela',
        data: '2026-11-21',
      });
      const charlie = await criar({ titulo: 'Charlie', tipo: 'LIGACAO', data: '2026-11-23' });
      await prisma.atividadeNegocio.update({
        where: { id: charlie.id },
        data: { status: 'CANCELADA' },
      });

      const todos = atividadePageSchema.parse((await http().get(BASE).expect(200)).body);
      expect(todos.meta).toMatchObject({ page: 1, pageSize: 10, total: 3, totalPages: 1 });
      // Padrão: pela data do agendamento.
      expect(todos.data.map((a) => a.titulo)).toEqual(['Alfa', 'Bravo', 'Charlie']);
      expect(todos.data[1]).toMatchObject({
        tipo: 'LIGACAO',
        negocio: 'Clínica Alfa',
        negocioStatus: 'ABERTO',
        status: 'PENDENTE',
        exigeProximaAcao: true,
        dataHora: '2026-11-22T12:00:00.000Z',
      });

      const consulta = async (query: Record<string, string>) =>
        atividadePageSchema
          .parse((await http().get(BASE).query(query).expect(200)).body)
          .data.map((a) => a.titulo);
      expect(await consulta({ tipo: 'LIGACAO' })).toEqual(['Bravo', 'Charlie']);
      expect(await consulta({ status: 'CANCELADA' })).toEqual(['Charlie']);
      expect(await consulta({ search: 'tabela' })).toEqual(['Alfa']);
      expect(await consulta({ search: 'clínica alfa' })).toEqual(['Bravo']);
      expect(await consulta({ sort: 'titulo:desc' })).toEqual(['Charlie', 'Bravo', 'Alfa']);
      expect(await consulta({ sort: 'negocio:asc' })).toEqual(['Bravo', 'Alfa', 'Charlie']);
      expect(await consulta({ sort: 'status:asc' })).toEqual(['Alfa', 'Bravo', 'Charlie']);
    });

    it('ordena por responsável (nome resolvido, vazio no fim) e pagina', async () => {
      const ana = await usuarioChamado('Ana Resp');
      const bia = await usuarioChamado('Bia Resp');
      await criar({ titulo: 'Sem' });
      await criar({ titulo: 'DaBia', responsavelId: bia.id });
      await criar({ titulo: 'DaAna', responsavelId: ana.id });

      const res = await http()
        .get(BASE)
        .query({ sort: 'responsavel:asc', pageSize: 2, page: 1 })
        .expect(200);
      const pagina = atividadePageSchema.parse(res.body);
      expect(pagina.data.map((a) => a.titulo)).toEqual(['DaAna', 'DaBia']);
      expect(pagina.meta).toMatchObject({ total: 3, totalPages: 2 });
      const segunda = await http()
        .get(BASE)
        .query({ sort: 'responsavel:asc', pageSize: 2, page: 2 })
        .expect(200);
      expect(segunda.body.data.map((a: { titulo: string }) => a.titulo)).toEqual(['Sem']);
    });

    it('400 para filtros e ordenação inválidos; não lista excluídas', async () => {
      const { id } = await criar();
      await prisma.atividadeNegocio.update({ where: { id }, data: { deletedAt: new Date() } });
      expect((await http().get(BASE).expect(200)).body.meta.total).toBe(0);
      const res = await http().get(BASE).query({ tipo: 'X', sort: 'senha:asc' }).expect(400);
      expect(res.body.details.map((d: { field: string }) => d.field).sort()).toEqual([
        'sort',
        'tipo',
      ]);
    });
  });

  describe('GET /resumo', () => {
    it('conta por status, com busca e tipo', async () => {
      await criar({ titulo: 'A', tipo: 'NOTA' });
      const b = await criar({ titulo: 'B' });
      const c = await criar({ titulo: 'C' });
      await prisma.atividadeNegocio.update({ where: { id: b.id }, data: { status: 'CONCLUIDA' } });
      await prisma.atividadeNegocio.update({ where: { id: c.id }, data: { status: 'CANCELADA' } });

      const todos = resumoAtividadesSchema.parse((await http().get(`${BASE}/resumo`)).body);
      expect(todos).toEqual({ total: 3, pendentes: 1, concluidas: 1, canceladas: 1 });
      const tarefas = await http().get(`${BASE}/resumo`).query({ tipo: 'TAREFA' }).expect(200);
      expect(tarefas.body).toEqual({ total: 2, pendentes: 0, concluidas: 1, canceladas: 1 });
    });
  });

  describe('GET /:id', () => {
    it('200 detalhe; 404 inexistente; 400 id inválido', async () => {
      const { id } = await criar({ descricao: 'Obs' });
      const res = await http().get(`${BASE}/${id}`).expect(200);
      expect(atividadeSchema.parse(res.body)).toMatchObject({ id, descricao: 'Obs' });
      await http().get(`${BASE}/${INEXISTENTE}`).expect(404);
      await http().get(`${BASE}/abc`).expect(400);
    });
  });

  describe('POST / (Nova Atividade)', () => {
    it('201: avulsa, tipo padrão Tarefa; audita CREATE', async () => {
      const criada = await criar({ descricao: 'Retornar orçamento' });
      expect(criada).toMatchObject({
        tipo: 'TAREFA',
        negocioId: null,
        negocio: null,
        status: 'PENDENTE',
        responsavelId: null,
        exigeProximaAcao: false,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: criada.id,
        before: null,
        after: { titulo: 'Ligar para o lead', descricao: 'Retornar orçamento' },
        userId: usuario.id,
      });
    });

    it('com negócio aberto, herda o responsável dele', async () => {
      const n = await negocio({ responsavelId: usuario.id });
      const criada = await criar({ negocioId: n.id, tipo: 'VISITA' });
      expect(criada).toMatchObject({
        negocioId: n.id,
        negocio: 'Sala 10',
        responsavelId: usuario.id,
        responsavel: expect.any(String),
        tipo: 'VISITA',
      });
    });

    it('400 formulário vazio com as mensagens padrão, sem auditar', async () => {
      const res = await http().post(BASE).send({}).expect(400);
      expect(
        Object.fromEntries(
          res.body.details.map((d: { field: string; message: string }) => [d.field, d.message]),
        ),
      ).toEqual({
        titulo: 'Título é obrigatório.',
        data: 'Data é obrigatória.',
        hora: 'Hora é obrigatória.',
      });
      await expectNoAudit(prisma, { entity: ENTITY, action: 'CREATE' });
    });

    it('404 negócio/responsável inexistente; 422 negócio fechado', async () => {
      await http()
        .post(BASE)
        .send(corpo({ negocioId: INEXISTENTE }))
        .expect(404);
      await http()
        .post(BASE)
        .send(corpo({ responsavelId: INEXISTENTE }))
        .expect(404);
      const ganho = await negocio({ status: 'GANHO' });
      const res = await http()
        .post(BASE)
        .send(corpo({ negocioId: ganho.id }))
        .expect(422);
      expect(res.body.code).toBe('NEGOCIO_FECHADO');
      await expectNoAudit(prisma, { entity: ENTITY, action: 'CREATE' });
    });
  });

  describe('PATCH /:id (Editar)', () => {
    it('200: altera e audita UPDATE com before/after', async () => {
      const { id } = await criar();
      const res = await http()
        .patch(`${BASE}/${id}`)
        .send(corpo({ titulo: 'Reunião com a clínica', tipo: 'REUNIAO', hora: '14:30' }))
        .expect(200);
      expect(atividadeSchema.parse(res.body)).toMatchObject({
        titulo: 'Reunião com a clínica',
        tipo: 'REUNIAO',
        dataHora: '2026-11-20T17:30:00.000Z',
      });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: id,
        before: { titulo: 'Ligar para o lead', tipo: 'TAREFA' },
        after: { titulo: 'Reunião com a clínica', tipo: 'REUNIAO' },
      });
    });

    it('422 ao tirar a última pendente do negócio aberto; 404 e 400', async () => {
      const n = await negocio();
      const { id } = await criar({ negocioId: n.id });
      const res = await http()
        .patch(`${BASE}/${id}`)
        .send(corpo({ negocioId: null }))
        .expect(422);
      expect(res.body.code).toBe('PROXIMA_ACAO_OBRIGATORIA');
      await http().patch(`${BASE}/${INEXISTENTE}`).send(corpo()).expect(404);
      await http()
        .patch(`${BASE}/${id}`)
        .send(corpo({ titulo: '' }))
        .expect(400);
      await expectNoAudit(prisma, { entity: ENTITY, action: 'UPDATE' });
    });
  });

  describe('PATCH /:id/concluir e /:id/cancelar', () => {
    it('última pendente de negócio aberto exige a próxima; depois conclui e audita', async () => {
      const n = await negocio();
      const primeira = await criar({ negocioId: n.id });
      for (const acao of ['concluir', 'cancelar']) {
        const res = await http().patch(`${BASE}/${primeira.id}/${acao}`).expect(422);
        expect(res.body.code).toBe('PROXIMA_ACAO_OBRIGATORIA');
      }
      await expectNoAudit(prisma, { entity: ENTITY, action: 'UPDATE' });

      const proxima = await criar({ negocioId: n.id, data: '2026-11-27' });
      expect(proxima.exigeProximaAcao).toBe(false);
      const res = await http().patch(`${BASE}/${primeira.id}/concluir`).expect(200);
      expect(atividadeSchema.parse(res.body)).toMatchObject({ status: 'CONCLUIDA' });
      expect(res.body.concluidaEm).not.toBeNull();
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: primeira.id,
        before: { status: 'PENDENTE' },
        after: { status: 'CONCLUIDA' },
      });

      const agora = await http().get(`${BASE}/${proxima.id}`).expect(200);
      expect(agora.body.exigeProximaAcao).toBe(true);
      await http().patch(`${BASE}/${primeira.id}/concluir`).expect(422);
    });

    it('negócio ganho libera fechar a última; avulsa cancela direto', async () => {
      const n = await negocio();
      const daQueGanhou = await criar({ negocioId: n.id });
      await prisma.negocio.update({ where: { id: n.id }, data: { status: 'GANHO' } });
      await http().patch(`${BASE}/${daQueGanhou.id}/concluir`).expect(200);

      const avulsa = await criar();
      const res = await http().patch(`${BASE}/${avulsa.id}/cancelar`).expect(200);
      expect(res.body).toMatchObject({ status: 'CANCELADA' });
      expect(res.body.canceladaEm).not.toBeNull();
      const deNovo = await http().patch(`${BASE}/${avulsa.id}/cancelar`).expect(422);
      expect(deNovo.body.code).toBe('ATIVIDADE_JA_CANCELADA');
      await http().patch(`${BASE}/${INEXISTENTE}/concluir`).expect(404);
    });
  });

  describe('DELETE /:id', () => {
    it('200: exclusão lógica e auditoria DELETE; 404 para inexistente', async () => {
      const { id } = await criar();
      await http().delete(`${BASE}/${id}`).expect(200);
      expect(await prisma.atividadeNegocio.count({ where: { id, deletedAt: { not: null } } })).toBe(
        1,
      );
      await expectAudit(prisma, {
        action: 'DELETE',
        entity: ENTITY,
        entityId: id,
        before: { titulo: 'Ligar para o lead' },
      });
      await http().delete(`${BASE}/${id}`).expect(404);
      await http().delete(`${BASE}/${INEXISTENTE}`).expect(404);
    });
  });

  describe('GET /export', () => {
    const binary = (req: request.Test) =>
      req.buffer(true).parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    it('xlsx com filtros, ordenação e colunas visíveis; audita EXPORT', async () => {
      await criar({ titulo: 'Beta', tipo: 'EMAIL' });
      await criar({ titulo: 'Alfa', tipo: 'EMAIL' });
      await criar({ titulo: 'Outra', tipo: 'NOTA' });

      const res = await binary(
        http()
          .get(`${BASE}/export`)
          .query({ format: 'xlsx', tipo: 'EMAIL', sort: 'titulo:asc', columns: 'titulo,tipo' }),
      ).expect(200);

      const workbook = new Workbook();
      await workbook.xlsx.load(res.body as unknown as ArrayBuffer);
      const rows: unknown[][] = [];
      workbook.worksheets[0]?.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
      expect(rows).toEqual([
        ['Título', 'Tipo'],
        ['Alfa', 'E-mail'],
        ['Beta', 'E-mail'],
      ]);
      await expectAudit(prisma, {
        action: 'EXPORT',
        entity: ENTITY,
        entityId: '*',
        userId: usuario.id,
      });
    });

    it('pdf ordenado por responsável', async () => {
      await criar();
      await http()
        .get(`${BASE}/export`)
        .query({ format: 'pdf', sort: 'responsavel:desc' })
        .expect(200)
        .expect('content-type', /pdf/);
    });

    it('400 para colunas inválidas, sem auditar', async () => {
      const res = await http()
        .get(`${BASE}/export`)
        .query({ format: 'xlsx', columns: 'senha' })
        .expect(400);
      expect(res.body.details[0].field).toBe('columns');
      await expectNoAudit(prisma, { entity: ENTITY, action: 'EXPORT' });
    });
  });

  describe('GET /leads-sem-follow-up', () => {
    it('negócios abertos sem atividade pendente futura, com filtro por responsável', async () => {
      const semNada = await negocio({ titulo: 'Sem atividade', responsavelId: usuario.id });
      const atrasado = await negocio({ titulo: 'Atrasado' });
      const emDia = await negocio({ titulo: 'Em dia' });
      await negocio({ titulo: 'Ganho', status: 'GANHO' });
      await criar({ negocioId: atrasado.id, data: '2020-01-10' });
      await criar({ negocioId: emDia.id, data: '2099-01-10' });

      const res = await http()
        .get(`${BASE}/leads-sem-follow-up`)
        .query({ sort: 'titulo:asc' })
        .expect(200);
      const pagina = negocioPageSchema.parse(res.body);
      expect(pagina.data.map((n) => [n.titulo, n.situacaoAcao])).toEqual([
        ['Atrasado', 'ATRASADA'],
        ['Sem atividade', 'SEM_ACAO'],
      ]);

      const doUsuario = await http()
        .get(`${BASE}/leads-sem-follow-up`)
        .query({ responsavelId: usuario.id })
        .expect(200);
      expect(doUsuario.body.data.map((n: { id: string }) => n.id)).toEqual([semNada.id]);
      const busca = await http()
        .get(`${BASE}/leads-sem-follow-up`)
        .query({ search: 'atras' })
        .expect(200);
      expect(busca.body.meta.total).toBe(1);
    });
  });

  describe('GET /responsaveis', () => {
    it('lista os usuários ativos', async () => {
      await criarUsuarioTeste(app, { ativo: false });
      const res = await http().get(`${BASE}/responsaveis`).expect(200);
      expect(responsavelListaSchema.parse(res.body).map((r) => r.id)).toEqual([usuario.id]);
    });
  });

  describe('acesso', () => {
    const ROTAS = [
      { metodo: 'get', caminho: BASE, permissao: 'ver' },
      { metodo: 'get', caminho: `${BASE}/resumo`, permissao: 'ver' },
      { metodo: 'get', caminho: `${BASE}/leads-sem-follow-up`, permissao: 'ver' },
      { metodo: 'get', caminho: `${BASE}/responsaveis`, permissao: 'ver' },
      { metodo: 'get', caminho: `${BASE}/${INEXISTENTE}`, permissao: 'ver' },
      { metodo: 'get', caminho: `${BASE}/export?format=xlsx`, permissao: 'exportar' },
      { metodo: 'post', caminho: BASE, permissao: 'criar' },
      { metodo: 'patch', caminho: `${BASE}/${INEXISTENTE}`, permissao: 'editar' },
      { metodo: 'patch', caminho: `${BASE}/${INEXISTENTE}/concluir`, permissao: 'editar' },
      { metodo: 'patch', caminho: `${BASE}/${INEXISTENTE}/cancelar`, permissao: 'editar' },
      { metodo: 'delete', caminho: `${BASE}/${INEXISTENTE}`, permissao: 'excluir' },
    ] as const;

    it.each(ROTAS)('$metodo $caminho sem token responde 401', async ({ metodo, caminho }) => {
      await request(app.getHttpServer())[metodo](caminho).send({}).expect(401);
    });

    it.each(ROTAS)(
      '$metodo $caminho sem a permissão $permissao responde 403, sem auditar',
      async ({ metodo, caminho, permissao }) => {
        const sem = PERMISSOES.filter((p) => !p.endsWith(`.${permissao}`));
        const cliente = comUsuario(app, await criarUsuarioTeste(app, { permissoes: sem }));
        await cliente[metodo](caminho).send({}).expect(403);
        await expectNoAudit(prisma, { entity: ENTITY });
      },
    );

    it('só com "ver" não escreve nem exporta', async () => {
      const cliente = await soVer();
      await cliente.post(BASE).send(corpo()).expect(403);
      await cliente.get(`${BASE}/export`).query({ format: 'xlsx' }).expect(403);
      await cliente.get(BASE).expect(200);
    });
  });
});
