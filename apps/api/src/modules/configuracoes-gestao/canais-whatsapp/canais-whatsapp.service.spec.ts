import type { TransactionHost } from '@nestjs-cls/transactional';
import type { RequestContextService } from '../../../common/context/request-context.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { CanaisWhatsappService } from './canais-whatsapp.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const USUARIO = 'a0000000-0000-4000-8000-000000000001';
const DATA = new Date('2026-11-17T12:00:00.000Z');
const CANAL = {
  id: ID,
  nome: 'Recepção',
  numero: '5565999990000',
  tipo: 'DINASTI_API',
  status: 'DESCONECTADO',
  profissionalId: null,
  profissional: null,
  usuarios: [{ usuarioId: USUARIO }],
  createdAt: DATA,
  updatedAt: DATA,
  deletedAt: null,
};

function setup(userId: string | null = USUARIO) {
  const canalWhatsapp = {
    findMany: jest.fn().mockResolvedValue([CANAL]),
    count: jest.fn().mockResolvedValue(1),
    findFirst: jest.fn().mockResolvedValue(CANAL),
    create: jest.fn().mockResolvedValue(CANAL),
    update: jest.fn().mockResolvedValue(CANAL),
  };
  const canalWhatsappUsuario = {
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    createMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const usuario = {
    count: jest.fn().mockResolvedValue(1),
    findMany: jest.fn().mockResolvedValue([]),
  };
  const txHost = {
    tx: { canalWhatsapp, canalWhatsappUsuario, usuario },
  } as unknown as TransactionHost<PrismaAdapter>;
  const contexto = { getUserId: jest.fn().mockReturnValue(userId ?? undefined) };
  const service = new CanaisWhatsappService(txHost, contexto as unknown as RequestContextService);
  return { service, canalWhatsapp, canalWhatsappUsuario, usuario };
}

describe('CanaisWhatsappService', () => {
  describe('filtroAcesso', () => {
    it('canal sem usuário vinculado (todos) ou com o usuário da requisição', () => {
      expect(setup().service.filtroAcesso()).toEqual({
        OR: [{ usuarios: { none: {} } }, { usuarios: { some: { usuarioId: USUARIO } } }],
      });
    });

    it('sem usuário na requisição (fora de HTTP) não restringe', () => {
      expect(setup(null).service.filtroAcesso()).toEqual({});
    });
  });

  it('lookup: só canais não excluídos e com acesso do usuário', async () => {
    const { service, canalWhatsapp } = setup();

    await service.lookup({
      page: 1,
      pageSize: 10,
      sort: { field: 'nome', direction: 'asc' },
      search: undefined,
    });

    expect(canalWhatsapp.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [{ deletedAt: null }, service.filtroAcesso()] },
      }),
    );
  });

  it('findById (lookup): aplica o filtro de acesso, então canal sem acesso dá 404', async () => {
    const { service, canalWhatsapp } = setup();
    canalWhatsapp.findFirst.mockResolvedValueOnce(null);

    await expect(service.findById(ID)).rejects.toMatchObject({ message: 'Canal não encontrado' });
    expect(canalWhatsapp.findFirst).toHaveBeenCalledWith({
      where: { AND: [{ id: ID, deletedAt: null }, service.filtroAcesso()] },
    });
  });

  it('list: mapeia o card com o nome do profissional e os usuários', async () => {
    const { service, canalWhatsapp } = setup();
    canalWhatsapp.findMany.mockResolvedValueOnce([
      { ...CANAL, profissionalId: ID, profissional: { nome: 'Profissional Teste' } },
    ]);

    const page = await service.list({
      page: 1,
      pageSize: 100,
      sort: { field: 'nome', direction: 'asc' },
      search: undefined,
    });

    expect(page.data[0]).toEqual({
      id: ID,
      nome: 'Recepção',
      numero: '5565999990000',
      tipo: 'DINASTI_API',
      status: 'DESCONECTADO',
      profissionalId: ID,
      profissionalNome: 'Profissional Teste',
      usuarioIds: [USUARIO],
      createdAt: DATA.toISOString(),
      updatedAt: DATA.toISOString(),
    });
  });

  describe('create', () => {
    const ENTRADA = {
      nome: 'Recepção',
      numero: '5565999990000',
      profissionalId: null,
      usuarioIds: [USUARIO],
    };

    it('grava desconectado, com os usuários, quando o número está livre', async () => {
      const { service, canalWhatsapp } = setup();
      canalWhatsapp.findFirst.mockResolvedValueOnce(null);

      await service.create(ENTRADA);

      expect(canalWhatsapp.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            nome: 'Recepção',
            numero: '5565999990000',
            profissionalId: null,
            usuarios: { createMany: { data: [{ usuarioId: USUARIO }] } },
          },
        }),
      );
    });

    it('400 NUMERO_DUPLICADO no campo numero', async () => {
      const { service, canalWhatsapp } = setup();

      await expect(service.create(ENTRADA)).rejects.toMatchObject({
        code: 'NUMERO_DUPLICADO',
        details: [{ field: 'numero', message: 'Já existe um canal com este número' }],
      });
      expect(canalWhatsapp.create).not.toHaveBeenCalled();
    });

    it('400 USUARIO_INVALIDO quando algum usuário não existe ou está inativo', async () => {
      const { service, canalWhatsapp, usuario } = setup();
      canalWhatsapp.findFirst.mockResolvedValueOnce(null);
      usuario.count.mockResolvedValueOnce(0);

      await expect(service.create(ENTRADA)).rejects.toMatchObject({ code: 'USUARIO_INVALIDO' });
      expect(canalWhatsapp.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('404 quando o canal não existe ou foi excluído', async () => {
      const { service, canalWhatsapp } = setup();
      canalWhatsapp.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.update(ID, { nome: 'X', numero: '5565999990000', profissionalId: null }),
      ).rejects.toMatchObject({ message: 'Canal não encontrado' });
    });

    it('ignora o próprio canal na checagem do número', async () => {
      const { service, canalWhatsapp } = setup();
      canalWhatsapp.findFirst.mockResolvedValueOnce(CANAL).mockResolvedValueOnce(null);

      await service.update(ID, { nome: 'X', numero: '5565999990000', profissionalId: null });

      expect(canalWhatsapp.findFirst).toHaveBeenLastCalledWith({
        where: { deletedAt: null, numero: '5565999990000', id: { not: ID } },
        select: { id: true },
      });
      expect(canalWhatsapp.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ID },
          data: { nome: 'X', numero: '5565999990000', profissionalId: null },
        }),
      );
    });
  });

  it('definirUsuarios: substitui os vínculos; lista vazia libera para todos', async () => {
    const { service, canalWhatsappUsuario, usuario } = setup();

    await service.definirUsuarios(ID, { usuarioIds: [] });

    expect(canalWhatsappUsuario.deleteMany).toHaveBeenCalledWith({ where: { canalId: ID } });
    expect(canalWhatsappUsuario.createMany).toHaveBeenCalledWith({ data: [] });
    expect(usuario.count).not.toHaveBeenCalled();
  });

  it('remove: exclusão lógica', async () => {
    const { service, canalWhatsapp } = setup();

    await service.remove(ID);

    expect(canalWhatsapp.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ID }, data: { deletedAt: expect.any(Date) } }),
    );
  });

  it('usuariosDisponiveis: ativos, com perfil', async () => {
    const { service, usuario } = setup();
    usuario.findMany.mockResolvedValueOnce([
      { id: USUARIO, nome: 'Ana', email: 'ana@example.com', perfil: { nome: 'Médico' } },
      { id: ID, nome: 'Bia', email: 'bia@example.com', perfil: null },
    ]);

    expect(await service.usuariosDisponiveis()).toEqual([
      { id: USUARIO, nome: 'Ana', email: 'ana@example.com', perfil: 'Médico' },
      { id: ID, nome: 'Bia', email: 'bia@example.com', perfil: null },
    ]);
    expect(usuario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null, ativo: true } }),
    );
  });
});
