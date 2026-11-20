import type { INestApplication } from '@nestjs/common';
import {
  receitaProfissionalPageSchema,
  receitaProfissionalSchema,
  resumoReceitaProfissionaisSchema,
} from '@torres/shared';
import { Workbook } from 'exceljs';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/gestao-profissionais/receita-profissionais';
const ENTITY = 'ContaReceber';
const PERMISSOES = [
  'gestao-profissionais.receita-profissionais.ver',
  'gestao-profissionais.receita-profissionais.editar',
  'gestao-profissionais.receita-profissionais.excluir',
  'gestao-profissionais.receita-profissionais.exportar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const SOMENTE_VER = ['gestao-profissionais.receita-profissionais.ver'] as const;

describe('Receita Profissionais (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;
  let ana: string;
  let beto: string;
  let paciente: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
    ana = (await prisma.profissional.create({ data: { nome: 'Dra. Ana Teste' } })).id;
    beto = (await prisma.profissional.create({ data: { nome: 'Dra. Beta Teste' } })).id;
    paciente = (await prisma.paciente.create({ data: { nome: 'Paciente Teste' } })).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => comUsuario(app, usuario);

  function criarReceita(
    descricao: string,
    extra: Partial<{
      profissionalId: string | null;
      valor: string;
      dataVencimento: Date;
      status: 'PENDENTE' | 'RECEBIDO' | 'CANCELADO';
      pacienteId: string;
      deletedAt: Date;
    }> = {},
  ) {
    return prisma.contaReceber.create({
      data: {
        descricao,
        profissionalId: ana,
        valor: '100.00',
        dataVencimento: new Date('2026-10-10'),
        status: 'RECEBIDO',
        dataRecebimento: new Date('2026-10-10'),
        ...extra,
      },
    });
  }

  describe('GET (listagem)', () => {
    it('lista só receitas de profissional, sem excluídas nem canceladas, mais recentes primeiro', async () => {
      await criarReceita('Antiga', { dataVencimento: new Date('2026-09-01') });
      await criarReceita('Recente', { dataVencimento: new Date('2026-10-20') });
      await criarReceita('Do Torres', { profissionalId: null });
      await criarReceita('Excluída', { deletedAt: new Date() });
      await criarReceita('Cancelada', { status: 'CANCELADO' });

      const res = await http().get(BASE).expect(200);
      const pagina = receitaProfissionalPageSchema.parse(res.body);
      expect(pagina.meta.total).toBe(2);
      expect(pagina.data.map((r) => r.descricao)).toEqual(['Recente', 'Antiga']);
      expect(pagina.data[0]).toMatchObject({ profissionalNome: 'Dra. Ana Teste' });
    });

    it('filtra por profissional, status, forma de pagamento, período e busca', async () => {
      const pix = await prisma.formaPagamento.create({
        data: { nome: 'PIX', finalidade: 'RECEBER', tipo: 'PIX' },
      });
      await criarReceita('Consulta Ana', { pacienteId: paciente });
      await criarReceita('Retorno Beto', {
        profissionalId: beto,
        status: 'PENDENTE',
        dataVencimento: new Date('2026-01-05'),
      });
      await prisma.contaReceber.updateMany({
        where: { descricao: 'Consulta Ana' },
        data: { formaPagamentoId: pix.id },
      });
      const nomes = async (query: Record<string, string>) =>
        (await http().get(BASE).query(query).expect(200)).body.data.map(
          (r: { descricao: string }) => r.descricao,
        );

      expect(await nomes({ profissionalId: beto })).toEqual(['Retorno Beto']);
      expect(await nomes({ status: 'RECEBIDO' })).toEqual(['Consulta Ana']);
      expect(await nomes({ status: 'VENCIDO' })).toEqual(['Retorno Beto']);
      expect(await nomes({ formaPagamentoId: pix.id })).toEqual(['Consulta Ana']);
      expect(await nomes({ vencimentoDe: '2026-10-01', vencimentoAte: '2026-10-31' })).toEqual([
        'Consulta Ana',
      ]);
      expect(await nomes({ search: 'paciente teste' })).toEqual(['Consulta Ana']);
      expect(await nomes({ search: 'dra. beta' })).toEqual(['Retorno Beto']);
    });

    it('ordena por profissional, paciente e valor, e pagina', async () => {
      await criarReceita('A', { profissionalId: beto, valor: '10.00' });
      await criarReceita('B', { profissionalId: ana, valor: '30.00' });
      await criarReceita('C', { profissionalId: ana, valor: '20.00' });
      const ordenar = async (sort: string) =>
        (await http().get(BASE).query({ sort }).expect(200)).body.data.map(
          (r: { descricao: string }) => r.descricao,
        );
      expect(await ordenar('valor:asc')).toEqual(['A', 'C', 'B']);
      expect(await ordenar('valor:desc')).toEqual(['B', 'C', 'A']);
      expect((await ordenar('profissional:asc'))[2]).toBe('A');
      expect(await ordenar('paciente:asc')).toHaveLength(3);

      const pagina2 = await http().get(BASE).query({ pageSize: 2, page: 2 }).expect(200);
      expect(pagina2.body.data).toHaveLength(1);
      expect(pagina2.body.meta).toMatchObject({ total: 3, totalPages: 2 });
    });

    it('400 com filtro ou ordenação inválidos; 403 sem permissão', async () => {
      await http().get(BASE).query({ status: 'x' }).expect(400);
      await http().get(BASE).query({ sort: 'descricao:asc' }).expect(400);
      await http().get(BASE).query({ profissionalId: 'x' }).expect(400);
      const sem = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, sem).get(BASE).expect(403);
    });

    it('Contas a Receber do Torres não traz as receitas dos profissionais', async () => {
      const receita = await criarReceita('Receita do médico');
      const torres = await criarReceita('Mensalidade', { profissionalId: null });
      const financeiro = await criarUsuarioTeste(app, {
        permissoes: ['financeiro.contas-receber.ver'],
      });
      const res = await comUsuario(app, financeiro)
        .get('/api/financeiro/contas-receber')
        .expect(200);
      expect(res.body.data.map((c: { id: string }) => c.id)).toEqual([torres.id]);
      await comUsuario(app, financeiro)
        .get(`/api/financeiro/contas-receber/${receita.id}`)
        .expect(404);
    });
  });

  describe('escopo por profissional (#153)', () => {
    async function restrito(profissionalIds: string[]) {
      return comUsuario(
        app,
        await criarUsuarioTeste(app, {
          permissoes: [...PERMISSOES],
          escopoDados: 'PROFISSIONAIS_VINCULADOS',
          profissionalIds,
        }),
      );
    }

    it('vê só as receitas dos profissionais vinculados; fora do escopo é 403', async () => {
      const daAna = await criarReceita('Da Ana');
      const doBeto = await criarReceita('Do Beto', { profissionalId: beto });
      const comoAna = await restrito([ana]);

      const lista = await comoAna.get(BASE).expect(200);
      expect(lista.body.data.map((r: { id: string }) => r.id)).toEqual([daAna.id]);
      await comoAna.get(BASE).query({ profissionalId: beto }).expect(403);
      await comoAna.get(`${BASE}/${doBeto.id}`).expect(403);
      await comoAna
        .patch(`${BASE}/${daAna.id}`)
        .send(corpo({ profissionalId: beto }))
        .expect(403);
      await comoAna.delete(`${BASE}/${doBeto.id}`).expect(403);
      await comoAna.post(`${BASE}/${doBeto.id}/estornar-baixa`).expect(403);

      const resumo = await comoAna.get(`${BASE}/resumo`).expect(200);
      expect(resumo.body).toMatchObject({ registros: 1, totalRecebido: '100.00' });
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('sem vínculo não vê nenhuma receita', async () => {
      await criarReceita('Da Ana');
      const semVinculo = await restrito([]);
      const lista = await semVinculo.get(BASE).expect(200);
      expect(lista.body.meta.total).toBe(0);
    });
  });

  describe('GET /resumo', () => {
    it('soma recebido e pendente, conta registros e agrupa por profissional', async () => {
      await criarReceita('A', { valor: '250.00' });
      await criarReceita('B', { valor: '100.50', status: 'PENDENTE' });
      await criarReceita('C', { profissionalId: beto, valor: '70.00' });
      await criarReceita('Cancelada', { status: 'CANCELADO', valor: '999.00' });
      await criarReceita('Do Torres', { profissionalId: null });

      const res = await http().get(`${BASE}/resumo`).expect(200);
      expect(resumoReceitaProfissionaisSchema.parse(res.body)).toEqual({
        totalRecebido: '320.00',
        totalPendente: '100.50',
        registros: 3,
        porProfissional: [
          {
            profissionalId: ana,
            profissionalNome: 'Dra. Ana Teste',
            totalRecebido: '250.00',
            registros: 2,
          },
          {
            profissionalId: beto,
            profissionalNome: 'Dra. Beta Teste',
            totalRecebido: '70.00',
            registros: 1,
          },
        ],
      });

      const filtrado = await http()
        .get(`${BASE}/resumo`)
        .query({ profissionalId: beto })
        .expect(200);
      expect(filtrado.body).toMatchObject({ registros: 1, totalRecebido: '70.00' });
    });

    it('zera tudo sem receitas; 400 e 403', async () => {
      const res = await http().get(`${BASE}/resumo`).expect(200);
      expect(res.body).toEqual({
        totalRecebido: '0.00',
        totalPendente: '0.00',
        registros: 0,
        porProfissional: [],
      });
      await http().get(`${BASE}/resumo`).query({ vencimentoDe: 'x' }).expect(400);
      const sem = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, sem).get(`${BASE}/resumo`).expect(403);
    });
  });

  describe('GET /:id (Detalhar)', () => {
    it('200; 404 para excluída, inexistente ou conta do Torres; 403 sem permissão', async () => {
      const receita = await criarReceita('Consulta');
      const excluida = await criarReceita('Excluída', { deletedAt: new Date() });
      const doTorres = await criarReceita('Mensalidade', { profissionalId: null });

      const ok = await http().get(`${BASE}/${receita.id}`).expect(200);
      expect(receitaProfissionalSchema.parse(ok.body)).toMatchObject({
        descricao: 'Consulta',
        profissionalId: ana,
      });
      await http().get(`${BASE}/${excluida.id}`).expect(404);
      await http().get(`${BASE}/${doTorres.id}`).expect(404);
      await http().get(`${BASE}/${INEXISTENTE}`).expect(404);
      await http().get(`${BASE}/x`).expect(400);
      const sem = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, sem).get(`${BASE}/${receita.id}`).expect(403);
    });
  });

  function corpo(extra: Record<string, unknown> = {}) {
    return {
      descricao: 'Consulta Corrigida',
      valor: 120,
      dataVencimento: '2026-10-12',
      status: 'RECEBIDO',
      profissionalId: ana,
      ...extra,
    };
  }

  describe('PATCH /:id (Editar)', () => {
    it('200: altera, troca de profissional e audita UPDATE com before/after', async () => {
      const receita = await criarReceita('Consulta');
      const res = await http()
        .patch(`${BASE}/${receita.id}`)
        .send(corpo({ profissionalId: beto }))
        .expect(200);
      expect(receitaProfissionalSchema.parse(res.body)).toMatchObject({
        descricao: 'Consulta Corrigida',
        valor: '120',
        profissionalNome: 'Dra. Beta Teste',
      });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: receita.id,
        before: { descricao: 'Consulta', profissionalId: ana },
        after: { descricao: 'Consulta Corrigida', profissionalId: beto },
        userId: usuario.id,
      });
    });

    it('400 sem profissional ou com campo obrigatório vazio, sem auditar', async () => {
      const receita = await criarReceita('Consulta');
      const semProfissional = await http()
        .patch(`${BASE}/${receita.id}`)
        .send(corpo({ profissionalId: undefined }))
        .expect(400);
      expect(semProfissional.body.details).toEqual([
        expect.objectContaining({
          field: 'profissionalId',
          message: 'Profissional é obrigatório.',
        }),
      ]);
      await http()
        .patch(`${BASE}/${receita.id}`)
        .send(corpo({ descricao: '' }))
        .expect(400);
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('404 para inexistente ou conta do Torres; 403 sem permissão de editar', async () => {
      const doTorres = await criarReceita('Mensalidade', { profissionalId: null });
      await http().patch(`${BASE}/${INEXISTENTE}`).send(corpo()).expect(404);
      await http().patch(`${BASE}/${doTorres.id}`).send(corpo()).expect(404);
      const receita = await criarReceita('Consulta');
      const leitor = await criarUsuarioTeste(app, { permissoes: [...SOMENTE_VER] });
      await comUsuario(app, leitor).patch(`${BASE}/${receita.id}`).send(corpo()).expect(403);
    });
  });

  describe('POST /:id/estornar-baixa', () => {
    it('200: volta para Pendente, limpa conta e data, e audita UPDATE', async () => {
      const banco = await prisma.contaBancaria.create({ data: { nome: 'Banco Teste' } });
      const receita = await criarReceita('Consulta', {});
      await prisma.contaReceber.update({
        where: { id: receita.id },
        data: { contaBancariaId: banco.id },
      });
      const res = await http().post(`${BASE}/${receita.id}/estornar-baixa`).expect(200);
      expect(res.body).toMatchObject({
        status: 'PENDENTE',
        contaBancariaId: null,
        dataRecebimento: null,
      });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: receita.id,
        before: { status: 'RECEBIDO', contaBancariaId: banco.id },
        after: { status: 'PENDENTE', contaBancariaId: null },
        userId: usuario.id,
      });
    });

    it('422 se a receita não está recebida; 404; 403', async () => {
      const pendente = await criarReceita('Pendente', { status: 'PENDENTE' });
      const res = await http().post(`${BASE}/${pendente.id}/estornar-baixa`).expect(422);
      expect(res.body.code).toBe('RECEITA_NAO_RECEBIDA');
      await http().post(`${BASE}/${INEXISTENTE}/estornar-baixa`).expect(404);
      const leitor = await criarUsuarioTeste(app, { permissoes: [...SOMENTE_VER] });
      await comUsuario(app, leitor).post(`${BASE}/${pendente.id}/estornar-baixa`).expect(403);
    });
  });

  describe('DELETE /:id', () => {
    it('200: exclusão lógica e audita DELETE', async () => {
      const receita = await criarReceita('Consulta');
      await http().delete(`${BASE}/${receita.id}`).expect(200);
      const banco = await prisma.contaReceber.findUniqueOrThrow({ where: { id: receita.id } });
      expect(banco.deletedAt).not.toBeNull();
      await http().get(`${BASE}/${receita.id}`).expect(404);
      await expectAudit(prisma, {
        action: 'DELETE',
        entity: ENTITY,
        entityId: receita.id,
        before: { descricao: 'Consulta' },
        after: null,
        userId: usuario.id,
      });
    });

    it('404 para inexistente; 403 sem permissão de excluir', async () => {
      await http().delete(`${BASE}/${INEXISTENTE}`).expect(404);
      const receita = await criarReceita('Consulta');
      const leitor = await criarUsuarioTeste(app, { permissoes: [...SOMENTE_VER] });
      await comUsuario(app, leitor).delete(`${BASE}/${receita.id}`).expect(403);
    });
  });

  describe('GET /export (Excel/PDF)', () => {
    it('xlsx com as receitas e audita EXPORT', async () => {
      await criarReceita('CONSULTA ESPECIAL', { pacienteId: paciente });
      const res = await http()
        .get(`${BASE}/export`)
        .query({ format: 'xlsx', columns: 'profissional,paciente,valor' })
        .buffer(true)
        .parse(binario)
        .expect(200);
      const wb = new Workbook();
      await wb.xlsx.load(res.body);
      const linhas = JSON.stringify(wb.worksheets[0]?.getSheetValues() ?? []);
      expect(linhas).toContain('Dra. Ana Teste');
      expect(linhas).toContain('Paciente Teste');
      const auditoria = await prisma.auditLog.findMany({
        where: { entity: ENTITY, action: 'EXPORT' },
      });
      expect(auditoria).toHaveLength(1);
    });

    it('400 sem formato ou com coluna inválida; 403 sem permissão de exportar', async () => {
      await http().get(`${BASE}/export`).expect(400);
      await http().get(`${BASE}/export`).query({ format: 'xlsx', columns: 'x' }).expect(400);
      const leitor = await criarUsuarioTeste(app, { permissoes: [...SOMENTE_VER] });
      await comUsuario(app, leitor).get(`${BASE}/export`).query({ format: 'xlsx' }).expect(403);
    });
  });
});

function binario(res: request.Response, cb: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}
