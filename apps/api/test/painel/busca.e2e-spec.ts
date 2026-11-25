import type { INestApplication } from '@nestjs/common';
import {
  apiErrorSchema,
  buscaGlobalResponseSchema,
  PERMISSAO_BUSCA,
  type BuscaGlobalResponse,
  type Permissao,
  type TipoBusca,
} from '@torres/shared';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';

const URL = '/api/painel/busca';
const TODAS: readonly Permissao[] = ['painel.painel.ver', ...Object.values(PERMISSAO_BUSCA)];

// Dados fictícios (CPF/CNPJ/telefone de teste, sem relação com pessoas reais).
const CPF = '39053344705';
const TELEFONE = '11987650001';
const CRM = 'CRM-SP 123456';
const CNPJ = '11222333000181';

describe('Painel: busca global do ⌘K (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let pacienteId: string;
  let outroPacienteId: string;
  let profissionalId: string;
  let outroProfissionalId: string;
  let contratoNumero: number;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    pacienteId = (
      await prisma.paciente.create({
        data: { nome: 'Paciente Alfa Teste', documento: CPF, celular: TELEFONE },
      })
    ).id;
    outroPacienteId = (
      await prisma.paciente.create({
        data: { nome: 'Paciente Beta Teste', documento: '52998224725' },
      })
    ).id;
    profissionalId = (
      await prisma.profissional.create({
        data: { nome: 'Dra. Alfa Teste', registro: CRM, ativo: true },
      })
    ).id;
    outroProfissionalId = (
      await prisma.profissional.create({
        data: { nome: 'Dr. Beta Teste', registro: 'CRM-SP 999888', ativo: true },
      })
    ).id;
    await prisma.atendimento.create({
      data: { pacienteId, profissionalId, status: 'FINALIZADO' },
    });
    await prisma.atendimento.create({
      data: { pacienteId: outroPacienteId, profissionalId: outroProfissionalId },
    });
    const sala = await prisma.sala.create({ data: { nome: 'Sala 7', numero: '07' } });
    const contrato = await prisma.contratoSala.create({
      data: {
        salaId: sala.id,
        modalidade: 'MENSAL',
        locatarioTipo: 'PROFISSIONAL',
        profissionalId,
        valorUnitario: 1500,
        dataInicio: new Date('2026-01-01T00:00:00Z'),
      },
    });
    contratoNumero = contrato.numero;
    await prisma.contratoSala.create({
      data: {
        salaId: sala.id,
        modalidade: 'MENSAL',
        locatarioTipo: 'PROFISSIONAL',
        profissionalId: outroProfissionalId,
        valorUnitario: 900,
        dataInicio: new Date('2026-01-01T00:00:00Z'),
      },
    });
    await prisma.fornecedor.create({
      data: { nome: 'Distribuidora Alfa Teste', documento: CNPJ },
    });
    const pipeline = await prisma.pipeline.create({ data: { nome: 'Funil', ordem: 1 } });
    const estagio = await prisma.estagioPipeline.create({
      data: { pipelineId: pipeline.id, nome: 'Novo', cor: '#112233', ordem: 1 },
    });
    await prisma.negocio.create({
      data: { pipelineId: pipeline.id, estagioId: estagio.id, titulo: 'Lead Alfa Teste' },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  async function buscar(
    termo: string,
    permissoes: readonly Permissao[] = TODAS,
    restrito?: readonly string[],
  ): Promise<BuscaGlobalResponse> {
    const usuario = await criarUsuarioTeste(app, {
      permissoes,
      ...(restrito
        ? { escopoDados: 'PROFISSIONAIS_VINCULADOS' as const, profissionalIds: restrito }
        : {}),
    });
    const res = await comUsuario(app, usuario).get(URL).query({ q: termo }).expect(200);
    return buscaGlobalResponseSchema.parse(res.body);
  }

  const tipos = (r: BuscaGlobalResponse): TipoBusca[] => r.grupos.map((g) => g.tipo);
  const itens = (r: BuscaGlobalResponse, tipo: TipoBusca) =>
    r.grupos.find((g) => g.tipo === tipo)?.itens ?? [];

  it('acha o paciente pelo CPF (com ou sem máscara) e mascara o documento', async () => {
    for (const termo of [CPF, '390.533.447-05']) {
      const achados = itens(await buscar(termo), 'PACIENTE');
      expect(achados.map((i) => i.id)).toEqual([pacienteId]);
      expect(achados[0]?.descricao).toBe('***.533.447-**');
    }
  });

  it('acha o paciente pelo telefone', async () => {
    const r = await buscar('(11) 98765-0001');
    expect(itens(r, 'PACIENTE').map((i) => i.id)).toEqual([pacienteId]);
  });

  it('acha o profissional pelo CRM', async () => {
    const r = await buscar('123456');
    expect(itens(r, 'PROFISSIONAL').map((i) => i.id)).toEqual([profissionalId]);
    expect(itens(r, 'PROFISSIONAL')[0]?.descricao).toBe(CRM);
  });

  it('acha o contrato pelo número e pelo nome do locatário', async () => {
    const porNumero = await buscar(String(contratoNumero));
    expect(itens(porNumero, 'CONTRATO').map((i) => i.titulo)).toContain(
      `Contrato nº ${contratoNumero}`,
    );
    const porLocatario = await buscar('Dra. Alfa');
    expect(itens(porLocatario, 'CONTRATO').map((i) => i.titulo)).toEqual([
      `Contrato nº ${contratoNumero}`,
    ]);
  });

  it('acha fornecedor pelo CNPJ e lead pelo título', async () => {
    expect(itens(await buscar('11.222.333/0001-81'), 'FORNECEDOR')).toHaveLength(1);
    expect(itens(await buscar('Lead Alfa'), 'LEAD')).toHaveLength(1);
  });

  it('agrupa por tipo, na ordem fixa, só com os que têm resultado', async () => {
    expect(tipos(await buscar('Alfa'))).toEqual([
      'PACIENTE',
      'PROFISSIONAL',
      'CONTRATO',
      'FORNECEDOR',
      'LEAD',
    ]);
    expect(tipos(await buscar('Beta'))).toEqual(['PACIENTE', 'PROFISSIONAL', 'CONTRATO']);
  });

  it('limita a 5 resultados por tipo', async () => {
    await prisma.paciente.createMany({
      data: Array.from({ length: 7 }, (_, i) => ({ nome: `Lote Paciente ${i}` })),
    });
    expect(itens(await buscar('Lote Paciente'), 'PACIENTE')).toHaveLength(5);
  });

  it('só mostra os tipos da tela que o usuário pode ver', async () => {
    const r = await buscar('Alfa', ['painel.painel.ver', 'comercial-atendimento.pacientes.ver']);
    expect(tipos(r)).toEqual(['PACIENTE']);
  });

  it('usuário restrito só acha os seus dados e não vê leads', async () => {
    const r = await buscar('Teste', TODAS, [profissionalId]);
    expect(itens(r, 'PACIENTE').map((i) => i.id)).toEqual([pacienteId]);
    expect(itens(r, 'PROFISSIONAL').map((i) => i.id)).toEqual([profissionalId]);
    expect(itens(r, 'CONTRATO').map((i) => i.titulo)).toEqual([`Contrato nº ${contratoNumero}`]);
    expect(tipos(r)).not.toContain('LEAD');
    expect(tipos(r)).toContain('FORNECEDOR');
  });

  it('usuário restrito sem vínculo não vê nenhum dado de profissional', async () => {
    expect(tipos(await buscar('Teste', TODAS, []))).toEqual(['FORNECEDOR']);
    expect(itens(await buscar(CPF, TODAS, []), 'PACIENTE')).toEqual([]);
  });

  it('400 para termo curto ou ausente', async () => {
    const usuario = await criarUsuarioTeste(app, { permissoes: TODAS });
    const curto = await comUsuario(app, usuario).get(URL).query({ q: 'a' }).expect(400);
    expect(apiErrorSchema.parse(curto.body).code).toBe('VALIDATION_ERROR');
    await comUsuario(app, usuario).get(URL).expect(400);
  });

  it('401 sem login e 403 sem acesso ao Painel', async () => {
    await request(app.getHttpServer()).get(URL).query({ q: 'Alfa' }).expect(401);
    const semPermissao = await criarUsuarioTeste(app, { permissoes: [] });
    await comUsuario(app, semPermissao).get(URL).query({ q: 'Alfa' }).expect(403);
  });

  it('é leitura: não grava audit_log', async () => {
    await buscar('Alfa');
    expect(await prisma.auditLog.count()).toBe(0);
  });
});
