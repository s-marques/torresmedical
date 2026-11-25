import type { INestApplication } from '@nestjs/common';
import { veiculoPageSchema, veiculoSchema } from '@torres/shared';
import { Workbook } from 'exceljs';
import request from 'supertest';
import type { Prisma } from '../../src/generated/prisma/client';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/patrimonio-pessoal/veiculos';
const ENTITY = 'Veiculo';
const PERMISSOES = [
  'patrimonio-pessoal.veiculos.ver',
  'patrimonio-pessoal.veiculos.criar',
  'patrimonio-pessoal.veiculos.editar',
  'patrimonio-pessoal.veiculos.excluir',
  'patrimonio-pessoal.veiculos.exportar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const MSG_DESCRICAO = 'Descrição é obrigatória.';

describe('Veículos (e2e)', () => {
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
    descricao: string,
    extra: Omit<Prisma.VeiculoCreateInput, 'descricao'> = {},
  ) {
    return prisma.veiculo.create({ data: { descricao, ...extra } });
  }

  const descricoes = (body: { data: { descricao: string }[] }) => body.data.map((i) => i.descricao);

  describe('GET (listagem)', () => {
    beforeEach(async () => {
      await criarNoBanco('Moto Entrega', {
        tipo: 'MOTO',
        uso: 'MISTO',
        placa: 'MOT0A11',
        ipvaAnual: '800',
        seguroAnual: '1200',
        financiamentoParcela: '600',
      });
      await criarNoBanco('Carro Clínica', {
        placa: 'ABC1D23',
        renavam: 'REN-777',
        chassi: 'CHASSI-XYZ',
        ipvaAnual: '3200',
        seguroAnual: '4100.50',
        financiamentoParcela: '2500',
      });
      await criarNoBanco('Utilitário', { tipo: 'UTILITARIO', uso: 'PESSOAL', ipvaAnual: '5000' });
      await criarNoBanco('Excluído', { deletedAt: new Date() });
    });

    it('padrão: descrição crescente e sem excluídos', async () => {
      const res = await http().get(BASE).expect(200);

      const page = veiculoPageSchema.parse(res.body);
      expect(descricoes(page)).toEqual(['Carro Clínica', 'Moto Entrega', 'Utilitário']);
      expect(page.meta).toEqual({ page: 1, pageSize: 10, total: 3, totalPages: 1 });
      expect(page.data[0]).toMatchObject({
        tipo: 'CARRO',
        uso: 'CLINICA',
        placa: 'ABC1D23',
        ipvaAnual: 3200,
        seguroAnual: 4100.5,
        financiamentoParcela: 2500,
        licenciamento: null,
      });
    });

    it('a busca procura na descrição, na placa, no RENAVAM e no chassi', async () => {
      for (const [search, esperado] of [
        ['moto', ['Moto Entrega']],
        ['abc1d', ['Carro Clínica']],
        ['ren-777', ['Carro Clínica']],
        ['xyz', ['Carro Clínica']],
        ['nada', []],
      ] as const) {
        const res = await http().get(BASE).query({ search }).expect(200);
        expect(descricoes(res.body)).toEqual(esperado);
      }
    });

    it('ordena por cada coluna do grid e pagina', async () => {
      const casos = [
        ['ipvaAnual:desc', ['Utilitário', 'Carro Clínica', 'Moto Entrega']],
        ['seguroAnual:asc', ['Moto Entrega', 'Carro Clínica', 'Utilitário']],
        ['financiamentoParcela:asc', ['Moto Entrega', 'Carro Clínica', 'Utilitário']],
        ['placa:asc', ['Carro Clínica', 'Moto Entrega', 'Utilitário']],
        ['tipo:desc', ['Utilitário', 'Moto Entrega', 'Carro Clínica']],
        ['uso:asc', ['Carro Clínica', 'Utilitário', 'Moto Entrega']],
      ] as const;
      for (const [sort, esperado] of casos) {
        const res = await http().get(BASE).query({ sort }).expect(200);
        expect(descricoes(res.body)).toEqual(esperado);
      }

      const pagina = await http()
        .get(BASE)
        .query({ sort: 'descricao:desc', pageSize: 2, page: 2 })
        .expect(200);
      expect(descricoes(pagina.body)).toEqual(['Carro Clínica']);
      expect(pagina.body.meta).toEqual({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    });

    it('400 para sort fora da whitelist', async () => {
      for (const sort of ['chassi:asc', 'banco:asc']) {
        const res = await http().get(BASE).query({ sort }).expect(400);
        expect(res.body.details.map((d: { field: string }) => d.field)).toEqual(['sort']);
      }
    });
  });

  describe('GET /:id', () => {
    it('200, 404 (inexistente ou excluído) e 400 (id inválido)', async () => {
      const veiculo = await criarNoBanco('Carro', {
        valorCompra: '120000.50',
        ano: 2024,
        dataCompra: new Date('2024-03-10T00:00:00.000Z'),
        vencimentoSeguro: new Date('2027-03-10T00:00:00.000Z'),
      });
      const excluido = await criarNoBanco('X', { deletedAt: new Date() });

      const ok = await http().get(`${BASE}/${veiculo.id}`).expect(200);
      expect(veiculoSchema.parse(ok.body)).toMatchObject({
        id: veiculo.id,
        descricao: 'Carro',
        ano: 2024,
        valorCompra: 120_000.5,
        dataCompra: '2024-03-10',
        vencimentoSeguro: '2027-03-10',
      });
      for (const id of [INEXISTENTE, excluido.id]) {
        const res = await http().get(`${BASE}/${id}`).expect(404);
        expect(res.body).toMatchObject({ code: 'NOT_FOUND', message: 'Veículo não encontrado' });
      }
      await http().get(`${BASE}/abc`).expect(400);
    });
  });

  describe('POST (Novo Veiculo)', () => {
    it('201: só com a descrição o Tipo é Carro e o Uso é Clínica; audita CREATE', async () => {
      const res = await http().post(BASE).send({ descricao: '  Corolla XEi 2024 ' }).expect(201);

      expect(veiculoSchema.parse(res.body)).toMatchObject({
        descricao: 'Corolla XEi 2024',
        tipo: 'CARRO',
        uso: 'CLINICA',
        ano: null,
        valorCompra: null,
        dataCompra: null,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { descricao: 'Corolla XEi 2024', tipo: 'CARRO', uso: 'CLINICA' },
        userId: usuario.id,
      });
    });

    it('201 com as três seções preenchidas', async () => {
      const completo = {
        descricao: 'Fiorino da clínica',
        tipo: 'UTILITARIO',
        placa: 'ABC1D23',
        renavam: '12345678901',
        chassi: '9BWZZZ377VT004251',
        ano: 2023,
        cor: 'Branco',
        uso: 'MISTO',
        valorCompra: 95_000.75,
        dataCompra: '2023-08-15',
        ipvaAnual: 2800,
        licenciamento: 160.5,
        seguroAnual: 3900,
        vencimentoSeguro: '2027-08-15',
        banco: 'Banco Teste',
        financiamentoParcela: 2200.5,
        saldoDevedor: 80_000,
        vencimentoFinanciamento: '2028-08-15',
        observacoes: 'Uso da equipe',
      };

      const res = await http().post(BASE).send(completo).expect(201);

      expect(veiculoSchema.parse(res.body)).toMatchObject(completo);
    });

    it(`400 "${MSG_DESCRICAO}" com a descrição vazia ou ausente, sem auditar`, async () => {
      for (const body of [{ descricao: '' }, { descricao: '   ' }, {}]) {
        const res = await http().post(BASE).send(body).expect(400);
        expect(res.body.details).toEqual([
          expect.objectContaining({ field: 'descricao', message: MSG_DESCRICAO }),
        ]);
      }
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('400 para tipo, uso, valor negativo, ano, data inválida e campo não permitido', async () => {
      const res = await http()
        .post(BASE)
        .send({
          descricao: 'X',
          tipo: 'BARCO',
          uso: 'OUTRO',
          ipvaAnual: -1,
          ano: 1800,
          vencimentoSeguro: '2024-02-31',
          id: 'x',
        })
        .expect(400);

      expect(res.body.details.map((d: { field: string }) => d.field).sort()).toEqual([
        'ano',
        'id',
        'ipvaAnual',
        'tipo',
        'uso',
        'vencimentoSeguro',
      ]);
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('PATCH /:id (Editar Veiculo)', () => {
    it('200: altera os campos e audita UPDATE com before/after', async () => {
      const veiculo = await criarNoBanco('Carro', { ipvaAnual: '3000' });

      const res = await http()
        .patch(`${BASE}/${veiculo.id}`)
        .send({ descricao: 'Carro novo', tipo: 'MOTO', uso: 'PESSOAL', ipvaAnual: 3200 })
        .expect(200);

      expect(res.body).toMatchObject({
        descricao: 'Carro novo',
        tipo: 'MOTO',
        uso: 'PESSOAL',
        ipvaAnual: 3200,
      });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: veiculo.id,
        before: { descricao: 'Carro', tipo: 'CARRO', uso: 'CLINICA' },
        after: { descricao: 'Carro novo', tipo: 'MOTO', uso: 'PESSOAL', ipvaAnual: 3200 },
        userId: usuario.id,
      });
    });

    it('400 sem descrição e 404 inexistente ou excluído, sem auditar', async () => {
      const veiculo = await criarNoBanco('Carro');
      const excluido = await criarNoBanco('X', { deletedAt: new Date() });

      const vazio = await http().patch(`${BASE}/${veiculo.id}`).send({ descricao: '' }).expect(400);
      expect(vazio.body.details[0].message).toBe(MSG_DESCRICAO);
      for (const id of [INEXISTENTE, excluido.id]) {
        await http().patch(`${BASE}/${id}`).send({ descricao: 'Y' }).expect(404);
      }
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('DELETE /:id', () => {
    it('exclusão lógica: 200, audita DELETE e some da listagem', async () => {
      const veiculo = await criarNoBanco('Carro');

      await http().delete(`${BASE}/${veiculo.id}`).expect(200);

      await expectAudit(prisma, {
        action: 'DELETE',
        entity: ENTITY,
        entityId: veiculo.id,
        before: { descricao: 'Carro', deletedAt: null },
        after: null,
        userId: usuario.id,
      });
      expect(
        (await prisma.veiculo.findUniqueOrThrow({ where: { id: veiculo.id } })).deletedAt,
      ).not.toBeNull();
      await http().get(`${BASE}/${veiculo.id}`).expect(404);
      const lista = await http().get(BASE).expect(200);
      expect(descricoes(lista.body)).toEqual([]);
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

    it('xlsx com busca, ordenação e colunas visíveis; audita EXPORT', async () => {
      await criarNoBanco('Moto Entrega', { tipo: 'MOTO', uso: 'MISTO', placa: 'MOT0A11' });
      await criarNoBanco('Carro Clínica', {
        placa: 'ABC1D23',
        ipvaAnual: '3200',
        seguroAnual: '4100.5',
        financiamentoParcela: '2500',
      });
      await criarNoBanco('Utilitário', { tipo: 'UTILITARIO', uso: 'PESSOAL' });

      const res = await binary(
        http().get(`${BASE}/export`).query({
          format: 'xlsx',
          search: 'o',
          sort: 'descricao:asc',
          columns: 'descricao,placa,tipo,uso,ipvaAnual,seguroAnual,financiamentoParcela',
        }),
      ).expect(200);

      const workbook = new Workbook();
      await workbook.xlsx.load(res.body as unknown as ArrayBuffer);
      const rows: unknown[][] = [];
      workbook.worksheets[0]?.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
      expect(rows[0]).toEqual([
        'Descrição',
        'Placa',
        'Tipo',
        'Uso',
        'IPVA',
        'Seguro',
        'Financ. Parcela',
      ]);
      expect(rows.slice(1).map((r) => [r[0], r[2], r[3]])).toEqual([
        ['Carro Clínica', 'Carro', 'Clínica'],
        ['Moto Entrega', 'Moto', 'Misto'],
        ['Utilitário', 'Utilitário', 'Pessoal'],
      ]);
      expect(rows[1]?.slice(4)).toEqual([3200, 4100.5, 2500]);
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
        .query({ format: 'xlsx', columns: 'chassi' })
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
