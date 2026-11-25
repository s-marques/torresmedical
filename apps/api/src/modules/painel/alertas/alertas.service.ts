import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import { Inject, Injectable } from '@nestjs/common';
import {
  rotaAlerta,
  tiposVisiveis,
  TIPOS_ALERTA,
  type Alerta,
  type AlertasResumo,
  type ListAlertasQuery,
  type TipoAlerta,
} from '@torres/shared';
import type { Alerta as AlertaLinha, AlertaUsuario } from '../../../generated/prisma/client';
import { ALERTA_REGRAS, type AlertaRegra } from '../../../common/alertas/alerta-regra';
import { AuditService } from '../../../common/audit/audit.service';
import { EscopoDadosService, semPermissao } from '../../../common/auth/escopo-dados.service';
import type { UsuarioAutenticado } from '../../../common/auth/usuario-autenticado';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { hojeEmSaoPaulo } from '../../gestao-profissionais/salas/data-local';

const ENTITY = 'AlertaUsuario';

type AlertaComEstado = AlertaLinha & { usuarios: AlertaUsuario[] };

function dia(valor: string): Date {
  return new Date(`${valor}T00:00:00.000Z`);
}

/**
 * Central de notificações (issue #160). O job diário grava um contador por tipo; aqui o usuário
 * vê só os tipos da sua alçada e marca cada alerta como lido ou resolvido (estado pessoal).
 */
@Injectable()
export class AlertasService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    @Inject(ALERTA_REGRAS) private readonly regras: readonly AlertaRegra[],
    private readonly escopo: EscopoDadosService,
    private readonly audit: AuditService,
  ) {}

  /** Recalcula os contadores do dia, um por regra, e devolve os tipos gravados. */
  async recalcular(agora = new Date()): Promise<TipoAlerta[]> {
    const hoje = hojeEmSaoPaulo(agora);
    const gravados: TipoAlerta[] = [];
    for (const regra of this.regras) {
      const quantidade = await regra.contar(hoje);
      await this.txHost.tx.alerta.upsert({
        where: { tipo_data: { tipo: regra.tipo, data: dia(hoje) } },
        create: { tipo: regra.tipo, data: dia(hoje), quantidade },
        update: { quantidade },
      });
      gravados.push(regra.tipo);
    }
    return gravados;
  }

  /** Há contadores gravados para o dia? Usado na subida da API, depois de um dia sem o job. */
  async temDoDia(agora = new Date()): Promise<boolean> {
    return (await this.txHost.tx.alerta.count({ where: { data: dia(hojeEmSaoPaulo(agora)) } })) > 0;
  }

  async listar(
    usuario: UsuarioAutenticado,
    query: ListAlertasQuery,
    agora = new Date(),
  ): Promise<AlertasResumo> {
    const hoje = hojeEmSaoPaulo(agora);
    const tipos = this.tiposDoUsuario(usuario);
    const linhas = await this.txHost.tx.alerta.findMany({
      where: { data: dia(hoje), tipo: { in: tipos }, quantidade: { gt: 0 } },
      include: { usuarios: { where: { usuarioId: usuario.id } } },
    });
    const ordem = new Map<string, number>(TIPOS_ALERTA.map((tipo, indice) => [tipo, indice]));
    const alertas = linhas
      .sort((a, b) => (ordem.get(a.tipo) ?? 0) - (ordem.get(b.tipo) ?? 0))
      .map((linha) => this.toDto(linha))
      .filter((alerta) => query.incluirResolvidos || !alerta.resolvido);
    return {
      data: alertas,
      naoLidos: alertas.filter((alerta) => !alerta.lido && !alerta.resolvido).length,
    };
  }

  /** Marca como lido (idempotente: a data do primeiro "lido" é mantida). */
  @Transactional()
  async marcarLido(usuario: UsuarioAutenticado, id: string, agora = new Date()): Promise<Alerta> {
    return this.atualizarEstado(usuario, id, (atual) => ({ lidoEm: atual?.lidoEm ?? agora }));
  }

  /** Marca como resolvido; resolver também lê. */
  @Transactional()
  async resolver(usuario: UsuarioAutenticado, id: string, agora = new Date()): Promise<Alerta> {
    return this.atualizarEstado(usuario, id, (atual) => ({
      lidoEm: atual?.lidoEm ?? agora,
      resolvidoEm: atual?.resolvidoEm ?? agora,
    }));
  }

  private async atualizarEstado(
    usuario: UsuarioAutenticado,
    id: string,
    campos: (atual: AlertaUsuario | undefined) => { lidoEm: Date; resolvidoEm?: Date },
  ): Promise<Alerta> {
    const alerta = await this.txHost.tx.alerta.findFirst({
      where: { id },
      include: { usuarios: { where: { usuarioId: usuario.id } } },
    });
    if (!alerta) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Alerta não encontrado', { status: 404 });
    }
    if (!this.tiposDoUsuario(usuario).includes(alerta.tipo as TipoAlerta)) throw semPermissao();

    const atual = alerta.usuarios[0];
    const dados = campos(atual);
    const estado = atual
      ? await this.txHost.tx.alertaUsuario.update({ where: { id: atual.id }, data: dados })
      : await this.txHost.tx.alertaUsuario.create({
          data: { alertaId: alerta.id, usuarioId: usuario.id, ...dados },
        });
    await this.audit.record({
      action: atual ? 'UPDATE' : 'CREATE',
      entity: ENTITY,
      entityId: estado.id,
      before: atual ? this.estadoAuditado(atual) : null,
      after: this.estadoAuditado(estado),
    });
    return this.toDto({ ...alerta, usuarios: [estado] });
  }

  private estadoAuditado(estado: AlertaUsuario) {
    return {
      alertaId: estado.alertaId,
      usuarioId: estado.usuarioId,
      lidoEm: estado.lidoEm,
      resolvidoEm: estado.resolvidoEm,
    };
  }

  private tiposDoUsuario(usuario: UsuarioAutenticado): TipoAlerta[] {
    return tiposVisiveis(usuario.permissoes, this.escopo.restrito());
  }

  private toDto(linha: AlertaComEstado): Alerta {
    const estado = linha.usuarios[0];
    const data = linha.data.toISOString().slice(0, 10);
    return {
      id: linha.id,
      tipo: linha.tipo as TipoAlerta,
      data,
      quantidade: linha.quantidade,
      rota: rotaAlerta(linha.tipo as TipoAlerta, data),
      lido: Boolean(estado?.lidoEm),
      resolvido: Boolean(estado?.resolvidoEm),
    };
  }
}
