import type { INestApplication } from '@nestjs/common';
import { catalogoRelatoriosSchema, paginaRelatorioSchema, type Permissao } from '@torres/shared';
import { Workbook } from 'exceljs';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { ENTIDADE_RELATORIO } from '../../src/common/relatorios/relatorios.controller';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit } from '../utils/expect-audit';

const BASE = '/api/comercial-atendimento/relatorios';
const TELA_VER = 'comercial-atendimento.relatorios.ver';
const TELA_EXPORTAR = 'comercial-atendimento.relatorios.exportar';
const TODAS: readonly Permissao[] = [
  TELA_VER,
  TELA_EXPORTAR,
  'comercial-atendimento.negocios.ver',
  'comercial-atendimento.pacientes.ver',
  'comercial-atendimento.pacotes.ver',
];

const DIA_MS = 86_400_000;
const diaIso = (deslocamentoDias: number) =>
  new Date(Date.now() + deslocamentoDias * DIA_MS).toISOString().slice(0, 10);
/** Janela larga: do ano passado até amanhã. */
const PERIODO = { de: diaIso(-400), ate: diaIso(1) };

describe('Relatórios Comerciais (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;
  let pipelineId: string;
  let estagioId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: TODAS });
    pipelineId = (await prisma.pipeline.create({ data: { nome: 'Funil', ordem: 1 } })).id;
    estagioId = (
      await prisma.estagioPipeline.create({
        data: { pipelineId, nome: 'Novo', cor: '#112233', ordem: 1 },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = (quem: UsuarioTeste = usuario) => comUsuario(app, quem);

  function negocio(extra: Record<string, unknown> = {}) {
    return prisma.negocio.create({
      data: { pipelineId, estagioId, titulo: 'Negócio', ...extra } as never,
    });
  }

  describe('GET /relatorios (catálogo)', () => {
    it('lista COM-01 a COM-04 com colunas e filtros', async () => {
      const res = await http().get(BASE).expect(200);

      const { data } = catalogoRelatoriosSchema.parse(res.body);
      expect(data.map((r) => [r.id, r.nome])).toEqual([
        ['COM-01', 'Taxa de Conversão por Origem'],
        ['COM-02', 'Pacientes Sem Retorno'],
        ['COM-03', 'Pacotes Acabando'],
        ['COM-04', 'Motivo de Perda'],
      ]);
      expect(data[1]?.filtros[0]?.parametro).toBe('dias');
      expect(data[2]?.filtros[0]?.parametro).toBe('saldo');
    });

    it('só mostra os relatórios cuja tela dona dos dados o usuário pode ver', async () => {
      const soNegocios = await criarUsuarioTeste(app, {
        permissoes: [TELA_VER, 'comercial-atendimento.negocios.ver'],
      });

      const res = await http(soNegocios).get(BASE).expect(200);

      expect(res.body.data.map((r: { id: string }) => r.id)).toEqual(['COM-01', 'COM-04']);
    });

    it('403 sem a permissão da tela', async () => {
      const semTela = await criarUsuarioTeste(app, { permissoes: [] });
      await http(semTela).get(BASE).expect(403);
    });
  });

  describe('COM-01: taxa de conversão por origem', () => {
    it('agrupa os negócios do período por origem e calcula a taxa', async () => {
      const indicacao = await prisma.origemCliente.create({
        data: { nome: 'Indicação', codigo: 'indicacao', ordem: 1 },
      });
      await negocio({ origemClienteId: indicacao.id, status: 'GANHO' });
      await negocio({ origemClienteId: indicacao.id, status: 'GANHO' });
      await negocio({ origemClienteId: indicacao.id, status: 'PERDIDO' });
      await negocio({ origemClienteId: indicacao.id });
      await negocio({ status: 'PERDIDO' });
      await negocio({ origemClienteId: indicacao.id, status: 'GANHO', deletedAt: new Date() });
      await negocio({
        origemClienteId: indicacao.id,
        status: 'GANHO',
        createdAt: new Date(Date.now() - 800 * DIA_MS),
      });

      const res = await http().get(`${BASE}/COM-01`).query(PERIODO).expect(200);

      expect(paginaRelatorioSchema.parse(res.body).data).toEqual([
        { origem: 'Indicação', total: 4, ganhos: 2, perdidos: 1, emAberto: 1, taxa: 50 },
        { origem: 'Sem origem', total: 1, ganhos: 0, perdidos: 1, emAberto: 0, taxa: 0 },
      ]);
      expect(res.body.meta.total).toBe(2);
    });

    it('ordena pela whitelist e rejeita campo fora dela', async () => {
      await negocio({ status: 'GANHO' });
      const res = await http()
        .get(`${BASE}/COM-01`)
        .query({ ...PERIODO, sort: 'origem:asc' })
        .expect(200);
      expect(res.body.data).toHaveLength(1);

      await http()
        .get(`${BASE}/COM-01`)
        .query({ ...PERIODO, sort: 'emAberto:asc' })
        .expect(400);
    });
  });

  describe('COM-02: pacientes sem retorno', () => {
    let profissionalId: string;

    async function atendimento(
      pacienteId: string,
      diasAtras: number,
      profissional = profissionalId,
    ) {
      return prisma.atendimento.create({
        data: {
          pacienteId,
          profissionalId: profissional,
          status: 'FINALIZADO',
          finalizadoEm: new Date(Date.now() - diasAtras * DIA_MS),
        },
      });
    }

    beforeEach(async () => {
      profissionalId = (await prisma.profissional.create({ data: { nome: 'Dra. Teste' } })).id;
    });

    it('lista quem tem o último atendimento no período e há mais de 90 dias (padrão)', async () => {
      const antigo = await prisma.paciente.create({
        data: { nome: 'Paciente Antigo', celular: '11900000000' },
      });
      const recente = await prisma.paciente.create({ data: { nome: 'Paciente Recente' } });
      const retornou = await prisma.paciente.create({ data: { nome: 'Paciente Retornou' } });
      await atendimento(antigo.id, 120);
      await atendimento(recente.id, 10);
      await atendimento(retornou.id, 200);
      await atendimento(retornou.id, 5);

      const res = await http().get(`${BASE}/COM-02`).query(PERIODO).expect(200);

      const { data } = paginaRelatorioSchema.parse(res.body);
      expect(data).toHaveLength(1);
      expect(data[0]).toMatchObject({
        paciente: 'Paciente Antigo',
        telefone: '11900000000',
        diasSemRetorno: 120,
      });
    });

    it('o filtro "dias" muda o limite e é validado', async () => {
      const paciente = await prisma.paciente.create({ data: { nome: 'Paciente 45' } });
      await atendimento(paciente.id, 45);

      const padrao = await http().get(`${BASE}/COM-02`).query(PERIODO).expect(200);
      expect(padrao.body.data).toHaveLength(0);

      const trinta = await http()
        .get(`${BASE}/COM-02`)
        .query({ ...PERIODO, dias: '30' })
        .expect(200);
      expect(trinta.body.data).toHaveLength(1);

      await http()
        .get(`${BASE}/COM-02`)
        .query({ ...PERIODO, dias: '7' })
        .expect(400);
    });

    it('perfil restrito vê só pacientes atendidos pelos profissionais vinculados', async () => {
      const outro = (await prisma.profissional.create({ data: { nome: 'Dr. Outro' } })).id;
      const meu = await prisma.paciente.create({ data: { nome: 'Paciente Meu' } });
      const alheio = await prisma.paciente.create({ data: { nome: 'Paciente Alheio' } });
      await atendimento(meu.id, 150);
      await atendimento(alheio.id, 150, outro);
      const restrito = await criarUsuarioTeste(app, {
        permissoes: TODAS,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [profissionalId],
      });

      const res = await http(restrito).get(`${BASE}/COM-02`).query(PERIODO).expect(200);

      expect(res.body.data.map((l: { paciente: string }) => l.paciente)).toEqual(['Paciente Meu']);
    });
  });

  describe('COM-03: pacotes acabando', () => {
    it('lista pacotes ativos com saldo positivo de até 2 sessões (padrão), sem vencidos', async () => {
      const paciente = await prisma.paciente.create({ data: { nome: 'Cliente Pacote' } });
      const criar = (nome: string, extra: Record<string, unknown> = {}) =>
        prisma.pacote.create({
          data: {
            pacienteId: paciente.id,
            nome,
            valorTotal: 100,
            sessoesTotal: 10,
            sessoesUsadas: 9,
            ...extra,
          },
        });
      await criar('Quase no fim');
      await criar('Saldo 5', { sessoesUsadas: 5 });
      await criar('Zerado', { sessoesUsadas: 10 });
      await criar('Cancelado', { status: 'CANCELADO' });
      await criar('Excluído', { deletedAt: new Date() });
      await criar('Vencido', { dataVencimento: new Date(`${diaIso(-3)}T00:00:00Z`) });

      const res = await http().get(`${BASE}/COM-03`).query(PERIODO).expect(200);
      expect(res.body.data.map((l: { pacote: string }) => l.pacote)).toEqual(['Quase no fim']);

      const ate5 = await http()
        .get(`${BASE}/COM-03`)
        .query({ ...PERIODO, saldo: '5', sort: 'saldo:desc' })
        .expect(200);
      expect(ate5.body.data.map((l: { pacote: string }) => l.pacote)).toEqual([
        'Saldo 5',
        'Quase no fim',
      ]);
    });
  });

  describe('COM-04: motivo de perda', () => {
    it('agrupa os negócios perdidos no período pelo motivo, com valor e participação', async () => {
      const preco = await prisma.motivoPerda.create({
        data: { nome: 'Preço', codigo: 'preco', ordem: 1 },
      });
      const fechadoEm = new Date();
      await negocio({ status: 'PERDIDO', motivoPerdaId: preco.id, valor: 100, fechadoEm });
      await negocio({ status: 'PERDIDO', motivoPerdaId: preco.id, valor: 50.5, fechadoEm });
      await negocio({ status: 'PERDIDO', valor: 10, fechadoEm });
      await negocio({ status: 'GANHO', fechadoEm });
      await negocio({
        status: 'PERDIDO',
        motivoPerdaId: preco.id,
        fechadoEm: new Date(Date.now() - 800 * DIA_MS),
      });

      const res = await http().get(`${BASE}/COM-04`).query(PERIODO).expect(200);

      expect(paginaRelatorioSchema.parse(res.body).data).toEqual([
        { motivo: 'Preço', quantidade: 2, valorPerdido: 150.5, participacao: 66.7 },
        { motivo: 'Sem motivo informado', quantidade: 1, valorPerdido: 10, participacao: 33.3 },
      ]);
    });
  });

  describe('validação, permissão e exportação', () => {
    it('400 com período invertido; 404 para relatório inexistente', async () => {
      await http().get(`${BASE}/COM-01`).query({ de: '2026-10-31', ate: '2026-10-01' }).expect(400);
      await http().get(`${BASE}/COM-99`).query(PERIODO).expect(404);
    });

    it('403 no relatório cuja tela dona dos dados o usuário não vê', async () => {
      const soTela = await criarUsuarioTeste(app, { permissoes: [TELA_VER] });
      await http(soTela).get(`${BASE}/COM-03`).query(PERIODO).expect(403);
    });

    it('exporta Excel e grava a ação EXPORT no audit_log', async () => {
      await negocio({ status: 'GANHO' });

      const res = await http()
        .get(`${BASE}/COM-01/export`)
        .query({ ...PERIODO, format: 'xlsx' })
        .buffer(true)
        .parse(binario)
        .expect(200);

      const livro = new Workbook();
      await livro.xlsx.load(res.body as unknown as ArrayBuffer);
      const linhas: unknown[][] = [];
      livro.worksheets[0]?.eachRow((row) => linhas.push((row.values as unknown[]).slice(1)));
      expect(linhas).toEqual([
        ['Origem', 'Negócios', 'Ganhos', 'Perdidos', 'Em aberto', 'Conversão (%)'],
        ['Sem origem', 1, 1, 0, 0, 100],
      ]);
      await expectAudit(prisma, {
        action: 'EXPORT',
        entity: ENTIDADE_RELATORIO,
        entityId: 'COM-01',
        userId: usuario.id,
      });
    });

    it('403 ao exportar sem a permissão exportar da tela', async () => {
      const soVer = await criarUsuarioTeste(app, {
        permissoes: [TELA_VER, 'comercial-atendimento.negocios.ver'],
      });
      await http(soVer)
        .get(`${BASE}/COM-01/export`)
        .query({ ...PERIODO, format: 'xlsx' })
        .expect(403);
    });
  });
});

function binario(res: request.Response, callback: (erro: Error | null, corpo: Buffer) => void) {
  const partes: Buffer[] = [];
  res.on('data', (parte: Buffer) => partes.push(parte));
  res.on('end', () => callback(null, Buffer.concat(partes)));
}
