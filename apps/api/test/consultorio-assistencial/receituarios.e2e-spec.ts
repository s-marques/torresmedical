import type { INestApplication } from '@nestjs/common';
import {
  historicoClinicoPageSchema,
  prescricaoPageSchema,
  prescricaoSchema,
  receituarioBlocoPageSchema,
  receituarioBlocoSchema,
} from '@torres/shared';
import { Workbook } from 'exceljs';
import type request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/consultorio-assistencial/receituarios';
const BLOCOS = `${BASE}/blocos`;
const PRESCRICOES = `${BASE}/prescricoes`;
const PERMISSOES = [
  'consultorio-assistencial.receituarios.ver',
  'consultorio-assistencial.receituarios.criar',
  'consultorio-assistencial.receituarios.exportar',
  'configuracoes-gestao.dados-pessoais.exportar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

describe('Receituários (e2e)', () => {
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

  const http = () => comUsuario(app, usuario);
  const profissional = (nome: string) => prisma.profissional.create({ data: { nome } });
  const paciente = (nome: string) => prisma.paciente.create({ data: { nome } });

  async function bloco(extra: Record<string, unknown> = {}) {
    return prisma.receituarioBloco.create({
      data: { tipo: 'AMARELA', numeroInicio: 1, numeroFim: 20, ...extra },
    });
  }

  function prescrever(blocoId: string, pacienteId: string, extra = {}) {
    return http()
      .post(PRESCRICOES)
      .send({ blocoId, pacienteId, medicacao: 'Medicamento X 10mg', ...extra });
  }

  describe('POST /blocos (Novo Bloco)', () => {
    it('201: nasce Ativo, 0/total, com o nome do médico, e audita CREATE', async () => {
      const medico = await profissional('Dra. Teste Alfa');
      const res = await http()
        .post(BLOCOS)
        .send({
          tipo: 'AMARELA',
          numeroInicio: 1,
          numeroFim: 20,
          localizacao: 'Consultorio 1, Gaveta B',
          profissionalId: medico.id,
          dataRecebimento: '2026-11-10',
        })
        .expect(201);
      expect(receituarioBlocoSchema.parse(res.body)).toMatchObject({
        status: 'ATIVO',
        usados: 0,
        total: 20,
        profissionalNome: 'Dra. Teste Alfa',
        dataRecebimento: '2026-11-10',
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'ReceituarioBloco',
        entityId: res.body.id,
        before: null,
        after: { tipo: 'AMARELA', numeroInicio: 1, numeroFim: 20 },
        userId: usuario.id,
      });
    });

    it('400 com o formulário vazio e fim menor que início, sem auditar', async () => {
      const vazio = await http().post(BLOCOS).send({ tipo: '' }).expect(400);
      expect(vazio.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'tipo', message: 'Tipo é obrigatório.' }),
          expect.objectContaining({
            field: 'numeroInicio',
            message: 'Número início é obrigatório.',
          }),
          expect.objectContaining({ field: 'numeroFim', message: 'Número fim é obrigatório.' }),
        ]),
      );
      const invertido = await http()
        .post(BLOCOS)
        .send({ tipo: 'AZUL', numeroInicio: 10, numeroFim: 5 })
        .expect(400);
      expect(invertido.body.details).toEqual([
        expect.objectContaining({
          field: 'numeroFim',
          message: 'Número fim deve ser maior ou igual ao início',
        }),
      ]);
      await expectNoAudit(prisma, { entity: 'ReceituarioBloco' });
    });

    it('409 com faixa sobreposta no mesmo tipo; outro tipo pode repetir a faixa', async () => {
      await bloco({ numeroInicio: 1, numeroFim: 20 });
      const res = await http()
        .post(BLOCOS)
        .send({ tipo: 'AMARELA', numeroInicio: 20, numeroFim: 40 })
        .expect(409);
      expect(res.body).toMatchObject({
        code: 'FAIXA_SOBREPOSTA',
        message: 'Já existe bloco deste tipo com numeração nesta faixa',
      });
      await http().post(BLOCOS).send({ tipo: 'AZUL', numeroInicio: 1, numeroFim: 20 }).expect(201);
      await http()
        .post(BLOCOS)
        .send({ tipo: 'AMARELA', numeroInicio: 21, numeroFim: 40 })
        .expect(201);
    });

    it('404 com médico inexistente; 403 sem a permissão de criar', async () => {
      await http()
        .post(BLOCOS)
        .send({ tipo: 'AZUL', numeroInicio: 1, numeroFim: 2, profissionalId: INEXISTENTE })
        .expect(404);
      const soVer = await criarUsuarioTeste(app, {
        permissoes: ['consultorio-assistencial.receituarios.ver'],
      });
      await comUsuario(app, soVer)
        .post(BLOCOS)
        .send({ tipo: 'AZUL', numeroInicio: 1, numeroFim: 2 })
        .expect(403);
      await expectNoAudit(prisma, { entity: 'ReceituarioBloco' });
    });
  });

  describe('GET /blocos', () => {
    it('filtra por tipo e status, busca e ordena pelo médico', async () => {
      const zeca = await profissional('Zeca Teste');
      const ana = await profissional('Ana Teste');
      const b1 = await bloco({ profissionalId: zeca.id, localizacao: 'Gaveta A' });
      const b2 = await bloco({
        tipo: 'AZUL',
        numeroInicio: 100,
        numeroFim: 150,
        profissionalId: ana.id,
      });
      const b3 = await bloco({ tipo: 'BRANCA', status: 'FINALIZADO', usados: 20 });

      const todos = await http().get(BLOCOS).query({ sort: 'medico:asc' }).expect(200);
      const pagina = receituarioBlocoPageSchema.parse(todos.body);
      expect(pagina.data.map((b) => b.id)).toEqual([b2.id, b1.id, b3.id]);
      expect(pagina.meta.total).toBe(3);
      expect(pagina.data[2]).toMatchObject({ usados: 20, total: 20, profissionalNome: null });

      const ids = async (query: Record<string, string>) =>
        (await http().get(BLOCOS).query(query).expect(200)).body.data.map(
          (b: { id: string }) => b.id,
        );
      expect(await ids({ tipo: 'AZUL' })).toEqual([b2.id]);
      expect(await ids({ status: 'FINALIZADO' })).toEqual([b3.id]);
      expect(await ids({ search: 'gaveta' })).toEqual([b1.id]);
      expect(await ids({ search: 'Ana' })).toEqual([b2.id]);
      expect(await ids({ search: '120' })).toEqual([b2.id]);
      expect(await ids({ sort: 'medico:asc', page: '2', pageSize: '1' })).toEqual([b1.id]);
    });

    it('400 com ordenação fora da whitelist; 403 sem ver', async () => {
      await http().get(BLOCOS).query({ sort: 'numeracao:asc' }).expect(400);
      const sem = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, sem).get(BLOCOS).expect(403);
    });

    it('GET /disponiveis: só Ativos com médico', async () => {
      const medico = await profissional('Dra. Teste');
      const ativo = await bloco({ profissionalId: medico.id });
      await bloco({ tipo: 'AZUL' });
      await bloco({ tipo: 'BRANCA', profissionalId: medico.id, status: 'FINALIZADO' });
      const res = await http().get(`${BLOCOS}/disponiveis`).expect(200);
      expect(res.body.map((b: { id: string }) => b.id)).toEqual([ativo.id]);
    });
  });

  describe('POST /prescricoes (Nova Prescricao)', () => {
    it('201: próxima folha do bloco, médico do bloco e audita CREATE', async () => {
      const medico = await profissional('Dr. Teste Beta');
      const p = await paciente('Paciente Teste Um');
      const b = await bloco({ numeroInicio: 51, numeroFim: 60, profissionalId: medico.id });

      const res = await prescrever(b.id, p.id, {
        posologia: '1 comprimido à noite',
        dataPrescricao: '2026-11-18',
      }).expect(201);
      expect(prescricaoSchema.parse(res.body)).toMatchObject({
        numero: 51,
        tipo: 'AMARELA',
        pacienteNome: 'Paciente Teste Um',
        profissionalId: medico.id,
        profissionalNome: 'Dr. Teste Beta',
        dataPrescricao: '2026-11-18',
        atendimentoId: null,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'Prescricao',
        entityId: res.body.id,
        before: null,
        after: { numero: 51, medicacao: 'Medicamento X 10mg' },
        userId: usuario.id,
      });

      const segunda = await prescrever(b.id, p.id).expect(201);
      expect(segunda.body).toMatchObject({
        numero: 52,
        dataPrescricao: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
      expect(await prisma.receituarioBloco.findUnique({ where: { id: b.id } })).toMatchObject({
        usados: 2,
        status: 'ATIVO',
      });
    });

    it('a última folha finaliza o bloco; depois disso, 422', async () => {
      const medico = await profissional('Dr. Teste');
      const p = await paciente('Paciente Teste');
      const b = await bloco({ numeroInicio: 7, numeroFim: 8, profissionalId: medico.id });
      await prescrever(b.id, p.id).expect(201);
      const ultima = await prescrever(b.id, p.id).expect(201);
      expect(ultima.body.numero).toBe(8);
      expect(await prisma.receituarioBloco.findUnique({ where: { id: b.id } })).toMatchObject({
        usados: 2,
        status: 'FINALIZADO',
      });
      const res = await prescrever(b.id, p.id).expect(422);
      expect(res.body).toMatchObject({
        code: 'BLOCO_INDISPONIVEL',
        message: 'Bloco finalizado não aceita novas prescrições',
      });
    });

    it('prescrições simultâneas recebem folhas diferentes', async () => {
      const medico = await profissional('Dr. Teste');
      const p = await paciente('Paciente Teste');
      const b = await bloco({ numeroInicio: 1, numeroFim: 3, profissionalId: medico.id });
      const respostas = await Promise.all([1, 2, 3, 4].map(() => prescrever(b.id, p.id)));
      const criadas = respostas.filter((r) => r.status === 201);
      expect(criadas.map((r) => r.body.numero as number).sort((a, b) => a - b)).toEqual([1, 2, 3]);
      expect(respostas.filter((r) => r.status === 422)).toHaveLength(1);
      expect(await prisma.prescricao.count()).toBe(3);
    });

    it('422 com bloco sem médico; 404 com bloco ou paciente inexistente; 400 vazio', async () => {
      const p = await paciente('Paciente Teste');
      const semMedico = await bloco();
      const res = await prescrever(semMedico.id, p.id).expect(422);
      expect(res.body.code).toBe('BLOCO_SEM_MEDICO');

      const medico = await profissional('Dr. Teste');
      const b = await bloco({ tipo: 'AZUL', profissionalId: medico.id });
      await prescrever(INEXISTENTE, p.id).expect(404);
      await prescrever(b.id, INEXISTENTE).expect(404);
      expect(await prisma.receituarioBloco.findUnique({ where: { id: b.id } })).toMatchObject({
        usados: 0,
      });

      const vazio = await http().post(PRESCRICOES).send({}).expect(400);
      expect(vazio.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'blocoId', message: 'Bloco é obrigatório.' }),
          expect.objectContaining({ field: 'pacienteId', message: 'Paciente é obrigatório.' }),
          expect.objectContaining({ field: 'medicacao', message: 'Medicação é obrigatória.' }),
        ]),
      );
      await expectNoAudit(prisma, { entity: 'Prescricao' });
    });

    it('403 sem a permissão de criar', async () => {
      const soVer = await criarUsuarioTeste(app, {
        permissoes: ['consultorio-assistencial.receituarios.ver'],
      });
      await comUsuario(app, soVer)
        .post(PRESCRICOES)
        .send({ blocoId: INEXISTENTE, pacienteId: INEXISTENTE, medicacao: 'x' })
        .expect(403);
    });
  });

  describe('GET /prescricoes', () => {
    it('filtra por tipo e período, busca e ordena pelo paciente', async () => {
      const medico = await profissional('Dr. Teste');
      const bia = await paciente('Bia Teste');
      const caio = await paciente('Caio Teste');
      const amarela = await bloco({ profissionalId: medico.id });
      const azul = await bloco({ tipo: 'AZUL', profissionalId: medico.id });
      const r1 = (
        await prescrever(amarela.id, caio.id, {
          medicacao: 'Clonazepam',
          dataPrescricao: '2026-11-01',
        })
      ).body;
      const r2 = (
        await prescrever(azul.id, bia.id, { medicacao: 'Morfina', dataPrescricao: '2026-11-15' })
      ).body;

      const res = await http().get(PRESCRICOES).query({ sort: 'paciente:asc' }).expect(200);
      expect(prescricaoPageSchema.parse(res.body).data.map((p) => p.id)).toEqual([r2.id, r1.id]);

      const ids = async (query: Record<string, string>) =>
        (await http().get(PRESCRICOES).query(query).expect(200)).body.data.map(
          (p: { id: string }) => p.id,
        );
      expect(await ids({})).toEqual([r2.id, r1.id]);
      expect(await ids({ tipo: 'AMARELA' })).toEqual([r1.id]);
      expect(await ids({ de: '2026-11-10' })).toEqual([r2.id]);
      expect(await ids({ ate: '2026-11-01' })).toEqual([r1.id]);
      expect(await ids({ search: 'clona' })).toEqual([r1.id]);
      expect(await ids({ search: 'Bia' })).toEqual([r2.id]);
      expect(await ids({ sort: 'tipo:desc' })).toEqual([r2.id, r1.id]);
      await http().get(PRESCRICOES).query({ de: '2026-11-30', ate: '2026-11-01' }).expect(400);
    });
  });

  describe('Exportação (Excel/PDF)', () => {
    it('xlsx de blocos e de prescrições, auditando EXPORT; 403 sem exportar', async () => {
      const medico = await profissional('Dr. Teste Export');
      const p = await paciente('Paciente Export');
      const b = await bloco({ profissionalId: medico.id, localizacao: 'Armario 3' });
      await prescrever(b.id, p.id, { medicacao: 'Fenobarbital' }).expect(201);

      const blocos = await http()
        .get(`${BLOCOS}/export`)
        .query({ format: 'xlsx' })
        .buffer(true)
        .parse(binario)
        .expect(200);
      expect(await conteudoXlsx(blocos.body)).toContain('000001 - 000020');

      const prescricoes = await http()
        .get(`${PRESCRICOES}/export`)
        .query({ format: 'xlsx', sort: 'medico:asc' })
        .buffer(true)
        .parse(binario)
        .expect(200);
      const conteudo = await conteudoXlsx(prescricoes.body);
      expect(conteudo).toContain('Fenobarbital');
      expect(conteudo).toContain('000001');

      expect(await prisma.auditLog.count({ where: { action: 'EXPORT' } })).toBe(2);

      const sem = await criarUsuarioTeste(app, {
        permissoes: ['consultorio-assistencial.receituarios.ver'],
      });
      await comUsuario(app, sem).get(`${BLOCOS}/export`).query({ format: 'xlsx' }).expect(403);
      await comUsuario(app, sem).get(`${PRESCRICOES}/export`).query({ format: 'pdf' }).expect(403);
    });
  });

  describe('Escopo de dados (perfil restrito)', () => {
    it('vê e usa só blocos e prescrições dos profissionais vinculados', async () => {
      const meu = await profissional('Dr. Meu');
      const outro = await profissional('Dr. Outro');
      const p = await paciente('Paciente Teste');
      const meuBloco = await bloco({ profissionalId: meu.id });
      const blocoOutro = await bloco({ tipo: 'AZUL', profissionalId: outro.id });
      await bloco({ tipo: 'BRANCA' });
      await prescrever(blocoOutro.id, p.id).expect(201);

      const restrito = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [meu.id],
      });
      const r = () => comUsuario(app, restrito);

      const blocos = await r().get(BLOCOS).expect(200);
      expect(blocos.body.data.map((b: { id: string }) => b.id)).toEqual([meuBloco.id]);
      const disponiveis = await r().get(`${BLOCOS}/disponiveis`).expect(200);
      expect(disponiveis.body.map((b: { id: string }) => b.id)).toEqual([meuBloco.id]);

      const novo = { tipo: 'BRANCA', numeroInicio: 500, numeroFim: 510 };
      await r().post(BLOCOS).send(novo).expect(403);
      await r()
        .post(BLOCOS)
        .send({ ...novo, profissionalId: outro.id })
        .expect(403);
      await r()
        .post(BLOCOS)
        .send({ ...novo, profissionalId: meu.id })
        .expect(201);

      const corpo = (blocoId: string) => ({ blocoId, pacienteId: p.id, medicacao: 'x' });
      await r().post(PRESCRICOES).send(corpo(blocoOutro.id)).expect(403);
      const minha = await r().post(PRESCRICOES).send(corpo(meuBloco.id)).expect(201);
      const lista = await r().get(PRESCRICOES).expect(200);
      expect(lista.body.data.map((x: { id: string }) => x.id)).toEqual([minha.body.id]);

      const semVinculo = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
      });
      expect((await comUsuario(app, semVinculo).get(PRESCRICOES).expect(200)).body.data).toEqual(
        [],
      );
    });
  });

  describe('Prontuário: aba Receitas e Histórico Clínico', () => {
    it('as prescrições aparecem no prontuário do paciente', async () => {
      const medico = await profissional('Dr. Teste');
      const p = await paciente('Paciente Teste');
      const b = await bloco({ tipo: 'AZUL', profissionalId: medico.id });
      const criada = (await prescrever(b.id, p.id, { medicacao: 'Metilfenidato' })).body;
      const leitor = await criarUsuarioTeste(app, {
        permissoes: ['consultorio-assistencial.prontuarios.ver'],
      });
      const PRONTUARIO = `/api/consultorio-assistencial/prontuarios/${p.id}`;

      const receitas = await comUsuario(app, leitor).get(`${PRONTUARIO}/receitas`).expect(200);
      expect(prescricaoPageSchema.parse(receitas.body).data).toEqual([
        expect.objectContaining({ id: criada.id, medicacao: 'Metilfenidato', tipo: 'AZUL' }),
      ]);

      const historico = await comUsuario(app, leitor)
        .get(`${PRONTUARIO}/historico-clinico`)
        .expect(200);
      expect(historicoClinicoPageSchema.parse(historico.body).data).toEqual([
        expect.objectContaining({
          id: criada.id,
          tipo: 'PRESCRICAO',
          rotulo: 'Receita Azul (B)',
          resumo: 'Metilfenidato',
          profissionalNome: 'Dr. Teste',
        }),
      ]);

      await comUsuario(app, leitor)
        .get(`/api/consultorio-assistencial/prontuarios/${INEXISTENTE}/receitas`)
        .expect(404);
      await http().get(`${PRONTUARIO}/receitas`).expect(403);
    });
  });
});

async function conteudoXlsx(buffer: Buffer): Promise<string> {
  const wb = new Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return JSON.stringify(wb.worksheets[0]?.getSheetValues() ?? []);
}

function binario(res: request.Response, cb: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}
