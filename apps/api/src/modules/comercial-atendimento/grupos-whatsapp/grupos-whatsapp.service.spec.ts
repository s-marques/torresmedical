import type { TransactionHost } from '@nestjs-cls/transactional';
import type { GrupoWhatsapp, ListGruposWhatsappQuery } from '@torres/shared';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { CanaisWhatsappService } from '../../configuracoes-gestao/canais-whatsapp/canais-whatsapp.service';
import { GruposWhatsappService } from './grupos-whatsapp.service';
import type { ProvedorGruposWhatsapp } from './provedor-grupos-whatsapp';

const CANAL_ID = '7a1d3c52-8d0f-4b8e-9f4c-2b2f3c4d5e6f';
const FILTRO_ACESSO = { OR: [{ usuarios: { none: {} } }] };

const GRUPOS: GrupoWhatsapp[] = [
  { id: 'g3@g.us', nome: 'Recepção', participantes: 8 },
  { id: 'g1@g.us', nome: 'Enfermagem', participantes: 12 },
  { id: 'g2@g.us', nome: 'Médicos', participantes: 5 },
];

function query(parcial: Partial<ListGruposWhatsappQuery> = {}): ListGruposWhatsappQuery {
  return {
    canalId: CANAL_ID,
    page: 1,
    pageSize: 10,
    sort: { field: 'nome', direction: 'asc' },
    search: undefined,
    ...parcial,
  };
}

function setup(canalExiste = true) {
  const findFirst = jest.fn().mockResolvedValue(canalExiste ? { id: CANAL_ID } : null);
  const txHost = {
    tx: { canalWhatsapp: { findFirst } },
  } as unknown as TransactionHost<PrismaAdapter>;
  const canais = { filtroAcesso: jest.fn().mockReturnValue(FILTRO_ACESSO) };
  const provedor = { listarGrupos: jest.fn().mockResolvedValue(GRUPOS) };
  const service = new GruposWhatsappService(
    txHost,
    canais as unknown as CanaisWhatsappService,
    provedor as unknown as ProvedorGruposWhatsapp,
  );
  return { service, findFirst, provedor };
}

describe('GruposWhatsappService', () => {
  it('confere o canal pelo filtro de acesso e consulta o provedor', async () => {
    const { service, findFirst, provedor } = setup();
    await service.list(query());
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: CANAL_ID, deletedAt: null, ...FILTRO_ACESSO },
      select: { id: true },
    });
    expect(provedor.listarGrupos).toHaveBeenCalledWith(CANAL_ID);
  });

  it('404 quando o canal não existe ou o usuário não tem acesso', async () => {
    const { service, provedor } = setup(false);
    await expect(service.list(query())).rejects.toMatchObject({ status: 404 });
    expect(provedor.listarGrupos).not.toHaveBeenCalled();
  });

  it('ordena por nome e por participantes, nos dois sentidos', async () => {
    const { service } = setup();
    const nomes = async (q: Partial<ListGruposWhatsappQuery>) =>
      (await service.list(query(q))).data.map((g) => g.nome);
    expect(await nomes({})).toEqual(['Enfermagem', 'Médicos', 'Recepção']);
    expect(await nomes({ sort: { field: 'nome', direction: 'desc' } })).toEqual([
      'Recepção',
      'Médicos',
      'Enfermagem',
    ]);
    expect(await nomes({ sort: { field: 'participantes', direction: 'asc' } })).toEqual([
      'Médicos',
      'Recepção',
      'Enfermagem',
    ]);
  });

  it('busca pelo nome sem diferenciar maiúsculas', async () => {
    const { service } = setup();
    const r = await service.list(query({ search: 'MÉDI' }));
    expect(r.data.map((g) => g.nome)).toEqual(['Médicos']);
    expect(r.meta.total).toBe(1);
  });

  it('pagina e informa o total', async () => {
    const { service } = setup();
    const r = await service.list(query({ page: 2, pageSize: 2 }));
    expect(r.data.map((g) => g.nome)).toEqual(['Recepção']);
    expect(r.meta).toEqual({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
  });

  it('lista vazia quando o provedor não devolve grupos', async () => {
    const { service, provedor } = setup();
    provedor.listarGrupos.mockResolvedValue([]);
    const r = await service.list(query());
    expect(r).toEqual({ data: [], meta: { page: 1, pageSize: 10, total: 0, totalPages: 0 } });
  });
});
