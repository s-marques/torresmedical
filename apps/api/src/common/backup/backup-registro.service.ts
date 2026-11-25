import { Injectable } from '@nestjs/common';
import type {
  BackupErro,
  BackupExecucao,
  BackupExecucaoPage,
  BackupOrigem,
  BackupTipo,
  ListBackupsQuery,
} from '@torres/shared';
import { Prisma, type BackupExecucao as BackupExecucaoRow } from '../../generated/prisma/client';
import { paginate, toOrderBy } from '../pagination/paginate';
import { PrismaService } from '../prisma/prisma.service';

export interface DadosConclusao {
  tamanhoBytes?: number;
  arquivosCopiados?: number;
  checksum?: string;
  destinoChave?: string;
  detalhes?: Prisma.InputJsonValue;
}

export function toBackupExecucao(row: BackupExecucaoRow): BackupExecucao {
  return {
    id: row.id,
    tipo: row.tipo as BackupTipo,
    status: row.status as BackupExecucao['status'],
    origem: row.origem as BackupOrigem,
    iniciadoEm: row.iniciadoEm.toISOString(),
    finalizadoEm: row.finalizadoEm?.toISOString() ?? null,
    tamanhoBytes: row.tamanhoBytes === null ? null : Number(row.tamanhoBytes),
    arquivosCopiados: row.arquivosCopiados,
    checksum: row.checksum,
    destinoChave: row.destinoChave,
    erroCodigo: row.erroCodigo,
    detalhes: (row.detalhes as Record<string, unknown> | null) ?? null,
  };
}

/**
 * Registro das execuções (tabela `backup_execucoes`). Usa o `PrismaService` direto, sem a
 * transação da requisição: o registro do job precisa persistir mesmo quando o endpoint que o
 * disparou já respondeu, e uma falha aqui não pode desfazer o histórico.
 */
@Injectable()
export class BackupRegistroService {
  constructor(private readonly prisma: PrismaService) {}

  async iniciar(
    tipo: BackupTipo,
    origem: BackupOrigem,
    usuarioId?: string,
  ): Promise<BackupExecucao> {
    const row = await this.prisma.backupExecucao.create({
      data: { tipo, origem, status: 'EXECUTANDO', usuarioId: usuarioId ?? null },
    });
    return toBackupExecucao(row);
  }

  async concluir(id: string, dados: DadosConclusao): Promise<BackupExecucao> {
    const row = await this.prisma.backupExecucao.update({
      where: { id },
      data: {
        status: 'SUCESSO',
        finalizadoEm: new Date(),
        tamanhoBytes: dados.tamanhoBytes,
        arquivosCopiados: dados.arquivosCopiados,
        checksum: dados.checksum,
        destinoChave: dados.destinoChave,
        detalhes: dados.detalhes,
      },
    });
    return toBackupExecucao(row);
  }

  async falhar(
    id: string,
    codigo: BackupErro,
    detalhes?: Prisma.InputJsonValue,
  ): Promise<BackupExecucao> {
    const row = await this.prisma.backupExecucao.update({
      where: { id },
      data: { status: 'FALHA', finalizadoEm: new Date(), erroCodigo: codigo, detalhes },
    });
    return toBackupExecucao(row);
  }

  /** Execuções que ficaram "em andamento" porque a API caiu no meio: viram falha na subida. */
  async encerrarPendentes(): Promise<number> {
    const { count } = await this.prisma.backupExecucao.updateMany({
      where: { status: 'EXECUTANDO' },
      data: {
        status: 'FALHA',
        finalizadoEm: new Date(),
        erroCodigo: 'BACKUP_ERRO_INESPERADO' satisfies BackupErro,
      },
    });
    return count;
  }

  async listar(query: ListBackupsQuery): Promise<BackupExecucaoPage> {
    const where: Prisma.BackupExecucaoWhereInput = {
      ...(query.tipo ? { tipo: query.tipo } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const page = await paginate(query, {
      findMany: (args) =>
        this.prisma.backupExecucao.findMany({ where, orderBy: toOrderBy(query.sort), ...args }),
      count: () => this.prisma.backupExecucao.count({ where }),
    });
    return { ...page, data: page.data.map(toBackupExecucao) };
  }
}
