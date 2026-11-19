import type { INestApplication } from '@nestjs/common';
import { prestadorPageSchema, prestadorSchema } from '@torres/shared';
import { Workbook } from 'exceljs';
import request from 'supertest';
import type { Prisma } from '../../src/generated/prisma/client';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/consultorio-assistencial/prestadores';
const ENTITY = 'Prestador';
const PERMISSOES = [
  'consultorio-assistencial.prestadores.ver',
  'consultorio-assistencial.prestadores.criar',
  'consultorio-assistencial.prestadores.editar',
  'consultorio-assistencial.prestadores.excluir',
  'consultorio-assistencial.prestadores.exportar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const MSG_NOME = 'Nome é obrigatório.';
// CNPJ fictício com dígitos verificadores válidos.
const CNPJ = '11444777000161';

describe('Prestadores (e2e)', () => {
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

  function criarNoBanco(nome: string, extra: Omit<Prisma.PrestadorCreateInput, 'nome'> = {}) {
    return prisma.prestador.create({ data: { nome, ...extra } });
  }

  const nomes = (body: { data: { nome: string }[] }) => body.data.map((p) => p.nome);

  describe('GET (listagem)', () => {
    beforeEach(async () => {
      await criarNoBanco('Beta Elétrica', {
        nomeFantasia: 'Choque Rápido',
        telefone: '65999998888',
        notaQualidade: 5,
        atendeUrgencia: true,
      });
      await criarNoBanco('Alfa Hidráulica', {
        categoria: 'HIDRAULICA',
        documento: CNPJ,
        notaQualidade: 2,
      });
      await criarNoBanco('Gama Pinturas', { categoria: 'PINTURA', status: 'BLOQUEADO' });
      await criarNoBanco('Delta TI', { categoria: 'TI', status: 'INATIVO' });
      await criarNoBanco('Excluído', { deletedAt: new Date() });
    });

    it('padrão: nome crescente, sem excluídos, com meta de paginação', async () => {
      const res = await http().get(BASE).expect(200);

      const page = prestadorPageSchema.parse(res.body);
      expect(nomes(page)).toEqual([
        'Alfa Hidráulica',
        'Beta Elétrica',
        'Delta TI',
        'Gama Pinturas',
      ]);
      expect(page.meta).toEqual({ page: 1, pageSize: 10, total: 4, totalPages: 1 });
    });

    it('filtra pelos chips Ativo/Inativo/Bloqueado e pela categoria', async () => {
      for (const [query, esperado] of [
        [{ status: 'ATIVO' }, ['Alfa Hidráulica', 'Beta Elétrica']],
        [{ status: 'INATIVO' }, ['Delta TI']],
        [{ status: 'BLOQUEADO' }, ['Gama Pinturas']],
        [{ categoria: 'HIDRAULICA' }, ['Alfa Hidráulica']],
        [{ categoria: 'TI', status: 'ATIVO' }, []],
      ] as const) {
        const res = await http().get(BASE).query(query).expect(200);
        expect(nomes(res.body)).toEqual(esperado);
      }
    });

    it('"Buscar prestador..." (nome) procura no nome e no nome fantasia', async () => {
      for (const [nome, esperado] of [
        ['alfa', ['Alfa Hidráulica']],
        ['CHOQUE', ['Beta Elétrica']],
        ['6599', []],
      ] as const) {
        const res = await http().get(BASE).query({ nome }).expect(200);
        expect(nomes(res.body)).toEqual(esperado);
      }
    });

    it('a busca do grid procura também no telefone e no CPF/CNPJ, junto com o nome', async () => {
      for (const [query, esperado] of [
        [{ search: '6599' }, ['Beta Elétrica']],
        [{ search: '114447' }, ['Alfa Hidráulica']],
        [{ search: 'a', nome: 'gama' }, ['Gama Pinturas']],
        [{ search: '6599', nome: 'alfa' }, []],
      ] as const) {
        const res = await http().get(BASE).query(query).expect(200);
        expect(nomes(res.body)).toEqual(esperado);
      }
    });

    it('ordena por avaliação e urgência, e pagina', async () => {
      const avaliacao = await http().get(BASE).query({ sort: 'avaliacao:desc' }).expect(200);
      expect(nomes(avaliacao.body)[0]).toBe('Beta Elétrica');
      expect(nomes(avaliacao.body).at(-1)).toBe('Alfa Hidráulica');

      const urgencia = await http().get(BASE).query({ sort: 'urgencia:desc' }).expect(200);
      expect(nomes(urgencia.body)[0]).toBe('Beta Elétrica');

      const pagina = await http()
        .get(BASE)
        .query({ sort: 'nome:desc', pageSize: 3, page: 2 })
        .expect(200);
      expect(nomes(pagina.body)).toEqual(['Alfa Hidráulica']);
      expect(pagina.body.meta).toEqual({ page: 2, pageSize: 3, total: 4, totalPages: 2 });
    });

    it('400 para sort fora da whitelist, status e categoria inválidos', async () => {
      const sort = await http().get(BASE).query({ sort: 'email:asc' }).expect(400);
      expect(sort.body.details.map((d: { field: string }) => d.field)).toEqual(['sort']);

      await http().get(BASE).query({ status: 'ativo' }).expect(400);
      await http().get(BASE).query({ categoria: 'OUTRA' }).expect(400);
    });
  });

  describe('GET /:id', () => {
    it('200, 404 (inexistente ou excluído) e 400 (id inválido)', async () => {
      const prestador = await criarNoBanco('Alfa', { valorHora: '80.50' });
      const excluido = await criarNoBanco('X', { deletedAt: new Date() });

      const ok = await http().get(`${BASE}/${prestador.id}`).expect(200);
      expect(prestadorSchema.parse(ok.body)).toMatchObject({
        id: prestador.id,
        nome: 'Alfa',
        valorHora: 80.5,
      });
      for (const id of [INEXISTENTE, excluido.id]) {
        const res = await http().get(`${BASE}/${id}`).expect(404);
        expect(res.body).toMatchObject({ code: 'NOT_FOUND', message: 'Prestador não encontrado' });
      }
      await http().get(`${BASE}/abc`).expect(400);
    });
  });

  describe('POST (Novo Prestador)', () => {
    it('201: só com o nome assume os padrões do modal; audita CREATE', async () => {
      const res = await http().post(BASE).send({ nome: '  Alfa Manutenção ' }).expect(201);

      expect(prestadorSchema.parse(res.body)).toMatchObject({
        nome: 'Alfa Manutenção',
        tipoPessoa: 'FISICA',
        status: 'ATIVO',
        categoria: 'ELETRICA',
        formaPagamento: 'PIX',
        notaQualidade: 3,
        notaPontualidade: 3,
        avaliacaoPreco: 'JUSTO',
        atendeUrgencia: false,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { nome: 'Alfa Manutenção', status: 'ATIVO', categoria: 'ELETRICA' },
        userId: usuario.id,
      });
    });

    it('201 com as quatro abas preenchidas, guardando só os dígitos', async () => {
      const res = await http()
        .post(BASE)
        .send({
          nome: 'Beta Serviços',
          nomeFantasia: 'Beta',
          tipoPessoa: 'JURIDICA',
          documento: '11.444.777/0001-61',
          telefone: '(65) 99999-8888',
          email: 'beta@teste.example',
          status: 'BLOQUEADO',
          endereco: 'Rua Teste, 10, Centro, Cuiabá',
          categoria: 'AR_CONDICIONADO',
          descricaoServico: 'Manutenção preventiva',
          atendeUrgencia: true,
          atendeFimSemana: true,
          formaPagamento: 'PIX',
          chavePix: 'beta@teste.example',
          valorHora: 80.5,
          valorDiaria: 500,
          emiteNotaFiscal: true,
          notaQualidade: '5',
          notaPontualidade: 4,
          avaliacaoPreco: 'CARO',
          observacoes: 'Atende só com agendamento',
        })
        .expect(201);

      expect(prestadorSchema.parse(res.body)).toMatchObject({
        tipoPessoa: 'JURIDICA',
        documento: CNPJ,
        telefone: '65999998888',
        status: 'BLOQUEADO',
        categoria: 'AR_CONDICIONADO',
        atendeUrgencia: true,
        atendeFimSemana: true,
        chavePix: 'beta@teste.example',
        valorHora: 80.5,
        valorDiaria: 500,
        emiteNotaFiscal: true,
        notaQualidade: 5,
        notaPontualidade: 4,
        avaliacaoPreco: 'CARO',
      });
    });

    it('descarta a Chave PIX quando a forma de pagamento não é PIX', async () => {
      const res = await http()
        .post(BASE)
        .send({ nome: 'X', formaPagamento: 'BOLETO', chavePix: 'chave' })
        .expect(201);

      expect(res.body).toMatchObject({ formaPagamento: 'BOLETO', chavePix: null });
    });

    it(`400 "${MSG_NOME}" com o nome vazio ou ausente, sem auditar`, async () => {
      for (const body of [{ nome: '' }, { nome: '   ' }, {}]) {
        const res = await http().post(BASE).send(body).expect(400);
        expect(res.body.details).toEqual([{ field: 'nome', message: MSG_NOME }]);
      }
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('400 para documento, email, enums, notas e campo não permitido', async () => {
      const res = await http()
        .post(BASE)
        .send({
          nome: 'X',
          documento: '11444777000162',
          email: 'x',
          status: 'ativo',
          categoria: 'OUTRA',
          notaQualidade: 6,
          deletedAt: null,
        })
        .expect(400);

      expect(res.body.details.map((d: { field: string }) => d.field).sort()).toEqual([
        'categoria',
        'deletedAt',
        'email',
        'notaQualidade',
        'status',
      ]);
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('PATCH /:id (Editar Prestador)', () => {
    it('200: altera os campos e audita UPDATE com before/after', async () => {
      const prestador = await criarNoBanco('Alfa', { categoria: 'GESSO' });

      const res = await http()
        .patch(`${BASE}/${prestador.id}`)
        .send({ nome: 'Alfa Ltda', categoria: 'MARCENARIA', status: 'INATIVO', notaQualidade: 1 })
        .expect(200);

      expect(res.body).toMatchObject({
        nome: 'Alfa Ltda',
        categoria: 'MARCENARIA',
        status: 'INATIVO',
        notaQualidade: 1,
      });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: prestador.id,
        before: { nome: 'Alfa', categoria: 'GESSO', status: 'ATIVO', notaQualidade: 3 },
        after: { nome: 'Alfa Ltda', categoria: 'MARCENARIA', status: 'INATIVO', notaQualidade: 1 },
        userId: usuario.id,
      });
    });

    it('400 sem nome e 404 inexistente ou excluído, sem auditar', async () => {
      const prestador = await criarNoBanco('Alfa');
      const excluido = await criarNoBanco('X', { deletedAt: new Date() });

      const vazio = await http().patch(`${BASE}/${prestador.id}`).send({ nome: '' }).expect(400);
      expect(vazio.body.details[0].message).toBe(MSG_NOME);
      for (const id of [INEXISTENTE, excluido.id]) {
        await http().patch(`${BASE}/${id}`).send({ nome: 'Y' }).expect(404);
      }
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('DELETE /:id', () => {
    it('exclusão lógica: 200, audita DELETE e some da listagem', async () => {
      const prestador = await criarNoBanco('Alfa');

      await http().delete(`${BASE}/${prestador.id}`).expect(200);

      await expectAudit(prisma, {
        action: 'DELETE',
        entity: ENTITY,
        entityId: prestador.id,
        before: { nome: 'Alfa', deletedAt: null },
        after: null,
        userId: usuario.id,
      });
      expect(
        (await prisma.prestador.findUniqueOrThrow({ where: { id: prestador.id } })).deletedAt,
      ).not.toBeNull();
      await http().get(`${BASE}/${prestador.id}`).expect(404);
      const lista = await http().get(BASE).expect(200);
      expect(nomes(lista.body)).toEqual([]);
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
      await criarNoBanco('Beta', { categoria: 'AR_CONDICIONADO', atendeUrgencia: true });
      await criarNoBanco('Alfa', { notaQualidade: 5 });
      await criarNoBanco('Gama', { status: 'BLOQUEADO' });

      const res = await binary(
        http().get(`${BASE}/export`).query({
          format: 'xlsx',
          status: 'ATIVO',
          sort: 'nome:asc',
          columns: 'nome,categoria,urgencia,avaliacao,status',
        }),
      ).expect(200);

      const workbook = new Workbook();
      await workbook.xlsx.load(res.body as unknown as ArrayBuffer);
      const rows: unknown[][] = [];
      workbook.worksheets[0]?.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
      expect(rows).toEqual([
        ['Nome', 'Categoria', 'Urgência', 'Avaliação', 'Status'],
        ['Alfa', 'Elétrica', 'Não', '5 - Ótimo', 'Ativo'],
        ['Beta', 'Ar Condicionado', 'Sim', '3 - Regular', 'Ativo'],
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
        .query({ format: 'xlsx', columns: 'chavePix' })
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
