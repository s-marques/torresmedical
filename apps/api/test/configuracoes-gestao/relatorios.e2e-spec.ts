import { fakerPT_BR as faker } from '@faker-js/faker';
import type { INestApplication } from '@nestjs/common';
import {
  apiErrorSchema,
  catalogoRelatoriosSchema,
  paginaRelatorioSchema,
  PERIODO_INVALIDO,
  type Permissao,
} from '@torres/shared';
import { Workbook } from 'exceljs';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { ENTIDADE_RELATORIO } from '../../src/common/relatorios/relatorios.controller';
import { RELATORIO_EXEMPLO_ID } from '../../src/modules/configuracoes-gestao/relatorios/relatorios-gestao';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/configuracoes-gestao/relatorios';
const EXEMPLO = `${BASE}/${RELATORIO_EXEMPLO_ID}`;
const TELA_VER = 'configuracoes-gestao.relatorios.ver';
const TELA_EXPORTAR = 'configuracoes-gestao.relatorios.exportar';
const DADOS_VER = 'configuracoes-gestao.minha-empresa.ver';
const TODAS: readonly Permissao[] = [TELA_VER, TELA_EXPORTAR, DADOS_VER];
const OUTUBRO = { de: '2026-10-01', ate: '2026-10-31' };

/** Instante em São Paulo (UTC-3), como o usuário vê. */
function emSaoPaulo(dataHora: string): Date {
  return new Date(`${dataHora}-03:00`);
}

