import type { TransactionHost } from '@nestjs-cls/transactional';
import { PREFERENCIAS_PADRAO } from '@torres/shared';
import type { AuditService } from '../../../common/audit/audit.service';
import { BusinessException } from '../../../common/errors/api.exception';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { ArquivosService } from '../../../common/storage/arquivos.service';
import type { UsuariosService } from '../usuarios/usuarios.service';
import { ConfiguracoesService } from './configuracoes.service';

// Sem CLS no teste unitário: a transação é testada no e2e.
jest.mock('@nestjs-cls/transactional', () => ({
  ...jest.requireActual('@nestjs-cls/transactional'),
  Transactional: () => () => undefined,
}));

const USUARIO_ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const ARQUIVO_ID = '7f1c2a8e-5b9d-4f3e-8a6c-1d2e3f4a5b6c';

const USUARIO = {
  id: USUARIO_ID,
  empresaId: '33333333-3333-4333-8333-333333333333',
  perfilId: null,
  nome: 'Ana Teste',
  email: 'ana@example.com',
  telefone: null,
  cargo: null,
  senhaHash: 'hash',
  verDadosSensiveis: false,
  ativo: true,
  ultimoLoginEm: null,
  avatarArquivoId: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
  deletedAt: null,
};

function setup({
  preferencia = null as Record<string, unknown> | null,
  usoArquivo = 'avatar',
} = {}) {
  const usuario = {
    findUniqueOrThrow: jest.fn().mockResolvedValue(USUARIO),
    update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...USUARIO, ...data })),
  };
  const preferenciaUsuario = {
    findUnique: jest.fn().mockResolvedValue(preferencia),
    upsert: jest
      .fn()
      .mockImplementation(({ create, update }) =>
        Promise.resolve(preferencia ? { ...preferencia, ...update } : create),
      ),
  };
  const txHost = {
    tx: { usuario, preferenciaUsuario },
  } as unknown as TransactionHost<PrismaAdapter>;
  const usuarios = { ensureEmailDisponivel: jest.fn().mockResolvedValue(undefined) };
  const arquivos = { findById: jest.fn().mockResolvedValue({ id: ARQUIVO_ID, uso: usoArquivo }) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new ConfiguracoesService(
    txHost,
    usuarios as unknown as UsuariosService,
    arquivos as unknown as ArquivosService,
    audit as unknown as AuditService,
  );
  return { service, usuario, preferenciaUsuario, usuarios, arquivos, audit };
}

describe('ConfiguracoesService', () => {
  describe('perfil', () => {
    it('obtém o perfil do usuário logado sem dados de login', async () => {
      const { service } = setup();
      const perfil = await service.obterPerfil(USUARIO_ID);
      expect(perfil).toEqual({
        id: USUARIO_ID,
        nome: 'Ana Teste',
        email: 'ana@example.com',
        telefone: null,
        cargo: null,
        avatarArquivoId: null,
        updatedAt: '2026-01-02T00:00:00.000Z',
      });
      expect(perfil).not.toHaveProperty('senhaHash');
    });

    it('não checa o e-mail quando ele não muda e audita o UPDATE', async () => {
      const { service, usuarios, usuario, audit } = setup();
      const input = { nome: 'Ana Nova', email: USUARIO.email, telefone: null, cargo: 'Gerente' };

      const perfil = await service.atualizarPerfil(USUARIO_ID, input);

      expect(perfil).toMatchObject({ nome: 'Ana Nova', cargo: 'Gerente' });
      expect(usuarios.ensureEmailDisponivel).not.toHaveBeenCalled();
      expect(usuario.update).toHaveBeenCalledWith({ where: { id: USUARIO_ID }, data: input });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE',
          entity: 'Usuario',
          entityId: USUARIO_ID,
          before: USUARIO,
        }),
      );
    });

    it('checa se o novo e-mail está livre, ignorando o próprio usuário', async () => {
      const { service, usuarios } = setup();
      await service.atualizarPerfil(USUARIO_ID, {
        nome: 'Ana',
        email: 'novo@example.com',
        telefone: null,
        cargo: null,
      });
      expect(usuarios.ensureEmailDisponivel).toHaveBeenCalledWith('novo@example.com', USUARIO_ID);
    });
  });

  describe('avatar', () => {
    it('grava o arquivo de uso avatar e remove com null', async () => {
      const { service, usuario, audit } = setup();

      expect((await service.definirAvatar(USUARIO_ID, ARQUIVO_ID)).avatarArquivoId).toBe(
        ARQUIVO_ID,
      );
      expect((await service.definirAvatar(USUARIO_ID, null)).avatarArquivoId).toBeNull();
      expect(usuario.update).toHaveBeenLastCalledWith({
        where: { id: USUARIO_ID },
        data: { avatarArquivoId: null },
      });
      expect(audit.record).toHaveBeenCalledTimes(2);
    });

    it('rejeita arquivo enviado com outro uso', async () => {
      const { service, usuario, audit } = setup({ usoArquivo: 'logo-empresa' });
      await expect(service.definirAvatar(USUARIO_ID, ARQUIVO_ID)).rejects.toBeInstanceOf(
        BusinessException,
      );
      expect(usuario.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('preferências', () => {
    it('devolve os padrões quando o usuário nunca alterou nada', async () => {
      const { service } = setup();
      expect(await service.obterPreferencias(USUARIO_ID)).toEqual(PREFERENCIAS_PADRAO);
    });

    it('primeira gravação cria a linha com os padrões e audita CREATE', async () => {
      const { service, preferenciaUsuario, audit } = setup();

      const preferencias = await service.atualizarPreferencias(USUARIO_ID, { tema: 'escuro' });

      expect(preferencias).toEqual({ ...PREFERENCIAS_PADRAO, tema: 'escuro' });
      expect(preferenciaUsuario.upsert).toHaveBeenCalledWith({
        where: { usuarioId: USUARIO_ID },
        create: { ...PREFERENCIAS_PADRAO, tema: 'escuro', usuarioId: USUARIO_ID },
        update: { tema: 'escuro' },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE', entity: 'PreferenciaUsuario', before: null }),
      );
    });

    it('gravações seguintes alteram só o enviado e auditam UPDATE', async () => {
      const existente = { ...PREFERENCIAS_PADRAO, usuarioId: USUARIO_ID, idioma: 'en' };
      const { service, audit } = setup({ preferencia: existente });

      const preferencias = await service.atualizarPreferencias(USUARIO_ID, {
        resumoSemanal: true,
      });

      expect(preferencias).toMatchObject({ idioma: 'en', resumoSemanal: true });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'UPDATE', before: existente }),
      );
    });

    it('valor fora do catálogo gravado no banco volta ao padrão só naquele campo', async () => {
      const { service } = setup({
        preferencia: { ...PREFERENCIAS_PADRAO, esquemaCor: 'amarelo', idioma: 'es' },
      });
      expect(await service.obterPreferencias(USUARIO_ID)).toMatchObject({
        esquemaCor: 'esmeralda',
        idioma: 'es',
      });
    });
  });
});
