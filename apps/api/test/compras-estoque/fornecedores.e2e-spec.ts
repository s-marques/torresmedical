import type { INestApplication } from '@nestjs/common';
import { fornecedorPageSchema, fornecedorSchema } from '@torres/shared';
import { Workbook } from 'exceljs';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/compras-estoque/fornecedores';
const ENTITY = 'Fornecedor';
const PERMISSOES = [
  'compras-estoque.fornecedores.ver',
  'compras-estoque.fornecedores.criar',
  'compras-estoque.fornecedores.editar',
  'compras-estoque.fornecedores.excluir',
  'compras-estoque.fornecedores.exportar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const MSG_NOME = 'Nome / Razão Social é obrigatório.';
// CNPJ e CPF fictícios com dígitos verificadores válidos.
const CNPJ = '11444777000161';
const CPF = '52998224725';

describe('Fornecedores (e2e)', () => {
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
    extra: {
      documento?: string;
      email?: string;
      cidade?: string;
      uf?: string;
      ativo?: boolean;
      deletedAt?: Date;
    } = {},
  ) {
    return prisma.fornecedor.create({ data: { nome, ...extra } });
  }

  const nomes = (body: { data: { nome: string }[] }) => body.data.map((f) => f.nome);

  describe('GET (listagem)', () => {
    beforeEach(async () => {
      await criarNoBanco('Beta Distribuidora', { documento: CNPJ, cidade: 'Cuiabá', uf: 'MT' });
      await criarNoBanco('Alfa Materiais', { email: 'alfa@teste.example' });
      await criarNoBanco('Gama Suprimentos', { ativo: false });
      await criarNoBanco('Excluído', { deletedAt: new Date() });
    });

    it('padrão: nome crescente, sem excluídos, com meta de paginação', async () => {
      const res = await http().get(BASE).expect(200);

      const page = fornecedorPageSchema.parse(res.body);
      expect(nomes(page)).toEqual(['Alfa Materiais', 'Beta Distribuidora', 'Gama Suprimentos']);
      expect(page.meta).toEqual({ page: 1, pageSize: 10, total: 3, totalPages: 1 });
    });

    it('filtra por status (chips Ativo/Inativo)', async () => {
      const ativos = await http().get(BASE).query({ status: 'ativo' }).expect(200);
      expect(nomes(ativos.body)).toEqual(['Alfa Materiais', 'Beta Distribuidora']);

      const inativos = await http().get(BASE).query({ status: 'inativo' }).expect(200);
      expect(nomes(inativos.body)).toEqual(['Gama Suprimentos']);
    });

    it('busca por nome, documento ou email', async () => {
      for (const [search, esperado] of [
        ['BETA', 'Beta Distribuidora'],
        ['114447', 'Beta Distribuidora'],
        ['alfa@', 'Alfa Materiais'],
      ]) {
        const res = await http().get(BASE).query({ search }).expect(200);
        expect(nomes(res.body)).toEqual([esperado]);
      }
    });

    it('ordena (inclusive por status) e pagina', async () => {
      const desc = await http()
        .get(BASE)
        .query({ sort: 'nome:desc', pageSize: 2, page: 2 })
        .expect(200);
      expect(nomes(desc.body)).toEqual(['Alfa Materiais']);
      expect(desc.body.meta).toEqual({ page: 2, pageSize: 2, total: 3, totalPages: 2 });

      const status = await http().get(BASE).query({ sort: 'status:asc' }).expect(200);
      expect(nomes(status.body)[0]).toBe('Gama Suprimentos');
    });

    it('400 para sort fora da whitelist e status inválido', async () => {
      const sort = await http().get(BASE).query({ sort: 'uf:asc' }).expect(400);
      expect(sort.body.details.map((d: { field: string }) => d.field)).toEqual(['sort']);

      await http().get(BASE).query({ status: 'outro' }).expect(400);
    });
  });

  describe('GET /:id', () => {
    it('200, 404 (inexistente ou excluído) e 400 (id inválido)', async () => {
      const fornecedor = await criarNoBanco('Alfa');
      const excluido = await criarNoBanco('X', { deletedAt: new Date() });

      const ok = await http().get(`${BASE}/${fornecedor.id}`).expect(200);
      expect(fornecedorSchema.parse(ok.body)).toMatchObject({ id: fornecedor.id, nome: 'Alfa' });
      for (const id of [INEXISTENTE, excluido.id]) {
        const res = await http().get(`${BASE}/${id}`).expect(404);
        expect(res.body).toMatchObject({ code: 'NOT_FOUND', message: 'Fornecedor não encontrado' });
      }
      await http().get(`${BASE}/abc`).expect(400);
    });
  });

  describe('POST (Novo Fornecedor)', () => {
    it('201: só com o nome fica ativo, sem outros dados; audita CREATE', async () => {
      const res = await http().post(BASE).send({ nome: '  Alfa Materiais ' }).expect(201);

      expect(fornecedorSchema.parse(res.body)).toMatchObject({
        nome: 'Alfa Materiais',
        documento: null,
        ativo: true,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { nome: 'Alfa Materiais', ativo: true },
        userId: usuario.id,
      });
    });

    it('201 com todos os campos, guardando só os dígitos, e documento repetido (permitido)', async () => {
      await criarNoBanco('Existente', { documento: CNPJ });

      const res = await http()
        .post(BASE)
        .send({
          nome: 'Beta Distribuidora',
          nomeFantasia: 'Beta',
          documento: '11.444.777/0001-61',
          email: 'beta@teste.example',
          contato: 'Maria Teste',
          telefone: '(65) 3333-4444',
          celular: '(65) 99999-8888',
          cep: '78000-000',
          logradouro: 'Rua Teste',
          numero: '10',
          complemento: 'Sala 2',
          bairro: 'Centro',
          cidade: 'Cuiabá',
          uf: 'MT',
          status: 'inativo',
          observacoes: 'Entrega às terças',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        documento: CNPJ,
        telefone: '6533334444',
        celular: '65999998888',
        cep: '78000000',
        uf: 'MT',
        ativo: false,
        observacoes: 'Entrega às terças',
      });
      expect(await prisma.fornecedor.count({ where: { documento: CNPJ } })).toBe(2);
    });

    it(`400 "${MSG_NOME}" com o nome vazio ou ausente, sem auditar`, async () => {
      for (const body of [{ nome: '' }, { nome: '   ' }, {}]) {
        const res = await http().post(BASE).send(body).expect(400);
        expect(res.body.details).toEqual([{ field: 'nome', message: MSG_NOME }]);
      }
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('400 para documento, email, UF, status e campo não permitido', async () => {
      const res = await http()
        .post(BASE)
        .send({
          nome: 'X',
          email: 'x',
          uf: 'XX',
          status: 'outro',
          deletedAt: null,
        })
        .expect(400);

      expect(res.body.details.map((d: { field: string }) => d.field).sort()).toEqual([
        'deletedAt',
        'email',
        'status',
        'uf',
      ]);
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('400 "CPF inválido" e "CNPJ inválido" para documento com dígitos errados', async () => {
      for (const [documento, message] of [
        ['11111111111', 'CPF inválido'],
        ['11444777000162', 'CNPJ inválido'],
        ['123', 'CNPJ/CPF inválido'],
      ]) {
        const res = await http().post(BASE).send({ nome: 'X', documento }).expect(400);
        expect(res.body.details).toEqual([{ field: 'documento', message }]);
      }
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('aceita CPF válido', async () => {
      const res = await http().post(BASE).send({ nome: 'Pessoa', documento: CPF }).expect(201);
      expect(res.body.documento).toBe(CPF);
    });
  });

  describe('PATCH /:id (Editar Fornecedor)', () => {
    it('200: altera os campos e audita UPDATE com before/after', async () => {
      const fornecedor = await criarNoBanco('Alfa', { cidade: 'Cuiabá' });

      const res = await http()
        .patch(`${BASE}/${fornecedor.id}`)
        .send({ nome: 'Alfa Ltda', cidade: 'Várzea Grande', uf: 'MT', status: 'inativo' })
        .expect(200);

      expect(res.body).toMatchObject({ nome: 'Alfa Ltda', ativo: false });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: fornecedor.id,
        before: { nome: 'Alfa', cidade: 'Cuiabá', ativo: true },
        after: { nome: 'Alfa Ltda', cidade: 'Várzea Grande', uf: 'MT', ativo: false },
        userId: usuario.id,
      });
    });

    it('400 sem nome e 404 inexistente ou excluído, sem auditar', async () => {
      const fornecedor = await criarNoBanco('Alfa');
      const excluido = await criarNoBanco('X', { deletedAt: new Date() });

      const vazio = await http().patch(`${BASE}/${fornecedor.id}`).send({ nome: '' }).expect(400);
      expect(vazio.body.details[0].message).toBe(MSG_NOME);
      for (const id of [INEXISTENTE, excluido.id]) {
        await http().patch(`${BASE}/${id}`).send({ nome: 'Y' }).expect(404);
      }
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('DELETE /:id', () => {
    it('exclusão lógica: 200, audita DELETE e some da listagem', async () => {
      const fornecedor = await criarNoBanco('Alfa');

      await http().delete(`${BASE}/${fornecedor.id}`).expect(200);

      await expectAudit(prisma, {
        action: 'DELETE',
        entity: ENTITY,
        entityId: fornecedor.id,
        before: { nome: 'Alfa', deletedAt: null },
        after: null,
        userId: usuario.id,
      });
      expect(
        (await prisma.fornecedor.findUniqueOrThrow({ where: { id: fornecedor.id } })).deletedAt,
      ).not.toBeNull();
      await http().get(`${BASE}/${fornecedor.id}`).expect(404);
    });

    it('404 para já excluído e inexistente, sem auditar', async () => {
      const excluido = await criarNoBanco('X', { deletedAt: new Date() });

      await http().delete(`${BASE}/${excluido.id}`).expect(404);
      await http().delete(`${BASE}/${INEXISTENTE}`).expect(404);
      await expectNoAudit(prisma, { entity: ENTITY });
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

    it('xlsx com filtro, ordenação e colunas visíveis; audita EXPORT', async () => {
      await criarNoBanco('Beta', { cidade: 'Cuiabá', uf: 'MT' });
      await criarNoBanco('Alfa');
      await criarNoBanco('Gama', { ativo: false });

      const res = await binary(
        http().get(`${BASE}/export`).query({
          format: 'xlsx',
          status: 'ativo',
          sort: 'nome:asc',
          columns: 'nome,cidade,status',
        }),
      ).expect(200);

      const workbook = new Workbook();
      await workbook.xlsx.load(res.body as unknown as ArrayBuffer);
      const rows: unknown[][] = [];
      workbook.worksheets[0]?.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
      expect(rows).toEqual([
        ['Nome', 'Cidade/UF', 'Status'],
        ['Alfa', '', 'Ativo'],
        ['Beta', 'Cuiabá/MT', 'Ativo'],
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
