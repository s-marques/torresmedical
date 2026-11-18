import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  CONFIRMACAO_CONFIG_PADRAO,
  type ConfirmacaoConfig,
  type ConfirmacaoConfigInput,
  type ConfirmacaoModelo,
  type ConfirmacaoModeloInput,
} from '@torres/shared';
import type { ConfiguracaoConfirmacao, Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../../common/audit/audit.service';
import { isUuid } from '../../../common/auth/tokens';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

const INCLUDE_MODELO = {
  tipoAgendamento: { select: { nome: true } },
} satisfies Prisma.ModeloConfirmacaoInclude;
type ModeloCompleto = Prisma.ModeloConfirmacaoGetPayload<{ include: typeof INCLUDE_MODELO }>;

const NAO_EXCLUIDOS = { deletedAt: null } as const;

function toConfigDto(c: ConfiguracaoConfirmacao | null): ConfirmacaoConfig {
  const base = c ?? CONFIRMACAO_CONFIG_PADRAO;
  return {
    ativo: base.ativo,
    antecedenciaDias: base.antecedenciaDias === 2 ? 2 : 1,
    horarioLembrete: base.horarioLembrete,
    horarioMsg1: base.horarioMsg1,
    horarioMsg2: base.horarioMsg2,
    horarioMsg3: base.horarioMsg3,
    horarioNaoConfirmou: base.horarioNaoConfirmou,
    mensagemCriacao: base.mensagemCriacao,
    mensagemConfirmada: base.mensagemConfirmada,
    mensagemJaConfirmado: base.mensagemJaConfirmado,
    atualizadoEm: c ? c.updatedAt.toISOString() : null,
  };
}

export function toModeloDto(m: ModeloCompleto): ConfirmacaoModelo {
  return {
    id: m.id,
    tipoAgendamentoId: m.tipoAgendamentoId,
    tipo: m.tipoAgendamento.nome,
    msg1: m.msg1,
    msg2: m.msg2,
    msg3: m.msg3,
    lembreteConfirmado: m.lembreteConfirmado,
    lembreteNaoConfirmado: m.lembreteNaoConfirmado,
  };
}

/** Aba "Modelos e Config": configuração geral (uma linha) e modelos por tipo de agendamento. */
@Injectable()
export class ConfirmacoesConfigService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly audit: AuditService,
  ) {}

  // ---------- Configuração Geral ----------

  /** Sem nada salvo, devolve os padrões do legado. */
  async configuracao(): Promise<ConfirmacaoConfig> {
    return toConfigDto(await this.txHost.tx.configuracaoConfirmacao.findUnique({ where: { id: 1 } }));
  }

  @Transactional()
  async salvarConfiguracao(input: ConfirmacaoConfigInput): Promise<ConfirmacaoConfig> {
    const antes = await this.txHost.tx.configuracaoConfirmacao.findUnique({ where: { id: 1 } });
    const depois = await this.txHost.tx.configuracaoConfirmacao.upsert({
      where: { id: 1 },
      create: { id: 1, ...input },
      update: input,
    });
    await this.audit.record({
      action: 'UPDATE',
      entity: 'ConfiguracaoConfirmacao',
      entityId: '1',
      before: toConfigDto(antes),
      after: toConfigDto(depois),
    });
    return toConfigDto(depois);
  }

  // ---------- Modelos por tipo ----------

  async listarModelos(): Promise<ConfirmacaoModelo[]> {
    const modelos = await this.txHost.tx.modeloConfirmacao.findMany({
      where: NAO_EXCLUIDOS,
      include: INCLUDE_MODELO,
      orderBy: [{ tipoAgendamento: { nome: 'asc' } }, { id: 'asc' }],
    });
    return modelos.map(toModeloDto);
  }

  async modelo(id: string): Promise<ConfirmacaoModelo> {
    return toModeloDto(await this.buscarModelo(id));
  }

  /** Um modelo por tipo. Se o tipo teve o modelo excluído, o registro antigo é reaproveitado. */
  async criarModelo(input: ConfirmacaoModeloInput): Promise<ConfirmacaoModelo> {
    await this.garantirTipo(input.tipoAgendamentoId);
    const existente = await this.txHost.tx.modeloConfirmacao.findUnique({
      where: { tipoAgendamentoId: input.tipoAgendamentoId },
    });
    if (existente && existente.deletedAt === null) throw this.duplicado();
    const modelo = existente
      ? await this.txHost.tx.modeloConfirmacao.update({
          where: { id: existente.id },
          data: { ...input, deletedAt: null },
          include: INCLUDE_MODELO,
        })
      : await this.txHost.tx.modeloConfirmacao.create({ data: input, include: INCLUDE_MODELO });
    return toModeloDto(modelo);
  }

  async alterarModelo(id: string, input: ConfirmacaoModeloInput): Promise<ConfirmacaoModelo> {
    const atual = await this.buscarModelo(id);
    if (input.tipoAgendamentoId !== atual.tipoAgendamentoId) {
      await this.garantirTipo(input.tipoAgendamentoId);
      const outro = await this.txHost.tx.modeloConfirmacao.findUnique({
        where: { tipoAgendamentoId: input.tipoAgendamentoId },
      });
      if (outro) {
        // Modelo excluído do tipo de destino libera o tipo; o ativo bloqueia.
        if (outro.deletedAt === null) throw this.duplicado();
        await this.txHost.tx.modeloConfirmacao.delete({ where: { id: outro.id } });
      }
    }
    const modelo = await this.txHost.tx.modeloConfirmacao.update({
      where: { id },
      data: input,
      include: INCLUDE_MODELO,
    });
    return toModeloDto(modelo);
  }

  /** Exclusão lógica: o tipo volta a usar os textos padrão. */
  async removerModelo(id: string): Promise<ConfirmacaoModelo> {
    await this.buscarModelo(id);
    const modelo = await this.txHost.tx.modeloConfirmacao.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: INCLUDE_MODELO,
    });
    return toModeloDto(modelo);
  }

  /** Modelo do tipo, para o envio. */
  async modeloDoTipo(tipoAgendamentoId: string | null) {
    if (!tipoAgendamentoId) return null;
    return this.txHost.tx.modeloConfirmacao.findFirst({
      where: { tipoAgendamentoId, ...NAO_EXCLUIDOS },
    });
  }

  private async buscarModelo(id: string): Promise<ModeloCompleto> {
    const modelo = isUuid(id)
      ? await this.txHost.tx.modeloConfirmacao.findFirst({
          where: { id, ...NAO_EXCLUIDOS },
          include: INCLUDE_MODELO,
        })
      : null;
    if (!modelo) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Modelo não encontrado', { status: 404 });
    }
    return modelo;
  }

  private async garantirTipo(id: string): Promise<void> {
    const tipo = await this.txHost.tx.tipoAgendamento.findFirst({
      where: { id, ...NAO_EXCLUIDOS },
      select: { id: true },
    });
    if (!tipo) {
      const mensagem = 'Tipo de agendamento inválido';
      throw new BusinessException('TIPO_INVALIDO', mensagem, {
        status: 400,
        details: [{ field: 'tipoAgendamentoId', message: mensagem }],
      });
    }
  }

  private duplicado(): BusinessException {
    const mensagem = 'Já existe um modelo para este tipo de agendamento';
    return new BusinessException('MODELO_DUPLICADO', mensagem, {
      status: 400,
      details: [{ field: 'tipoAgendamentoId', message: mensagem }],
    });
  }
}
