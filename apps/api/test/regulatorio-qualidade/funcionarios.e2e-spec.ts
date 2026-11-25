import type { INestApplication } from '@nestjs/common';
import { funcionarioPageSchema, funcionarioSchema } from '@torres/shared';
import { Workbook } from 'exceljs';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/regulatorio-qualidade/funcionarios';
const ENTITY = 'Funcionario';
const PERMISSOES = [
  'regulatorio-qualidade.funcionarios.ver',
  'regulatorio-qualidade.funcionarios.criar',
  'regulatorio-qualidade.funcionarios.editar',
  'regulatorio-qualidade.funcionarios.excluir',
  'regulatorio-qualidade.funcionarios.exportar',
  'configuracoes-gestao.dados-pessoais.exportar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const MSG_NOME = 'Nome é obrigatório.';

describe('Funcionários (e2e)', () => {
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

  async function criarCargoNoBanco(nome: string, departamento?: string) {
    return prisma.cargo.create({ data: { nome, departamento } });
  }

  function criarNoBanco(
    nome: string,
    extra: { cargoId?: string; ativo?: boolean; deletedAt?: Date } = {},
  ) {
    return prisma.funcionario.create({ data: { nome, ...extra } });
  }

  const nomes = (body: { data: { nome: string }[] }) => body.data.map((f) => f.nome);

  describe('GET (listagem)', () => {
    it('padrão: nome crescente, sem excluídos, com Cargo e Departamento do join', async () => {
      const cargo = await criarCargoNoBanco('Recepção', 'Atendimento');
      await criarNoBanco('Beta', { cargoId: cargo.id });
      await criarNoBanco('Alfa');
      await criarNoBanco('Gama', { ativo: false });
      await criarNoBanco('Excluído', { deletedAt: new Date() });

      const res = await http().get(BASE).expect(200);

      const page = funcionarioPageSchema.parse(res.body);
      expect(nomes(page)).toEqual(['Alfa', 'Beta', 'Gama']);
      expect(page.data[1]).toMatchObject({ cargoNome: 'Recepção', departamento: 'Atendimento' });
    });

    it('filtra por status e busca por nome/telefone/email/cpf', async () => {
      await criarNoBanco('Ativo');
      await criarNoBanco('Inativo', { ativo: false });

      const ativos = await http().get(BASE).query({ status: 'ativo' }).expect(200);
      expect(nomes(ativos.body)).toEqual(['Ativo']);

      const busca = await http().get(BASE).query({ search: 'ativ' }).expect(200);
      expect(nomes(busca.body).sort()).toEqual(['Ativo', 'Inativo']);
    });

    it('400 para sort fora da whitelist (cargo/departamento não são sortáveis)', async () => {
      const res = await http().get(BASE).query({ sort: 'cargo:asc' }).expect(400);
      expect(res.body.details[0].field).toBe('sort');
    });
  });

  describe('GET /:id', () => {
    it('200 e 404 (inexistente ou excluído)', async () => {
      const funcionario = await criarNoBanco('Alfa');
      const excluido = await criarNoBanco('X', { deletedAt: new Date() });

      const ok = await http().get(`${BASE}/${funcionario.id}`).expect(200);
      expect(funcionarioSchema.parse(ok.body)).toMatchObject({ nome: 'Alfa' });
      for (const id of [INEXISTENTE, excluido.id]) {
        await http().get(`${BASE}/${id}`).expect(404);
      }
    });
  });

  describe('POST (Novo Funcionario)', () => {
    it('201: só com o nome fica ativo; audita CREATE', async () => {
      const res = await http().post(BASE).send({ nome: '  Ana Teste ' }).expect(201);

      expect(funcionarioSchema.parse(res.body)).toMatchObject({ nome: 'Ana Teste', ativo: true });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        userId: usuario.id,
      });
    });

    it('201 com cargo, tipo de contrato e salário', async () => {
      const cargo = await criarCargoNoBanco('Gerente', 'Diretoria');

      const res = await http()
        .post(BASE)
        .send({
          nome: 'João Gerente',
          cargoId: cargo.id,
          salario: 8000,
          tipoContrato: 'CLT',
          cargaHoraria: 40,
        })
        .expect(201);

      expect(res.body).toMatchObject({
        cargoNome: 'Gerente',
        departamento: 'Diretoria',
        salario: '8000',
        tipoContrato: 'CLT',
      });
    });

    it(`400 "${MSG_NOME}" com o nome vazio ou ausente, sem auditar`, async () => {
      for (const body of [{ nome: '' }, { nome: '   ' }, {}]) {
        const res = await http().post(BASE).send(body).expect(400);
        expect(res.body.details).toEqual([
          expect.objectContaining({ field: 'nome', message: MSG_NOME }),
        ]);
      }
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('400 para tipo de contrato e cargo inválidos', async () => {
      const res = await http()
        .post(BASE)
        .send({ nome: 'X', tipoContrato: 'OUTRO', cargoId: 'abc' })
        .expect(400);
      expect(res.body.details.map((d: { field: string }) => d.field).sort()).toEqual([
        'cargoId',
        'tipoContrato',
      ]);
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('PATCH /:id (Editar Funcionario)', () => {
    it('200: altera e audita UPDATE com before/after', async () => {
      const funcionario = await criarNoBanco('Alfa');

      const res = await http()
        .patch(`${BASE}/${funcionario.id}`)
        .send({ nome: 'Alfa Editado', status: 'inativo' })
        .expect(200);

      expect(res.body).toMatchObject({ nome: 'Alfa Editado', ativo: false });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: funcionario.id,
        before: { nome: 'Alfa', ativo: true },
        after: { nome: 'Alfa Editado', ativo: false },
        userId: usuario.id,
      });
    });

    it('400 sem nome e 404 inexistente, sem auditar', async () => {
      const funcionario = await criarNoBanco('Alfa');
      const vazio = await http().patch(`${BASE}/${funcionario.id}`).send({ nome: '' }).expect(400);
      expect(vazio.body.details[0].message).toBe(MSG_NOME);
      await http().patch(`${BASE}/${INEXISTENTE}`).send({ nome: 'Y' }).expect(404);
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('DELETE /:id', () => {
    it('exclusão lógica: 200, audita DELETE e some da listagem', async () => {
      const funcionario = await criarNoBanco('Alfa');

      await http().delete(`${BASE}/${funcionario.id}`).expect(200);

      await expectAudit(prisma, {
        action: 'DELETE',
        entity: ENTITY,
        entityId: funcionario.id,
        before: { nome: 'Alfa', deletedAt: null },
        after: null,
        userId: usuario.id,
      });
      await http().get(`${BASE}/${funcionario.id}`).expect(404);
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

    it('xlsx com filtro e ordenação, com cargo e departamento do join; audita EXPORT', async () => {
      const cargo = await criarCargoNoBanco('Gerente', 'Diretoria');
      await criarNoBanco('Beta', { cargoId: cargo.id });
      await criarNoBanco('Alfa');
      await criarNoBanco('Gama', { ativo: false });

      const res = await binary(
        http().get(`${BASE}/export`).query({ format: 'xlsx', status: 'ativo', sort: 'nome:asc' }),
      ).expect(200);

      const workbook = new Workbook();
      await workbook.xlsx.load(res.body as unknown as ArrayBuffer);
      const rows: unknown[][] = [];
      workbook.worksheets[0]?.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
      expect(rows[0]).toEqual([
        'Nome',
        'Cargo',
        'Departamento',
        'Telefone',
        'Tipo Contrato',
        'Salário',
        'Status',
      ]);
      expect(rows.slice(1).map((r) => r[0])).toEqual(['Alfa', 'Beta']);
      expect(rows[2]).toEqual(['Beta', 'Gerente', 'Diretoria', '', '', undefined, 'Ativo']);
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
