import type { INestApplication } from '@nestjs/common';
import {
  apiErrorSchema,
  arquivoLinkSchema,
  atendimentoAnexoListaSchema,
  atendimentoAnexoSchema,
  atendimentoDocumentoListaSchema,
  atendimentoDocumentoSchema,
  atendimentoSchema,
  atendimentoVersaoListaSchema,
  atendimentoVersaoSchema,
  type Permissao,
} from '@torres/shared';
import request from 'supertest';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, SENHA_TESTE, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit, expectNoAudit } from '../utils/expect-audit';

const BASE = '/api/consultorio-assistencial/prontuarios';
const CLINICAS: readonly Permissao[] = [
  'consultorio-assistencial.prontuarios.ver',
  'consultorio-assistencial.prontuarios.criar',
  'consultorio-assistencial.prontuarios.editar',
  'consultorio-assistencial.prontuarios.excluir',
];
const ASSINAR: Permissao = 'consultorio-assistencial.prontuarios.assinar';
const INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const PDF = Buffer.from('%PDF-1.7\n% exame fictício\n');

/** Issue #151: exames, anexos, documentos, assinatura e histórico de versões do atendimento. */
describe('Prontuários: anexos, documentos, assinatura e versões (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let medicoA: UsuarioTeste;
  let medicoB: UsuarioTeste;
  let recepcaoA: UsuarioTeste;
  let semPermissao: UsuarioTeste;
  let admin: UsuarioTeste;
  let profA: { id: string };
  let profB: { id: string };
  let paciente: { id: string };
  let atendimentoId: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    profA = await prisma.profissional.create({ data: { nome: 'Dr. Fictício A' } });
    profB = await prisma.profissional.create({ data: { nome: 'Dra. Fictícia B' } });
    paciente = await prisma.paciente.create({ data: { nome: 'Paciente Fictício' } });
    medicoA = await criarUsuarioTeste(app, {
      permissoes: [...CLINICAS, ASSINAR],
      escopoDados: 'PROFISSIONAIS_VINCULADOS',
      profissionalIds: [profA.id],
    });
    medicoB = await criarUsuarioTeste(app, {
      permissoes: [...CLINICAS, ASSINAR],
      escopoDados: 'PROFISSIONAIS_VINCULADOS',
      profissionalIds: [profB.id],
    });
    // Recepção vinculada ao mesmo profissional, mas sem a permissão de assinar.
    recepcaoA = await criarUsuarioTeste(app, {
      permissoes: CLINICAS,
      escopoDados: 'PROFISSIONAIS_VINCULADOS',
      profissionalIds: [profA.id],
    });
    // Administração vê tudo, mas não é o profissional responsável.
    admin = await criarUsuarioTeste(app, { permissoes: [...CLINICAS, ASSINAR] });
    semPermissao = await criarUsuarioTeste(app, { permissoes: [] });
    const atendimento = await prisma.atendimento.create({
      data: {
        pacienteId: paciente.id,
        profissionalId: profA.id,
        queixa: 'Queixa original',
        conduta: 'Conduta original',
      },
    });
    atendimentoId = atendimento.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const url = (resto = '', id = atendimentoId) =>
    `${BASE}/${paciente.id}/atendimentos/${id}${resto}`;

  function erro(body: unknown) {
    return apiErrorSchema.parse(body);
  }

  async function assinar(usuario = medicoA) {
    return comUsuario(app, usuario).post(url('/assinatura')).send({ senha: SENHA_TESTE });
  }

  async function enviarArquivo(
    usuario: UsuarioTeste,
    uso = 'anexo-atendimento',
    conteudo = PDF,
  ): Promise<string> {
    const res = await comUsuario(app, usuario)
      .post('/api/arquivos')
      .query({ uso })
      .attach('arquivo', conteudo, { filename: 'exame.pdf', contentType: 'application/pdf' })
      .expect(201);
    return res.body.id as string;
  }

  describe('PATCH atendimento (edição antes de assinar)', () => {
    it('corrige o conteúdo e audita antes/depois', async () => {
      const res = await comUsuario(app, medicoA)
        .patch(url())
        .send({ queixa: '  Queixa corrigida  ', conduta: null })
        .expect(200);
      const corpo = atendimentoSchema.parse(res.body);
      expect(corpo).toMatchObject({ queixa: 'Queixa corrigida', conduta: null, assinadoEm: null });
      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Atendimento',
        entityId: atendimentoId,
        before: { queixa: 'Queixa original' },
        after: { queixa: 'Queixa corrigida' },
        userId: medicoA.id,
      });
    });

    it('400 com tipo inválido, 404 inexistente, 403 sem permissão e fora do escopo', async () => {
      const invalido = await comUsuario(app, medicoA)
        .patch(url())
        .send({ tipo: 'XYZ' })
        .expect(400);
      expect(erro(invalido.body).code).toBe('VALIDATION_ERROR');
      await comUsuario(app, medicoA).patch(url('', INEXISTENTE)).send({}).expect(404);
      await comUsuario(app, semPermissao).patch(url()).send({}).expect(403);
      await comUsuario(app, medicoB).patch(url()).send({ queixa: 'x' }).expect(403);
      expect(
        (await prisma.atendimento.findUniqueOrThrow({ where: { id: atendimentoId } })).queixa,
      ).toBe('Queixa original');
    });
  });

  describe('assinatura', () => {
    it('o responsável assina com a senha: finaliza, grava a versão 1 e audita', async () => {
      const res = await assinar().then((r) => {
        expect(r.status).toBe(200);
        return r;
      });
      const corpo = atendimentoSchema.parse(res.body);
      expect(corpo.status).toBe('FINALIZADO');
      expect(corpo.assinadoEm).not.toBeNull();
      expect(corpo.totalAdendos).toBe(0);
      expect(corpo.assinadoPorNome).not.toBeNull();

      const gravado = await prisma.atendimento.findUniqueOrThrow({ where: { id: atendimentoId } });
      expect(gravado.assinadoPorId).toBe(medicoA.id);
      expect(gravado.finalizadoEm).not.toBeNull();
      expect(gravado.assinaturaHash).toMatch(/^[0-9a-f]{64}$/);

      const versoes = await prisma.atendimentoVersao.findMany({ where: { atendimentoId } });
      expect(versoes).toHaveLength(1);
      expect(versoes[0]).toMatchObject({ numero: 1, tipo: 'ASSINATURA', usuarioId: medicoA.id });
      expect(versoes[0]?.hash).toBe(gravado.assinaturaHash);

      await expectAudit(prisma, {
        action: 'UPDATE',
        entity: 'Atendimento',
        entityId: atendimentoId,
        before: { assinadoEm: null },
        after: { status: 'FINALIZADO' },
        userId: medicoA.id,
      });
    });

    it('senha incorreta: 422, nada muda e nada é auditado', async () => {
      const res = await comUsuario(app, medicoA)
        .post(url('/assinatura'))
        .send({ senha: 'errada' })
        .expect(422);
      expect(erro(res.body).code).toBe('ASSINATURA_SENHA_INVALIDA');
      expect(
        (await prisma.atendimento.findUniqueOrThrow({ where: { id: atendimentoId } })).assinadoEm,
      ).toBeNull();
      await expectNoAudit(prisma, { entity: 'Atendimento', action: 'UPDATE' });
    });

    it('400 sem senha; 404 inexistente', async () => {
      await comUsuario(app, medicoA).post(url('/assinatura')).send({}).expect(400);
      await comUsuario(app, medicoA)
        .post(url('/assinatura', INEXISTENTE))
        .send({ senha: SENHA_TESTE })
        .expect(404);
    });

    it('403: sem a permissão de assinar, fora do escopo e quem não é o responsável', async () => {
      await assinar(recepcaoA).then((r) => expect(r.status).toBe(403));
      await assinar(medicoB).then((r) => expect(r.status).toBe(403));
      // Administração tem a permissão e o escopo TODOS, mas não é o profissional vinculado.
      await assinar(admin).then((r) => expect(r.status).toBe(403));
      await assinar(semPermissao).then((r) => expect(r.status).toBe(403));
      expect(await prisma.atendimentoVersao.count()).toBe(0);
    });

    it('já assinado: 409', async () => {
      await assinar().then((r) => expect(r.status).toBe(200));
      const res = await assinar();
      expect(res.status).toBe(409);
      expect(erro(res.body).code).toBe('ATENDIMENTO_JA_ASSINADO');
    });

    it('atendimento da agenda só é assinado depois de finalizado', async () => {
      const daAgenda = await prisma.atendimento.create({
        data: {
          pacienteId: paciente.id,
          profissionalId: profA.id,
          agendamentoId: INEXISTENTE,
          status: 'EM_ANDAMENTO',
        },
      });
      const res = await comUsuario(app, medicoA)
        .post(url('/assinatura', daAgenda.id))
        .send({ senha: SENHA_TESTE });
      expect(res.status).toBe(409);
      expect(erro(res.body).code).toBe('ATENDIMENTO_NAO_FINALIZADO');

      await prisma.atendimento.update({
        where: { id: daAgenda.id },
        data: { status: 'FINALIZADO' },
      });
      await comUsuario(app, medicoA)
        .post(url('/assinatura', daAgenda.id))
        .send({ senha: SENHA_TESTE })
        .expect(200);
    });
  });

  describe('registro assinado: sem edição, correção por adendo', () => {
    beforeEach(async () => {
      await assinar().then((r) => expect(r.status).toBe(200));
    });

    it('PATCH recusa a edição (409) e não altera o registro', async () => {
      const res = await comUsuario(app, medicoA).patch(url()).send({ queixa: 'Nova' }).expect(409);
      expect(erro(res.body).code).toBe('ATENDIMENTO_ASSINADO');
      expect(
        (await prisma.atendimento.findUniqueOrThrow({ where: { id: atendimentoId } })).queixa,
      ).toBe('Queixa original');
    });

    it('o adendo vira a versão 2, com antes/depois, sem tocar no original', async () => {
      const res = await comUsuario(app, medicoA)
        .post(url('/adendos'))
        .send({ texto: '  Correção: dose ajustada.  ' })
        .expect(201);
      const versao = atendimentoVersaoSchema.parse(res.body);
      expect(versao).toMatchObject({
        numero: 2,
        tipo: 'ADENDO',
        texto: 'Correção: dose ajustada.',
        usuarioId: medicoA.id,
      });
      expect(versao.antes?.adendos).toEqual([]);
      expect(versao.depois.adendos).toEqual(['Correção: dose ajustada.']);
      expect(versao.depois.queixa).toBe('Queixa original');

      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'AtendimentoVersao',
        entityId: versao.id,
        before: null,
        after: { numero: 2, tipo: 'ADENDO' },
        userId: medicoA.id,
      });

      await comUsuario(app, medicoA).post(url('/adendos')).send({ texto: 'Segundo' }).expect(201);
      const historico = atendimentoVersaoListaSchema.parse(
        (await comUsuario(app, medicoA).get(url('/versoes')).expect(200)).body,
      );
      expect(historico.data.map((v) => [v.numero, v.tipo])).toEqual([
        [1, 'ASSINATURA'],
        [2, 'ADENDO'],
        [3, 'ADENDO'],
      ]);
      expect(historico.data[2]?.antes?.adendos).toEqual(['Correção: dose ajustada.']);
      expect(historico.data[0]?.usuarioNome).not.toBeNull();

      const lista = await comUsuario(app, medicoA)
        .get(`${BASE}/${paciente.id}/atendimentos`)
        .expect(200);
      expect(lista.body.data[0]).toMatchObject({ totalAdendos: 2 });
    });

    it('adendo: 400 sem texto, 403 sem permissão/escopo/responsável', async () => {
      await comUsuario(app, medicoA).post(url('/adendos')).send({ texto: '  ' }).expect(400);
      await comUsuario(app, recepcaoA).post(url('/adendos')).send({ texto: 'x' }).expect(403);
      await comUsuario(app, medicoB).post(url('/adendos')).send({ texto: 'x' }).expect(403);
      await comUsuario(app, admin).post(url('/adendos')).send({ texto: 'x' }).expect(403);
      expect(await prisma.atendimentoVersao.count()).toBe(1);
    });

    it('as versões só aparecem para quem tem o atendimento no escopo (e ficam no log de acesso)', async () => {
      await comUsuario(app, medicoB).get(url('/versoes')).expect(403);
      await comUsuario(app, semPermissao).get(url('/versoes')).expect(403);
      await comUsuario(app, recepcaoA).get(url('/versoes')).expect(200);
      const acessos = await prisma.prontuarioAcesso.findMany({ where: { recurso: 'VERSOES' } });
      expect(acessos).toHaveLength(1);
      expect(acessos[0]?.usuarioId).toBe(recepcaoA.id);
    });
  });

  it('adendo em atendimento ainda não assinado: 409', async () => {
    const res = await comUsuario(app, medicoA)
      .post(url('/adendos'))
      .send({ texto: 'Adendo' })
      .expect(409);
    expect(erro(res.body).code).toBe('ATENDIMENTO_NAO_ASSINADO');
  });

  describe('exames e anexos', () => {
    const corpo = (arquivoId: string) => ({
      tipo: 'EXAME',
      arquivoId,
      data: '2026-11-20',
      descricao: '  Hemograma completo  ',
    });

    it('anexa, lista, baixa por link temporário e audita', async () => {
      const arquivoId = await enviarArquivo(medicoA);
      const res = await comUsuario(app, medicoA)
        .post(url('/anexos'))
        .send(corpo(arquivoId))
        .expect(201);
      const anexo = atendimentoAnexoSchema.parse(res.body);
      expect(anexo).toMatchObject({
        tipo: 'EXAME',
        data: '2026-11-20',
        descricao: 'Hemograma completo',
        arquivoNome: 'exame.pdf',
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'AtendimentoAnexo',
        entityId: anexo.id,
        before: null,
        after: { tipo: 'EXAME', arquivoId },
        userId: medicoA.id,
      });

      const lista = atendimentoAnexoListaSchema.parse(
        (await comUsuario(app, medicoA).get(url('/anexos')).expect(200)).body,
      );
      expect(lista.data.map((a) => a.id)).toEqual([anexo.id]);

      const link = arquivoLinkSchema.parse(
        (
          await comUsuario(app, medicoA)
            .get(url(`/anexos/${anexo.id}/link`))
            .expect(200)
        ).body,
      );
      const download = await request(app.getHttpServer()).get(link.url).expect(200);
      expect(download.headers['content-type']).toContain('application/pdf');
      expect(Buffer.from(download.body as Buffer).toString()).toContain('%PDF-1.7');

      const acessos = await prisma.prontuarioAcesso.findMany({ where: { recurso: 'ANEXOS' } });
      expect(acessos.length).toBeGreaterThanOrEqual(2);
    });

    it('400: dados inválidos e arquivo de outro uso', async () => {
      const sem = await comUsuario(app, medicoA).post(url('/anexos')).send({}).expect(400);
      expect(erro(sem.body).code).toBe('VALIDATION_ERROR');
      const outroUso = await enviarArquivo(medicoA, 'documento-profissional');
      const res = await comUsuario(app, medicoA)
        .post(url('/anexos'))
        .send(corpo(outroUso))
        .expect(400);
      expect(erro(res.body).code).toBe('ARQUIVO_USO_INVALIDO');
      await comUsuario(app, medicoA).post(url('/anexos')).send(corpo(INEXISTENTE)).expect(404);
      expect(await prisma.atendimentoAnexo.count()).toBe(0);
    });

    it('o responsável (escopo) controla a lista, o link e a gravação', async () => {
      const arquivoId = await enviarArquivo(medicoA);
      const criado = atendimentoAnexoSchema.parse(
        (await comUsuario(app, medicoA).post(url('/anexos')).send(corpo(arquivoId)).expect(201))
          .body,
      );
      await comUsuario(app, medicoB).get(url('/anexos')).expect(403);
      await comUsuario(app, medicoB)
        .get(url(`/anexos/${criado.id}/link`))
        .expect(403);
      await comUsuario(app, medicoB).post(url('/anexos')).send(corpo(arquivoId)).expect(403);
      await comUsuario(app, semPermissao).get(url('/anexos')).expect(403);
      await comUsuario(app, medicoA)
        .get(url('/anexos/' + INEXISTENTE + '/link'))
        .expect(404);
    });

    it('os endpoints genéricos de arquivos não entregam o exame (uso privado)', async () => {
      const arquivoId = await enviarArquivo(medicoA);
      await comUsuario(app, medicoB).get(`/api/arquivos/${arquivoId}/link`).expect(403);
      await comUsuario(app, medicoB).get(`/api/arquivos/${arquivoId}`).expect(403);
      await comUsuario(app, medicoB).delete(`/api/arquivos/${arquivoId}`).expect(403);
    });

    it('exclui antes de assinar; depois da assinatura mantém (409) mas aceita novo exame', async () => {
      // O upload termina antes de montar a requisição: o supertest fecha o servidor ao fim de cada uma.
      const anexar = async () => {
        const arquivoId = await enviarArquivo(medicoA);
        const res = await comUsuario(app, medicoA)
          .post(url('/anexos'))
          .send(corpo(arquivoId))
          .expect(201);
        return atendimentoAnexoSchema.parse(res.body);
      };
      const a1 = await anexar();
      const a2 = await anexar();
      await comUsuario(app, medicoA)
        .delete(url(`/anexos/${a1.id}`))
        .expect(200);
      await expectAudit(prisma, {
        action: 'DELETE',
        entity: 'AtendimentoAnexo',
        entityId: a1.id,
        before: { tipo: 'EXAME' },
        after: null,
      });
      await comUsuario(app, medicoA)
        .get(url(`/anexos/${a1.id}/link`))
        .expect(404);

      await assinar().then((r) => expect(r.status).toBe(200));
      const bloqueado = await comUsuario(app, medicoA)
        .delete(url(`/anexos/${a2.id}`))
        .expect(409);
      expect(erro(bloqueado.body).code).toBe('ATENDIMENTO_ASSINADO');
      await anexar();
      await comUsuario(app, medicoB)
        .delete(url(`/anexos/${a2.id}`))
        .expect(403);
    });
  });

  describe('documentos emitidos', () => {
    const corpo = {
      tipo: 'ATESTADO',
      texto: '  Atesto repouso por 2 dias.  ',
      dataEmissao: '2026-11-21',
    };

    it('emite, lista e audita', async () => {
      const res = await comUsuario(app, medicoA).post(url('/documentos')).send(corpo).expect(201);
      const documento = atendimentoDocumentoSchema.parse(res.body);
      expect(documento).toMatchObject({
        tipo: 'ATESTADO',
        texto: 'Atesto repouso por 2 dias.',
        dataEmissao: '2026-11-21',
      });
      await expectAudit(prisma, {
        action: 'CREATE',
        entity: 'AtendimentoDocumento',
        entityId: documento.id,
        before: null,
        after: { tipo: 'ATESTADO' },
        userId: medicoA.id,
      });
      const lista = atendimentoDocumentoListaSchema.parse(
        (await comUsuario(app, medicoA).get(url('/documentos')).expect(200)).body,
      );
      expect(lista.data).toHaveLength(1);
    });

    it('400 sem texto ou com tipo inválido; 403 fora do escopo ou sem permissão', async () => {
      const sem = await comUsuario(app, medicoA)
        .post(url('/documentos'))
        .send({ ...corpo, texto: ' ' })
        .expect(400);
      expect(erro(sem.body).details?.[0]?.message).toBe('Texto é obrigatório.');
      await comUsuario(app, medicoA)
        .post(url('/documentos'))
        .send({ ...corpo, tipo: 'RECEITA' })
        .expect(400);
      await comUsuario(app, medicoB).post(url('/documentos')).send(corpo).expect(403);
      await comUsuario(app, medicoB).get(url('/documentos')).expect(403);
      await comUsuario(app, semPermissao).get(url('/documentos')).expect(403);
    });

    it('exclui antes de assinar; assinado mantém o documento (409) mas aceita novo', async () => {
      const d1 = atendimentoDocumentoSchema.parse(
        (await comUsuario(app, medicoA).post(url('/documentos')).send(corpo).expect(201)).body,
      );
      const d2 = atendimentoDocumentoSchema.parse(
        (
          await comUsuario(app, medicoA)
            .post(url('/documentos'))
            .send({ ...corpo, tipo: 'DECLARACAO' })
            .expect(201)
        ).body,
      );
      await comUsuario(app, medicoA)
        .delete(url(`/documentos/${d1.id}`))
        .expect(200);
      await expectAudit(prisma, {
        action: 'DELETE',
        entity: 'AtendimentoDocumento',
        entityId: d1.id,
        before: { tipo: 'ATESTADO' },
        after: null,
      });
      await comUsuario(app, medicoA)
        .delete(url(`/documentos/${d1.id}`))
        .expect(404);

      await assinar().then((r) => expect(r.status).toBe(200));
      await comUsuario(app, medicoA)
        .delete(url(`/documentos/${d2.id}`))
        .expect(409);
      await comUsuario(app, medicoA)
        .post(url('/documentos'))
        .send({ ...corpo, tipo: 'SOLICITACAO_EXAME' })
        .expect(201);
    });
  });
});
