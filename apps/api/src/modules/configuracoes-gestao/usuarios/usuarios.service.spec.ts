import type { TransactionHost } from '@nestjs-cls/transactional';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { Prisma } from '../../../generated/prisma/client';
import { UsuariosService } from './usuarios.service';

const CRIADOR_ID = '11111111-1111-4111-8111-111111111111';
const PERFIL_ID = '22222222-2222-4222-8222-222222222222';
const EMPRESA_ID = '33333333-3333-4333-8333-333333333333';

interface UsuarioFake {
  id: string;
  email: string;
  [chave: string]: unknown;
}

const USUARIO: UsuarioFake = {
  id: '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
  empresaId: EMPRESA_ID,
  perfilId: null,
  nome: 'Ana Luiza',
  email: 'ana@example.com',
  telefone: null,
  cargo: null,
  senhaHash: 'hash-antigo',
  verDadosSensiveis: false,
  ativo: true,
  ultimoLoginEm: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  deletedAt: null,
  perfil: null,
  profissionais: [],
};

interface WhereFake {
  id?: string | { not?: string };
  email?: string;
}

/** Fake fiel o bastante para distinguir a busca por id (`buscar`) da checagem de email único. */
function montarTxHost(opcoes: { usuarios?: UsuarioFake[]; perfis?: unknown[] } = {}) {
  const usuarios = opcoes.usuarios ?? [USUARIO];
  const perfis = opcoes.perfis ?? [];

  const findFirst = jest.fn().mockImplementation((args: { where: WhereFake }) => {
    const { where } = args;
    if (where.email !== undefined) {
      const ignorarId = typeof where.id === 'object' ? where.id.not : undefined;
      return Promise.resolve(
        usuarios.find((u) => u.email === where.email && u.id !== ignorarId) ?? null,
      );
    }
    const id = typeof where.id === 'string' ? where.id : undefined;
    return Promise.resolve(usuarios.find((u) => u.id === id) ?? null);
  });

  const usuarioDelegate = {
    findMany: jest.fn().mockResolvedValue(usuarios),
    count: jest.fn().mockResolvedValue(usuarios.length),
    findFirst,
    findUniqueOrThrow: jest.fn().mockResolvedValue({ empresaId: EMPRESA_ID }),
    create: jest.fn().mockResolvedValue(usuarios[0] ?? USUARIO),
    update: jest.fn().mockResolvedValue(usuarios[0] ?? USUARIO),
  };
  const perfilDelegate = { findFirst: jest.fn().mockResolvedValue(perfis[0] ?? null) };
  const txHost = {
    tx: { usuario: usuarioDelegate, perfil: perfilDelegate },
  } as unknown as TransactionHost<PrismaAdapter>;
  return { txHost, usuarioDelegate };
}

const exportServiceFalso = { ensureWithinLimit: jest.fn(), export: jest.fn() } as never;

