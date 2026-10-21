import { TransactionHost } from '@nestjs-cls/transactional';
import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateServicoProfissionalInput,
  ListServicosProfissionaisQuery,
  ServicoProfissional as ServicoProfissionalDto,
  UpdateServicoProfissionalInput,
} from '@torres/shared';
import { isUuid } from '../../../common/auth/tokens';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { paginate, searchWhere, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { Prisma } from '../../../generated/prisma/client';
import { SERVICO_EM_USO_VERIFICADORES, type ServicoEmUsoVerificador } from './servico-em-uso';

const COM_PROFISSIONAL = {
  profissional: { select: { nome: true } },
} satisfies Prisma.ServicoProfissionalInclude;

type ServicoComProfissional = Prisma.ServicoProfissionalGetPayload<{
  include: typeof COM_PROFISSIONAL;
}>;

function toDto(servico: ServicoComProfissional, emUso: boolean): ServicoProfissionalDto {
  return {
    id: servico.id,
    profissionalId: servico.profissionalId,
    profissionalNome: servico.profissional.nome,
    nome: servico.nome,
    categoria: servico.categoria,
    valor: Number(servico.valor),
    duracaoMinutos: servico.duracaoMinutos,
    descricao: servico.descricao,
    ativo: servico.ativo,
    emUso,
    createdAt: servico.createdAt.toISOString(),
    updatedAt: servico.updatedAt.toISOString(),
  };
}

/** Serviços/procedimentos que cada profissional realiza (tela Serviços Profissionais). */
@Injectable()
export class ServicosProfissionaisService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    @Inject(SERVICO_EM_USO_VERIFICADORES)
    private readonly verificadores: readonly ServicoEmUsoVerificador[],
  ) {}

  /** Agrupada por profissional (nome) e, dentro dele, pelo `sort` pedido. */
  async list(query: ListServicosProfissionaisQuery): Promise<Page<ServicoProfissionalDto>> {
    const where: Prisma.ServicoProfissionalWhereInput = {
      profissionalId: query.profissionalId,
      profissional: { deletedAt: null },
      ativo: query.status ? query.status === 'ativo' : undefined,
      ...searchWhere(query.search, ['nome', 'categoria', 'descricao']),
    };
    const orderBy = [{ profissional: { nome: 'asc' as const } }, ...toOrderBy(query.sort)];
    const page = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.servicoProfissional.findMany({
          where,
          orderBy,
          include: COM_PROFISSIONAL,
          ...p,
        }),
      count: () => this.txHost.tx.servicoProfissional.count({ where }),
    });
    const usados = await this.idsEmUso(page.data.map((s) => s.id));
    return { ...page, data: page.data.map((s) => toDto(s, usados.has(s.id))) };
  }

  async findById(id: string): Promise<ServicoProfissionalDto> {
    const servico = await this.buscar(id);
    return toDto(servico, (await this.idsEmUso([id])).has(id));
  }

  async create(input: CreateServicoProfissionalInput): Promise<ServicoProfissionalDto> {
    await this.garantirProfissional(input.profissionalId);
    const criado = await this.txHost.tx.servicoProfissional.create({
      data: input,
      include: COM_PROFISSIONAL,
    });
    return toDto(criado, false);
  }

  async update(id: string, input: UpdateServicoProfissionalInput): Promise<ServicoProfissionalDto> {
    await this.buscar(id);
    await this.garantirProfissional(input.profissionalId);
    const alterado = await this.txHost.tx.servicoProfissional.update({
      where: { id },
      data: input,
      include: COM_PROFISSIONAL,
    });
    return toDto(alterado, (await this.idsEmUso([id])).has(id));
  }

  /** Ativar / Desativar (ícone da linha). */
  async alterarStatus(id: string, ativo: boolean): Promise<ServicoProfissionalDto> {
    await this.buscar(id);
    const alterado = await this.txHost.tx.servicoProfissional.update({
      where: { id },
      data: { ativo },
      include: COM_PROFISSIONAL,
    });
    return toDto(alterado, (await this.idsEmUso([id])).has(id));
  }

  /**
   * Exclusão definitiva, só de serviço sem vínculo com outro cadastro. Com vínculo, a saída é
   * desativar.
   */
  async remove(id: string): Promise<ServicoProfissionalDto> {
    const servico = await this.buscar(id);
    if ((await this.idsEmUso([id])).has(id)) {
      throw new BusinessException(
        'SERVICO_EM_USO',
        'Este serviço está vinculado a outros cadastros e não pode ser excluído. Desative-o.',
        { status: 409 },
      );
    }
    await this.txHost.tx.servicoProfissional.delete({ where: { id } });
    return toDto(servico, false);
  }

  private async idsEmUso(ids: readonly string[]): Promise<ReadonlySet<string>> {
    if (ids.length === 0) return new Set();
    const conjuntos = await Promise.all(this.verificadores.map((v) => v.emUso(ids)));
    return new Set(conjuntos.flatMap((conjunto) => [...conjunto]));
  }

  private async buscar(id: string): Promise<ServicoComProfissional> {
    const servico = isUuid(id)
      ? await this.txHost.tx.servicoProfissional.findFirst({
          where: { id, profissional: { deletedAt: null } },
          include: COM_PROFISSIONAL,
        })
      : null;
    if (!servico) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Serviço não encontrado', { status: 404 });
    }
    return servico;
  }

  private async garantirProfissional(profissionalId: string): Promise<void> {
    const existe = await this.txHost.tx.profissional.count({
      where: { id: profissionalId, deletedAt: null },
    });
    if (existe === 0) {
      throw new BusinessException('PROFISSIONAL_INVALIDO', 'Profissional inválido', {
        status: 400,
        details: [{ field: 'profissionalId', message: 'Profissional inválido' }],
      });
    }
  }
}
