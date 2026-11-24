import type { INestApplication } from '@nestjs/common';
import {
  arquivoLinkSchema,
  profissionalDocumentoAlertasResponseSchema,
  profissionalDocumentoSchema,
  profissionalDocumentosResponseSchema,
} from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

/** Documentos do profissional (issue #141). */
const BASE = '/api/gestao-profissionais/profissionais';
const ENTITY = 'ProfissionalDocumento';
const PERMISSOES_EDICAO = [
  'gestao-profissionais.profissionais.ver',
  'gestao-profissionais.profissionais.editar',
] as const;
const PERMISSOES = [
  ...PERMISSOES_EDICAO,
  'gestao-profissionais.profissionais-documentos.validar',
] as const;
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';

function diasDeHoje(dias: number): string {
  const data = new Date();
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

describe('Documentos do profissional (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;
  let profissionalId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, { permissoes: PERMISSOES });
    profissionalId = (
      await prisma.profissional.create({ data: { nome: 'Dra. Ana Teste', profissao: 'MEDICO' } })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => comUsuario(app, usuario);
  const url = (id = profissionalId, resto = '') => `${BASE}/${id}/documentos${resto}`;

  async function criarArquivo(uso = 'documento-profissional'): Promise<string> {
    const arquivo = await prisma.arquivo.create({
      data: {
        uso,
        nomeOriginal: 'crm.pdf',
        contentType: 'application/pdf',
        tamanho: 10,
        chave: `${uso}/${Math.random().toString(36).slice(2)}`,
      },
    });
    return arquivo.id;
  }

  async function corpo(extra: Record<string, unknown> = {}) {
    return {
      tipo: 'REGISTRO_CONSELHO',
      arquivoId: await criarArquivo(),
      numero: '12345-SP',
      emissao: '2024-01-10',
      validade: diasDeHoje(200),
      ...extra,
    };
  }

  async function criarNoBanco(extra: Record<string, unknown> = {}, profissional = profissionalId) {
    return prisma.profissionalDocumento.create({
      data: {
        profissionalId: profissional,
        tipo: 'REGISTRO_CONSELHO',
        arquivoId: await criarArquivo(),
        ...extra,
      },
    });
  }

  describe('POST', () => {
    it('201 registra como Enviado e audita a criação', async () => {
      const res = await http()
        .post(url())
        .send(await corpo())
        .expect(201);
      const doc = profissionalDocumentoSchema.parse(res.body);
      expect(doc).toMatchObject({
        tipo: 'REGISTRO_CONSELHO',
        situacao: 'ENVIADO',
        numero: '12345-SP',
        arquivoNome: 'crm.pdf',
        alerta: null,
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: ENTITY,
        entityId: doc.id,
        before: null,
        after: { tipo: 'REGISTRO_CONSELHO', situacao: 'ENVIADO' },
        userId: usuario.id,
      });
    });

    it('400 com tipo inválido, arquivo ausente, validade antes da emissão e uso de arquivo errado', async () => {
      const ruim = await http()
        .post(url())
        .send(await corpo({ tipo: 'XYZ', arquivoId: undefined }))
        .expect(400);
      expect(ruim.body.code).toBe('VALIDATION_ERROR');
      await http()
        .post(url())
        .send(await corpo({ emissao: '2026-05-10', validade: '2026-05-09' }))
        .expect(400);
      const usoErrado = await http()
        .post(url())
        .send(await corpo({ arquivoId: await criarArquivo('avatar') }))
        .expect(400);
      expect(usoErrado.body.code).toBe('ARQUIVO_USO_INVALIDO');
      await expectNoAudit(prisma, { entity: ENTITY });
    });

    it('404 com profissional ou arquivo inexistente', async () => {
      await http()
        .post(url(INEXISTENTE))
        .send(await corpo())
        .expect(404);
      await http()
        .post(url())
        .send(await corpo({ arquivoId: INEXISTENTE }))
        .expect(404);
    });

    it('403 sem permissão de editar, e para perfil restrito a outro profissional', async () => {
      const soVer = await criarUsuarioTeste(app, {
        permissoes: ['gestao-profissionais.profissionais.ver'],
      });
      await comUsuario(app, soVer)
        .post(url())
        .send(await corpo())
        .expect(403);
      const outro = await prisma.profissional.create({ data: { nome: 'Dr. Outro' } });
      const restrito = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [outro.id],
      });
      await comUsuario(app, restrito)
        .post(url())
        .send(await corpo())
        .expect(403);
      await expectNoAudit(prisma, { entity: ENTITY });
    });
  });

  describe('GET', () => {
    it('lista com situação calculada (vencido), pendências e documentação não validada', async () => {
      await criarNoBanco({
        situacao: 'VALIDADO',
        validade: new Date(`${diasDeHoje(-1)}T00:00:00Z`),
      });
      await criarNoBanco({ tipo: 'CONTRATO' });
      const res = await http().get(url()).expect(200);
      const corpoRes = profissionalDocumentosResponseSchema.parse(res.body);
      const registro = corpoRes.data.find((d) => d.tipo === 'REGISTRO_CONSELHO');
      expect(registro).toMatchObject({
        situacao: 'VENCIDO',
        alerta: 'vencido',
        diasParaVencer: -1,
      });
      expect(corpoRes.pendentes).toEqual(['DOCUMENTO_PESSOAL']);
      expect(corpoRes.documentacaoValidada).toBe(false);
    });

    it('documentação validada quando todos os obrigatórios estão validados e em dia', async () => {
      for (const tipo of ['CONTRATO', 'DOCUMENTO_PESSOAL', 'REGISTRO_CONSELHO']) {
        await criarNoBanco({
          tipo,
          situacao: 'VALIDADO',
          validade: new Date(`${diasDeHoje(90)}T00:00:00Z`),
        });
      }
      const res = await http().get(url()).expect(200);
      expect(res.body).toMatchObject({ pendentes: [], documentacaoValidada: true });
    });

    it('recusado continua pendente e não conta como validado', async () => {
      await criarNoBanco({ tipo: 'CONTRATO', situacao: 'RECUSADO', motivoRecusa: 'Ilegível' });
      const res = await http().get(url()).expect(200);
      expect(res.body.pendentes).toContain('CONTRATO');
    });

    it('lista de alertas: vencidos e a vencer em 60 dias, sem recusados nem os distantes', async () => {
      const vencido = await criarNoBanco({ validade: new Date(`${diasDeHoje(-5)}T00:00:00Z`) });
      const proximo = await criarNoBanco({
        tipo: 'LICENCA',
        validade: new Date(`${diasDeHoje(20)}T00:00:00Z`),
      });
      await criarNoBanco({ tipo: 'RQE', validade: new Date(`${diasDeHoje(200)}T00:00:00Z`) });
      await criarNoBanco({
        tipo: 'CERTIFICADO',
        situacao: 'RECUSADO',
        validade: new Date(`${diasDeHoje(-3)}T00:00:00Z`),
      });
      const res = await http().get(`${BASE}/documentos/alertas`).expect(200);
      const alertas = profissionalDocumentoAlertasResponseSchema.parse(res.body).data;
      expect(alertas.map((a) => a.id)).toEqual([vencido.id, proximo.id]);
      expect(alertas[0]).toMatchObject({ alerta: 'vencido', profissionalNome: 'Dra. Ana Teste' });
      expect(alertas[1]?.alerta).toBe('alerta-30');
    });

    it('404 com profissional inexistente; 403 sem permissão; restrito só vê o seu', async () => {
      await http().get(url(INEXISTENTE)).expect(404);
      const sem = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, sem).get(url()).expect(403);
      const outro = await prisma.profissional.create({ data: { nome: 'Dr. Outro' } });
      await criarNoBanco({ validade: new Date(`${diasDeHoje(-5)}T00:00:00Z`) });
      await criarNoBanco({ validade: new Date(`${diasDeHoje(-5)}T00:00:00Z`) }, outro.id);
      const restrito = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [outro.id],
      });
      await comUsuario(app, restrito).get(url()).expect(403);
      const alertas = await comUsuario(app, restrito).get(`${BASE}/documentos/alertas`).expect(200);
      expect(alertas.body.data).toHaveLength(1);
      expect(alertas.body.data[0].profissionalId).toBe(outro.id);
    });
  });

  describe('PATCH', () => {
    it('200 altera, volta para Enviado, limpa a validação e audita antes/depois', async () => {
      const doc = await criarNoBanco({
        situacao: 'VALIDADO',
        validadoPorId: usuario.id,
        validadoEm: new Date(),
      });
      const res = await http()
        .patch(url(profissionalId, `/${doc.id}`))
        .send(await corpo({ numero: '99999-SP' }))
        .expect(200);
      expect(profissionalDocumentoSchema.parse(res.body)).toMatchObject({
        situacao: 'ENVIADO',
        numero: '99999-SP',
        validadoPorId: null,
        validadoEm: null,
      });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: doc.id,
        before: { situacao: 'VALIDADO' },
        after: { situacao: 'ENVIADO', numero: '99999-SP' },
      });
    });

    it('404 com documento de outro profissional, 400 com dados inválidos', async () => {
      const outro = await prisma.profissional.create({ data: { nome: 'Dr. Outro' } });
      const doc = await criarNoBanco({}, outro.id);
      await http()
        .patch(url(profissionalId, `/${doc.id}`))
        .send(await corpo())
        .expect(404);
      await http()
        .patch(url(outro.id, `/${doc.id}`))
        .send({ tipo: 'CONTRATO' })
        .expect(400);
    });
  });

  describe('POST validação', () => {
    it('200 valida, grava quem e quando, e audita', async () => {
      const doc = await criarNoBanco();
      const res = await http()
        .post(url(profissionalId, `/${doc.id}/validacao`))
        .send({ decisao: 'VALIDAR' })
        .expect(200);
      const dto = profissionalDocumentoSchema.parse(res.body);
      expect(dto).toMatchObject({ situacao: 'VALIDADO', validadoPorId: usuario.id });
      expect(dto.validadoPorNome).toEqual(expect.any(String));
      expect(dto.validadoEm).not.toBeNull();
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: ENTITY,
        entityId: doc.id,
        before: { situacao: 'ENVIADO' },
        after: { situacao: 'VALIDADO', validadoPorId: usuario.id },
        userId: usuario.id,
      });
    });

    it('recusa com motivo; 400 sem motivo', async () => {
      const doc = await criarNoBanco();
      await http()
        .post(url(profissionalId, `/${doc.id}/validacao`))
        .send({ decisao: 'RECUSAR' })
        .expect(400);
      const res = await http()
        .post(url(profissionalId, `/${doc.id}/validacao`))
        .send({ decisao: 'RECUSAR', motivo: 'Documento ilegível' })
        .expect(200);
      expect(res.body).toMatchObject({ situacao: 'RECUSADO', motivoRecusa: 'Documento ilegível' });
    });

    it('403 sem a permissão de validar (só editar), 404 documento inexistente', async () => {
      const doc = await criarNoBanco();
      const editor = await criarUsuarioTeste(app, { permissoes: PERMISSOES_EDICAO });
      await comUsuario(app, editor)
        .post(url(profissionalId, `/${doc.id}/validacao`))
        .send({ decisao: 'VALIDAR' })
        .expect(403);
      await http()
        .post(url(profissionalId, `/${INEXISTENTE}/validacao`))
        .send({ decisao: 'VALIDAR' })
        .expect(404);
      await expectNoAudit(prisma, { entity: ENTITY, action: 'UPDATE' });
    });
  });

  describe('DELETE', () => {
    it('200 remove logicamente e audita; some da listagem', async () => {
      const doc = await criarNoBanco();
      await http()
        .delete(url(profissionalId, `/${doc.id}`))
        .expect(200);
      expect(
        (await prisma.profissionalDocumento.findUniqueOrThrow({ where: { id: doc.id } })).deletedAt,
      ).not.toBeNull();
      await expectAudit(prisma, {
        action: 'DELETE',
        entity: ENTITY,
        entityId: doc.id,
        after: null,
      });
      const lista = await http().get(url()).expect(200);
      expect(lista.body.data).toHaveLength(0);
    });

    it('404 e 403', async () => {
      await http()
        .delete(url(profissionalId, `/${INEXISTENTE}`))
        .expect(404);
      const doc = await criarNoBanco();
      const soVer = await criarUsuarioTeste(app, {
        permissoes: ['gestao-profissionais.profissionais.ver'],
      });
      await comUsuario(app, soVer)
        .delete(url(profissionalId, `/${doc.id}`))
        .expect(403);
    });
  });

  describe('GET link', () => {
    it('200 devolve a URL temporária do arquivo do documento', async () => {
      const doc = await criarNoBanco();
      const res = await http()
        .get(url(profissionalId, `/${doc.id}/link`))
        .expect(200);
      const link = arquivoLinkSchema.parse(res.body);
      expect(link.url).toContain(`/api/arquivos/${doc.arquivoId}/conteudo?`);
    });

    it('404 documento inexistente; 403 sem permissão ou fora do escopo', async () => {
      await http()
        .get(url(profissionalId, `/${INEXISTENTE}/link`))
        .expect(404);
      const doc = await criarNoBanco();
      const sem = await criarUsuarioTeste(app, { permissoes: [] });
      await comUsuario(app, sem)
        .get(url(profissionalId, `/${doc.id}/link`))
        .expect(403);
      const outro = await prisma.profissional.create({ data: { nome: 'Dr. Outro' } });
      const restrito = await criarUsuarioTeste(app, {
        permissoes: PERMISSOES,
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        profissionalIds: [outro.id],
      });
      await comUsuario(app, restrito)
        .get(url(profissionalId, `/${doc.id}/link`))
        .expect(403);
    });
  });
});
