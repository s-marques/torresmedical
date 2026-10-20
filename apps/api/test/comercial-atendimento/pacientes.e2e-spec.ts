import type { INestApplication } from '@nestjs/common';
import { pacientePageSchema, pacienteSchema } from '@torres/shared';
import { Workbook } from 'exceljs';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import type { Prisma } from '../../src/generated/prisma/client';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/comercial-atendimento/pacientes';
const ENTITY = 'Paciente';
const PERMISSOES = [
  'comercial-atendimento.pacientes.ver',
  'comercial-atendimento.pacientes.criar',
  'comercial-atendimento.pacientes.editar',
  'comercial-atendimento.pacientes.excluir',
  'comercial-atendimento.pacientes.exportar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';
// Documentos fictícios com dígitos verificadores válidos (exemplos públicos).
const CPF_A = '52998224725';
const CPF_B = '11144477735';
const CNPJ = '11222333000181';

describe('Pacientes (e2e)', () => {
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

  function criarNoBanco(nome: string, extra: Partial<Prisma.PacienteUncheckedCreateInput> = {}) {
    return prisma.paciente.create({ data: { nome, ...extra } });
  }

  function criarOrigem(nome: string, ativa = true) {
    return prisma.origemCliente.create({
      data: { nome, codigo: nome.toLowerCase(), ordem: 1, ativa },
    });
  }

  async function nomes(query: Record<string, unknown> = {}) {
    const res = await http().get(BASE).query(query).expect(200);
    return (res.body.data as { nome: string }[]).map((p) => p.nome);
  }

  describe('GET (listagem)', () => {
    beforeEach(async () => {
      const origem = await criarOrigem('WhatsApp');
      await criarNoBanco('Ana Teste', {
        documento: CPF_A,
        celular: '65999990001',
        email: 'ana@exemplo.test',
        status: 'NOVO',
        origemClienteId: origem.id,
      });
      await criarNoBanco('Bruno Teste', { telefone: '6533330002', status: 'ATIVO' });
      await criarNoBanco('Carla Teste', { status: 'INATIVO' });
      await criarNoBanco('Excluído', { deletedAt: new Date() });
    });

    it('padrão: por nome, sem excluídos, com origem e meta de paginação', async () => {
      const res = await http().get(BASE).expect(200);

      const page = pacientePageSchema.parse(res.body);
      expect(page.data.map((p) => [p.nome, p.status, p.origemNome])).toEqual([
        ['Ana Teste', 'NOVO', 'WhatsApp'],
        ['Bruno Teste', 'ATIVO', null],
        ['Carla Teste', 'INATIVO', null],
      ]);
      expect(page.meta).toEqual({ page: 1, pageSize: 10, total: 3, totalPages: 1 });
    });

    it('busca por nome, email, CPF, celular e telefone (com ou sem máscara)', async () => {
      expect(await nomes({ search: 'bruno' })).toEqual(['Bruno Teste']);
      expect(await nomes({ search: 'ana@exemplo' })).toEqual(['Ana Teste']);
      expect(await nomes({ search: '529.982' })).toEqual(['Ana Teste']);
      expect(await nomes({ search: '(65) 99999' })).toEqual(['Ana Teste']);
      expect(await nomes({ search: '3333-0002' })).toEqual(['Bruno Teste']);
    });

    it('filtra por status (Todos/Ativo/Inativo)', async () => {
      expect(await nomes({ status: 'INATIVO' })).toEqual(['Carla Teste']);
      expect(await nomes({ status: 'ATIVO' })).toEqual(['Bruno Teste']);
    });

    it('ordena por nome, origem e status, e pagina', async () => {
      expect(await nomes({ sort: 'nome:desc' })).toEqual([
        'Carla Teste',
        'Bruno Teste',
        'Ana Teste',
      ]);
      expect((await nomes({ sort: 'origem:asc' }))[0]).toBe('Ana Teste');
      expect(await nomes({ sort: 'status:asc' })).toEqual([
        'Ana Teste',
        'Bruno Teste',
        'Carla Teste',
      ]);

      const pagina2 = await http().get(BASE).query({ pageSize: 2, page: 2 }).expect(200);
      expect(pagina2.body.data.map((p: { nome: string }) => p.nome)).toEqual(['Carla Teste']);
      expect(pagina2.body.meta).toEqual({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    });

    it('400 para sort e status fora da whitelist', async () => {
      const sort = await http().get(BASE).query({ sort: 'deletedAt:asc' }).expect(400);
      expect(sort.body.details.map((d: { field: string }) => d.field)).toEqual(['sort']);
      await http().get(BASE).query({ status: 'xyz' }).expect(400);
    });
  });

  describe('GET /:id', () => {
    it('200 com todos os campos; 404 inexistente ou excluído; 400 id inválido', async () => {
      const paciente = await criarNoBanco('Ana Teste', { cidade: 'Cuiabá' });
      const excluido = await criarNoBanco('X', { deletedAt: new Date() });

      const ok = await http().get(`${BASE}/${paciente.id}`).expect(200);
      expect(pacienteSchema.parse(ok.body)).toMatchObject({ id: paciente.id, cidade: 'Cuiabá' });
      for (const id of [INEXISTENTE, excluido.id]) {
        const res = await http().get(`${BASE}/${id}`).expect(404);
        expect(res.body).toMatchObject({ code: 'NOT_FOUND', message: 'Paciente não encontrado' });
      }
      await http().get(`${BASE}/abc`).expect(400);
    });
  });

  describe('POST (Novo Paciente)', () => {
    it('201 só com o nome: padrões PF, Ativo e WhatsApp aceito; audita CREATE', async () => {
      const res = await http().post(BASE).send({ nome: '  Ana Teste  ' }).expect(201);

      expect(pacienteSchema.parse(res.body)).toMatchObject({
        nome: 'Ana Teste',
        tipo: 'PF',
        status: 'ATIVO',
        aceitaCampanhasWhatsapp: true,
        menorIdade: false,
        documento: null,
        email: null,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { nome: 'Ana Teste', tipo: 'PF', status: 'ATIVO' },
        userId: usuario.id,
      });
    });

    it('201 completo (PF): guarda só dígitos, vazio vira null e liga a origem', async () => {
      const origem = await criarOrigem('Google');

      const res = await http()
        .post(BASE)
        .send({
          nome: 'Ana Teste',
          nomeSocial: 'Ana',
          email: 'ana@exemplo.test',
          documento: '529.982.247-25',
          celular: '(65) 99999-0001',
          telefone: '',
          dataNascimento: '1990-05-17',
          sexo: 'FEMININO',
          profissao: 'Designer',
          origemClienteId: origem.id,
          status: 'NOVO',
          observacoes: 'Teste',
          aceitaCampanhasWhatsapp: false,
          cep: '78000-000',
          uf: 'mt',
          codigoIbge: '5103403',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        documento: CPF_A,
        celular: '65999990001',
        telefone: null,
        dataNascimento: '1990-05-17',
        sexo: 'FEMININO',
        origemNome: 'Google',
        status: 'NOVO',
        aceitaCampanhasWhatsapp: false,
        cep: '78000000',
        uf: 'MT',
      });
    });

    it('201 PJ: guarda os dados da empresa e descarta os campos de pessoa física', async () => {
      const res = await http()
        .post(BASE)
        .send({
          tipo: 'PJ',
          nome: 'Empresa Teste',
          documento: CNPJ,
          razaoSocial: 'Empresa Teste LTDA',
          nomeFantasia: 'Empresa',
          representanteNome: 'Fulano de Tal',
          representanteCelular: '65999990002',
          rg: '123',
          sexo: 'OUTRO',
          menorIdade: true,
        })
        .expect(201);

      expect(res.body).toMatchObject({
        tipo: 'PJ',
        documento: CNPJ,
        razaoSocial: 'Empresa Teste LTDA',
        representanteNome: 'Fulano de Tal',
        rg: null,
        sexo: null,
        menorIdade: false,
      });
    });

    it('400 "O nome do paciente é obrigatório." com nome vazio ou ausente, sem auditar', async () => {
      for (const body of [{ nome: '' }, { nome: '   ' }, {}]) {
        const res = await http().post(BASE).send(body).expect(400);
        expect(res.body.details).toEqual([
          { field: 'nome', message: 'O nome do paciente é obrigatório.' },
        ]);
      }
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('400 para CPF, CNPJ, email, telefone, UF e campos não permitidos', async () => {
      const campos = async (body: object) =>
        (
          await http()
            .post(BASE)
            .send({ nome: 'X', ...body })
            .expect(400)
        ).body.details.map((d: { field: string; message: string }) => [d.field, d.message]);

      expect(await campos({ documento: '11111111111' })).toEqual([['documento', 'CPF inválido']]);
      expect(await campos({ tipo: 'PJ', documento: CPF_A })).toEqual([
        ['documento', 'CNPJ inválido'],
      ]);
      expect(await campos({ email: 'invalido' })).toEqual([['email', 'Email inválido']]);
      expect(await campos({ celular: '123' })).toEqual([['celular', 'Celular inválido']]);
      expect(await campos({ uf: 'MTX' })).toEqual([['uf', 'UF inválida']]);
      expect(await campos({ deletedAt: null })).toEqual([['deletedAt', 'Campo não permitido']]);
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('409 para CPF repetido, mas permite o de um paciente excluído', async () => {
      await criarNoBanco('Antiga', { documento: CPF_B, deletedAt: new Date() });
      await criarNoBanco('Ana Teste', { documento: CPF_A });

      const res = await http().post(BASE).send({ nome: 'Outra', documento: CPF_A }).expect(409);

      expect(res.body).toMatchObject({ code: 'PACIENTE_DOCUMENTO_DUPLICADO' });
      expect(res.body.details).toEqual([{ field: 'documento', message: 'CPF já cadastrado' }]);
      await http().post(BASE).send({ nome: 'Nova', documento: CPF_B }).expect(201);
    });

    it('400 para origem inexistente, inativa ou excluída', async () => {
      const inativa = await criarOrigem('Inativa', false);

      for (const origemClienteId of [INEXISTENTE, inativa.id]) {
        const res = await http().post(BASE).send({ nome: 'X', origemClienteId }).expect(400);
        expect(res.body.code).toBe('ORIGEM_CLIENTE_INVALIDA');
      }
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('PATCH /:id (Editar)', () => {
    it('200: altera, permite manter o próprio CPF e audita UPDATE com before/after', async () => {
      const paciente = await criarNoBanco('Ana Teste', { documento: CPF_A, cidade: 'Cuiabá' });

      const res = await http()
        .patch(`${BASE}/${paciente.id}`)
        .send({ nome: 'Ana Souza', documento: CPF_A, cidade: 'Várzea Grande', status: 'INATIVO' })
        .expect(200);

      expect(res.body).toMatchObject({
        nome: 'Ana Souza',
        cidade: 'Várzea Grande',
        status: 'INATIVO',
      });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: paciente.id,
        before: { nome: 'Ana Teste', cidade: 'Cuiabá', status: 'ATIVO' },
        after: { nome: 'Ana Souza', cidade: 'Várzea Grande', status: 'INATIVO' },
        userId: usuario.id,
      });
    });

    it('409 com o CPF de outro paciente; 400 sem nome; 404', async () => {
      await criarNoBanco('Ana Teste', { documento: CPF_A });
      const outro = await criarNoBanco('Bruno Teste');

      await http()
        .patch(`${BASE}/${outro.id}`)
        .send({ nome: 'Bruno', documento: CPF_A })
        .expect(409);
      await http().patch(`${BASE}/${outro.id}`).send({ nome: '' }).expect(400);
      await http().patch(`${BASE}/${INEXISTENTE}`).send({ nome: 'X' }).expect(404);
      await expectNoAudit(prisma, { entity: ENTITY, action: 'UPDATE' });
    });
  });

  describe('DELETE /:id', () => {
    it('exclusão lógica: 200, audita DELETE e some da listagem e do detalhe', async () => {
      const paciente = await criarNoBanco('Ana Teste');

      await http().delete(`${BASE}/${paciente.id}`).expect(200);

      await expectAudit(prisma, {
        action: 'DELETE',
        entity: ENTITY,
        entityId: paciente.id,
        before: { nome: 'Ana Teste', deletedAt: null },
        after: null,
        userId: usuario.id,
      });
      expect(
        (await prisma.paciente.findUniqueOrThrow({ where: { id: paciente.id } })).deletedAt,
      ).not.toBeNull();
      expect(await nomes()).toEqual([]);
      await http().get(`${BASE}/${paciente.id}`).expect(404);
      await http().delete(`${BASE}/${paciente.id}`).expect(404);
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
      await criarNoBanco('Ana Teste', { documento: CPF_A, status: 'ATIVO' });
      await criarNoBanco('Bruno Teste', { status: 'ATIVO' });
      await criarNoBanco('Carla Teste', { status: 'INATIVO' });

      const res = await binary(
        http().get(`${BASE}/export`).query({
          format: 'xlsx',
          status: 'ATIVO',
          sort: 'nome:desc',
          columns: 'nome,documento,status',
        }),
      ).expect(200);

      const workbook = new Workbook();
      await workbook.xlsx.load(res.body as unknown as ArrayBuffer);
      const rows: unknown[][] = [];
      workbook.worksheets[0]?.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
      expect(rows).toEqual([
        ['Nome', 'Documento', 'Status'],
        ['Bruno Teste', undefined, 'Ativo'],
        ['Ana Teste', '529.982.247-25', 'Ativo'],
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
