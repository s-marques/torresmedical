import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type {
  CreateEspecialidadeInput,
  Especialidade as EspecialidadeDto,
  ListEspecialidadesQuery,
  LookupItem,
  LookupQuery,
  UpdateEspecialidadeInput,
} from '@torres/shared';
import type { Especialidade, Prisma } from '../../../generated/prisma/client';
import {
  EntidadeLookupService,
  SELECIONAVEIS,
  type FonteLookup,
} from '../../../common/lookups/lookup-query';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { isUuid } from '../../../common/auth/tokens';
import { paginate, searchWhere, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

/** Especialidade dos profissionais (botão "Especialidades" da tela Profissionais). */
@Injectable()
export class EspecialidadesService extends EntidadeLookupService<
  LookupQuery<'especialidades'>,
  Prisma.EspecialidadeWhereInput,
  Especialidade
> {
  protected readonly naoEncontrado = 'Especialidade não encontrada';
  protected readonly fonte: FonteLookup<Prisma.EspecialidadeWhereInput, Especialidade> = {
    findMany: (args) => this.txHost.tx.especialidade.findMany(args),
    count: (args) => this.txHost.tx.especialidade.count(args),
    findFirst: (args) => this.txHost.tx.especialidade.findFirst(args),
  };

  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {
    super();
  }

  protected filtro(query: LookupQuery<'especialidades'>): Prisma.EspecialidadeWhereInput {
    return { ...SELECIONAVEIS, ...searchWhere(query.search, ['nome']) };
  }

  protected toItem(especialidade: Especialidade): LookupItem {
    return { id: especialidade.id, label: especialidade.nome, descricao: null };
  }

  // -------------------------------------------------------------------------------------------
  // Modal "Gerenciar Especialidades" (tela Profissionais)

  list(query: ListEspecialidadesQuery): Promise<Page<EspecialidadeDto>> {
    const where: Prisma.EspecialidadeWhereInput = {
      deletedAt: null,
      ...searchWhere(query.search, ['nome']),
    };
    const orderBy = toOrderBy(query.sort);
    return paginate(query, {
      findMany: async (page) =>
        (await this.txHost.tx.especialidade.findMany({ where, orderBy, ...page })).map(toDto),
      count: () => this.txHost.tx.especialidade.count({ where }),
    });
  }

  async create(input: CreateEspecialidadeInput): Promise<EspecialidadeDto> {
    await this.garantirNomeLivre(input.nome);
    return toDto(await this.txHost.tx.especialidade.create({ data: input }));
  }

  async update(id: string, input: UpdateEspecialidadeInput): Promise<EspecialidadeDto> {
    await this.buscar(id);
    await this.garantirNomeLivre(input.nome, id);
    return toDto(await this.txHost.tx.especialidade.update({ where: { id }, data: input }));
  }

  /** Exclusão lógica; bloqueada enquanto algum profissional ainda usa a especialidade. */
  async remove(id: string): Promise<EspecialidadeDto> {
    await this.buscar(id);
    const emUso = await this.txHost.tx.profissional.count({
      where: { especialidadeId: id, deletedAt: null },
    });
    if (emUso > 0) {
      throw new BusinessException(
        'ESPECIALIDADE_EM_USO',
        `Esta especialidade está em uso por ${emUso} profissional(is) e não pode ser excluída.`,
        { status: 409 },
      );
    }
    return toDto(
      await this.txHost.tx.especialidade.update({ where: { id }, data: { deletedAt: new Date() } }),
    );
  }

  private async buscar(id: string): Promise<Especialidade> {
    const especialidade = isUuid(id)
      ? await this.txHost.tx.especialidade.findFirst({ where: { id, deletedAt: null } })
      : null;
    if (!especialidade) {
      throw new BusinessException(ErrorCode.NOT_FOUND, this.naoEncontrado, { status: 404 });
    }
    return especialidade;
  }

  /** Nome único, sem diferenciar maiúsculas (a lista legada tem repetidas, as novas não). */
  private async garantirNomeLivre(nome: string, ignorarId?: string): Promise<void> {
    const existente = await this.txHost.tx.especialidade.findFirst({
      where: {
        deletedAt: null,
        nome: { equals: nome, mode: 'insensitive' },
        id: ignorarId ? { not: ignorarId } : undefined,
      },
      select: { id: true },
    });
    if (existente) {
      throw new BusinessException('ESPECIALIDADE_DUPLICADA', 'Esta especialidade já existe.', {
        status: 409,
        details: [{ field: 'nome', message: 'Especialidade já cadastrada' }],
      });
    }
  }
}

function toDto(e: Especialidade): EspecialidadeDto {
  return {
    id: e.id,
    nome: e.nome,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}
