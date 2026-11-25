import type { INestApplication } from '@nestjs/common';
import {
  bloqueioAgendaSchema,
  especialidadePageSchema,
  especialidadeSchema,
  contratosProfissionalResponseSchema,
  profissionalPageSchema,
  profissionalSchema,
} from '@torres/shared';
import { Workbook } from 'exceljs';
import request from 'supertest';
import { SegredosService } from '../../src/common/crypto/segredos.service';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import type { Prisma } from '../../src/generated/prisma/client';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/gestao-profissionais/profissionais';
const BASE_ESPECIALIDADES = '/api/gestao-profissionais/especialidades';
const ENTITY = 'Profissional';
const PERMISSOES = [
  'gestao-profissionais.profissionais.ver',
  'gestao-profissionais.profissionais.criar',
  'gestao-profissionais.profissionais.editar',
  'gestao-profissionais.profissionais.excluir',
  'gestao-profissionais.profissionais.exportar',
  'configuracoes-gestao.dados-pessoais.exportar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';
// CNPJ fictício com dígitos verificadores válidos (exemplo público).
const CNPJ = '11222333000181';
// CPF fictício com dígitos verificadores válidos (exemplo público).
const CPF = '52998224725';

describe('Profissionais (e2e)', () => {
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
    nome: string,
    extra: Partial<Prisma.ProfissionalUncheckedCreateInput> = {},
  ) {
    return prisma.profissional.create({ data: { nome, ...extra } });
  }

  function criarEspecialidade(nome: string, ativo = true) {
    return prisma.especialidade.create({ data: { nome, ativo } });
  }

  async function nomes(query: Record<string, unknown> = {}) {
    const res = await http().get(BASE).query(query).expect(200);
    return (res.body.data as { nome: string }[]).map((p) => p.nome);
  }

  describe('GET (listagem)', () => {
    beforeEach(async () => {
      const especialidade = await criarEspecialidade('Endocrinologia');
      await criarNoBanco('Ana Teste', {
        registro: 'CRM 1111/MT',
        telefone: '65999990001',
        email: 'ana@exemplo.test',
        duracaoPadrao: 60,
        valorConsulta: 600,
        especialidadeId: especialidade.id,
      });
      await criarNoBanco('Bruno Teste', {
        registro: 'CRO 2222',
        duracaoPadrao: 20,
        valorConsulta: 100,
      });
      await criarNoBanco('Carla Teste', { ativo: false, valorConsulta: 400 });
      await criarNoBanco('Excluído', { deletedAt: new Date() });
    });

    it('padrão: por nome, sem excluídos, com meta de paginação', async () => {
      const res = await http().get(BASE).expect(200);

      const page = profissionalPageSchema.parse(res.body);
      expect(page.data.map((p) => [p.nome, p.ativo, p.valorConsulta])).toEqual([
        ['Ana Teste', true, 600],
        ['Bruno Teste', true, 100],
        ['Carla Teste', false, 400],
      ]);
      expect(page.meta).toEqual({ page: 1, pageSize: 10, total: 3, totalPages: 1 });
    });

    it('busca por nome, registro, email e telefone', async () => {
      expect(await nomes({ search: 'bruno' })).toEqual(['Bruno Teste']);
      expect(await nomes({ search: 'cro 2222' })).toEqual(['Bruno Teste']);
      expect(await nomes({ search: 'ana@exemplo' })).toEqual(['Ana Teste']);
      expect(await nomes({ search: '65999990001' })).toEqual(['Ana Teste']);
    });

    it('filtra por status (Todos/Ativo/Inativo)', async () => {
      expect(await nomes({ status: 'inativo' })).toEqual(['Carla Teste']);
      expect(await nomes({ status: 'ativo' })).toEqual(['Ana Teste', 'Bruno Teste']);
    });

    it('ordena por colunas do grid e pagina', async () => {
      expect(await nomes({ sort: 'valorConsulta:desc' })).toEqual([
        'Ana Teste',
        'Carla Teste',
        'Bruno Teste',
      ]);
      expect((await nomes({ sort: 'duracaoPadrao:asc' }))[0]).toBe('Bruno Teste');
      expect((await nomes({ sort: 'ativo:asc' }))[0]).toBe('Carla Teste');

      const pagina2 = await http().get(BASE).query({ pageSize: 2, page: 2 }).expect(200);
      expect(pagina2.body.data.map((p: { nome: string }) => p.nome)).toEqual(['Carla Teste']);
      expect(pagina2.body.meta).toEqual({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    });

    it('400 para sort e status fora da whitelist', async () => {
      const sort = await http().get(BASE).query({ sort: 'cpf:asc' }).expect(400);
      expect(sort.body.details.map((d: { field: string }) => d.field)).toEqual(['sort']);
      await http().get(BASE).query({ status: 'xyz' }).expect(400);
    });
  });

  describe('GET /:id', () => {
    it('200 com especialidade; 404 inexistente ou excluído; 400 id inválido', async () => {
      const especialidade = await criarEspecialidade('Pediatria');
      const profissional = await criarNoBanco('Ana Teste', { especialidadeId: especialidade.id });
      const excluido = await criarNoBanco('X', { deletedAt: new Date() });

      const ok = await http().get(`${BASE}/${profissional.id}`).expect(200);
      expect(profissionalSchema.parse(ok.body)).toMatchObject({
        id: profissional.id,
        especialidadeNome: 'Pediatria',
        corCalendario: 'azul',
        duracaoPadrao: 30,
      });
      for (const id of [INEXISTENTE, excluido.id]) {
        const res = await http().get(`${BASE}/${id}`).expect(404);
        expect(res.body).toMatchObject({
          code: 'NOT_FOUND',
          message: 'Profissional não encontrado',
        });
      }
      await http().get(`${BASE}/abc`).expect(400);
    });
  });

  describe('POST (Novo Profissional)', () => {
    it('201 só com o nome: padrões do formulário; audita CREATE', async () => {
      const res = await http().post(BASE).send({ nome: '  Ana Teste  ' }).expect(201);

      expect(profissionalSchema.parse(res.body)).toMatchObject({
        nome: 'Ana Teste',
        duracaoPadrao: 30,
        corCalendario: 'azul',
        layoutReceita: 'PADRAO',
        ativo: true,
        valorConsulta: null,
        comissao: null,
        memedSecretKeyDefinida: false,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
        before: null,
        after: { nome: 'Ana Teste', duracaoPadrao: 30 },
        userId: usuario.id,
      });
    });

    it('201 completo: só dígitos em CPF e telefones, valores numéricos e Memed cifrada', async () => {
      const especialidade = await criarEspecialidade('Endocrinologia');

      const res = await http()
        .post(BASE)
        .send({
          nome: 'Ana Teste',
          especialidadeId: especialidade.id,
          registro: 'CRM 1111/MT',
          outrasEspecialidades: 'Metabologia, emagrecimento',
          email: 'ana@exemplo.test',
          telefone: '(65) 99999-0001',
          duracaoPadrao: 60,
          valorConsulta: 600.5,
          comissao: 12.5,
          corCalendario: 'rosa',
          cpf: '529.982.247-25',
          dataNascimento: '1990-05-17',
          estadoCivil: 'CASADO',
          telefoneReceita: '(65) 3333-4444',
          layoutReceita: 'COMPACTO',
          memedApiToken: 'token-fake',
          memedSecretKey: 'segredo-fake',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        especialidadeNome: 'Endocrinologia',
        telefone: '65999990001',
        valorConsulta: 600.5,
        comissao: 12.5,
        corCalendario: 'rosa',
        cpf: CPF,
        dataNascimento: '1990-05-17',
        estadoCivil: 'CASADO',
        telefoneReceita: '6533334444',
        layoutReceita: 'COMPACTO',
        memedApiToken: 'token-fake',
        memedSecretKeyDefinida: true,
      });
      expect(JSON.stringify(res.body)).not.toContain('segredo-fake');

      const gravado = await prisma.profissional.findUniqueOrThrow({ where: { id: res.body.id } });
      const segredos = app.get(SegredosService);
      expect(gravado.memedApiToken).not.toBe('token-fake');
      expect(segredos.decifrar(gravado.memedApiToken ?? '')).toBe('token-fake');
      expect(segredos.decifrar(gravado.memedSecretKey ?? '')).toBe('segredo-fake');

      // As credenciais não vão para o audit_log.
      const auditoria = await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: res.body.id,
      });
      expect(JSON.stringify(auditoria.after)).not.toMatch(/token-fake|segredo-fake/);
    });

    it('400 "O nome do profissional é obrigatório." com nome vazio ou ausente, sem auditar', async () => {
      for (const body of [{ nome: '' }, { nome: '   ' }, {}]) {
        const res = await http().post(BASE).send(body).expect(400);
        expect(res.body.details).toEqual([
          expect.objectContaining({
            field: 'nome',
            message: 'O nome do profissional é obrigatório.',
          }),
        ]);
      }
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('400 para CPF, email, telefone, duração, comissão, cor e campos não permitidos', async () => {
      const campos = async (body: object) =>
        (
          await http()
            .post(BASE)
            .send({ nome: 'X', ...body })
            .expect(400)
        ).body.details.map((d: { field: string; message: string }) => [d.field, d.message]);

      expect(await campos({ cpf: '11111111111' })).toEqual([['cpf', 'CPF inválido']]);
      expect(await campos({ email: 'invalido' })).toEqual([['email', 'Email inválido']]);
      expect(await campos({ telefone: '123' })).toEqual([['telefone', 'Telefone inválido']]);
      expect((await campos({ duracaoPadrao: 0 }))[0][0]).toBe('duracaoPadrao');
      expect(await campos({ comissao: 101 })).toEqual([
        ['comissao', 'A comissão deve ser de no máximo 100%'],
      ]);
      expect(await campos({ corCalendario: 'brilhante' })).toEqual([
        ['corCalendario', 'Cor inválida'],
      ]);
      expect(await campos({ deletedAt: null })).toEqual([['deletedAt', 'Campo não permitido']]);
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('400 para especialidade inexistente, inativa ou excluída', async () => {
      const inativa = await criarEspecialidade('Inativa', false);

      for (const especialidadeId of [INEXISTENTE, inativa.id]) {
        const res = await http().post(BASE).send({ nome: 'X', especialidadeId }).expect(400);
        expect(res.body.code).toBe('ESPECIALIDADE_INVALIDA');
      }
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('PATCH /:id (Editar)', () => {
    it('200: altera, mantém a Secret Key em branco e audita UPDATE com before/after', async () => {
      const criado = await http()
        .post(BASE)
        .send({ nome: 'Ana Teste', memedApiToken: 'token-a', memedSecretKey: 'segredo-a' })
        .expect(201);
      const antes = await prisma.profissional.findUniqueOrThrow({ where: { id: criado.body.id } });

      const res = await http()
        .patch(`${BASE}/${criado.body.id}`)
        .send({ nome: 'Ana Souza', valorConsulta: 250, memedApiToken: 'token-b' })
        .expect(200);

      expect(res.body).toMatchObject({
        nome: 'Ana Souza',
        valorConsulta: 250,
        memedApiToken: 'token-b',
        memedSecretKeyDefinida: true,
      });
      const depois = await prisma.profissional.findUniqueOrThrow({ where: { id: criado.body.id } });
      expect(depois.memedSecretKey).toBe(antes.memedSecretKey);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: criado.body.id,
        before: { nome: 'Ana Teste' },
        after: { nome: 'Ana Souza', valorConsulta: 250 },
        userId: usuario.id,
      });
    });

    it('400 sem nome; 404 inexistente', async () => {
      const profissional = await criarNoBanco('Ana Teste');

      await http().patch(`${BASE}/${profissional.id}`).send({ nome: '' }).expect(400);
      await http().patch(`${BASE}/${INEXISTENTE}`).send({ nome: 'X' }).expect(404);
      await expectNoAudit(prisma, { entity: ENTITY, action: 'UPDATE' });
    });
  });

  describe('PATCH /:id/status (Ativar / Desativar)', () => {
    it('desativa e ativa, auditando cada mudança', async () => {
      const profissional = await criarNoBanco('Ana Teste');

      const inativo = await http()
        .patch(`${BASE}/${profissional.id}/status`)
        .send({ ativo: false })
        .expect(200);
      expect(inativo.body.ativo).toBe(false);
      expect(await nomes({ status: 'inativo' })).toEqual(['Ana Teste']);

      await http().patch(`${BASE}/${profissional.id}/status`).send({ ativo: true }).expect(200);
      expect(await nomes({ status: 'ativo' })).toEqual(['Ana Teste']);
      expect(
        await prisma.auditLog.count({ where: { entity: ENTITY, entityId: profissional.id } }),
      ).toBe(2);
    });

    it('400 sem o campo ativo; 404 inexistente', async () => {
      const profissional = await criarNoBanco('Ana Teste');

      await http().patch(`${BASE}/${profissional.id}/status`).send({}).expect(400);
      await http().patch(`${BASE}/${INEXISTENTE}/status`).send({ ativo: false }).expect(404);
    });
  });

  describe('DELETE /:id', () => {
    it('exclusão lógica: 200, audita DELETE e some da listagem e do detalhe', async () => {
      const profissional = await criarNoBanco('Ana Teste');

      await http().delete(`${BASE}/${profissional.id}`).expect(200);

      await expectAudit(prisma, {
        action: 'DELETE',
        entity: ENTITY,
        entityId: profissional.id,
        before: { nome: 'Ana Teste', deletedAt: null },
        after: null,
        userId: usuario.id,
      });
      expect(
        (await prisma.profissional.findUniqueOrThrow({ where: { id: profissional.id } })).deletedAt,
      ).not.toBeNull();
      expect(await nomes()).toEqual([]);
      await http().get(`${BASE}/${profissional.id}`).expect(404);
      await http().delete(`${BASE}/${profissional.id}`).expect(404);
    });
  });

  describe('PUT /:id/arquivos/:campo (foto e logo da receita)', () => {
    async function criarArquivo(uso: string) {
      return prisma.arquivo.create({
        data: {
          uso,
          nomeOriginal: 'a.png',
          contentType: 'image/png',
          tamanho: 10,
          chave: `${uso}/${Math.random()}`,
        },
      });
    }

    it('grava a foto, rejeita arquivo de outro uso e remove com null', async () => {
      const profissional = await criarNoBanco('Ana Teste');
      const foto = await criarArquivo('foto-profissional');
      const logo = await criarArquivo('logo-receita');

      const ok = await http()
        .put(`${BASE}/${profissional.id}/arquivos/foto`)
        .send({ arquivoId: foto.id })
        .expect(200);
      expect(ok.body.fotoArquivoId).toBe(foto.id);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: profissional.id,
        after: { fotoArquivoId: foto.id },
      });

      const errado = await http()
        .put(`${BASE}/${profissional.id}/arquivos/foto`)
        .send({ arquivoId: logo.id })
        .expect(400);
      expect(errado.body.code).toBe('ARQUIVO_USO_INVALIDO');

      await http()
        .put(`${BASE}/${profissional.id}/arquivos/logo-receita`)
        .send({ arquivoId: logo.id })
        .expect(200);
      const removido = await http()
        .put(`${BASE}/${profissional.id}/arquivos/foto`)
        .send({ arquivoId: null })
        .expect(200);
      expect(removido.body.fotoArquivoId).toBeNull();
    });

    it('400 para campo inválido; 404 para arquivo ou profissional inexistente', async () => {
      const profissional = await criarNoBanco('Ana Teste');

      await http()
        .put(`${BASE}/${profissional.id}/arquivos/outro`)
        .send({ arquivoId: null })
        .expect(400);
      await http()
        .put(`${BASE}/${profissional.id}/arquivos/foto`)
        .send({ arquivoId: INEXISTENTE })
        .expect(404);
      await http()
        .put(`${BASE}/${INEXISTENTE}/arquivos/foto`)
        .send({ arquivoId: null })
        .expect(404);
    });
  });

  describe('horários de atendimento', () => {
    const SEMANAL = {
      tipo: 'SEMANAL',
      diaSemana: 4,
      inicio: '13:30',
      fim: '18:00',
      almocoInicio: '',
      almocoFim: '',
    };

    it('PUT substitui a lista, GET devolve e audita UPDATE', async () => {
      const profissional = await criarNoBanco('Ana Teste');

      const salvo = await http()
        .put(`${BASE}/${profissional.id}/horarios`)
        .send({
          horarios: [
            SEMANAL,
            { tipo: 'POR_DATA', data: '2026-12-24', inicio: '08:00', fim: '12:00' },
          ],
        })
        .expect(200);
      expect(salvo.body.horarios).toHaveLength(2);

      await http()
        .put(`${BASE}/${profissional.id}/horarios`)
        .send({
          horarios: [{ ...SEMANAL, almocoInicio: '12:00', almocoFim: '13:00', inicio: '08:00' }],
        })
        .expect(200);
      const lista = await http().get(`${BASE}/${profissional.id}/horarios`).expect(200);
      expect(lista.body.data).toEqual([
        expect.objectContaining({
          tipo: 'SEMANAL',
          diaSemana: 4,
          inicio: '08:00',
          almocoInicio: '12:00',
          almocoFim: '13:00',
        }),
      ]);
      expect(
        await prisma.auditLog.count({
          where: { entity: 'HorarioAtendimento', entityId: profissional.id, action: 'UPDATE' },
        }),
      ).toBe(2);

      await http().put(`${BASE}/${profissional.id}/horarios`).send({ horarios: [] }).expect(200);
      expect((await http().get(`${BASE}/${profissional.id}/horarios`)).body.data).toEqual([]);
    });

    it('400 para fim antes do início, almoço fora do expediente, dia repetido e hora inválida', async () => {
      const profissional = await criarNoBanco('Ana Teste');
      const erros = async (horarios: object[]) =>
        (
          await http().put(`${BASE}/${profissional.id}/horarios`).send({ horarios }).expect(400)
        ).body.details.map((d: { message: string }) => d.message);

      expect(await erros([{ ...SEMANAL, inicio: '18:00', fim: '13:30' }])).toContain(
        'O fim deve ser depois do início',
      );
      expect(await erros([{ ...SEMANAL, almocoInicio: '12:00', almocoFim: '13:00' }])).toContain(
        'O almoço deve ficar dentro do horário de atendimento',
      );
      expect(await erros([{ ...SEMANAL, almocoInicio: '14:00' }])).toContain(
        'Informe o início e o fim do almoço',
      );
      expect(await erros([SEMANAL, SEMANAL])).toContain('Dia já cadastrado');
      expect(await erros([{ ...SEMANAL, inicio: '25:00' }])).toEqual(['Início inválido (HH:MM)']);
      await expectNoAudit(prisma, { entity: 'HorarioAtendimento' });
    });

    it('404 para profissional inexistente', async () => {
      await http().get(`${BASE}/${INEXISTENTE}/horarios`).expect(404);
      await http().put(`${BASE}/${INEXISTENTE}/horarios`).send({ horarios: [] }).expect(404);
    });
  });

  describe('bloqueios de agenda', () => {
    const amanha = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const ontem = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

    it('Data Única (dia inteiro e horário) e Lote: cria, lista só os ativos e audita', async () => {
      const profissional = await criarNoBanco('Ana Teste');
      const url = `${BASE}/${profissional.id}/bloqueios`;

      const dia = await http()
        .post(url)
        .send({ dataInicio: amanha(), tipo: 'DIA_INTEIRO', motivo: 'FOLGA' })
        .expect(201);
      expect(bloqueioAgendaSchema.parse(dia.body)).toMatchObject({
        dataInicio: amanha(),
        dataFim: amanha(),
        tipo: 'DIA_INTEIRO',
        horaInicio: null,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'BloqueioAgenda',
        entityId: dia.body.id,
        before: null,
        after: { motivo: 'FOLGA' },
        userId: usuario.id,
      });

      const horario = await http()
        .post(url)
        .send({
          dataInicio: amanha(),
          tipo: 'HORARIO',
          horaInicio: '08:00',
          horaFim: '10:00',
          motivo: 'REUNIAO',
        })
        .expect(201);
      expect(horario.body).toMatchObject({
        tipo: 'HORARIO',
        horaInicio: '08:00',
        horaFim: '10:00',
      });

      await http()
        .post(url)
        .send({ dataInicio: amanha(), dataFim: '2099-01-10', motivo: 'FERIAS' })
        .expect(201);
      // Já terminou: não aparece em "Bloqueios Ativos".
      await prisma.bloqueioAgenda.create({
        data: {
          profissionalId: profissional.id,
          dataInicio: new Date(ontem()),
          dataFim: new Date(ontem()),
          tipo: 'DIA_INTEIRO',
          motivo: 'OUTRO',
        },
      });

      const lista = await http().get(url).expect(200);
      expect(lista.body.data.map((b: { motivo: string }) => b.motivo).sort()).toEqual([
        'FERIAS',
        'FOLGA',
        'REUNIAO',
      ]);
    });

    it('400 para data fim anterior, horário sem horas, hora final antes da inicial e motivo ausente', async () => {
      const profissional = await criarNoBanco('Ana Teste');
      const url = `${BASE}/${profissional.id}/bloqueios`;
      const erros = async (body: object) =>
        (await http().post(url).send(body).expect(400)).body.details.map(
          (d: { field: string; message: string }) => [d.field, d.message],
        );

      expect(
        await erros({ dataInicio: '2026-11-10', dataFim: '2026-11-09', motivo: 'FERIAS' }),
      ).toEqual([['dataFim', 'A data fim deve ser igual ou posterior à data início']]);
      expect(await erros({ dataInicio: '2026-11-10', tipo: 'HORARIO', motivo: 'FOLGA' })).toEqual([
        ['horaInicio', 'Informe a hora inicial'],
        ['horaFim', 'Informe a hora final'],
      ]);
      expect(
        await erros({
          dataInicio: '2026-11-10',
          tipo: 'HORARIO',
          horaInicio: '10:00',
          horaFim: '09:00',
          motivo: 'FOLGA',
        }),
      ).toEqual([['horaFim', 'A hora final deve ser depois da inicial']]);
      expect(await erros({ dataInicio: '2026-11-10' })).toEqual([['motivo', 'Selecione o motivo']]);
      expect(await erros({ motivo: 'FOLGA' })).toEqual([['dataInicio', 'Data é obrigatória']]);
      await expectNoAudit(prisma, { entity: 'BloqueioAgenda' });
    });

    it('DELETE remove (exclusão lógica) e audita; 404 para outro profissional', async () => {
      const ana = await criarNoBanco('Ana Teste');
      const bruno = await criarNoBanco('Bruno Teste');
      const criado = await http()
        .post(`${BASE}/${ana.id}/bloqueios`)
        .send({ dataInicio: amanha(), motivo: 'FERIADO' })
        .expect(201);

      await http().delete(`${BASE}/${bruno.id}/bloqueios/${criado.body.id}`).expect(404);
      await http().delete(`${BASE}/${ana.id}/bloqueios/${criado.body.id}`).expect(200);

      await expectAudit(prisma, {
        action: 'DELETE',
        entity: 'BloqueioAgenda',
        entityId: criado.body.id,
        before: { motivo: 'FERIADO', deletedAt: null },
        after: null,
        userId: usuario.id,
      });
      expect((await http().get(`${BASE}/${ana.id}/bloqueios`)).body.data).toEqual([]);
      await http().delete(`${BASE}/${ana.id}/bloqueios/${criado.body.id}`).expect(404);
    });

    it('404 para profissional inexistente', async () => {
      await http().get(`${BASE}/${INEXISTENTE}/bloqueios`).expect(404);
      await http()
        .post(`${BASE}/${INEXISTENTE}/bloqueios`)
        .send({ dataInicio: amanha(), motivo: 'FOLGA' })
        .expect(404);
    });
  });

  describe('especialidades (modal Gerenciar Especialidades)', () => {
    it('GET lista ordenada por nome, sem excluídas', async () => {
      await criarEspecialidade('Pediatria');
      await criarEspecialidade('Acupuntura');
      await prisma.especialidade.create({ data: { nome: 'Excluída', deletedAt: new Date() } });

      const res = await http().get(BASE_ESPECIALIDADES).query({ pageSize: 100 }).expect(200);

      expect(especialidadePageSchema.parse(res.body).data.map((e) => e.nome)).toEqual([
        'Acupuntura',
        'Pediatria',
      ]);
    });

    it('POST adiciona, audita e bloqueia nome repetido (sem diferenciar maiúsculas)', async () => {
      const res = await http()
        .post(BASE_ESPECIALIDADES)
        .send({ nome: '  Cardiologia ' })
        .expect(201);

      expect(especialidadeSchema.parse(res.body).nome).toBe('Cardiologia');
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'Especialidade',
        entityId: res.body.id,
        after: { nome: 'Cardiologia' },
      });
      const duplicada = await http()
        .post(BASE_ESPECIALIDADES)
        .send({ nome: 'cardiologia' })
        .expect(409);
      expect(duplicada.body.code).toBe('ESPECIALIDADE_DUPLICADA');
      const vazia = await http().post(BASE_ESPECIALIDADES).send({ nome: ' ' }).expect(400);
      expect(vazia.body.details[0].message).toBe('Informe o nome da especialidade');
    });

    it('PATCH renomeia; DELETE exclui, mas não com profissional vinculado', async () => {
      const livre = await criarEspecialidade('Livre');
      const emUso = await criarEspecialidade('Em uso');
      await criarNoBanco('Ana Teste', { especialidadeId: emUso.id });

      const renomeada = await http()
        .patch(`${BASE_ESPECIALIDADES}/${livre.id}`)
        .send({ nome: 'Livre 2' })
        .expect(200);
      expect(renomeada.body.nome).toBe('Livre 2');
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Especialidade',
        entityId: livre.id,
        before: { nome: 'Livre' },
        after: { nome: 'Livre 2' },
      });

      const bloqueada = await http().delete(`${BASE_ESPECIALIDADES}/${emUso.id}`).expect(409);
      expect(bloqueada.body.code).toBe('ESPECIALIDADE_EM_USO');
      await http().delete(`${BASE_ESPECIALIDADES}/${livre.id}`).expect(200);
      await expectAudit(prisma, { action: 'DELETE', entity: 'Especialidade', entityId: livre.id });
      await http().delete(`${BASE_ESPECIALIDADES}/${livre.id}`).expect(404);
      await http().patch(`${BASE_ESPECIALIDADES}/${INEXISTENTE}`).send({ nome: 'X' }).expect(404);
    });
  });

  describe('cadastro completo (issue #140)', () => {
    const contato = (extra: Record<string, unknown> = {}) => ({
      nome: 'Bia Teste',
      funcao: 'Secretária',
      telefone: '(65) 99999-0002',
      ...extra,
    });

    it('201: profissão, subespecialidade, CNPJ, RQEs e contatos; audita com as listas', async () => {
      const cardio = await criarEspecialidade('Cardiologia');
      const clinica = await criarEspecialidade('Clínica Médica');

      const res = await http()
        .post(BASE)
        .send({
          nome: 'Ana Teste',
          profissao: 'MEDICO',
          subespecialidade: 'Arritmia',
          cnpj: '11.222.333/0001-81',
          especialidadeId: cardio.id,
          rqes: [
            { numero: '4321', especialidadeId: cardio.id },
            { numero: '99', especialidadeId: clinica.id },
          ],
          contatosAdministrativos: [
            contato(),
            contato({
              nome: 'Caio Teste',
              funcao: 'Financeiro',
              telefone: '',
              email: 'caio@exemplo.test',
            }),
          ],
        })
        .expect(201);

      const dto = profissionalSchema.parse(res.body);
      expect(dto).toMatchObject({ profissao: 'MEDICO', subespecialidade: 'Arritmia', cnpj: CNPJ });
      expect(dto.rqes.map((r) => [r.numero, r.especialidadeNome])).toEqual([
        ['4321', 'Cardiologia'],
        ['99', 'Clínica Médica'],
      ]);
      expect(dto.contatosAdministrativos.map((c) => [c.nome, c.telefone, c.email])).toEqual([
        ['Bia Teste', '65999990002', null],
        ['Caio Teste', null, 'caio@exemplo.test'],
      ]);
      expect(await prisma.profissionalRqe.count({ where: { profissionalId: dto.id } })).toBe(2);
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: dto.id,
        after: { cnpj: CNPJ, profissao: 'MEDICO' },
        userId: usuario.id,
      });
    });

    it('sem os campos novos o cadastro continua válido, com listas vazias', async () => {
      const res = await http().post(BASE).send({ nome: 'Ana Teste' }).expect(201);

      expect(res.body).toMatchObject({
        profissao: null,
        subespecialidade: null,
        cnpj: null,
        rqes: [],
        contatosAdministrativos: [],
      });
    });

    it('400: CNPJ inválido, profissão inválida, RQE duplicado ou sem número, contato incompleto', async () => {
      const cardio = await criarEspecialidade('Cardiologia');
      const campos = async (corpo: Record<string, unknown>) => {
        const res = await http()
          .post(BASE)
          .send({ nome: 'X', ...corpo })
          .expect(400);
        return (res.body.details as { field: string }[]).map((d) => d.field);
      };

      expect(await campos({ cnpj: '11222333000182' })).toEqual(['cnpj']);
      expect(await campos({ profissao: 'MAGO' })).toEqual(['profissao']);
      expect(
        await campos({
          rqes: [
            { numero: '1', especialidadeId: cardio.id },
            { numero: '2', especialidadeId: cardio.id },
          ],
        }),
      ).toEqual(['rqes']);
      expect(await campos({ rqes: [{ numero: ' ', especialidadeId: cardio.id }] })).toEqual([
        'rqes.0.numero',
      ]);
      expect(
        await campos({ contatosAdministrativos: [{ nome: 'Bia', funcao: 'Secretária' }] }),
      ).toEqual(['contatosAdministrativos.0.telefone']);
      expect(await prisma.profissional.count()).toBe(0);
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('400 RQE_ESPECIALIDADE_INVALIDA para especialidade do RQE inexistente ou inativa', async () => {
      const inativa = await criarEspecialidade('Antiga', false);

      for (const especialidadeId of [INEXISTENTE, inativa.id]) {
        const res = await http()
          .post(BASE)
          .send({ nome: 'X', rqes: [{ numero: '1', especialidadeId }] })
          .expect(400);
        expect(res.body.code).toBe('RQE_ESPECIALIDADE_INVALIDA');
      }
      expect(await prisma.profissional.count()).toBe(0);
    });

    it('PATCH substitui RQEs e contatos e audita before/after', async () => {
      const cardio = await criarEspecialidade('Cardiologia');
      const criado = await http()
        .post(BASE)
        .send({
          nome: 'Ana Teste',
          rqes: [{ numero: '1', especialidadeId: cardio.id }],
          contatosAdministrativos: [contato()],
        })
        .expect(201);

      const res = await http()
        .patch(`${BASE}/${criado.body.id}`)
        .send({
          nome: 'Ana Teste',
          cnpj: CNPJ,
          rqes: [{ numero: '2', especialidadeId: cardio.id }],
          contatosAdministrativos: [],
        })
        .expect(200);

      expect(res.body.rqes.map((r: { numero: string }) => r.numero)).toEqual(['2']);
      expect(res.body.contatosAdministrativos).toEqual([]);
      expect(await prisma.profissionalRqe.count()).toBe(1);
      expect(await prisma.profissionalContato.count()).toBe(0);
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: criado.body.id,
        before: { cnpj: null },
        after: { cnpj: CNPJ },
        userId: usuario.id,
      });
    });

    it('busca na listagem por CRM/registro e por CNPJ (com ou sem máscara)', async () => {
      await criarNoBanco('Ana Teste', { registro: 'CRM 1111/MT', cnpj: CNPJ });
      await criarNoBanco('Bruno Teste', { registro: 'CRM 2222/MT', cnpj: '45723174000110' });

      expect(await nomes({ search: 'CRM 1111' })).toEqual(['Ana Teste']);
      expect(await nomes({ search: CNPJ })).toEqual(['Ana Teste']);
      expect(await nomes({ search: '11.222.333/0001-81' })).toEqual(['Ana Teste']);
      expect(await nomes({ search: '45.723.174' })).toEqual(['Bruno Teste']);
    });
  });

  describe('GET /:id/contratos (aba Contratos, somente leitura)', () => {
    async function prepararContratos() {
      const sala = await prisma.sala.create({ data: { nome: 'Sala 7', numero: '07' } });
      const profissional = await criarNoBanco('Ana Teste');
      const outro = await criarNoBanco('Bruno Teste');
      const base = {
        salaId: sala.id,
        modalidade: 'MENSAL' as const,
        locatarioTipo: 'PROFISSIONAL' as const,
        valorUnitario: 1500,
        dataInicio: new Date('2026-10-01T00:00:00Z'),
      };
      await prisma.contratoSala.create({
        data: {
          ...base,
          profissionalId: profissional.id,
          status: 'ENCERRADO',
          dataInicio: new Date('2025-01-01T00:00:00Z'),
        },
      });
      await prisma.contratoSala.create({
        data: {
          ...base,
          profissionalId: profissional.id,
          dias: { create: [{ diaSemana: 2, inicio: '08:00', fim: '12:00' }] },
        },
      });
      await prisma.contratoSala.create({ data: { ...base, profissionalId: outro.id } });
      await prisma.contratoSala.create({
        data: { ...base, profissionalId: profissional.id, deletedAt: new Date() },
      });
      return { profissional, outro };
    }

    it('200: contratos ativos e encerrados do profissional, ativo primeiro, sem os de outros', async () => {
      const { profissional } = await prepararContratos();

      const res = await http().get(`${BASE}/${profissional.id}/contratos`).expect(200);

      const { data } = contratosProfissionalResponseSchema.parse(res.body);
      expect(data.map((c) => c.status)).toEqual(['ATIVO', 'ENCERRADO']);
      expect(data[0]).toMatchObject({
        salaNome: 'Sala 7',
        modalidade: 'MENSAL',
        valorUnitario: 1500,
        diaVencimento: 10,
        dataInicio: '2026-10-01',
      });
      expect(data[0]?.dias).toHaveLength(1);
      await expectNoAudit(prisma, { entity: 'ContratoSala' });
    });

    it('200 com lista vazia; 404 para inexistente, excluído ou id inválido', async () => {
      const semContrato = await criarNoBanco('Ana Teste');
      const excluido = await criarNoBanco('Excluído', { deletedAt: new Date() });

      const vazio = await http().get(`${BASE}/${semContrato.id}/contratos`).expect(200);
      expect(vazio.body).toEqual({ data: [] });
      await http().get(`${BASE}/${INEXISTENTE}/contratos`).expect(404);
      await http().get(`${BASE}/${excluido.id}/contratos`).expect(404);
      await http().get(`${BASE}/abc/contratos`).expect(400);
    });

    it('escopo: usuário restrito vê só os contratos dos profissionais vinculados; fora → 403', async () => {
      const { profissional, outro } = await prepararContratos();
      const restrito = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [profissional.id],
      });

      const ok = await comUsuario(app, restrito)
        .get(`${BASE}/${profissional.id}/contratos`)
        .expect(200);
      expect(ok.body.data).toHaveLength(2);
      const negado = await comUsuario(app, restrito)
        .get(`${BASE}/${outro.id}/contratos`)
        .expect(403);
      expect(negado.body).toMatchObject({ code: 'FORBIDDEN', message: 'Sem permissão' });
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

    it('xlsx com filtros, ordenação e colunas visíveis; audita EXPORT', async () => {
      await criarNoBanco('Ana Teste', { registro: 'CRM 1', valorConsulta: 600 });
      await criarNoBanco('Bruno Teste');
      await criarNoBanco('Carla Teste', { ativo: false });

      const res = await binary(
        http().get(`${BASE}/export`).query({
          format: 'xlsx',
          status: 'ativo',
          sort: 'nome:desc',
          columns: 'nome,registro,ativo',
        }),
      ).expect(200);

      const workbook = new Workbook();
      await workbook.xlsx.load(res.body as unknown as ArrayBuffer);
      const rows: unknown[][] = [];
      workbook.worksheets[0]?.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
      expect(rows).toEqual([
        ['Nome', 'Registro', 'Status'],
        ['Bruno Teste', undefined, 'Ativo'],
        ['Ana Teste', 'CRM 1', 'Ativo'],
      ]);
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
        .query({ format: 'xlsx', columns: 'cpf' })
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
      { metodo: 'patch', caminho: `${BASE}/${INEXISTENTE}/status`, permissao: 'editar' },
      { metodo: 'put', caminho: `${BASE}/${INEXISTENTE}/arquivos/foto`, permissao: 'editar' },
      { metodo: 'delete', caminho: `${BASE}/${INEXISTENTE}`, permissao: 'excluir' },
      { metodo: 'get', caminho: `${BASE}/${INEXISTENTE}/contratos`, permissao: 'ver' },
      { metodo: 'get', caminho: `${BASE}/${INEXISTENTE}/horarios`, permissao: 'ver' },
      { metodo: 'put', caminho: `${BASE}/${INEXISTENTE}/horarios`, permissao: 'editar' },
      { metodo: 'get', caminho: `${BASE}/${INEXISTENTE}/bloqueios`, permissao: 'ver' },
      { metodo: 'post', caminho: `${BASE}/${INEXISTENTE}/bloqueios`, permissao: 'editar' },
      {
        metodo: 'delete',
        caminho: `${BASE}/${INEXISTENTE}/bloqueios/${INEXISTENTE}`,
        permissao: 'editar',
      },
      { metodo: 'get', caminho: BASE_ESPECIALIDADES, permissao: 'ver' },
      { metodo: 'post', caminho: BASE_ESPECIALIDADES, permissao: 'editar' },
      { metodo: 'patch', caminho: `${BASE_ESPECIALIDADES}/${INEXISTENTE}`, permissao: 'editar' },
      { metodo: 'delete', caminho: `${BASE_ESPECIALIDADES}/${INEXISTENTE}`, permissao: 'editar' },
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
        expect(await prisma.auditLog.count({ where: { action: { not: 'EXPORT' } } })).toBe(0);
      },
    );
  });
});
