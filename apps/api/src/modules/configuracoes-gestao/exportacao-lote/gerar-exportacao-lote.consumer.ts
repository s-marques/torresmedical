import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { BaseConsumer, MessageConsumer } from '../../../common/messaging/message-consumer';
import type { MessageEnvelope } from '../../../common/messaging/message-envelope';
import { COMANDO_GERAR_EXPORTACAO_LOTE, ExportacaoLoteService } from './exportacao-lote.service';

const payloadSchema = z.object({ exportacaoId: z.uuid() });
type Payload = z.infer<typeof payloadSchema>;

/** A exportação pode levar minutos (milhares de anexos): a transação do consumidor vai a 15 min. */
const TIMEOUT_TRANSACAO_MS = 15 * 60 * 1000;

/** Gera o ZIP de uma exportação em lote. Idempotente: pedido já iniciado não é processado de novo. */
@Injectable()
@MessageConsumer({
  queue: 'configuracoes-gestao.gerar-exportacao-lote',
  events: [COMANDO_GERAR_EXPORTACAO_LOTE],
  payloadSchema,
  prefetch: 1,
  transactionTimeoutMs: TIMEOUT_TRANSACAO_MS,
})
export class GerarExportacaoLoteConsumer extends BaseConsumer<Payload> {
  constructor(private readonly exportacoes: ExportacaoLoteService) {
    super();
  }

  async handle({ payload }: MessageEnvelope<Payload>): Promise<void> {
    await this.exportacoes.processar(payload.exportacaoId);
  }
}
