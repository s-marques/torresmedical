import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type { GrupoWhatsapp, ListGruposWhatsappQuery } from '@torres/shared';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { CanaisWhatsappService } from '../../configuracoes-gestao/canais-whatsapp/canais-whatsapp.service';
import { ProvedorGruposWhatsapp } from './provedor-grupos-whatsapp';

/** Tela Grupos WhatsApp (`/grupos-whatsapp`): só consulta, nada é gravado. */
@Injectable()
export class GruposWhatsappService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly canais: CanaisWhatsappService,
    private readonly provedor: ProvedorGruposWhatsapp,
  ) {}

  async list(query: ListGruposWhatsappQuery): Promise<Page<GrupoWhatsapp>> {
    await this.garantirCanalAcessivel(query.canalId);
    const todos = await this.provedor.listarGrupos(query.canalId);

    const busca = query.search?.toLocaleLowerCase('pt-BR');
    const filtrados = busca
      ? todos.filter((g) => g.nome.toLocaleLowerCase('pt-BR').includes(busca))
      : todos;
    const { field, direction } = query.sort;
    const fator = direction === 'asc' ? 1 : -1;
    const ordenados = [...filtrados].sort((a, b) => {
      const cmp =
        field === 'nome'
          ? a.nome.localeCompare(b.nome, 'pt-BR')
          : a.participantes - b.participantes;
      return (cmp || a.id.localeCompare(b.id)) * fator;
    });

    const inicio = (query.page - 1) * query.pageSize;
    return {
      data: ordenados.slice(inicio, inicio + query.pageSize),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total: ordenados.length,
        totalPages: Math.ceil(ordenados.length / query.pageSize),
      },
    };
  }

  /** O canal precisa existir e estar entre os que o usuário pode usar. */
  private async garantirCanalAcessivel(canalId: string): Promise<void> {
    const canal = await this.txHost.tx.canalWhatsapp.findFirst({
      where: { id: canalId, deletedAt: null, ...this.canais.filtroAcesso() },
      select: { id: true },
    });
    if (!canal) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Canal não encontrado', { status: 404 });
    }
  }
}