describe('Relatórios: infraestrutura e relatório de exemplo (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let empresaId: string;
  let usuario: UsuarioTeste;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    empresaId = (
      await prisma.empresa.create({
        data: { nome: faker.company.name(), documento: faker.string.numeric(14) },
      })
    ).id;
    usuario = await criarUsuarioTeste(app, { permissoes: TODAS, empresaId });
    const unidades = [
      // Primeiro e último instantes de outubro no fuso da clínica entram; os vizinhos, não.
      { nome: 'Centro', createdAt: emSaoPaulo('2026-10-01T00:00:00') },
      { nome: 'Barra', createdAt: emSaoPaulo('2026-10-15T12:00:00'), ativo: false },
      { nome: 'Asa Norte', createdAt: emSaoPaulo('2026-10-31T23:59:59') },
      { nome: 'Setembro', createdAt: emSaoPaulo('2026-09-30T23:59:59') },
      { nome: 'Novembro', createdAt: emSaoPaulo('2026-11-01T00:00:00') },
      { nome: 'Excluída', createdAt: emSaoPaulo('2026-10-10T10:00:00'), deletedAt: new Date() },
    ];
    await prisma.unidade.createMany({ data: unidades.map((u) => ({ ...u, empresaId })) });
  });

  afterAll(async () => {
    await app.close();
  });

  function http(quem: UsuarioTeste = usuario) {
    return comUsuario(app, quem);
  }

  function nomes(body: { data: Record<string, unknown>[] }): unknown[] {
    return body.data.map((linha) => linha.nome);
  }

  describe('GET /relatorios (catálogo)', () => {
    it('lista o relatório com colunas e filtros para o front montar o grid', async () => {
      const res = await http().get(BASE).expect(200);

      expect(catalogoRelatoriosSchema.parse(res.body)).toEqual({
        data: [
          {
            id: RELATORIO_EXEMPLO_ID,
            nome: 'Unidades cadastradas no período',
            colunas: [
              { id: 'nome', titulo: 'Nome', tipo: 'text', ordenavel: true },
              { id: 'status', titulo: 'Status', tipo: 'text', ordenavel: true },
              { id: 'createdAt', titulo: 'Criado em', tipo: 'datetime', ordenavel: true },
            ],
            filtros: [
              {
                tipo: 'select',
                parametro: 'status',
                rotulo: 'Status',
                opcoes: [
                  { valor: 'ativo', rotulo: 'Ativo' },
                  { valor: 'inativo', rotulo: 'Inativo' },
                ],
              },
            ],
          },
        ],
      });
    });

    it('sem a permissão do relatório, ele não aparece', async () => {
      const semDados = await criarUsuarioTeste(app, { permissoes: [TELA_VER], empresaId });

      const res = await http(semDados).get(BASE).expect(200);

      expect(res.body).toEqual({ data: [] });
    });
  });

  describe('GET /relatorios/:id (resultado)', () => {
    it('filtra pelo período no fuso da clínica (dias inteiros), sem as excluídas', async () => {
      const res = await http().get(EXEMPLO).query(OUTUBRO).expect(200);

      const pagina = paginaRelatorioSchema.parse(res.body);
      expect(pagina.data).toEqual([
        { nome: 'Centro', status: 'Ativo', createdAt: '2026-10-01T03:00:00.000Z' },
        { nome: 'Barra', status: 'Inativo', createdAt: '2026-10-15T15:00:00.000Z' },
        { nome: 'Asa Norte', status: 'Ativo', createdAt: '2026-11-01T02:59:59.000Z' },
      ]);
      expect(pagina.meta).toEqual({ page: 1, pageSize: 10, total: 3, totalPages: 1 });
    });

    it('um dia só: De igual a Até', async () => {
      const res = await http()
        .get(EXEMPLO)
        .query({ de: '2026-10-15', ate: '2026-10-15' })
        .expect(200);

      expect(nomes(res.body)).toEqual(['Barra']);
    });

    it('pagina, ordena pela whitelist e aplica o filtro extra', async () => {
      const pagina2 = await http()
        .get(EXEMPLO)
        .query({ ...OUTUBRO, sort: 'nome:asc', page: 2, pageSize: 2 })
        .expect(200);
      expect(nomes(pagina2.body)).toEqual(['Centro']);
      expect(pagina2.body.meta).toEqual({ page: 2, pageSize: 2, total: 3, totalPages: 2 });

      const inativas = await http()
        .get(EXEMPLO)
        .query({ ...OUTUBRO, status: 'inativo' })
        .expect(200);
      expect(nomes(inativas.body)).toEqual(['Barra']);
    });

    it('400 com De depois de Até, na mensagem do schema compartilhado', async () => {
      const res = await http()
        .get(EXEMPLO)
        .query({ de: '2026-10-31', ate: '2026-10-01' })
        .expect(400);

      expect(apiErrorSchema.parse(res.body)).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: [expect.objectContaining({ field: 'ate', message: PERIODO_INVALIDO })],
      });
    });

    it('400 sem período, com data inválida, sort fora da whitelist ou filtro inválido', async () => {
      const semPeriodo = await http().get(EXEMPLO).expect(400);
      expect(semPeriodo.body.details).toEqual([
        expect.objectContaining({ field: 'de', message: 'Informe a data inicial' }),
        expect.objectContaining({ field: 'ate', message: 'Informe a data final' }),
      ]);

      const invalidos = await http()
        .get(EXEMPLO)
        .query({ de: '2026-02-30', ate: '2026-10-31', sort: 'empresaId:asc', status: 'todos' })
        .expect(400);
      expect(invalidos.body.details.map((d: { field: string }) => d.field)).toEqual([
        'de',
        'sort',
        'status',
      ]);
    });

    it('404 para relatório inexistente', async () => {
      const res = await http().get(`${BASE}/XX-99`).query(OUTUBRO).expect(404);

      expect(res.body).toMatchObject({
        code: 'RELATORIO_NAO_ENCONTRADO',
        message: 'Relatório não encontrado',
      });
    });

    it('403 sem a permissão do relatório, mesmo com a da tela', async () => {
      const semDados = await criarUsuarioTeste(app, {
        permissoes: [TELA_VER, TELA_EXPORTAR],
        empresaId,
      });

      const res = await http(semDados).get(EXEMPLO).query(OUTUBRO).expect(403);

      expect(res.body).toMatchObject({ code: 'FORBIDDEN', message: 'Sem permissão' });
    });
  });

  describe('GET /relatorios/:id/export', () => {
    function binary(req: request.Test) {
      return req.buffer(true).parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    }

    async function lerXlsx(buffer: Buffer) {
      const workbook = new Workbook();
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
      const sheet = workbook.worksheets[0];
      const linhas: unknown[][] = [];
      sheet?.eachRow((row) => linhas.push((row.values as unknown[]).slice(1)));
      return { titulo: sheet?.name, linhas };
    }

    it('xlsx do período com as colunas pedidas; audita EXPORT com o id do relatório', async () => {
      const query = { ...OUTUBRO, format: 'xlsx', sort: 'nome:desc', columns: 'nome,status' };

      const res = await binary(http().get(`${EXEMPLO}/export`).query(query)).expect(200);

      expect(res.headers['content-type']).toContain('spreadsheetml');
      expect(res.headers['content-disposition']).toMatch(
        /^attachment; filename="relatorio-ex-01-\d{4}-\d{2}-\d{2}\.xlsx"/,
      );
      expect((await lerXlsx(res.body as Buffer)).linhas).toEqual([
        ['Nome', 'Status'],
        ['Centro', 'Ativo'],
        ['Barra', 'Inativo'],
        ['Asa Norte', 'Ativo'],
      ]);
      await expectAudit(prisma, {
        action: 'EXPORT',
        entity: ENTIDADE_RELATORIO,
        entityId: RELATORIO_EXEMPLO_ID,
        before: null,
        after: { filtros: query },
        userId: usuario.id,
      });
    });

    it('pdf com todas as colunas por padrão', async () => {
      const res = await binary(
        http()
          .get(`${EXEMPLO}/export`)
          .query({ ...OUTUBRO, format: 'pdf' }),
      ).expect(200);

      expect(res.headers['content-type']).toBe('application/pdf');
      expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      await expectAudit(prisma, {
        action: 'EXPORT',
        entity: ENTIDADE_RELATORIO,
        entityId: RELATORIO_EXEMPLO_ID,
      });
    });

    it('400 para período invertido, formato ou colunas inválidos, sem auditar', async () => {
      const res = await http()
        .get(`${EXEMPLO}/export`)
        .query({ de: '2026-10-31', ate: '2026-10-01', format: 'csv', columns: 'nome,senha' })
        .expect(400);

      expect(res.body.details.map((d: { field: string }) => d.field)).toEqual([
        'format',
        'columns',
      ]);
      const invertido = await http()
        .get(`${EXEMPLO}/export`)
        .query({ de: '2026-10-31', ate: '2026-10-01', format: 'pdf' })
        .expect(400);
      expect(invertido.body.details).toEqual([
        expect.objectContaining({ field: 'ate', message: PERIODO_INVALIDO }),
      ]);
      await expectNoAudit(prisma, { entity: ENTIDADE_RELATORIO });
    });

    it('404 para relatório inexistente, sem auditar', async () => {
      await http()
        .get(`${BASE}/XX-99/export`)
        .query({ ...OUTUBRO, format: 'pdf' })
        .expect(404);

      await expectNoAudit(prisma, { entity: ENTIDADE_RELATORIO });
    });

    it('403 sem a permissão do relatório, sem auditar', async () => {
      const semDados = await criarUsuarioTeste(app, {
        permissoes: [TELA_VER, TELA_EXPORTAR],
        empresaId,
      });

      await http(semDados)
        .get(`${EXEMPLO}/export`)
        .query({ ...OUTUBRO, format: 'pdf' })
        .expect(403);

      await expectNoAudit(prisma, { entity: ENTIDADE_RELATORIO });
    });
  });

  describe('acesso pela tela', () => {
    const ROTAS = [
      { caminho: BASE, falta: TELA_VER },
      { caminho: `${EXEMPLO}?de=2026-10-01&ate=2026-10-31`, falta: TELA_VER },
      {
        caminho: `${EXEMPLO}/export?de=2026-10-01&ate=2026-10-31&format=pdf`,
        falta: TELA_EXPORTAR,
      },
    ] as const;

    it.each(ROTAS)('$caminho sem token responde 401', async ({ caminho }) => {
      const res = await request(app.getHttpServer()).get(caminho).expect(401);

      expect(res.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    });

    it.each(ROTAS)('$caminho sem $falta responde 403, sem auditar', async ({ caminho, falta }) => {
      const semTela = await criarUsuarioTeste(app, {
        permissoes: TODAS.filter((permissao) => permissao !== falta),
        empresaId,
      });

      const res = await http(semTela).get(caminho).expect(403);

      expect(res.body).toMatchObject({ code: 'FORBIDDEN' });
      await expectNoAudit(prisma, { entity: ENTIDADE_RELATORIO });
    });
  });
});
