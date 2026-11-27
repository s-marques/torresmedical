import type { INestApplication } from '@nestjs/common';
import {
  motivoPerdaListaSchema,
  negocioPageSchema,
  negocioSchema,
  pipelineListaSchema,
  resumoQuadroSchema,
  responsavelListaSchema,
} from '@torres/shared';
import { Workbook } from 'exceljs';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/comercial-atendimento/negocios';
const ENTITY = 'Negocio';
const PERMISSOES = [
  'comercial-atendimento.negocios.ver',
  'comercial-atendimento.negocios.criar',
  'comercial-atendimento.negocios.editar',
  'comercial-atendimento.negocios.excluir',
  'comercial-atendimento.negocios.exportar',
] as const;
const SO_VER = ['comercial-atendimento.negocios.ver'] as const;
const INEXISTENTE = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

describe('Negócios (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;
  let pipelineId: string;
  let outroPipelineId: string;
  let contato: string;
  let proposta: string;
  let outroEstagio: string;
  let motivoId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
    pipelineId = (await prisma.pipeline.create({ data: { nome: 'Pipeline Torres', ordem: 1 } })).id;
    outroPipelineId = (await prisma.pipeline.create({ data: { nome: 'Locações', ordem: 2 } })).id;
    contato = (
      await prisma.estagioPipeline.create({
        data: { pipelineId, nome: 'Contato inicial', cor: '#3b82f6', ordem: 1 },
      })
    ).id;
    proposta = (
      await prisma.estagioPipeline.create({
        data: { pipelineId, nome: 'Proposta', cor: '#84cc16', ordem: 2 },
      })
    ).id;
    outroEstagio = (
      await prisma.estagioPipeline.create({
        data: { pipelineId: outroPipelineId, nome: 'Em decisão', cor: '#f97316', ordem: 1 },
      })
    ).id;
    motivoId = (
      await prisma.motivoPerda.create({ data: { nome: 'Preço', codigo: 'preco', ordem: 1 } })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => comUsuario(app, usuario);
  const soVer = async () => comUsuario(app, await criarUsuarioTeste(app, { permissoes: SO_VER }));
  const corpo = (extra: Record<string, unknown> = {}) => ({
    titulo: 'Sala 10 - Clínica geral',
    pipelineId,
    estagioId: contato,
    ...extra,
  });
  const criar = async (extra: Record<string, unknown> = {}) =>
    negocioSchema.parse((await http().post(BASE).send(corpo(extra)).expect(201)).body);

  describe('GET / (listagem)', () => {
    it('200: página com as colunas do grid, busca, pipeline, status e ordenação', async () => {
      const paciente = await prisma.paciente.create({
        data: { nome: 'Bruna Cliente', documento: '12345678901', celular: '65999990000' },
      });
      const origem = await prisma.origemCliente.create({
        data: { nome: 'Instagram', codigo: 'instagram', ordem: 1 },
      });
      await criar({
        titulo: 'Bravo',
        valor: 300,
        contatoId: paciente.id,
        origemClienteId: origem.id,
        responsavelId: usuario.id,
      });
      await criar({ titulo: 'Alfa', valor: 100, estagioId: proposta });
      await criar({ titulo: 'Charlie', pipelineId: outroPipelineId, estagioId: outroEstagio });

      const todos = negocioPageSchema.parse(
        (await http().get(BASE).query({ sort: 'titulo:asc' }).expect(200)).body,
      );
      expect(todos.meta).toMatchObject({ page: 1, pageSize: 10, total: 3, totalPages: 1 });
      expect(todos.data.map((n) => n.titulo)).toEqual(['Alfa', 'Bravo', 'Charlie']);
      expect(todos.data[1]).toMatchObject({
        estagio: 'Contato inicial',
        contato: 'Bruna Cliente',
        origem: 'Instagram',
        valor: '300',
        status: 'ABERTO',
      });

      const porValor = await http().get(BASE).query({ sort: 'valor:desc' }).expect(200);
      expect(negocioPageSchema.parse(porValor.body).data.map((n) => n.titulo)).toEqual([
        'Bravo',
        'Alfa',
        'Charlie',
      ]);

      const porPipeline = await http().get(BASE).query({ pipelineId: outroPipelineId });
      expect(negocioPageSchema.parse(porPipeline.body).data.map((n) => n.titulo)).toEqual([
        'Charlie',
      ]);

      for (const busca of ['bravo', 'bruna', '123.456', '(65) 99999']) {
        const res = await http().get(BASE).query({ search: busca }).expect(200);
        expect(negocioPageSchema.parse(res.body).data.map((n) => n.titulo)).toEqual(['Bravo']);
      }
    });

    it('ordena por cliente e responsável (nome resolvido, vazio no fim) e pagina', async () => {
      const ana = await prisma.paciente.create({
        data: { nome: 'Ana Teste', celular: '65911110000' },
      });
      const bia = await prisma.paciente.create({
        data: { nome: 'Bia Teste', celular: '65922220000' },
      });
      await criar({ titulo: 'Sem cliente' });
      await criar({ titulo: 'Da Bia', contatoId: bia.id });
      await criar({ titulo: 'Da Ana', contatoId: ana.id });

      const asc = await http().get(BASE).query({ sort: 'cliente:asc' }).expect(200);
      expect(negocioPageSchema.parse(asc.body).data.map((n) => n.titulo)).toEqual([
        'Da Ana',
        'Da Bia',
        'Sem cliente',
      ]);
      const desc = await http().get(BASE).query({ sort: 'cliente:desc', pageSize: 2, page: 2 });
      const pagina = negocioPageSchema.parse(desc.body);
      expect(pagina.data.map((n) => n.titulo)).toEqual(['Sem cliente']);
      expect(pagina.meta).toMatchObject({ page: 2, pageSize: 2, total: 3, totalPages: 2 });

      const porResponsavel = await http().get(BASE).query({ sort: 'responsavel:asc' });
      expect(porResponsavel.status).toBe(200);
    });

    it('chips de status e motivo da perda', async () => {
      const aberto = await criar({ titulo: 'Aberto' });
      const ganho = await criar({ titulo: 'Ganho' });
      const perdido = await criar({ titulo: 'Perdido' });
      await http()
        .patch(`${BASE}/${ganho.id}`)
        .send(corpo({ titulo: 'Ganho', status: 'GANHO' }))
        .expect(200);
      await http()
        .patch(`${BASE}/${perdido.id}`)
        .send(corpo({ titulo: 'Perdido', status: 'PERDIDO', motivoPerdaId: motivoId }))
        .expect(200);

      const titulos = async (status: string) =>
        negocioPageSchema
          .parse((await http().get(BASE).query({ status }).expect(200)).body)
          .data.map((n) => n.titulo);
      expect(await titulos('ABERTO')).toEqual([aberto.titulo]);
      expect(await titulos('GANHO')).toEqual(['Ganho']);
      expect(await titulos('PERDIDO')).toEqual(['Perdido']);

      const lista = negocioPageSchema.parse((await http().get(BASE).expect(200)).body);
      expect(lista.data.find((n) => n.titulo === 'Perdido')?.motivoPerda).toBe('Preço');
    });

    it('não lista negócios excluídos', async () => {
      const { id } = await criar();
      await http().delete(`${BASE}/${id}`).expect(200);
      const res = await http().get(BASE).expect(200);
      expect(negocioPageSchema.parse(res.body).data).toEqual([]);
    });

    it('400 para ordenação, status e pipeline inválidos', async () => {
      await http().get(BASE).query({ sort: 'senha:asc' }).expect(400);
      await http().get(BASE).query({ status: 'OUTRO' }).expect(400);
      await http().get(BASE).query({ pipelineId: 'x' }).expect(400);
    });
  });

  describe('GET /resumo', () => {
    it('200: quantidade e valor por status, respeitando pipeline e busca', async () => {
      await criar({ titulo: 'A', valor: 100 });
      const ganho = await criar({ titulo: 'B', valor: 50 });
      await criar({ titulo: 'C', valor: 70, pipelineId: outroPipelineId, estagioId: outroEstagio });
      await http()
        .patch(`${BASE}/${ganho.id}`)
        .send(corpo({ titulo: 'B', valor: 50, status: 'GANHO' }))
        .expect(200);

      const todos = resumoQuadroSchema.parse((await http().get(`${BASE}/resumo`).expect(200)).body);
      expect(todos).toEqual({
        abertos: { quantidade: 2, total: '170.00' },
        ganhos: { quantidade: 1, total: '50.00' },
        perdidos: { quantidade: 0, total: '0.00' },
      });
      const filtrado = await http().get(`${BASE}/resumo`).query({ pipelineId, search: 'a' });
      expect(resumoQuadroSchema.parse(filtrado.body).abertos).toEqual({
        quantidade: 1,
        total: '100.00',
      });
    });
  });

  describe('listas de apoio', () => {
    it('pipelines, motivos de perda e responsáveis', async () => {
      const pipelines = pipelineListaSchema.parse((await http().get(`${BASE}/pipelines`)).body);
      expect(pipelines.map((p) => p.nome)).toEqual(['Pipeline Torres', 'Locações']);
      const motivos = motivoPerdaListaSchema.parse(
        (await http().get(`${BASE}/motivos-perda`)).body,
      );
      expect(motivos.map((m) => m.nome)).toEqual(['Preço']);
      const responsaveis = responsavelListaSchema.parse(
        (await http().get(`${BASE}/responsaveis`).expect(200)).body,
      );
      expect(responsaveis.map((r) => r.id)).toContain(usuario.id);
    });
  });

  describe('POST / (Novo Negócio)', () => {
    it('201: só o título é obrigatório; grava observações e audita CREATE', async () => {
      const negocio = await criar({
        valor: 1160,
        observacoes: 'Ligar na segunda',
        previsaoFechamento: '2026-12-31',
        responsavelId: usuario.id,
      });
      expect(negocio).toMatchObject({
        pipelineId,
        estagioId: contato,
        estagio: 'Contato inicial',
        status: 'ABERTO',
        observacoes: 'Ligar na segunda',
        previsaoFechamento: '2026-12-31',
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: negocio.id,
        before: null,
        after: { titulo: 'Sala 10 - Clínica geral', observacoes: 'Ligar na segunda' },
        userId: usuario.id,
      });
    });

    it('sem pipeline e estágio entra no primeiro estágio do primeiro pipeline', async () => {
      const padrao = negocioSchema.parse(
        (await http().post(BASE).send({ titulo: 'Só o título' }).expect(201)).body,
      );
      expect(padrao).toMatchObject({ pipelineId, estagioId: contato, status: 'ABERTO' });
      const doOutro = negocioSchema.parse(
        (await http().post(BASE).send({ titulo: 'Outro', pipelineId: outroPipelineId }).expect(201))
          .body,
      );
      expect(doOutro).toMatchObject({ pipelineId: outroPipelineId, estagioId: outroEstagio });
    });

    it('422 sem nenhum pipeline com estágio cadastrado', async () => {
      await prisma.estagioPipeline.deleteMany();
      const res = await http().post(BASE).send({ titulo: 'Sem funil' }).expect(422);
      expect(res.body.code).toBe('PIPELINE_SEM_ESTAGIO');
    });

    it('cria já como ganho ou como perdido (com motivo)', async () => {
      const ganho = await criar({ status: 'GANHO' });
      expect(ganho.status).toBe('GANHO');
      expect(ganho.fechadoEm).not.toBeNull();
      const perdido = await criar({ status: 'PERDIDO', motivoPerdaId: motivoId });
      expect(perdido).toMatchObject({ status: 'PERDIDO', motivoPerda: 'Preço' });
    });

    it('400 com título vazio e perdido sem motivo, sem auditar', async () => {
      const vazio = await http()
        .post(BASE)
        .send(corpo({ titulo: '  ' }))
        .expect(400);
      expect(vazio.body.details[0].field).toBe('titulo');
      const semMotivo = await http()
        .post(BASE)
        .send(corpo({ status: 'PERDIDO' }))
        .expect(400);
      expect(semMotivo.body.details[0].field).toBe('motivoPerdaId');
      await expectNoAudit(prisma, { entity: ENTITY, action: 'CREATE' });
    });

    it('422 para estágio de outro pipeline; 404 para referências inexistentes', async () => {
      await http()
        .post(BASE)
        .send(corpo({ estagioId: outroEstagio }))
        .expect(422);
      await http()
        .post(BASE)
        .send(corpo({ estagioId: INEXISTENTE }))
        .expect(404);
      await http()
        .post(BASE)
        .send(corpo({ responsavelId: INEXISTENTE }))
        .expect(404);
      await http()
        .post(BASE)
        .send(corpo({ origemClienteId: INEXISTENTE }))
        .expect(404);
      await http()
        .post(BASE)
        .send(corpo({ status: 'PERDIDO', motivoPerdaId: INEXISTENTE }))
        .expect(404);
    });
  });

  describe('PATCH /:id (Editar Negócio)', () => {
    it('200: troca pipeline, estágio e status; audita UPDATE com before/after', async () => {
      const { id } = await criar({ observacoes: 'Antes' });
      const res = await http()
        .patch(`${BASE}/${id}`)
        .send(
          corpo({
            titulo: 'Editado',
            pipelineId: outroPipelineId,
            estagioId: outroEstagio,
            status: 'PERDIDO',
            motivoPerdaId: motivoId,
            observacoes: '',
          }),
        )
        .expect(200);
      expect(negocioSchema.parse(res.body)).toMatchObject({
        titulo: 'Editado',
        pipelineId: outroPipelineId,
        estagio: 'Em decisão',
        status: 'PERDIDO',
        motivoPerda: 'Preço',
        observacoes: null,
      });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: id,
        before: { titulo: 'Sala 10 - Clínica geral', observacoes: 'Antes' },
        after: { titulo: 'Editado', status: 'PERDIDO' },
      });
      // Marcar como perdido pela edição também entra no histórico de cancelamentos (issue #162).
      const historico = await prisma.cancelamento.findMany({ where: { entidadeId: id } });
      expect(historico).toHaveLength(1);
      expect(historico[0]).toMatchObject({
        tipo: 'PROPOSTA',
        entidade: 'Negocio',
        motivoNome: 'Preço',
      });
    });

    it('reabrir o negócio limpa data de fechamento e motivo; ganho mantém a data original', async () => {
      const { id } = await criar({ status: 'GANHO' });
      const antes = await prisma.negocio.findUniqueOrThrow({ where: { id } });
      await http()
        .patch(`${BASE}/${id}`)
        .send(corpo({ status: 'GANHO', titulo: 'Novo' }))
        .expect(200);
      const mantido = await prisma.negocio.findUniqueOrThrow({ where: { id } });
      expect(mantido.fechadoEm).toEqual(antes.fechadoEm);

      await http()
        .patch(`${BASE}/${id}`)
        .send(corpo({ status: 'ABERTO' }))
        .expect(200);
      const reaberto = await prisma.negocio.findUniqueOrThrow({ where: { id } });
      expect(reaberto).toMatchObject({ status: 'ABERTO', fechadoEm: null, motivoPerdaId: null });
    });

    it('sem pipeline e estágio mantém o atual; só o pipeline vai para o primeiro estágio dele', async () => {
      const { id } = await criar({ estagioId: proposta });
      const mantido = await http().patch(`${BASE}/${id}`).send({ titulo: 'Novo' }).expect(200);
      expect(mantido.body).toMatchObject({ estagioId: proposta, titulo: 'Novo' });
      const trocado = await http()
        .patch(`${BASE}/${id}`)
        .send({ titulo: 'Novo', pipelineId: outroPipelineId })
        .expect(200);
      expect(trocado.body).toMatchObject({ pipelineId: outroPipelineId, estagioId: outroEstagio });
    });

    it('422 estágio de outro pipeline; 404 inexistente; 400 inválido', async () => {
      const { id } = await criar();
      await http()
        .patch(`${BASE}/${id}`)
        .send(corpo({ estagioId: outroEstagio }))
        .expect(422);
      await http().patch(`${BASE}/${INEXISTENTE}`).send(corpo()).expect(404);
      await http()
        .patch(`${BASE}/${id}`)
        .send(corpo({ titulo: '' }))
        .expect(400);
    });
  });

  describe('DELETE /:id', () => {
    it('200: exclusão lógica e auditoria DELETE; 404 para inexistente', async () => {
      const { id } = await criar();
      await http().delete(`${BASE}/${id}`).expect(200);
      expect(await prisma.negocio.count({ where: { id, deletedAt: { not: null } } })).toBe(1);
      await expectAudit(prisma, {
        action: 'DELETE',
        entity: ENTITY,
        entityId: id,
        before: { titulo: 'Sala 10 - Clínica geral' },
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
      await criar({ titulo: 'Beta', valor: 10 });
      await criar({ titulo: 'Alfa', valor: 20 });
      await criar({ titulo: 'Outro', pipelineId: outroPipelineId, estagioId: outroEstagio });

      const res = await binary(
        http()
          .get(`${BASE}/export`)
          .query({ format: 'xlsx', pipelineId, sort: 'titulo:asc', columns: 'titulo,status' }),
      ).expect(200);

      const workbook = new Workbook();
      await workbook.xlsx.load(res.body as unknown as ArrayBuffer);
      const rows: unknown[][] = [];
      workbook.worksheets[0]?.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
      expect(rows).toEqual([
        ['Título', 'Status'],
        ['Alfa', 'Aberto'],
        ['Beta', 'Aberto'],
      ]);
      await expectAudit(prisma, {
        action: 'EXPORT',
        entity: ENTITY,
        entityId: '*',
        userId: usuario.id,
      });
    });

    it('exporta ordenando por cliente (nome resolvido)', async () => {
      await criar({ titulo: 'Qualquer' });
      await http().get(`${BASE}/export`).query({ format: 'xlsx', sort: 'cliente:asc' }).expect(200);
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

  describe('acesso', () => {
    const ROTAS = [
      { metodo: 'get', caminho: BASE, permissao: 'ver' },
      { metodo: 'get', caminho: `${BASE}/resumo`, permissao: 'ver' },
      { metodo: 'get', caminho: `${BASE}/pipelines`, permissao: 'ver' },
      { metodo: 'get', caminho: `${BASE}/motivos-perda`, permissao: 'ver' },
      { metodo: 'get', caminho: `${BASE}/responsaveis`, permissao: 'ver' },
      { metodo: 'get', caminho: `${BASE}/export?format=xlsx`, permissao: 'exportar' },
      { metodo: 'post', caminho: BASE, permissao: 'criar' },
      { metodo: 'patch', caminho: `${BASE}/${INEXISTENTE}`, permissao: 'editar' },
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
