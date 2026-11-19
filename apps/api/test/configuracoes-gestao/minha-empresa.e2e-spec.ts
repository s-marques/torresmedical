import { fakerPT_BR as faker } from '@faker-js/faker';
import type { INestApplication } from '@nestjs/common';
import {
  diaHorarioSchema,
  empresaSchema,
  usuarioResumoSchema,
  type DiaHorario,
} from '@torres/shared';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/configuracoes-gestao/minha-empresa';
const PERMISSOES = [
  'configuracoes-gestao.minha-empresa.ver',
  'configuracoes-gestao.minha-empresa.editar',
] as const;

function diaAberto(diaSemana: number, overrides: Partial<DiaHorario> = {}) {
  return {
    diaSemana,
    fechado: false,
    abre: '08:00',
    fecha: '18:00',
    intervalos: [{ inicio: '12:00', fim: '13:00' }],
    ...overrides,
  };
}

describe('Minha Empresa (e2e)', () => {
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
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
    empresaId = usuario.empresaId;
  });

  afterAll(async () => {
    await app.close();
  });

  function http() {
    return comUsuario(app, usuario);
  }

  async function criarArquivo(uso: string) {
    return prisma.arquivo.create({
      data: {
        uso,
        nomeOriginal: 'logo.png',
        contentType: 'image/png',
        tamanho: 10,
        chave: `${uso}/${Math.random()}`,
      },
    });
  }

  describe('GET /', () => {
    it('200 com os dados da empresa do usuário logado', async () => {
      const res = await http().get(BASE).expect(200);

      const empresa = empresaSchema.parse(res.body);
      expect(empresa.id).toBe(empresaId);
    });
  });

  describe('PUT / (Salvar Alterações, aba Dados)', () => {
    it('200, atualiza e audita UPDATE com before/after', async () => {
      const antes = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });

      const res = await http()
        .put(BASE)
        .send({
          nome: 'Nova Razão Social',
          documento: '11222333000181',
          email: 'a@b.com',
          telefone: '65999998888',
        })
        .expect(200);

      expect(res.body).toMatchObject({ nome: 'Nova Razão Social', documento: '11222333000181' });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Empresa',
        entityId: empresaId,
        before: { nome: antes.nome },
        after: { nome: 'Nova Razão Social' },
        userId: usuario.id,
      });
    });

    it('400 com mensagens em português por campo', async () => {
      const res = await http()
        .put(BASE)
        .send({ nome: '', documento: '123', email: 'x' })
        .expect(400);

      expect(res.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'nome', message: 'Nome da Empresa é obrigatório.' }),
          expect.objectContaining({ field: 'documento', message: 'CNPJ / CPF inválido' }),
          expect.objectContaining({ field: 'email', message: 'E-mail inválido' }),
        ]),
      );
      await expectNoAudit(prisma, { entity: 'Empresa' });
    });

    it('409 DUPLICATE quando o documento já pertence a outra empresa', async () => {
      const cnpjDeOutra = '11222333000181';
      await prisma.empresa.create({ data: { nome: faker.company.name(), documento: cnpjDeOutra } });

      const res = await http()
        .put(BASE)
        .send({ nome: 'X', documento: cnpjDeOutra, email: null, telefone: null })
        .expect(409);

      expect(res.body.code).toBe('DUPLICATE');
    });
  });

  describe('PUT /logo', () => {
    it('grava, rejeita arquivo de outro uso e remove com null', async () => {
      const logo = await criarArquivo('logo-empresa');
      const outro = await criarArquivo('foto-profissional');

      const ok = await http().put(`${BASE}/logo`).send({ arquivoId: logo.id }).expect(200);
      expect(ok.body.logoArquivoId).toBe(logo.id);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Empresa',
        entityId: empresaId,
        after: { logoArquivoId: logo.id },
        userId: usuario.id,
      });

      const errado = await http().put(`${BASE}/logo`).send({ arquivoId: outro.id }).expect(400);
      expect(errado.body.code).toBe('ARQUIVO_USO_INVALIDO');

      const removido = await http().put(`${BASE}/logo`).send({ arquivoId: null }).expect(200);
      expect(removido.body.logoArquivoId).toBeNull();
    });

    it('404 para arquivo inexistente', async () => {
      await http()
        .put(`${BASE}/logo`)
        .send({ arquivoId: '00000000-0000-4000-8000-000000000000' })
        .expect(404);
    });
  });

  describe('GET /usuarios', () => {
    it('lista somente os usuários ativos da empresa, sem o de outra empresa', async () => {
      const outraEmpresa = await prisma.empresa.create({
        data: { nome: faker.company.name(), documento: faker.string.numeric(14) },
      });
      await prisma.usuario.create({
        data: {
          empresaId: outraEmpresa.id,
          nome: 'De Outra Empresa',
          email: `x.${faker.string.uuid()}@ex.com`,
        },
      });
      await prisma.usuario.create({
        data: {
          empresaId,
          nome: 'Excluído',
          email: `y.${faker.string.uuid()}@ex.com`,
          deletedAt: new Date(),
        },
      });

      const res = await http().get(`${BASE}/usuarios`).expect(200);

      const lista = res.body.data.map(usuarioResumoSchema.parse.bind(usuarioResumoSchema));
      const emails = lista.map((u: { email: string }) => u.email);
      const nomes = lista.map((u: { nome: string }) => u.nome);
      expect(emails).toContain(usuario.email);
      expect(nomes).not.toContain('De Outra Empresa');
      expect(nomes).not.toContain('Excluído');
    });
  });

  describe('Horários', () => {
    it('GET sem configuração: os 7 dias vêm fechados', async () => {
      const res = await http().get(`${BASE}/horarios`).expect(200);

      const dias = res.body.data.map(diaHorarioSchema.parse.bind(diaHorarioSchema));
      expect(dias).toHaveLength(7);
      expect(dias.every((d: DiaHorario) => d.fechado)).toBe(true);
    });

    it('PUT substitui a semana inteira e audita; GET reflete a troca', async () => {
      const dias = Array.from({ length: 7 }, (_, dia) =>
        dia === 0 ? { diaSemana: 0, fechado: true } : diaAberto(dia),
      );

      const res = await http().put(`${BASE}/horarios`).send({ dias }).expect(200);

      expect(res.body.data).toHaveLength(7);
      const segunda = res.body.data.find((d: DiaHorario) => d.diaSemana === 1);
      expect(segunda).toMatchObject({ fechado: false, abre: '08:00', fecha: '18:00' });
      expect(segunda.intervalos).toHaveLength(1);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'HorarioFuncionamento',
        entityId: empresaId,
        userId: usuario.id,
      });

      const relido = await http().get(`${BASE}/horarios`).expect(200);
      expect(relido.body.data.find((d: DiaHorario) => d.diaSemana === 1)).toMatchObject({
        abre: '08:00',
        fecha: '18:00',
      });
    });

    it('400 quando falta abre/fecha de um dia aberto ou a pausa fica fora do expediente', async () => {
      const dias = Array.from({ length: 7 }, (_, dia) =>
        dia === 1 ? { diaSemana: 1, fechado: false } : { diaSemana: dia, fechado: true },
      );

      const res = await http().put(`${BASE}/horarios`).send({ dias }).expect(400);

      expect(res.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'dias.1.abre',
            message: 'Informe o horário de abertura',
          }),
          expect.objectContaining({
            field: 'dias.1.fecha',
            message: 'Informe o horário de fechamento',
          }),
        ]),
      );
    });

    it('400 quando falta algum dia da semana', async () => {
      const dias = Array.from({ length: 6 }, (_, dia) => ({ diaSemana: dia, fechado: true }));

      await http().put(`${BASE}/horarios`).send({ dias }).expect(400);
    });
  });

  describe('acesso', () => {
    const ROTAS = [
      { metodo: 'get', caminho: BASE, permissao: 'ver' },
      { metodo: 'put', caminho: BASE, permissao: 'editar' },
      { metodo: 'put', caminho: `${BASE}/logo`, permissao: 'editar' },
      { metodo: 'get', caminho: `${BASE}/usuarios`, permissao: 'ver' },
      { metodo: 'get', caminho: `${BASE}/horarios`, permissao: 'ver' },
      { metodo: 'put', caminho: `${BASE}/horarios`, permissao: 'editar' },
    ] as const;

    it.each(ROTAS)('$metodo $caminho sem token responde 401', async ({ metodo, caminho }) => {
      const res = await request(app.getHttpServer())[metodo](caminho).send({}).expect(401);
      expect(res.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    });

    it.each(ROTAS)(
      '$metodo $caminho sem a permissão $permissao responde 403',
      async ({ metodo, caminho, permissao }) => {
        const outras = PERMISSOES.filter((p) => !p.endsWith(`.${permissao}`));
        const semPermissao = await criarUsuarioTeste(app, { permissoes: outras, empresaId });

        const res = await comUsuario(app, semPermissao)[metodo](caminho).send({}).expect(403);
        expect(res.body).toMatchObject({ code: 'FORBIDDEN', message: 'Sem permissão' });
      },
    );
  });
});
