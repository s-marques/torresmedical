import type { INestApplication } from '@nestjs/common';
import {
  apiErrorSchema,
  LOOKUP_ENTIDADES,
  LOOKUP_PERMISSOES,
  lookupItemSchema,
  lookupPageSchema,
  type LookupEntidade,
} from '@torres/shared';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { comUsuario, criarUsuarioTeste } from '../utils/auth';

const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

interface Dados {
  nome: string;
  ativo?: boolean;
  deletedAt?: Date;
}

interface Config {
  criar(dados: Dados): Promise<{ id: string }>;
  /** Entidades sem status no inventário (Empresa, Categoria, Unidade de medida). */
  semStatus?: boolean;
  label?: (nome: string) => string;
}

const sigla = (nome: string) => nome.slice(0, 2).toUpperCase();

/** Como criar um registro de cada entidade com só o necessário. */
function configs(prisma: PrismaService, empresaId: string): Record<LookupEntidade, Config> {
  return {
    pacientes: {
      criar: ({ ativo, ...data }) =>
        prisma.paciente.create({
          data: { ...data, ...(ativo === false && { status: 'INATIVO' }) },
        }),
    },
    profissionais: { criar: (data) => prisma.profissional.create({ data }) },
    especialidades: { criar: (data) => prisma.especialidade.create({ data }) },
    empresas: {
      semStatus: true,
      criar: ({ nome, deletedAt }) =>
        prisma.empresa.create({ data: { nome, deletedAt, documento: `doc-${nome}` } }),
    },
    unidades: { criar: (data) => prisma.unidade.create({ data: { ...data, empresaId } }) },
    fornecedores: { criar: (data) => prisma.fornecedor.create({ data }) },
    produtos: { criar: (data) => prisma.produto.create({ data: { ...data, tipo: 'PRODUTO' } }) },
    categorias: {
      semStatus: true,
      criar: ({ nome, deletedAt }) =>
        prisma.categoria.create({ data: { nome, deletedAt, tipo: 'SERVICO' } }),
    },
    'unidades-medida': {
      semStatus: true,
      label: (nome) => `${sigla(nome)} – ${nome}`,
      criar: ({ nome, deletedAt }) =>
        prisma.unidadeMedida.create({ data: { nome, deletedAt, sigla: sigla(nome) } }),
    },
    funcionarios: { criar: (data) => prisma.funcionario.create({ data }) },
    cargos: { criar: (data) => prisma.cargo.create({ data }) },
    'formas-pagamento': {
      criar: (data) =>
        prisma.formaPagamento.create({ data: { ...data, finalidade: 'RECEBER', tipo: 'PIX' } }),
    },
    'tipos-agendamento': {
      criar: (data) => prisma.tipoAgendamento.create({ data: { ...data, duracaoMinutos: 30 } }),
    },
    'origens-cliente': {
      criar: ({ ativo, ...data }) =>
        prisma.origemCliente.create({
          data: {
            ...data,
            ativa: ativo,
            codigo: data.nome.toLowerCase().replaceAll(' ', '_'),
            ordem: 1,
          },
        }),
    },
  };
}