describe('UsuariosService', () => {
  it('404 quando não existe', async () => {
    const { txHost } = montarTxHost({ usuarios: [] });

    await expect(
      new UsuariosService(txHost, exportServiceFalso).findByIdDto(USUARIO.id),
    ).rejects.toMatchObject({ message: 'Usuário não encontrado' });
  });

  it('nunca retorna senhaHash', async () => {
    const { txHost } = montarTxHost();

    const dto = await new UsuariosService(txHost, exportServiceFalso).findByIdDto(USUARIO.id);

    expect(dto).not.toHaveProperty('senhaHash');
    expect(dto.perfilNome).toBeNull();
  });

  describe('create', () => {
    const ENTRADA = {
      nome: 'Carlos',
      email: 'carlos@example.com',
      senha: 'senha-123456',
      telefone: null,
      cargo: null,
      perfilId: null,
      verDadosSensiveis: false,
      profissionalIds: [] as string[],
    } as const;

    it('herda a empresa do criador e grava o hash da senha, sem a senha em texto puro', async () => {
      const { txHost, usuarioDelegate } = montarTxHost();

      await new UsuariosService(txHost, exportServiceFalso).create(ENTRADA, CRIADOR_ID);

      expect(usuarioDelegate.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: CRIADOR_ID },
        select: { empresaId: true },
      });
      const dados = usuarioDelegate.create.mock.calls[0][0].data;
      expect(dados).toMatchObject({
        nome: 'Carlos',
        email: 'carlos@example.com',
        empresaId: EMPRESA_ID,
      });
      expect(dados.senha).toBeUndefined();
      expect(typeof dados.senhaHash).toBe('string');
      expect(dados.senhaHash).not.toBe('senha-123456');
    });

    it('409 com email já cadastrado', async () => {
      const { txHost } = montarTxHost();

      await expect(
        new UsuariosService(txHost, exportServiceFalso).create(
          { ...ENTRADA, email: USUARIO.email },
          CRIADOR_ID,
        ),
      ).rejects.toMatchObject({ message: 'Já existe um usuário com este email' });
    });

    it('404 em "Perfil não encontrado" quando o perfilId informado não existe', async () => {
      const { txHost } = montarTxHost({ perfis: [] });

      await expect(
        new UsuariosService(txHost, exportServiceFalso).create(
          { ...ENTRADA, perfilId: PERFIL_ID },
          CRIADOR_ID,
        ),
      ).rejects.toMatchObject({ message: 'Perfil não encontrado' });
    });
  });

  describe('update', () => {
    it('converte status em ativo e não altera a senha', async () => {
      const { txHost, usuarioDelegate } = montarTxHost();

      await new UsuariosService(txHost, exportServiceFalso).update(USUARIO.id, {
        nome: 'Ana Luiza Cardoso',
        email: USUARIO.email,
        telefone: null,
        cargo: null,
        perfilId: null,
        verDadosSensiveis: false,
        profissionalIds: [] as string[],
        status: 'inativo',
      });

      expect(usuarioDelegate.update).toHaveBeenCalledWith({
        where: { id: USUARIO.id },
        data: expect.objectContaining({ ativo: false, nome: 'Ana Luiza Cardoso' }),
        include: expect.objectContaining({ perfil: { select: { nome: true } } }),
      });
      expect(usuarioDelegate.update.mock.calls[0][0].data).not.toHaveProperty('status');
      expect(usuarioDelegate.update.mock.calls[0][0].data).not.toHaveProperty('senha');
    });

    it('404 para inexistente', async () => {
      const { txHost } = montarTxHost({ usuarios: [] });

      await expect(
        new UsuariosService(txHost, exportServiceFalso).update(USUARIO.id, {
          nome: 'X',
          email: 'x@example.com',
          telefone: null,
          cargo: null,
          perfilId: null,
          verDadosSensiveis: false,
          profissionalIds: [],
          status: 'ativo',
        }),
      ).rejects.toMatchObject({ message: 'Usuário não encontrado' });
    });
  });

  describe('profissionais vinculados (issue #153)', () => {
    const PROF_A = '44444444-4444-4444-8444-444444444444';
    const PROF_B = '55555555-5555-4555-8555-555555555555';
    const EDICAO = {
      nome: 'Ana Luiza',
      email: USUARIO.email,
      telefone: null,
      cargo: null,
      perfilId: null,
      verDadosSensiveis: false,
      status: 'ativo' as const,
    };

    it('create conecta cada profissional informado', async () => {
      const { txHost, usuarioDelegate } = montarTxHost();

      await new UsuariosService(txHost, exportServiceFalso).create(
        {
          nome: 'Carlos',
          email: 'carlos@example.com',
          senha: 'senha-123456',
          telefone: null,
          cargo: null,
          perfilId: null,
          verDadosSensiveis: false,
          profissionalIds: [PROF_A, PROF_B],
        },
        CRIADOR_ID,
      );

      expect(usuarioDelegate.create.mock.calls[0][0].data.profissionais).toEqual({
        create: [
          { profissional: { connect: { id: PROF_A } } },
          { profissional: { connect: { id: PROF_B } } },
        ],
      });
    });

    it('update substitui todos os vínculos (lista vazia remove)', async () => {
      const { txHost, usuarioDelegate } = montarTxHost();
      const service = new UsuariosService(txHost, exportServiceFalso);

      await service.update(USUARIO.id, { ...EDICAO, profissionalIds: [PROF_A] });
      await service.update(USUARIO.id, { ...EDICAO, profissionalIds: [] });

      expect(usuarioDelegate.update.mock.calls[0][0].data.profissionais).toEqual({
        deleteMany: {},
        create: [{ profissional: { connect: { id: PROF_A } } }],
      });
      expect(usuarioDelegate.update.mock.calls[1][0].data.profissionais).toEqual({
        deleteMany: {},
        create: [],
      });
    });

    it('profissional inexistente vira 400 no campo profissionalIds', async () => {
      const { txHost, usuarioDelegate } = montarTxHost();
      usuarioDelegate.update.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('não encontrado', {
          code: 'P2025',
          clientVersion: 'teste',
        }),
      );

      await expect(
        new UsuariosService(txHost, exportServiceFalso).update(USUARIO.id, {
          ...EDICAO,
          profissionalIds: [PROF_A],
        }),
      ).rejects.toMatchObject({
        code: 'PROFISSIONAL_INVALIDO',
        details: [{ field: 'profissionalIds', message: 'Profissional não encontrado' }],
      });
    });

    it('outros erros do banco seguem sem tradução', async () => {
      const { txHost, usuarioDelegate } = montarTxHost();
      usuarioDelegate.update.mockRejectedValueOnce(new Error('falha'));

      await expect(
        new UsuariosService(txHost, exportServiceFalso).update(USUARIO.id, {
          ...EDICAO,
          profissionalIds: [],
        }),
      ).rejects.toThrow('falha');
    });

    it('devolve os profissionais vinculados por nome', async () => {
      const comVinculo = {
        ...USUARIO,
        profissionais: [{ profissional: { id: PROF_A, nome: 'Dra. Teste' } }],
      };
      const { txHost } = montarTxHost({ usuarios: [comVinculo] });

      const dto = await new UsuariosService(txHost, exportServiceFalso).findByIdDto(USUARIO.id);

      expect(dto.profissionais).toEqual([{ id: PROF_A, nome: 'Dra. Teste' }]);
    });
  });

  describe('resetarSenha', () => {
    it('grava um novo hash sem expor a senha', async () => {
      const { txHost, usuarioDelegate } = montarTxHost();

      await new UsuariosService(txHost, exportServiceFalso).resetarSenha(USUARIO.id, {
        senha: 'nova-senha-123',
      });

      const dados = usuarioDelegate.update.mock.calls[0][0].data;
      expect(typeof dados.senhaHash).toBe('string');
      expect(dados.senhaHash).not.toBe('nova-senha-123');
    });

    it('404 para inexistente', async () => {
      const { txHost } = montarTxHost({ usuarios: [] });

      await expect(
        new UsuariosService(txHost, exportServiceFalso).resetarSenha(USUARIO.id, {
          senha: 'nova-senha-123',
        }),
      ).rejects.toMatchObject({ message: 'Usuário não encontrado' });
    });
  });
});
