import { Injectable, Logger } from '@nestjs/common';

export const NOTIFICADOR_REDEFINICAO_SENHA = Symbol('NOTIFICADOR_REDEFINICAO_SENHA');

export interface PedidoRedefinicaoSenha {
  usuarioId: string;
  /** Token do link `/redefinir-senha?token=...`. Segredo: nunca vai para log. */
  token: string;
  expiraEm: Date;
}

/** Envia ao usuário o link de redefinição de senha (e-mail, pela mensageria). */
export interface NotificadorRedefinicaoSenha {
  enviar(pedido: PedidoRedefinicaoSenha): Promise<void>;
}

/**
 * Implementação provisória: o envio do e-mail entra com a mensageria (#78), como um comando
 * na fila. Até lá, só registra que houve o pedido (com o id, sem e-mail nem token).
 */
@Injectable()
export class NotificadorRedefinicaoSenhaPendente implements NotificadorRedefinicaoSenha {
  private readonly logger = new Logger(NotificadorRedefinicaoSenhaPendente.name);

  enviar({ usuarioId }: PedidoRedefinicaoSenha): Promise<void> {
    this.logger.warn({ usuarioId }, 'Redefinição de senha pedida: envio do e-mail ainda pendente');
    return Promise.resolve();
  }
}