describe('Lookups das entidades compartilhadas (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let empresaId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    // Empresa dos usuários de teste: o nome não casa com a busca "teste" dos cenários.
    empresaId = (await prisma.empresa.create({ data: { nome: 'Base Usuarios', documento: '1' } }))
      .id;
  });

  afterAll(async () => {
    await app.close();
  });

  /** Cliente com uma das permissões do lookup (por padrão, a primeira da lista). */
  async function http(entidade: LookupEntidade, indice = 0) {
    const permissoes = LOOKUP_PERMISSOES[entidade];
    const permissao = permissoes[indice] ?? permissoes[0];
    return comUsuario(app, await criarUsuarioTeste(app, { permissoes: [permissao], empresaId }));
  }

  /** Alfa e Beta selecionáveis, Gama inativo (quando há status) e Delta excluído. */
  async function cenario(entidade: LookupEntidade) {
    const config = configs(prisma, empresaId)[entidade];
    const alfa = await config.criar({ nome: 'Alfa Teste' });
    await config.criar({ nome: 'Beta Teste' });
    const gama = await config.criar({
      nome: 'Gama Teste',
      ...(config.semStatus ? {} : { ativo: false }),
    });
    const delta = await config.criar({ nome: 'Delta Teste', deletedAt: new Date() });
    const label = config.label ?? ((nome: string) => nome);
    const selecionaveis = config.semStatus
      ? ['Alfa Teste', 'Beta Teste', 'Gama Teste']
      : ['Alfa Teste', 'Beta Teste'];
    return { alfa, gama, delta, label, selecionaveis: selecionaveis.map(label) };
  }

  describe.each(LOOKUP_ENTIDADES)('/api/lookups/%s', (entidade) => {
    const base = `/api/lookups/${entidade}`;

    it('200: lista selecionáveis por nome, com busca; sem inativos e excluídos', async () => {
      const { selecionaveis } = await cenario(entidade);
      const cliente = await http(entidade);

      const res = await cliente.get(base).query({ search: 'TESTE' }).expect(200);

      const page = lookupPageSchema.parse(res.body);
      expect(page.data.map((item) => item.label)).toEqual(selecionaveis);
      expect(page.meta).toEqual({
        page: 1,
        pageSize: 10,
        total: selecionaveis.length,
        totalPages: 1,
      });
    });

    it('200: pagina e aceita qualquer uma das permissões das telas que usam a entidade', async () => {
      const { label } = await cenario(entidade);
      const cliente = await http(entidade, LOOKUP_PERMISSOES[entidade].length - 1);

      const res = await cliente
        .get(base)
        .query({ search: 'teste', pageSize: 1, page: 2 })
        .expect(200);

      expect(res.body.data.map((item: { label: string }) => item.label)).toEqual([
        label('Beta Teste'),
      ]);
      expect(res.body.meta).toMatchObject({ page: 2, pageSize: 1 });
    });

    it('200 /:id: devolve o item, inclusive inativo', async () => {
      const { alfa, gama, label } = await cenario(entidade);
      const cliente = await http(entidade);

      const res = await cliente.get(`${base}/${alfa.id}`).expect(200);
      expect(lookupItemSchema.parse(res.body)).toMatchObject({
        id: alfa.id,
        label: label('Alfa Teste'),
      });

      const inativo = await cliente.get(`${base}/${gama.id}`).expect(200);
      expect(inativo.body.label).toBe(label('Gama Teste'));
    });

    it('400: query e id inválidos', async () => {
      const cliente = await http(entidade);

      const lista = await cliente.get(base).query({ pageSize: 101, sort: 'id:asc' }).expect(400);
      const detalhe = await cliente.get(`${base}/abc`).expect(400);

      expect(
        apiErrorSchema
          .parse(lista.body)
          .details?.map((d) => d.field)
          .sort((a, b) => a.localeCompare(b)),
      ).toEqual(['pageSize', 'sort']);
      expect(apiErrorSchema.parse(detalhe.body).details).toEqual([
        { field: 'id', message: 'Identificador inválido' },
      ]);
    });

    it('401 sem login', async () => {
      const lista = await request(app.getHttpServer()).get(base).expect(401);
      const detalhe = await request(app.getHttpServer()).get(`${base}/${INEXISTENTE}`).expect(401);

      expect(lista.body.code).toBe('UNAUTHORIZED');
      expect(detalhe.body.code).toBe('UNAUTHORIZED');
    });

    it('403 sem nenhuma permissão das telas que usam a entidade', async () => {
      const usuario = await criarUsuarioTeste(app, {
        permissoes: ['configuracoes-gestao.auditoria.ver'],
        empresaId,
      });
      const cliente = comUsuario(app, usuario);

      const lista = await cliente.get(base).expect(403);
      const detalhe = await cliente.get(`${base}/${INEXISTENTE}`).expect(403);

      expect(lista.body).toMatchObject({ code: 'FORBIDDEN', message: 'Sem permissão' });
      expect(detalhe.body.code).toBe('FORBIDDEN');
    });

    it('404 /:id inexistente ou excluído', async () => {
      const { delta } = await cenario(entidade);
      const cliente = await http(entidade);

      const inexistente = await cliente.get(`${base}/${INEXISTENTE}`).expect(404);
      const excluido = await cliente.get(`${base}/${delta.id}`).expect(404);

      expect(inexistente.body.code).toBe('NOT_FOUND');
      expect(excluido.body.code).toBe('NOT_FOUND');
    });
  });

  describe('filtros e descrições', () => {
    it('produtos e categorias por tipo; formas de pagamento por finalidade', async () => {
      await prisma.produto.create({ data: { nome: 'Soro', tipo: 'PRODUTO', sku: '789' } });
      await prisma.produto.create({ data: { nome: 'Consulta', tipo: 'SERVICO' } });
      await prisma.categoria.create({ data: { nome: 'Insumos', tipo: 'PRODUTO' } });
      await prisma.formaPagamento.create({
        data: { nome: 'Boleto', finalidade: 'PAGAR', tipo: 'PAGAMENTO' },
      });
      await prisma.formaPagamento.create({
        data: { nome: 'PIX', finalidade: 'RECEBER', tipo: 'PIX' },
      });

      const produtos = await (
        await http('produtos')
      )
        .get('/api/lookups/produtos')
        .query({ tipo: 'servico' })
        .expect(200);
      const categorias = await (
        await http('categorias')
      )
        .get('/api/lookups/categorias')
        .query({ tipo: 'servico' })
        .expect(200);
      const formas = await (
        await http('formas-pagamento')
      )
        .get('/api/lookups/formas-pagamento')
        .query({ finalidade: 'pagar' })
        .expect(200);

      expect(produtos.body.data).toEqual([
        expect.objectContaining({ label: 'Consulta', descricao: 'Serviço' }),
      ]);
      expect(categorias.body.meta.total).toBe(0);
      expect(formas.body.data).toEqual([
        expect.objectContaining({ label: 'Boleto', descricao: 'Pagar' }),
      ]);
    });

    it('profissionais por especialidade, com a especialidade na descrição', async () => {
      const pediatria = await prisma.especialidade.create({ data: { nome: 'Pediatria' } });
      await prisma.profissional.create({
        data: { nome: 'Dra. Ana', registro: 'CRM 1', especialidadeId: pediatria.id },
      });
      await prisma.profissional.create({ data: { nome: 'Dr. Bruno' } });

      const res = await (
        await http('profissionais')
      )
        .get('/api/lookups/profissionais')
        .query({ especialidadeId: pediatria.id })
        .expect(200);

      expect(res.body.data).toEqual([
        expect.objectContaining({ label: 'Dra. Ana', descricao: 'Pediatria · CRM 1' }),
      ]);
    });

    it('pacientes: busca pelos dígitos do CPF e devolve o CPF mascarado', async () => {
      await prisma.paciente.create({ data: { nome: 'Paciente Um', documento: '12345678901' } });
      await prisma.paciente.create({ data: { nome: 'Paciente Dois', documento: '98765432100' } });

      const res = await (
        await http('pacientes')
      )
        .get('/api/lookups/pacientes')
        .query({ search: '456.789' })
        .expect(200);

      expect(res.body.data).toEqual([
        { id: expect.any(String), label: 'Paciente Um', descricao: '***.456.789-**' },
      ]);
    });

    it('unidades por empresa e 400 para filtro inválido', async () => {
      const outra = await prisma.empresa.create({ data: { nome: 'Outra', documento: '2' } });
      await prisma.unidade.create({ data: { nome: 'Matriz', empresaId } });
      await prisma.unidade.create({ data: { nome: 'Filial', empresaId: outra.id } });
      const cliente = await http('unidades');

      const res = await cliente
        .get('/api/lookups/unidades')
        .query({ empresaId: outra.id })
        .expect(200);
      const invalido = await cliente
        .get('/api/lookups/unidades')
        .query({ empresaId: 'x' })
        .expect(400);

      expect(res.body.data.map((u: { label: string }) => u.label)).toEqual(['Filial']);
      expect(invalido.body.details).toEqual([{ field: 'empresaId', message: 'Empresa inválida' }]);
    });
  });
});
