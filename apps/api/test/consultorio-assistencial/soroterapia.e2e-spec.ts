import type { INestApplication } from '@nestjs/common';
import {
  atendimentoMedicoItemSchema,
  soroterapiaChecklistPageSchema,
  soroterapiaPacoteSchema,
} from '@torres/shared';
import { Workbook } from 'exceljs';
import type request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/consultorio-assistencial/soroterapia';
const PERMISSOES = [
  'consultorio-assistencial.soroterapia.ver',
  'consultorio-assistencial.soroterapia.exportar',
  'configuracoes-gestao.dados-pessoais.exportar',
] as const;
const ROTAS = ['fila-dia', 'pacotes', 'em-andamento', 'historico'] as const;
const MINUTO_MS = 60_000;

describe('Soroterapia (e2e)', () => {
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

  async function checklist(
    pacienteId: string,
    profissionalId: string,
    extra: Record<string, unknown> = {},
  ) {
    return prisma.soroterapiaChecklist.create({
      data: {
        pacienteId,
        profissionalId,
        protocoloNome: 'Protocolo Alfa',
        iniciadoEm: new Date('2026-11-10T13:00:00.000Z'),
        ...extra,
      },
    });
  }

  async function agendamento(
    pacienteId: string,
    profissionalId: string,
    tipoNome: string,
    soroterapia: boolean,
    extra: Record<string, unknown> = {},
  ) {
    const tipo = await prisma.tipoAgendamento.create({
      data: { nome: tipoNome, duracaoMinutos: 60, soroterapia },
    });
    return prisma.agendamento.create({
      data: {
        pacienteId,
        profissionalId,
        tipoAgendamentoId: tipo.id,
        inicio: new Date(),
        ...extra,
      },
    });
  }

  describe('permissões', () => {
    it.each(ROTAS)('GET /%s: 403 sem a permissão de ver', async (rota) => {
      const sem = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, sem).get(`${BASE}/${rota}`).expect(403);
    });

    it.each(ROTAS)('GET /%s: 401 sem login', async (rota) => {
      await request401(app, `${BASE}/${rota}`);
    });
  });

  describe('GET /fila-dia', () => {
    it('200: agendamentos de hoje de tipo soroterapia, sem cancelados nem de outros dias', async () => {
      const medico = await profissional('Dra. Teste Alfa');
      const p = await paciente('Paciente Alfa');
      const hoje = await agendamento(p.id, medico.id, 'Soro Vitaminico', true);
      await agendamento(p.id, medico.id, 'Consulta', false);
      await agendamento(p.id, medico.id, 'Soro Cancelado', true, { status: 'CANCELADO' });
      await agendamento(p.id, medico.id, 'Soro Ontem', true, {
        inicio: new Date(Date.now() - 2 * 24 * 60 * MINUTO_MS),
      });

      const res = await http().get(`${BASE}/fila-dia`).expect(200);
      expect(res.body).toHaveLength(1);
      expect(atendimentoMedicoItemSchema.parse(res.body[0])).toMatchObject({
        id: hoje.id,
        pacienteNome: 'Paciente Alfa',
        profissionalNome: 'Dra. Teste Alfa',
        procedimento: 'Soro Vitaminico',
      });
    });

    it('200 vazio quando não há agendamento de soroterapia hoje', async () => {
      const res = await http().get(`${BASE}/fila-dia`).expect(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('GET /pacotes', () => {
    it('200: só itens de protocolo de orçamentos aprovados', async () => {
      const p = await paciente('Paciente Pacote');
      const criarOrcamento = (status: 'APROVADO' | 'PENDENTE', pacienteId: string | null) =>
        prisma.orcamento.create({
          data: {
            pacienteId,
            status,
            subtotal: 100,
            total: 100,
            itens: {
              create: [
                {
                  origem: 'PROTOCOLO',
                  origemId: '00000000-0000-4000-8000-000000000001',
                  descricao: `Protocolo ${status}`,
                  quantidade: 4,
                  valorUnitario: 25,
                  total: 100,
                  posicao: 0,
                },
                {
                  origem: 'SERVICO',
                  origemId: '00000000-0000-4000-8000-000000000002',
                  descricao: `Servico ${status}`,
                  valorUnitario: 10,
                  total: 10,
                  posicao: 1,
                },
              ],
            },
          },
        });
      const aprovado = await criarOrcamento('APROVADO', p.id);
      await criarOrcamento('PENDENTE', p.id);

      const res = await http().get(`${BASE}/pacotes`).expect(200);
      expect(res.body).toHaveLength(1);
      expect(soroterapiaPacoteSchema.parse(res.body[0])).toMatchObject({
        orcamentoId: aprovado.id,
        orcamentoNumero: aprovado.numero,
        pacienteNome: 'Paciente Pacote',
        protocolo: 'Protocolo APROVADO',
        quantidade: 4,
      });
    });
  });

  describe('GET /em-andamento', () => {
    it('200: só checklists em andamento, com nomes e sem duração', async () => {
      const medico = await profissional('Dr. Teste Beta');
      const p = await paciente('Paciente Beta');
      const andamento = await checklist(p.id, medico.id, { sinaisVitaisInicio: 'PA 120x80' });
      await checklist(p.id, medico.id, { status: 'FINALIZADO' });
      await checklist(p.id, medico.id, { deletedAt: new Date() });

      const res = await http().get(`${BASE}/em-andamento`).expect(200);
      const pagina = soroterapiaChecklistPageSchema.parse(res.body);
      expect(pagina.data).toEqual([
        expect.objectContaining({
          id: andamento.id,
          pacienteNome: 'Paciente Beta',
          profissionalNome: 'Dr. Teste Beta',
          protocolo: 'Protocolo Alfa',
          sinaisVitaisInicio: 'PA 120x80',
          status: 'EM_ANDAMENTO',
          duracaoMinutos: null,
        }),
      ]);
      expect(pagina.meta).toMatchObject({ page: 1, total: 1, totalPages: 1 });
    });

    it('busca por paciente ou protocolo, ordena por paciente e pagina', async () => {
      const medico = await profissional('Dr. Teste Gama');
      const ana = await paciente('Ana Teste');
      const bruno = await paciente('Bruno Teste');
      await checklist(bruno.id, medico.id, { protocoloNome: 'Imunidade' });
      await checklist(ana.id, medico.id, { protocoloNome: 'Hidratacao' });

      const porPaciente = await http().get(`${BASE}/em-andamento`).query({ search: 'bruno' });
      expect(porPaciente.body.data.map((c: { pacienteNome: string }) => c.pacienteNome)).toEqual([
        'Bruno Teste',
      ]);
      const porProtocolo = await http().get(`${BASE}/em-andamento`).query({ search: 'hidrata' });
      expect(porProtocolo.body.data.map((c: { protocolo: string }) => c.protocolo)).toEqual([
        'Hidratacao',
      ]);

      const asc = await http()
        .get(`${BASE}/em-andamento`)
        .query({ sort: 'paciente:asc', page: 1, pageSize: 1 })
        .expect(200);
      expect(asc.body.data[0].pacienteNome).toBe('Ana Teste');
      expect(asc.body.meta).toMatchObject({ total: 2, totalPages: 2 });
      const desc = await http()
        .get(`${BASE}/em-andamento`)
        .query({ sort: 'profissional:desc', pageSize: 5 })
        .expect(200);
      expect(desc.body.data).toHaveLength(2);
    });

    it('400 com ordenação inválida', async () => {
      await http().get(`${BASE}/em-andamento`).query({ sort: 'duracao:asc' }).expect(400);
    });
  });

  describe('GET /historico', () => {
    it('200: Finalizado e Suspenso, com a duração em minutos; chips filtram por status', async () => {
      const medico = await profissional('Dr. Teste Delta');
      const p = await paciente('Paciente Delta');
      const inicio = new Date('2026-11-10T13:00:00.000Z');
      const finalizado = await checklist(p.id, medico.id, {
        status: 'FINALIZADO',
        iniciadoEm: inicio,
        finalizadoEm: new Date(inicio.getTime() + 45 * MINUTO_MS),
      });
      const suspenso = await checklist(p.id, medico.id, { status: 'SUSPENSO' });
      await checklist(p.id, medico.id);

      const todos = await http().get(`${BASE}/historico`).expect(200);
      expect(todos.body.data).toHaveLength(2);
      expect(
        todos.body.data.find((c: { id: string }) => c.id === finalizado.id).duracaoMinutos,
      ).toBe(45);

      const soFinalizado = await http().get(`${BASE}/historico`).query({ status: 'FINALIZADO' });
      expect(soFinalizado.body.data.map((c: { id: string }) => c.id)).toEqual([finalizado.id]);
      const soSuspenso = await http().get(`${BASE}/historico`).query({ status: 'SUSPENSO' });
      expect(soSuspenso.body.data.map((c: { id: string }) => c.id)).toEqual([suspenso.id]);
    });

    it('400 com status que não é do histórico', async () => {
      await http().get(`${BASE}/historico`).query({ status: 'EM_ANDAMENTO' }).expect(400);
    });
  });

  describe('Exportação (Excel/PDF)', () => {
    it('xlsx de Em Andamento e do Historico, auditando EXPORT; 403 sem exportar', async () => {
      const medico = await profissional('Dr. Teste Export');
      const p = await paciente('Paciente Export');
      await checklist(p.id, medico.id, { protocoloNome: 'Protocolo Em Andamento' });
      await checklist(p.id, medico.id, { status: 'FINALIZADO', protocoloNome: 'Protocolo Antigo' });

      const andamento = await http()
        .get(`${BASE}/em-andamento/export`)
        .query({ format: 'xlsx' })
        .buffer(true)
        .parse(binario)
        .expect(200);
      const conteudoAndamento = await conteudoXlsx(andamento.body);
      expect(conteudoAndamento).toContain('Protocolo Em Andamento');
      expect(conteudoAndamento).not.toContain('Protocolo Antigo');

      const historico = await http()
        .get(`${BASE}/historico/export`)
        .query({ format: 'xlsx', columns: 'paciente,protocolo' })
        .buffer(true)
        .parse(binario)
        .expect(200);
      const conteudoHistorico = await conteudoXlsx(historico.body);
      expect(conteudoHistorico).toContain('Protocolo Antigo');
      expect(conteudoHistorico).toContain('Paciente Export');

      expect(await prisma.auditLog.count({ where: { action: 'EXPORT' } })).toBe(2);
      const auditorias = await prisma.auditLog.findMany({
        where: { action: 'EXPORT', entity: 'SoroterapiaChecklist', userId: usuario.id },
        orderBy: { occurredAt: 'asc' },
      });
      expect(auditorias.map((a) => a.after)).toEqual([
        { filtros: { format: 'xlsx' } },
        { filtros: { format: 'xlsx', columns: 'paciente,protocolo' } },
      ]);

      const sem = await criarUsuarioTeste(app, {
        permissoes: ['consultorio-assistencial.soroterapia.ver'],
      });
      await comUsuario(app, sem)
        .get(`${BASE}/em-andamento/export`)
        .query({ format: 'xlsx' })
        .expect(403);
      await comUsuario(app, sem)
        .get(`${BASE}/historico/export`)
        .query({ format: 'pdf' })
        .expect(403);
    });

    it('400 com formato inválido, sem auditar', async () => {
      await http().get(`${BASE}/historico/export`).query({ format: 'docx' }).expect(400);
      await expectNoAudit(prisma, { entity: 'SoroterapiaChecklist' });
    });
  });

  describe('Escopo de dados (perfil restrito)', () => {
    it('vê só checklists, fila e pacotes dos profissionais e pacientes vinculados', async () => {
      const meu = await profissional('Dr. Meu');
      const outro = await profissional('Dr. Outro');
      const pMeu = await paciente('Paciente Meu');
      const pOutro = await paciente('Paciente Outro');
      const meuChecklist = await checklist(pMeu.id, meu.id);
      await checklist(pOutro.id, outro.id);
      await checklist(pOutro.id, outro.id, { status: 'SUSPENSO' });
      const meuAgendamento = await agendamento(pMeu.id, meu.id, 'Soro A', true);
      await agendamento(pOutro.id, outro.id, 'Soro B', true);
      await prisma.atendimento.create({ data: { pacienteId: pMeu.id, profissionalId: meu.id } });
      const orcamento = (pacienteId: string) =>
        prisma.orcamento.create({
          data: {
            pacienteId,
            status: 'APROVADO',
            subtotal: 10,
            total: 10,
            itens: {
              create: {
                origem: 'PROTOCOLO',
                origemId: '00000000-0000-4000-8000-000000000001',
                descricao: 'Protocolo Escopo',
                valorUnitario: 10,
                total: 10,
              },
            },
          },
        });
      const orcamentoMeu = await orcamento(pMeu.id);
      await orcamento(pOutro.id);

      const restrito = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [meu.id],
      });
      const r = () => comUsuario(app, restrito);

      const andamento = await r().get(`${BASE}/em-andamento`).expect(200);
      expect(andamento.body.data.map((c: { id: string }) => c.id)).toEqual([meuChecklist.id]);
      const historico = await r().get(`${BASE}/historico`).expect(200);
      expect(historico.body.data).toEqual([]);
      const fila = await r().get(`${BASE}/fila-dia`).expect(200);
      expect(fila.body.map((a: { id: string }) => a.id)).toEqual([meuAgendamento.id]);
      const pacotes = await r().get(`${BASE}/pacotes`).expect(200);
      expect(pacotes.body.map((c: { orcamentoId: string }) => c.orcamentoId)).toEqual([
        orcamentoMeu.id,
      ]);

      const sem = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [],
      });
      const vazio = await comUsuario(app, sem).get(`${BASE}/em-andamento`).expect(200);
      expect(vazio.body.data).toEqual([]);
      expect((await comUsuario(app, sem).get(`${BASE}/pacotes`).expect(200)).body).toEqual([]);
    });
  });
});

async function request401(app: INestApplication, url: string): Promise<void> {
  const supertest = (await import('supertest')).default;
  await supertest(app.getHttpServer()).get(url).expect(401);
}

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
