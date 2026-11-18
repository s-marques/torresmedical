import { txHostFalso } from '../../../../test/utils/tx-host-falso';
import type { ExportService } from '../../../common/export/export.service';
import { PerfisAcessoService } from './perfis-acesso.service';

const AGORA = new Date('2026-01-01T00:00:00.000Z');

const PERFIL = {
  id: '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
  nome: 'Recepção',
  descricao: 'Acesso para recepcionistas',
  escopoDados: 'TODOS',
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
});
