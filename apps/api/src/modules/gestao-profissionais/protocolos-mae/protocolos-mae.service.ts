import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  PROTOCOLO_MAE_NOME_DUPLICADO,
  type CreateProtocoloMaeInput,
  type ListProtocolosMaeQuery,
  type ProtocoloMae as ProtocoloMaeDto,
  type UpdateProtocoloMaeInput,
} from '@torres/shared';
import { isUuid } from '../../../common/auth/tokens';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { paginate, searchWhere, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { Prisma } from '../../../generated/prisma/client';

const INCLUIR = {
  semanas: {
    orderBy: { semana: 'asc' },
    include: { protocolo: { select: { nome: true } } },
  },
} satisfies Prisma.ProtocoloMaeInclude;

type ProtocoloMaeCompleto = Prisma.ProtocoloMaeGetPayload<{ include: typeof INCLUIR }>;

const NAO_EXCLUIDOS = { deletedAt: null } as const;

function toDto(mae: ProtocoloMaeCompleto): ProtocoloMaeDto {
  return {
    id: mae.id,
    nome: mae.nome,
    categoria: mae.categoria,
    totalSemanas: mae.totalSemanas,
    valorTotal: Number(mae.valorTotal),
    descricao: mae.descricao,
    semanas: mae.semanas.map((s) => ({
      semana: s.semana,
      protocoloId: s.protocoloId,
      protocoloNome: s.protocolo?.nome ?? null,
      observacoes: s.observacoes,
    })),
    createdAt: mae.createdAt.toISOString(),
    updatedAt: mae.updatedAt.toISOString(),
  };
}

/** Protocolos mãe: sequência de protocolos por semana (tela Protocolos, aba Protocolos Mãe). */
@Injectable()
export class ProtocolosMaeService {
  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {}

  async list(query: ListProtocolosMaeQuery): Promise<Page<ProtocoloMaeDto>> {
    const where: Prisma.ProtocoloMaeWhereInput = {
      ...NAO_EXCLUIDOS,
      categoria: query.categoria,
      ...searchWhere(query.search, ['nome']),
    };
    const orderBy = [{ categoria: 'asc' as const }, ...toOrderBy(query.sort)];
    const page = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.protocoloMae.findMany({ where, orderBy, include: INCLUIR, ...p }),
      count: () => this.txHost.tx.protocoloMae.count({ where }),
    });
    return { ...page, data: page.data.map(toDto) };
  }

  async findById(id: string): Promise<ProtocoloMaeDto> {
    return toDto(await this.buscar(id));
  }

  async create(input: CreateProtocoloMaeInput): Promise<ProtocoloMaeDto> {
    await this.validar(input);
    await this.garantirNomeDisponivel(input.nome);
    const criado = await this.txHost.tx.protocoloMae.create({
      data: this.dados(input),
      include: INCLUIR,
    });
    return toDto(criado);
  }

  async update(id: string, input: UpdateProtocoloMaeInput): Promise<ProtocoloMaeDto> {
    await this.buscar(id);
    await this.validar(input);
    await this.garantirNomeDisponivel(input.nome, id);
    const dados = this.dados(input);
    const alterado = await this.txHost.tx.protocoloMae.update({
      where: { id },
      data: { ...dados, semanas: { deleteMany: {}, ...dados.semanas } },
      include: INCLUIR,
    });
    return toDto(alterado);
  }

  /** Exclusão lógica. */
  async remove(id: string): Promise<ProtocoloMaeDto> {
    const mae = await this.buscar(id);
    await this.txHost.tx.protocoloMae.update({ where: { id }, data: { deletedAt: new Date() } });
    return toDto(mae);
  }

  private dados(input: CreateProtocoloMaeInput) {
    return {
      nome: input.nome,
      categoria: input.categoria,
      totalSemanas: input.totalSemanas,
      valorTotal: input.valorTotal,
      descricao: input.descricao,
      semanas: { create: input.semanas },
    };
  }

  private async buscar(id: string): Promise<ProtocoloMaeCompleto> {
    const mae = isUuid(id)
      ? await this.txHost.tx.protocoloMae.findFirst({
          where: { id, ...NAO_EXCLUIDOS },
          include: INCLUIR,
        })
      : null;
    if (!mae) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Protocolo mãe não encontrado', {
        status: 404,
      });
    }
    return mae;
  }

  /** Cada protocolo escolhido numa semana precisa existir e não estar excluído. */
  private async validar(input: CreateProtocoloMaeInput): Promise<void> {
    const ids = [...new Set(input.semanas.flatMap((s) => (s.protocoloId ? [s.protocoloId] : [])))];
    if (ids.length === 0) return;
    const existentes = await this.txHost.tx.protocolo.findMany({
      where: { id: { in: ids }, ...NAO_EXCLUIDOS },
      select: { id: true },
    });
    const validos = new Set(existentes.map((p) => p.id));
    const indice = input.semanas.findIndex((s) => s.protocoloId && !validos.has(s.protocoloId));
    if (indice >= 0) {
      throw new BusinessException('PROTOCOLO_INVALIDO', 'Protocolo inválido', {
        status: 400,
        details: [{ field: `semanas.${indice}.protocoloId`, message: 'Protocolo inválido' }],
      });
    }
  }

  /** O nome não repete entre os protocolos mãe não excluídos (sem diferenciar maiúsculas). */
  private async garantirNomeDisponivel(nome: string, ignorarId?: string): Promise<void> {
    const existente = await this.txHost.tx.protocoloMae.findFirst({
      where: {
        ...NAO_EXCLUIDOS,
        nome: { equals: nome, mode: 'insensitive' },
        id: ignorarId ? { not: ignorarId } : undefined,
      },
      select: { id: true },
    });
    if (existente) {
      throw new BusinessException('PROTOCOLO_MAE_DUPLICADO', PROTOCOLO_MAE_NOME_DUPLICADO, {
        status: 409,
        details: [{ field: 'nome', message: PROTOCOLO_MAE_NOME_DUPLICADO }],
      });
    }
  }
}
