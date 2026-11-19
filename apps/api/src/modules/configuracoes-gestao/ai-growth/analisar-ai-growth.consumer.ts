import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { BaseConsumer, MessageConsumer } from '../../../common/messaging/message-consumer';
import type { MessageEnvelope } from '../../../common/messaging/message-envelope';
import { AiGrowthService, COMANDO_ANALISAR_AI_GROWTH } from './ai-growth.service';

const payloadSchema = z.object({ analiseId: z.uuid() });
type Payload = z.infer<typeof payloadSchema>;

/** Roda o "Analisar Agora". Idempotente: uma análise já iniciada não é processada de novo. */
@Injectable()
@MessageConsumer({
  queue: 'configuracoes-gestao.analisar-ai-growth',
  events: [COMANDO_ANALISAR_AI_GROWTH],
  payloadSchema,
})
export class AnalisarAiGrowthConsumer extends BaseConsumer<Payload> {
  constructor(private readonly aiGrowth: AiGrowthService) {
    super();
  }

  async handle({ payload }: MessageEnvelope<Payload>): Promise<void> {
    await this.aiGrowth.processar(payload.analiseId);
  }
}
