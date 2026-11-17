import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type {
  AtivarMensagemAutomaticaInput,
  MensagemAutomatica,
  MensagemAutomaticaInput,
} from '@torres/shared';
import type { Prisma } from '../../../generated/prisma/client';
import { isUuid } from '../../../common/auth/tokens';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { CanaisWhatsappService } from '../../configuracoes-gestao/canais-whatsapp/canais-whatsapp.service';
import { OrigensClienteService } from '../origens-cliente/origens-cliente.service';
import { camposDoFiltro, INCLUDE, validarReferencias } from './campanhas.service';

type AutomacaoCompleta = Prisma.MensagemAutomaticaGetPayload<{ include: typeof INCLUDE }>;

const NAO_EXCLUIDAS = { deletedAt: null } as const;

/** Mensagens Automáticas (aba da tela Campanhas): mensagens recorrentes por dia e horário. */
@Injectable()
export class MensagensAutomaticasService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly canais: CanaisWhatsappService,
    private readonly origens: OrigensClienteService,
  ) {}

  /** Todas, na ordem de criação (cartões e tabela "Mensagens Automáticas — Resumo"). */
  async list(): Promise<MensagemAutomatica[]> {
    const linhas = await this.txHost.tx.mensagemAutomatica.findMany({
      where: NAO_EXCLUIDAS,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: INCLUDE,
    });
    return this.paraDto(linhas);
  }

  async findById(id: string): Promise<MensagemAutomatica> {
    return this.toDto(await this.buscar(id));
  }

  async create(input: MensagemAutomaticaInput): Promise<MensagemAutomatica> {
    await validarReferencias(input, this.canais, this.origens);
    const criada = await this.txHost.tx.mensagemAutomatica.create({
      data: this.dados(input),
      include: INCLUDE,
    });
    return this.toDto(criada);
  }

  async update(id: string, input: MensagemAutomaticaInput): Promise<MensagemAutomatica> {
    await this.buscar(id);
    await validarReferencias(input, this.canais, this.origens);
    const alterada = await this.txHost.tx.mensagemAutomatica.update({
      where: { id },
      data: this.dados(input),
      include: INCLUDE,
    });
    return this.toDto(alterada);
  }

  /** Switch do cartão. Desativar cancela os envios do dia que ainda não saíram. */
  async alterarAtiva(
    id: string,
    { ativa }: AtivarMensagemAutomaticaInput,
  ): Promise<MensagemAutomatica> {
    await this.buscar(id);
    if (!ativa) await this.cancelarPendentes(id);
    const alterada = await this.txHost.tx.mensagemAutomatica.update({
      where: { id },
      data: { ativa },
      include: INCLUDE,
    });
    return this.toDto(alterada);
  }

  /** Exclusão lógica; os envios que ainda não saíram são cancelados. */
  async remove(id: string): Promise<MensagemAutomatica> {
    await this.buscar(id);
    await this.cancelarPendentes(id);
    const excluida = await this.txHost.tx.mensagemAutomatica.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: INCLUDE,
    });
    return this.toDto(excluida);
  }

  // ---------- Apoio ----------

  private cancelarPendentes(mensagemAutomaticaId: string) {
    return this.txHost.tx.envioCampanha.updateMany({
      where: { mensagemAutomaticaId, status: 'PROGRAMADO' },
      data: { status: 'CANCELADO' },
    });
  }

  private async buscar(id: string): Promise<AutomacaoCompleta> {
    const automacao = isUuid(id)
      ? await this.txHost.tx.mensagemAutomatica.findFirst({
          where: { id, ...NAO_EXCLUIDAS },
          include: INCLUDE,
        })
      : null;
    if (!automacao) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Mensagem automática não encontrada', {
        status: 404,
      });
    }
    return automacao;
  }

  private dados(input: MensagemAutomaticaInput) {
    return {
      nome: input.nome,
      tipoEnvio: input.tipoEnvio,
      canalId: input.canalId,
      ...camposDoFiltro(input),
      horario: input.horario,
      diasSemana: input.diasSemana,
      ativa: input.ativa,
      mensagem: input.mensagem,
    };
  }

  private async paraDto(linhas: readonly AutomacaoCompleta[]): Promise<MensagemAutomatica[]> {
    const ids = linhas.map((a) => a.id);
    const grupos =
      ids.length === 0
        ? []
        : await this.txHost.tx.envioCampanha.groupBy({
            by: ['mensagemAutomaticaId'],
            where: { mensagemAutomaticaId: { in: ids }, status: 'ENFILEIRADO' },
            _count: { _all: true },
          });
    const enviados = new Map(grupos.map((g) => [g.mensagemAutomaticaId, g._count._all]));
    return linhas.map((a) => ({
      id: a.id,
      nome: a.nome,
      tipoEnvio: a.tipoEnvio,
      canalId: a.canalId,
      canal: a.canal.nome,
      filtro: a.filtro,
      origemClienteId: a.origemClienteId,
      origem: a.origemCliente?.nome ?? null,
      diasCompra: a.diasCompra,
      horario: a.horario,
      diasSemana: a.diasSemana,
      ativa: a.ativa,
      mensagem: a.mensagem,
      totalEnviados: enviados.get(a.id) ?? 0,
      ultimoEnvioEm: a.ultimoEnvioEm?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
    }));
  }

  private async toDto(automacao: AutomacaoCompleta): Promise<MensagemAutomatica> {
    const [dto] = await this.paraDto([automacao]);
    return dto as MensagemAutomatica;
  }
}
