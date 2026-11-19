import type { MessageEnvelope } from '../../../common/messaging/message-envelope';
import { AnalisarAiGrowthConsumer } from './analisar-ai-growth.consumer';
import type { AiGrowthService } from './ai-growth.service';

describe('AnalisarAiGrowthConsumer', () => {
  it('processa a análise do payload', async () => {
    const processar = jest.fn().mockResolvedValue(true);
    const consumer = new AnalisarAiGrowthConsumer({ processar } as unknown as AiGrowthService);
    const analiseId = '11111111-1111-4111-8111-111111111111';

    await consumer.handle({ payload: { analiseId } } as MessageEnvelope<{ analiseId: string }>);
    await consumer.handle({ payload: { analiseId } } as MessageEnvelope<{ analiseId: string }>);

    // A idempotência é do service (só PENDENTE processa): o consumidor repassa sempre.
    expect(processar).toHaveBeenCalledTimes(2);
    expect(processar).toHaveBeenCalledWith(analiseId);
  });
});
