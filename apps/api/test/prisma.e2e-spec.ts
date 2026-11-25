import { Test } from '@nestjs/testing';
import { PERMISSOES } from '@torres/shared';
import { applySeed, buildSeedData } from '../prisma/seed-data';
import { PrismaModule } from '../src/common/prisma/prisma.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { truncateAll } from './utils/database';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('Banco: migration e tabelas estruturais (e2e)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule] }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function criarEmpresa(documento = '11222333000181') {
    return prisma.empresa.create({ data: { nome: 'Empresa Teste', documento } });
  }

  it('aplicou todas as migrations sem pendências', async () => {
    const pendentes = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) AS total FROM _prisma_migrations
      WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL`;
    expect(Number(pendentes[0]?.total)).toBe(0);
  });

  it('cria as tabelas estruturais com nomes em snake_case', async () => {
    const tabelas = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
      ORDER BY table_name`;
    expect(tabelas.map((t) => t.table_name)).toEqual([
      'agendamento_recebimentos',
      'agendamentos',
      'agente_alertas_destinos',
      'agente_instrucao_versoes',
      'agente_instrucoes',
      'agente_instrucoes_extras',
      'agente_regras',
      'analises_ai_growth',
      'anamneses',
      'arquivos',
      'atendimento_anexos',
      'atendimento_documentos',
      'atendimento_evolucoes',
      'atendimento_receitas',
      'atendimento_versoes',
      'atendimentos',
      'atividades_negocio',
      'audit_log',
      'baixas_insumos',
      'baixas_insumos_itens',
      'bandeiras',
      'bens',
      'bloqueios_agenda',
      'bypass_agentes',
      'caixas',
      'campanhas',
      'canais_whatsapp',
      'canais_whatsapp_usuarios',
      'cargos',
      'categorias',
      'centros_custo',
      'coletas_residuo',
      'comissoes',
      'compra_itens',
      'compras',
      'configuracao_confirmacao',
      'configuracao_pesquisa_profissional',
      'contas_bancarias',
      'contas_pagar',
      'contas_pagar_baixas',
      'contas_receber',
      'contatos_whatsapp',
      'contratos_sala',
      'contratos_sala_cobranca',
      'contratos_sala_dias',
      'contratos_sala_horas',
      'conversas_tags',
      'conversas_whatsapp',
      'documentos_conhecimento',
      'empresas',
      'encaminhamentos',
      'envios_campanha',
      'envios_confirmacao',
      'especialidades',
      'estagios_pipeline',
      'formas_pagamento',
      'fornecedores',
      'funcionarios',
      'horarios_atendimento',
      'horarios_funcionamento',
      'horarios_intervalos',
      'imoveis',
      'insights_ai_growth',
      'licencas',
      'lotes',
      'mensagens_automaticas',
      'mensagens_whatsapp',
      'mensalidade_titulos',
      'mensalidades',
      'modelos_confirmacao',
      'motivos_perda',
      'movimentacoes_estoque',
      'nao_conformidades',
      'negocios',
      'orcamento_itens',
      'orcamentos',
      'origens_cliente',
      'outbox_events',
      'paciente_consentimentos',
      'pacientes',
      'pacote_itens',
      'pacote_usos',
      'pacotes',
      'pedido_compra_itens',
      'pedidos_compra',
      'perfis',
      'perfis_permissoes',
      'pesquisas_nps',
      'pesquisas_profissional',
      'pipelines',
      'planos_contas',
      'preferencias_usuario',
      'prescricoes',
      'prestadores',
      'processed_events',
      'produtos',
      'profissionais',
      'profissionais_classificacoes',
      'profissionais_contatos',
      'profissionais_documentos',
      'profissionais_onboarding',
      'profissionais_rqe',
      'prontuario_acessos',
      'prontuarios',
      'protocolo_itens',
      'protocolo_mae_semanas',
      'protocolos',
      'protocolos_mae',
      'receituario_blocos',
      'redefinicoes_senha',
      'respostas_rapidas',
      'salas',
      'salas_bloqueio',
      'salas_bloqueio_dias',
      'servicos_profissionais',
      'sessoes',
      'soroterapia_checklists',
      'tags_atendimento',
      'tipos_agendamento',
      'tipos_licenca',
      'tipos_treinamento',
      'treinamentos',
      'unidades',
      'unidades_medida',
      'usuarios',
      'usuarios_profissionais',
      'venda_itens',
      'vendas',
    ]);
  });

  it('gera uuid no banco e preenche created_at/updated_at; deleted_at começa nulo', async () => {
    const [linha] = await prisma.$queryRaw<
      { id: string; created_at: Date; updated_at: Date; deleted_at: Date | null }[]
    >`
      INSERT INTO empresas (nome, documento, updated_at)
      VALUES ('Direto no SQL', '99888777000100', now())
      RETURNING id, created_at, updated_at, deleted_at`;

    expect(linha?.id).toMatch(UUID);
    expect(linha?.created_at).toBeInstanceOf(Date);
    expect(linha?.deleted_at).toBeNull();

    const empresa = await criarEmpresa();
    expect(empresa.id).toMatch(UUID);
    expect(empresa.updatedAt).toBeInstanceOf(Date);
  });

  it('impede documento de empresa duplicado (P2002)', async () => {
    await criarEmpresa();
    await expect(criarEmpresa()).rejects.toMatchObject({ code: 'P2002' });
  });

  it('impede e-mail de usuário duplicado (P2002)', async () => {
    const empresa = await criarEmpresa();
    const usuario = { empresaId: empresa.id, nome: 'Usuário', email: 'dup@example.com' };
    await prisma.usuario.create({ data: usuario });
    await expect(prisma.usuario.create({ data: usuario })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('exige empresa existente em unidades e usuários (FK)', async () => {
    const empresaId = '00000000-0000-4000-8000-000000000000';
    await expect(
      prisma.unidade.create({ data: { empresaId, nome: 'Sem empresa' } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.usuario.create({ data: { empresaId, nome: 'Sem empresa', email: 'x@example.com' } }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('não apaga empresa que tem unidades (ON DELETE RESTRICT)', async () => {
    const empresa = await criarEmpresa();
    await prisma.unidade.create({ data: { empresaId: empresa.id, nome: 'Matriz' } });
    await expect(prisma.empresa.delete({ where: { id: empresa.id } })).rejects.toThrow();
  });

  it('entidades compartilhadas: FKs válidas e sem apagar quem tem vínculo (RESTRICT)', async () => {
    const inexistente = '00000000-0000-4000-8000-000000000000';
    await expect(
      prisma.profissional.create({
        data: { nome: 'Sem especialidade', especialidadeId: inexistente },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.produto.create({
        data: { nome: 'Sem categoria', tipo: 'PRODUTO', categoriaId: inexistente },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });

    const cargo = await prisma.cargo.create({ data: { nome: 'Recepção' } });
    await prisma.funcionario.create({ data: { nome: 'Funcionário', cargoId: cargo.id } });
    await expect(prisma.cargo.delete({ where: { id: cargo.id } })).rejects.toThrow();

    const unidade = await prisma.unidadeMedida.create({ data: { sigla: 'UN', nome: 'Unidade' } });
    const produto = await prisma.produto.create({
      data: { nome: 'Soro', tipo: 'PRODUTO', unidadeMedidaId: unidade.id, precoVenda: '10.25' },
    });
    expect(produto.precoVenda.toString()).toBe('10.25');
    await expect(prisma.unidadeMedida.delete({ where: { id: unidade.id } })).rejects.toThrow();
  });

  it('grava audit_log com before/after em jsonb e ação do enum', async () => {
    const registro = await prisma.auditLog.create({
      data: {
        userId: 'system',
        action: 'UPDATE',
        entity: 'Empresa',
        entityId: '1',
        before: { nome: 'Antes' },
        after: { nome: 'Depois' },
        requestId: 'req-1',
        ip: '127.0.0.1',
      },
    });

    expect(registro.id).toMatch(UUID);
    expect(registro.occurredAt).toBeInstanceOf(Date);

    const [tipos] = await prisma.$queryRaw<{ before: string; after: string }[]>`
      SELECT jsonb_typeof(before) AS before, jsonb_typeof(after) AS after
      FROM audit_log WHERE id = ${registro.id}::uuid`;
    expect(tipos).toEqual({ before: 'object', after: 'object' });

    await expect(
      prisma.$executeRaw`INSERT INTO audit_log (user_id, action, entity, entity_id)
        VALUES ('system', 'INVALIDA', 'Empresa', '1')`,
    ).rejects.toThrow();
  });

  it('seed grava os dados fictícios e é idempotente', async () => {
    const esperado = buildSeedData();

    await applySeed(prisma, 'senha-do-seed-1');
    await applySeed(prisma, 'senha-do-seed-1');

    expect(await prisma.empresa.count()).toBe(1);
    expect(await prisma.unidade.count()).toBe(esperado.unidades.length);
    const usuarios = await prisma.usuario.findMany({ select: { email: true } });
    expect(usuarios).toHaveLength(esperado.usuarios.length + 1);
    expect(usuarios.every((u) => u.email.endsWith('@example.com'))).toBe(true);

    const admin = await prisma.usuario.findUniqueOrThrow({
      where: { email: 'admin@example.com' },
      include: { perfil: { include: { permissoes: true } } },
    });
    expect(admin.senhaHash).toMatch(/^\$argon2id\$/);
    expect(admin.perfil?.nome).toBe('Administrador');
    expect(admin.perfil?.permissoes).toHaveLength(PERMISSOES.length);

    expect(await prisma.paciente.count()).toBe(esperado.entidades.pacientes.length);
    expect(await prisma.produto.count()).toBe(esperado.entidades.produtos.length);
    expect(await prisma.formaPagamento.count()).toBe(esperado.entidades.formasPagamento.length);
    expect(await prisma.tipoAgendamento.count()).toBe(esperado.entidades.tiposAgendamento.length);
  });
});
