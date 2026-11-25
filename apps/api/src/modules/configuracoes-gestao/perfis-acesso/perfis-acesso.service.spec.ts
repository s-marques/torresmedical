import type { UpdatePerfilInput } from '@torres/shared';
import { txHostFalso } from '../../../../test/utils/tx-host-falso';
import type { ExportService } from '../../../common/export/export.service';
import { PerfisAcessoService } from './perfis-acesso.service';

const AGORA = new Date('2026-01-01T00:00:00.000Z');

const PERFIL = {
  id: '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
  nome: 'Recepção',
  descricao: 'Acesso para recepcionistas',
  escopoDados: 'TODOS',
  padrao: false,
  ativo: true,
  createdAt: AGORA,
  updatedAt: AGORA,
  deletedAt: null,
  permissoes: [
    { perfilId: '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f', permissao: 'painel.painel.ver' },
    {
      perfilId: '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
      permissao: 'comercial-atendimento.agenda.ver',
    },
  ],
};

function exportServiceFalso(): ExportService {
  return {
    ensureWithinLimit: jest.fn(),
    export: jest.fn().mockResolvedValue({ filename: 'perfis.xlsx' }),
  } as unknown as ExportService;
}

describe('PerfisAcessoService', () => {
  it('toDto: mapeia permissões para ids de página', async () => {
    const { txHost } = txHostFalso('perfil', [PERFIL]);

    const perfil = await new PerfisAcessoService(txHost, exportServiceFalso()).findById(PERFIL.id);

    expect(perfil.paginasPermitidas).toEqual(['painel.painel', 'comercial-atendimento.agenda']);
  });

  it('404 quando não existe', async () => {
    const { txHost } = txHostFalso('perfil', []);

    await expect(
      new PerfisAcessoService(txHost, exportServiceFalso()).findById(PERFIL.id),
    ).rejects.toMatchObject({ message: 'Perfil não encontrado' });
  });

  it('list: sem excluídos, filtra status e busca por nome', async () => {
    const { txHost, delegate } = txHostFalso('perfil', [PERFIL]);

    const page = await new PerfisAcessoService(txHost, exportServiceFalso()).list({
      page: 1,
      pageSize: 100,
      sort: { field: 'nome', direction: 'asc' },
      status: 'ativo',
      search: 'rec',
    });

    expect(delegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null, ativo: true }),
        include: { permissoes: true },
      }),
    );
    expect(page.data[0]).toMatchObject({ nome: 'Recepção' });
  });

  it('create grava uma permissão .ver por página marcada', async () => {
    const { txHost, delegate } = txHostFalso('perfil', [PERFIL]);

    await new PerfisAcessoService(txHost, exportServiceFalso()).create({
      nome: 'Recepção',
      descricao: 'Acesso para recepcionistas',
      paginasPermitidas: ['painel.painel', 'comercial-atendimento.agenda'],
      escopoDados: 'PROFISSIONAIS_VINCULADOS',
    });

    expect(delegate.create).toHaveBeenCalledWith({
      data: {
        nome: 'Recepção',
        descricao: 'Acesso para recepcionistas',
        escopoDados: 'PROFISSIONAIS_VINCULADOS',
        permissoes: {
          create: [
            { permissao: 'painel.painel.ver' },
            { permissao: 'comercial-atendimento.agenda.ver' },
          ],
        },
      },
      include: { permissoes: true },
    });
  });

  it('update substitui todas as páginas e 404 se não existe', async () => {
    const { txHost, delegate } = txHostFalso('perfil', [PERFIL]);
    const service = new PerfisAcessoService(txHost, exportServiceFalso());

    await service.update(PERFIL.id, {
      nome: 'Recepção',
      descricao: null,
      paginasPermitidas: ['painel.painel'],
      escopoDados: 'TODOS',
    });

    expect(delegate.update).toHaveBeenCalledWith({
      where: { id: PERFIL.id },
      data: {
        nome: 'Recepção',
        descricao: null,
        escopoDados: 'TODOS',
        permissoes: { deleteMany: {}, create: [{ permissao: 'painel.painel.ver' }] },
      },
      include: { permissoes: true },
    });

    const vazio = txHostFalso('perfil', []);
    await expect(
      new PerfisAcessoService(vazio.txHost, exportServiceFalso()).update(PERFIL.id, {
        nome: 'Recepção',
        descricao: null,
        paginasPermitidas: ['painel.painel'],
        escopoDados: 'TODOS',
      }),
    ).rejects.toMatchObject({ message: 'Perfil não encontrado' });
    expect(vazio.delegate.update).not.toHaveBeenCalled();
  });

  it('remove faz exclusão lógica', async () => {
    const { txHost, delegate } = txHostFalso('perfil', [PERFIL]);

    await new PerfisAcessoService(txHost, exportServiceFalso()).remove(PERFIL.id);

    expect(delegate.update).toHaveBeenCalledWith({
      where: { id: PERFIL.id },
      data: { deletedAt: expect.any(Date) },
      include: { permissoes: true },
    });
  });

  describe('perfis padrão (issue #154)', () => {
    const ID = PERFIL.id;
    const PADRAO = {
      ...PERFIL,
      padrao: true,
      permissoes: [
        { perfilId: ID, permissao: 'painel.painel.ver' },
        { perfilId: ID, permissao: 'comercial-atendimento.agenda.ver' },
        { perfilId: ID, permissao: 'comercial-atendimento.agenda.criar' },
        { perfilId: ID, permissao: 'financeiro.caixas.criar' },
        { perfilId: ID, permissao: 'gestao-profissionais.profissionais-documentos.validar' },
      ],
    };

    it('paginasPermitidas lista só o .ver das telas, não as demais ações nem os extras', async () => {
      const { txHost } = txHostFalso('perfil', [PADRAO]);

      const perfil = await new PerfisAcessoService(txHost, exportServiceFalso()).findById(ID);

      expect(perfil.paginasPermitidas).toEqual(['painel.painel', 'comercial-atendimento.agenda']);
      expect(perfil.padrao).toBe(true);
    });

    it('remove recusa perfil padrão (422) sem excluir', async () => {
      const { txHost, delegate } = txHostFalso('perfil', [PADRAO]);

      await expect(
        new PerfisAcessoService(txHost, exportServiceFalso()).remove(ID),
      ).rejects.toMatchObject({ code: 'PERFIL_PADRAO_NAO_EXCLUIVEL' });
      expect(delegate.update).not.toHaveBeenCalled();
    });

    it('update mantém as ações das páginas que continuam e os extras; some as de páginas retiradas', async () => {
      const { txHost, delegate } = txHostFalso('perfil', [PADRAO]);

      await new PerfisAcessoService(txHost, exportServiceFalso()).update(ID, {
        nome: 'Recepção',
        descricao: null,
        paginasPermitidas: ['comercial-atendimento.agenda', 'painel.painel'],
        escopoDados: 'TODOS',
      });

      const { permissoes } = delegate.update.mock.calls[0][0].data;
      expect(permissoes.create.map((p: { permissao: string }) => p.permissao).sort()).toEqual([
        'comercial-atendimento.agenda.criar',
        'comercial-atendimento.agenda.ver',
        'gestao-profissionais.profissionais-documentos.validar',
        'painel.painel.ver',
      ]);
    });

    it('o Administrador não muda nome, páginas nem escopo, mas a descrição sim', async () => {
      const admin = { ...PADRAO, nome: 'Administrador' };
      const { txHost, delegate } = txHostFalso('perfil', [admin]);
      const service = new PerfisAcessoService(txHost, exportServiceFalso());
      const base: UpdatePerfilInput = {
        nome: 'Administrador',
        descricao: 'Novo texto',
        paginasPermitidas: ['painel.painel', 'comercial-atendimento.agenda'],
        escopoDados: 'TODOS',
      };

      await expect(
        service.update(ID, { ...base, paginasPermitidas: ['painel.painel'] }),
      ).rejects.toMatchObject({ code: 'PERFIL_ADMINISTRADOR_PROTEGIDO' });
      await expect(service.update(ID, { ...base, nome: 'Outro' })).rejects.toMatchObject({
        code: 'PERFIL_ADMINISTRADOR_PROTEGIDO',
      });
      await expect(
        service.update(ID, { ...base, escopoDados: 'PROFISSIONAIS_VINCULADOS' }),
      ).rejects.toMatchObject({ code: 'PERFIL_ADMINISTRADOR_PROTEGIDO' });
      expect(delegate.update).not.toHaveBeenCalled();

      await service.update(ID, base);
      expect(delegate.update).toHaveBeenCalledTimes(1);
    });

    it('duplicar copia permissões e escopo, sem a marca de padrão, com nome livre', async () => {
      const { txHost, delegate } = txHostFalso('perfil', [PADRAO]);
      delegate.findUnique.mockResolvedValueOnce({ id: 'ocupado' }).mockResolvedValue(null);

      await new PerfisAcessoService(txHost, exportServiceFalso()).duplicar(ID);

      expect(delegate.findUnique).toHaveBeenCalledTimes(2);
      expect(delegate.create).toHaveBeenCalledWith({
        data: {
          nome: 'Cópia de Recepção (2)',
          descricao: PADRAO.descricao,
          escopoDados: 'TODOS',
          permissoes: { create: PADRAO.permissoes.map((p) => ({ permissao: p.permissao })) },
        },
        include: { permissoes: true },
      });
    });

    it('duplicar: 404 quando o perfil não existe', async () => {
      const { txHost, delegate } = txHostFalso('perfil', []);

      await expect(
        new PerfisAcessoService(txHost, exportServiceFalso()).duplicar(ID),
      ).rejects.toMatchObject({ message: 'Perfil não encontrado' });
      expect(delegate.create).not.toHaveBeenCalled();
    });
  });
});
