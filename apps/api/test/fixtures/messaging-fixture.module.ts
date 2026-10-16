import { TransactionHost } from '@nestjs-cls/transactional';
import { BadRequestException, Body, Controller, Injectable, Module, Post } from '@nestjs/common';
import { z } from 'zod';
import { Audit } from '../../src/common/audit/audit.decorator';
import { AuditService } from '../../src/common/audit/audit.service';
import { SomenteAutenticado } from '../../src/common/auth/auth.decorators';
import { EventPublisher } from '../../src/common/messaging/event-publisher';
import type { MessageEnvelope } from '../../src/common/messaging/message-envelope';
import { BaseConsumer, MessageConsumer } from '../../src/common/messaging/message-consumer';
import type { PrismaAdapter } from '../../src/common/prisma/prisma-transaction';

/** Evento e filas de exemplo da mensageria, só para os e2e (exchange `torres.exemplo`). */
export const EVENTO_EMPRESA_CRIADA = 'exemplo.empresa.criada';
export const FILA_EMPRESA_CRIADA = 'exemplo.registrar-empresa-criada';
export const EVENTO_FALHA = 'exemplo.falha.solicitada';
export const FILA_FALHA = 'exemplo.falhar-sempre';

interface EmpresaInput {
  nome: string;
  documento: string;
}

/**
 * Escrita de uma "tela" que publica um evento: a empresa, o audit_log e a outbox entram na
 * mesma transação do `@Audit`. O evento leva só o id.
 */
@Controller('test-fixtures/mensageria/empresas')
@SomenteAutenticado()
class MessagingFixtureController {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly events: EventPublisher,
  ) {}

  @Post()
  @Audit({ entity: 'Empresa' })
  async criar(@Body() body: EmpresaInput) {
    const empresa = await this.txHost.tx.empresa.create({ data: body });
    await this.events.publish(EVENTO_EMPRESA_CRIADA, { empresaId: empresa.id });
    return empresa;
  }

  /** Publica e depois falha: a transação desfaz a escrita e o evento. */
  @Post('falha')
  @Audit({ entity: 'Empresa' })
  async criarComFalha(@Body() body: EmpresaInput) {
    const empresa = await this.txHost.tx.empresa.create({ data: body });
    await this.events.publish(EVENTO_EMPRESA_CRIADA, { empresaId: empresa.id });
    throw new BadRequestException('Falha de negócio depois de publicar');
  }
}

const empresaCriadaSchema = z.object({ empresaId: z.uuid() });

/** Consumidor de exemplo: busca o que precisa pelo id e audita com o usuário do evento. */
@Injectable()
@MessageConsumer({
  queue: FILA_EMPRESA_CRIADA,
  events: [EVENTO_EMPRESA_CRIADA],
  payloadSchema: empresaCriadaSchema,
})
export class EmpresaCriadaConsumer extends BaseConsumer<z.infer<typeof empresaCriadaSchema>> {
  /** eventIds processados, na ordem. */
  readonly processados: string[] = [];

  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly audit: AuditService,
  ) {
    super();
  }

  async handle({ eventId, payload }: MessageEnvelope<{ empresaId: string }>): Promise<void> {
    const empresa = await this.txHost.tx.empresa.findUnique({ where: { id: payload.empresaId } });
    await this.audit.record({
      action: 'CREATE',
      entity: 'ExemploRecebimento',
      entityId: payload.empresaId,
      after: { empresaEncontrada: empresa !== null },
    });
    this.processados.push(eventId);
  }
}

/** Sempre falha: a mensagem deve ir para a DLQ depois de `MESSAGING_MAX_ATTEMPTS` tentativas. */
@Injectable()
@MessageConsumer({ queue: FILA_FALHA, events: [EVENTO_FALHA] })
export class FalhaConsumer extends BaseConsumer {
  tentativas = 0;

  handle(): Promise<void> {
    this.tentativas++;
    return Promise.reject(new Error('Falha simulada'));
  }
}

@Module({
  controllers: [MessagingFixtureController],
  providers: [EmpresaCriadaConsumer, FalhaConsumer],
})
export class MessagingFixtureModule {}
