import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { BaseConsumer, MessageConsumer } from '../../../common/messaging/message-consumer';
import type { MessageEnvelope } from '../../../common/messaging/message-envelope';
import { EnvioPesquisaNpsService } from './envio-pesquisa-nps.service';

/** Fato publicado pelo consultório ao finalizar um atendimento (só ids). Só o nome é combinado. */
export const EVENTO_ATENDIMENTO_FINALIZADO = 'consultorio.atendimento.finalizado';

const payloadSchema = z.object({
  atendimentoId: z.uuid(),
  pacienteId: z.uuid(),
  profissionalId: z.uuid(),
});
type Payload = z.infer<typeof payloadSchema>;

/** Manda a pesquisa NPS quando um atendimento é finalizado. Idempotente por atendimento. */
@Injectable()
@MessageConsumer({
  queue: 'comercial.enviar-pesquisa-nps',
  events: [EVENTO_ATENDIMENTO_FINALIZADO],
  payloadSchema,
})
export class EnviarPesquisaNpsConsumer extends BaseConsumer<Payload> {
  constructor(private readonly envio: EnvioPesquisaNpsService) {
    super();
  }

  async handle({ payload }: MessageEnvelope<Payload>): Promise<void> {
    await this.envio.enviar(payload);
  }
}
