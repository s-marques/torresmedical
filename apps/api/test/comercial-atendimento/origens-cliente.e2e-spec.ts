import type { INestApplication } from '@nestjs/common';
import { origemClientePageSchema, origemClienteSchema } from '@torres/shared';
import { Workbook } from 'exceljs';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';

const BASE = '/api/comercial-atendimento/origens-cliente';
const ENTITY = 'OrigemCliente';
const PERMISSOES = [
  'comercial-atendimento.origens-cliente.ver',
  'comercial-atendimento.origens-cliente.criar',
  'comercial-atendimento.origens-cliente.editar',
  'comercial-atendimento.origens-cliente.excluir',
  'comercial-atendimento.origens-cliente.exportar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe('Origens de Cliente (e2e)', () => {
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

  function http() {
    return comUsuario(app, usuario);
  }

  function criarNoBanco(
    nome: string,
    ordem: number,
    extra: { ativa?: boolean; deletedAt?: Date; codigo?: string } = {},
  ) {
    const { codigo = nome.toLowerCase().replaceAll(' ', '_'), ...resto } = extra;
    return prisma.origemCliente.create({ data: { nome, codigo, ordem, ...resto } });
  }

  async function nomesNaOrdem() {
    const res = await http().get(BASE).query({ pageSize: 50 }).expect(200);
    return (res.body.data as { nome: string }[]).map((o) => o.nome);
  }

  describe('GET (listagem)', () => {
    beforeEach(async () => {
      await criarNoBanco('Indicação', 1, { codigo: 'indicacao' });
      await criarNoBanco('Google', 2);
      await criarNoBanco('Instagram', 3, { ativa: false });
      await criarNoBanco('Excluída', 4, { deletedAt: new Date() });
    });

    it('padrão: ordem crescente, sem excluídas, com meta de paginação', async () => {
      const res = await http().get(BASE).expect(200);

      const page = origemClientePageSchema.parse(res.body);
      expect(page.data.map((o) => [o.ordem, o.nome, o.codigo, o.ativa])).toEqual([
        [1, 'Indicação', 'indicacao', true],
        [2, 'Google', 'google', true],
        [3, 'Instagram', 'instagram', false],
      ]);
      expect(page.meta).toEqual({ page: 1, pageSize: 10, total: 3, totalPages: 1 });
    });

    it('busca por nome ou código, filtra por status, ordena e pagina', async () => {
      const busca = await http().get(BASE).query({ search: 'INDICACAO' }).expect(200);
      expect(busca.body.data.map((o: { nome: string }) => o.nome)).toEqual(['Indicação']);

      const inativas = await http().get(BASE).query({ status: 'inativo' }).expect(200);
      expect(inativas.body.data.map((o: { nome: string }) => o.nome)).toEqual(['Instagram']);

      const porNome = await http()
        .get(BASE)
        .query({ sort: 'nome:desc', pageSize: 2, page: 2 })
        .expect(200);
      expect(porNome.body.data.map((o: { nome: string }) => o.nome)).toEqual(['Google']);
      expect(porNome.body.meta).toEqual({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    });

    it('400 para sort fora da whitelist', async () => {
      const res = await http().get(BASE).query({ sort: 'deletedAt:asc' }).expect(400);

      expect(res.body.details.map((d: { field: string }) => d.field)).toEqual(['sort']);
    });
  });

  describe('GET /:id', () => {
    it('200, 404 (inexistente ou excluída) e 400 (id inválido)', async () => {
      const origem = await criarNoBanco('Google', 1);
      const excluida = await criarNoBanco('X', 2, { deletedAt: new Date() });

      const ok = await http().get(`${BASE}/${origem.id}`).expect(200);
      expect(origemClienteSchema.parse(ok.body)).toMatchObject({ id: origem.id, nome: 'Google' });
      for (const id of [INEXISTENTE, excluida.id]) {
        const res = await http().get(`${BASE}/${id}`).expect(404);
        expect(res.body).toMatchObject({
          code: 'NOT_FOUND',
          message: 'Origem de cliente não encontrada',
        });
      }
      await http().get(`${BASE}/abc`).expect(400);
    });
  });

  describe('POST (Nova Origem)', () => {
    it('201: gera o código do nome, entra no fim da lista e audita CREATE', async () => {
      await criarNoBanco('Google', 7);

      const res = await http().post(BASE).send({ nome: '  Evento Finanças 03/10  ' }).expect(201);

      expect(origemClienteSchema.parse(res.body)).toMatchObject({
        nome: 'Evento Finanças 03/10',
        codigo: 'evento_financas_03_10',
        ordem: 8,
        ativa: true,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { nome: 'Evento Finanças 03/10', codigo: 'evento_financas_03_10', ordem: 8 },
        userId: usuario.id,
      });
    });

    it('a primeira origem recebe ordem 1', async () => {
      const res = await http().post(BASE).send({ nome: 'Google' }).expect(201);

      expect(res.body.ordem).toBe(1);
    });

    it('400 "Nome é obrigatório." com o nome vazio ou ausente, sem auditar', async () => {
      for (const body of [{ nome: '' }, { nome: '   ' }, {}]) {
        const res = await http().post(BASE).send(body).expect(400);
        expect(res.body.details).toEqual([
          expect.objectContaining({ field: 'nome', message: 'Nome é obrigatório.' }),
        ]);
      }
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('400 para nome só com símbolos e para campo não permitido', async () => {
      const simbolos = await http().post(BASE).send({ nome: '!!!' }).expect(400);
      expect(simbolos.body.code).toBe('ORIGEM_CLIENTE_NOME_INVALIDO');

      const extra = await http().post(BASE).send({ nome: 'X', codigo: 'y' }).expect(400);
      expect(extra.body.details).toEqual([
        expect.objectContaining({ field: 'codigo', message: 'Campo não permitido' }),
      ]);
    });

    it('409 "Já existe uma origem chamada \'teste\'." (sem diferenciar maiúsculas) e não audita', async () => {
      await criarNoBanco('teste', 1);

      const res = await http().post(BASE).send({ nome: 'TESTE' }).expect(409);

      expect(res.body).toMatchObject({
        code: 'ORIGEM_CLIENTE_DUPLICADA',
        message: "Já existe uma origem chamada 'TESTE'.",
      });
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('409 quando outro nome gera o mesmo código; permite reutilizar nome de excluída', async () => {
      await criarNoBanco('Indicação', 1, { codigo: 'indicacao' });
      await criarNoBanco('Antiga', 2, { deletedAt: new Date() });

      await http().post(BASE).send({ nome: 'Indicacao' }).expect(409);
      await http().post(BASE).send({ nome: 'Antiga' }).expect(201);
    });
  });

  describe('PATCH /:id (Renomear Origem)', () => {
    it('200: renomeia, mantém o código e audita UPDATE com before/after', async () => {
      const origem = await criarNoBanco('Indicação', 1, { codigo: 'indicacao' });

      const res = await http()
        .patch(`${BASE}/${origem.id}`)
        .send({ nome: 'Indicação de paciente' })
        .expect(200);

      expect(res.body).toMatchObject({ nome: 'Indicação de paciente', codigo: 'indicacao' });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: origem.id,
        before: { nome: 'Indicação' },
        after: { nome: 'Indicação de paciente', codigo: 'indicacao' },
        userId: usuario.id,
      });
    });

    it('400 sem nome, 404 e não audita', async () => {
      const origem = await criarNoBanco('Google', 1);

      const vazio = await http().patch(`${BASE}/${origem.id}`).send({ nome: '' }).expect(400);
      expect(vazio.body.details).toEqual([
        expect.objectContaining({ field: 'nome', message: 'Nome é obrigatório.' }),
      ]);
      await http().patch(`${BASE}/${INEXISTENTE}`).send({ nome: 'X' }).expect(404);
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('409 para nome de outra origem; o próprio nome (com outra caixa) é permitido', async () => {
      await criarNoBanco('Instagram', 1);
      const google = await criarNoBanco('Google', 2);

      await http().patch(`${BASE}/${google.id}`).send({ nome: 'instagram' }).expect(409);
      await http().patch(`${BASE}/${google.id}`).send({ nome: 'GOOGLE' }).expect(200);
    });
  });

  describe('PATCH /:id/ativa (interruptor)', () => {
    it('desativa e ativa, auditando cada alteração', async () => {
      const origem = await criarNoBanco('Google', 1);

      const desativada = await http()
        .patch(`${BASE}/${origem.id}/ativa`)
        .send({ ativa: false })
        .expect(200);
      expect(desativada.body.ativa).toBe(false);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: origem.id,
        before: { ativa: true },
        after: { ativa: false },
        userId: usuario.id,
      });

      const ativada = await http()
        .patch(`${BASE}/${origem.id}/ativa`)
        .send({ ativa: true })
        .expect(200);
      expect(ativada.body.ativa).toBe(true);
      expect(await prisma.auditLog.count({ where: { entity: ENTITY, action: 'UPDATE' } })).toBe(2);
    });

    it('400 sem booleano e 404', async () => {
      const origem = await criarNoBanco('Google', 1);

      await http().patch(`${BASE}/${origem.id}/ativa`).send({ ativa: 'sim' }).expect(400);
      await http().patch(`${BASE}/${INEXISTENTE}/ativa`).send({ ativa: true }).expect(404);
    });
  });

  describe('PATCH /:id/mover (setas)', () => {
    let a: { id: string };
    let b: { id: string };
    let c: { id: string };

    beforeEach(async () => {
      a = await criarNoBanco('A', 1);
      b = await criarNoBanco('B', 2);
      c = await criarNoBanco('C', 3);
      await criarNoBanco('Excluída', 4, { deletedAt: new Date() });
    });

    it('para cima: troca com a vizinha e audita as duas origens', async () => {
      const res = await http().patch(`${BASE}/${b.id}/mover`).send({ direcao: 'cima' }).expect(200);

      expect(res.body).toMatchObject({ nome: 'B', ordem: 1 });
      expect(await nomesNaOrdem()).toEqual(['B', 'A', 'C']);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: b.id,
        before: { ordem: 2 },
        after: { ordem: 1 },
        userId: usuario.id,
      });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: a.id,
        before: { ordem: 1 },
        after: { ordem: 2 },
        userId: usuario.id,
      });
    });

    it('para baixo: troca com a vizinha, ignorando as excluídas', async () => {
      await http().patch(`${BASE}/${c.id}/mover`).send({ direcao: 'cima' }).expect(200);
      await http().patch(`${BASE}/${a.id}/mover`).send({ direcao: 'baixo' }).expect(200);

      expect(await nomesNaOrdem()).toEqual(['C', 'A', 'B']);
    });

    it('na ponta da lista nada muda', async () => {
      await http().patch(`${BASE}/${a.id}/mover`).send({ direcao: 'cima' }).expect(200);
      await http().patch(`${BASE}/${c.id}/mover`).send({ direcao: 'baixo' }).expect(200);

      expect(await nomesNaOrdem()).toEqual(['A', 'B', 'C']);
    });

    it('400 para direção inválida e 404', async () => {
      await http().patch(`${BASE}/${a.id}/mover`).send({ direcao: 'lado' }).expect(400);
      await http().patch(`${BASE}/${INEXISTENTE}/mover`).send({ direcao: 'cima' }).expect(404);
    });
  });

  describe('DELETE /:id', () => {
    it('exclusão lógica: 200, audita DELETE e some da listagem', async () => {
      const origem = await criarNoBanco('teste', 1);

      await http().delete(`${BASE}/${origem.id}`).expect(200);

      await expectAudit(prisma, {
        action: 'DELETE',
        entity: ENTITY,
        entityId: origem.id,
        before: { nome: 'teste', deletedAt: null },
        after: null,
        userId: usuario.id,
      });
      expect(
        (await prisma.origemCliente.findUniqueOrThrow({ where: { id: origem.id } })).deletedAt,
      ).not.toBeNull();
      await http().get(`${BASE}/${origem.id}`).expect(404);
    });

    it('409 ORIGEM_CLIENTE_EM_USO quando algum cliente usa a origem, sem auditar', async () => {
      const origem = await criarNoBanco('Google', 1);
      await prisma.paciente.create({
        data: { nome: 'Paciente Teste', origemClienteId: origem.id },
      });

      const res = await http().delete(`${BASE}/${origem.id}`).expect(409);

      expect(res.body).toMatchObject({ code: 'ORIGEM_CLIENTE_EM_USO' });
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('clientes excluídos não bloqueiam; 404 para já excluída', async () => {
      const origem = await criarNoBanco('Google', 1);
      await prisma.paciente.create({
        data: { nome: 'Paciente Teste', origemClienteId: origem.id, deletedAt: new Date() },
      });

      await http().delete(`${BASE}/${origem.id}`).expect(200);
      await http().delete(`${BASE}/${origem.id}`).expect(404);
    });
  });

  describe('GET /export', () => {
    function binary(req: request.Test) {
      return req.buffer(true).parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    }

    it('xlsx com filtros, ordenação e colunas visíveis; audita EXPORT', async () => {
      await criarNoBanco('Indicação', 1, { codigo: 'indicacao' });
      await criarNoBanco('Google', 2);
      await criarNoBanco('Instagram', 3, { ativa: false });

      const res = await binary(
        http()
          .get(`${BASE}/export`)
          .query({ format: 'xlsx', status: 'ativo', sort: 'nome:asc', columns: 'nome,ativa' }),
      ).expect(200);

      const workbook = new Workbook();
      await workbook.xlsx.load(res.body as unknown as ArrayBuffer);
      const rows: unknown[][] = [];
      workbook.worksheets[0]?.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
      expect(rows).toEqual([
        ['Nome', 'Ativa'],
        ['Google', 'Sim'],
        ['Indicação', 'Sim'],
      ]);
      await expectAudit(prisma, {
        action: 'EXPORT',
        entity: ENTITY,
        entityId: '*',
        userId: usuario.id,
      });
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
      { metodo: 'get', caminho: `${BASE}/export?format=xlsx`, permissao: 'exportar' },
      { metodo: 'get', caminho: `${BASE}/${INEXISTENTE}`, permissao: 'ver' },
      { metodo: 'post', caminho: BASE, permissao: 'criar' },
      { metodo: 'patch', caminho: `${BASE}/${INEXISTENTE}`, permissao: 'editar' },
      { metodo: 'patch', caminho: `${BASE}/${INEXISTENTE}/ativa`, permissao: 'editar' },
      { metodo: 'patch', caminho: `${BASE}/${INEXISTENTE}/mover`, permissao: 'editar' },
      { metodo: 'delete', caminho: `${BASE}/${INEXISTENTE}`, permissao: 'excluir' },
    ] as const;

    it.each(ROTAS)('$metodo $caminho sem token responde 401', async ({ metodo, caminho }) => {
      await request(app.getHttpServer())[metodo](caminho).send({}).expect(401);
    });

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
