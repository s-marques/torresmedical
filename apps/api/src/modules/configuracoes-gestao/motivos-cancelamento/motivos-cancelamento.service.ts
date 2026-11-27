import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  gerarCodigoOrigemCliente,
  type CreateMotivoCancelamentoInput,
  type ListMotivosCancelamentoQuery,
  type MotivoCancelamento as MotivoCancelamentoDto,
  type TipoCancelamento,
  type UpdateMotivoCancelamentoInput,
} from '@torres/shared';
import type { MotivoCancelamento, Prisma } from '../../../generated/prisma/client';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { paginate, searchWhere, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

function toDto(m: MotivoCancelamento): MotivoCancelamentoDto {
  return {
    id: m.id,
    tipo: m.tipo,
    nome: m.nome,
    codigo: m.codigo,
    exigeTexto: m.exigeTexto,
    sistema: m.sistema,
    ordem: m.ordem,
    ativo: m.ativo,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

/** Os motivos de sistema ficam sempre por último na lista do tipo (ordem 99). */
const ORDEM_MAX_EDITAVEL = 98;

/**
 * Cadastro dos motivos de cancelamento por tipo (issue #162, R §35). Os motivos de sistema
 * ("Outro", "Contrato cancelado") não podem ser renomeados, desativados nem excluídos: o código
 * os usa. A exclusão é lógica; cancelamentos antigos continuam apontando para o motivo.
 */
@Injectable()
export class MotivosCancelamentoService {
  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {}

  async list(query: ListMotivosCancelamentoQuery): Promise<Page<MotivoCancelamentoDto>> {
    const where: Prisma.MotivoCancelamentoWhereInput = {
      deletedAt: null,
      tipo: query.tipo,
      ativo: query.status ? query.status === 'ativo' : undefined,
      ...searchWhere(query.search, ['nome']),
    };
    const orderBy = [{ tipo: 'asc' as const }, ...toOrderBy(query.sort)];
    const pagina = await paginate(query, {
      findMany: (p) => this.txHost.tx.motivoCancelamento.findMany({ where, orderBy, ...p }),
      count: () => this.txHost.tx.motivoCancelamento.count({ where }),
    });
    return { ...pagina, data: pagina.data.map(toDto) };
  }

  async findById(id: string): Promise<MotivoCancelamentoDto> {
    return toDto(await this.buscar(id));
  }

  async create(input: CreateMotivoCancelamentoInput): Promise<MotivoCancelamentoDto> {
    const codigo = this.codigoDe(input.nome);
    await this.garantirNomeLivre(input.tipo, input.nome, codigo);
    const ultima = await this.txHost.tx.motivoCancelamento.aggregate({
      where: { tipo: input.tipo, sistema: false, deletedAt: null },
      _max: { ordem: true },
    });
    const ordem = Math.min((ultima._max.ordem ?? 0) + 1, ORDEM_MAX_EDITAVEL);
    const criado = await this.txHost.tx.motivoCancelamento.create({
      data: { tipo: input.tipo, nome: input.nome, codigo, exigeTexto: input.exigeTexto, ordem },
    });
    return toDto(criado);
  }

  async update(id: string, input: UpdateMotivoCancelamentoInput): Promise<MotivoCancelamentoDto> {
    const atual = await this.buscar(id);
    if (atual.sistema) this.garantirSemAlteracaoDeSistema(atual, input);

    const data: Prisma.MotivoCancelamentoUpdateInput = {
      exigeTexto: input.exigeTexto,
      ativo: input.ativo,
    };
    if (input.nome !== undefined && input.nome !== atual.nome) {
      const codigo = this.codigoDe(input.nome);
      await this.garantirNomeLivre(atual.tipo, input.nome, codigo, atual.id);
      data.nome = input.nome;
      data.codigo = codigo;
    }
    const alterado = await this.txHost.tx.motivoCancelamento.update({ where: { id }, data });
    return toDto(alterado);
  }

  async remove(id: string): Promise<MotivoCancelamentoDto> {
    const atual = await this.buscar(id);
    if (atual.sistema) {
      throw new BusinessException(
        'MOTIVO_CANCELAMENTO_SISTEMA',
        'Este motivo é usado pelo sistema e não pode ser excluído.',
      );
    }
    const excluido = await this.txHost.tx.motivoCancelamento.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return toDto(excluido);
  }

  private async buscar(id: string): Promise<MotivoCancelamento> {
    const motivo = await this.txHost.tx.motivoCancelamento.findFirst({
      where: { id, deletedAt: null },
    });
    if (!motivo) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Motivo de cancelamento não encontrado', {
        status: 404,
      });
    }
    return motivo;
  }

  private garantirSemAlteracaoDeSistema(
    atual: MotivoCancelamento,
    input: UpdateMotivoCancelamentoInput,
  ): void {
    const mudaNome = input.nome !== undefined && input.nome !== atual.nome;
    const desativa = input.ativo === false;
    const mudaTexto = input.exigeTexto !== undefined && input.exigeTexto !== atual.exigeTexto;
    if (mudaNome || desativa || mudaTexto) {
      throw new BusinessException(
        'MOTIVO_CANCELAMENTO_SISTEMA',
        'Este motivo é usado pelo sistema e não pode ser alterado nem desativado.',
      );
    }
  }

  private codigoDe(nome: string): string {
    const codigo = gerarCodigoOrigemCliente(nome);
    if (!codigo) {
      throw new BusinessException(
        ErrorCode.VALIDATION_ERROR,
        'Informe um nome com letras ou números',
        {
          status: 400,
          details: [{ field: 'nome', message: 'Informe um nome com letras ou números' }],
        },
      );
    }
    return codigo;
  }

  private async garantirNomeLivre(
    tipo: TipoCancelamento,
    nome: string,
    codigo: string,
    ignorarId?: string,
  ): Promise<void> {
    const existente = await this.txHost.tx.motivoCancelamento.findFirst({
      where: {
        tipo,
        deletedAt: null,
        id: ignorarId ? { not: ignorarId } : undefined,
        OR: [{ nome: { equals: nome, mode: 'insensitive' } }, { codigo }],
      },
    });
    if (existente) {
      throw new BusinessException(
        ErrorCode.DUPLICATE,
        'Já existe um motivo com este nome neste tipo',
        {
          status: 409,
          details: [{ field: 'nome', message: 'Já existe um motivo com este nome neste tipo' }],
        },
      );
    }
  }
}
