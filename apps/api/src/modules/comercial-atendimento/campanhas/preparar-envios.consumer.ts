import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { BaseConsumer, MessageConsumer } from '../../../common/messaging/message-consumer';
import type { MessageEnvelope } from '../../../common/messaging/message-envelope';
import {
  COMANDO_PREPARAR_AUTOMACAO,
  COMANDO_PREPARAR_CAMPANHA,
  EnviosCampanhaService,
} from './envios-campanha.service';
import { agoraNaClinica } from './relogio-clinica';

const payloadSchema = z.union([
  z.object({ campanhaId: z.uuid() }),
  z.object({ mensagemAutomaticaId: z.uuid(), dia: z.iso.date() }),
]);
type Payload = z.infer<typeof payloadSchema>;

/**
 * Monta os destinatários de uma campanha ou do disparo diário de uma mensagem automática.
 * Idempotente: campanha já preparada é ignorada, e o mesmo paciente não entra duas vezes
 * (índices únicos em `envios_campanha`).
 */
@Injectable()
@MessageConsumer({
  queue: 'comercial.preparar-envios-campanha',
  events: [COMANDO_PREPARAR_CAMPANHA, COMANDO_PREPARAR_AUTOMACAO],
  payloadSchema,
})
export class PrepararEnviosConsumer extends BaseConsumer<Payload> {
  constructor(private readonly envios: EnviosCampanhaService) {
    super();
  }

  async handle({ payload }: MessageEnvelope<Payload>): Promise<void> {
    const agora = agoraNaClinica();
    if ('campanhaId' in payload) {
      await this.envios.prepararCampanha(payload.campanhaId, agora);
    } else {
      await this.envios.prepararAutomacao(payload.mensagemAutomaticaId, payload.dia, agora);
    }
  }
}
