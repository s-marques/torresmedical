import type { TransactionHost } from '@nestjs-cls/transactional';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { AgendaOcupacaoService } from './agenda-ocupacao.service';

describe('AgendaOcupacaoService.salasOcupadasEm (Painel "Hoje", #170)', () => {
  const agora = new Date('2026-11-27T15:00:00.000Z');
  const minutosAntes = (m: number) => new Date(agora.getTime() - m * 60_000);

  it('só conta a sala cujo agendamento já começou e ainda não terminou', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { salaId: 'em-curso', inicio: minutosAntes(10), duracaoMinutos: 30 },
      { salaId: 'terminou', inicio: minutosAntes(60), duracaoMinutos: 30 },
      { salaId: 'em-curso', inicio: minutosAntes(5), duracaoMinutos: 30 },
      { salaId: null, inicio: minutosAntes(5), duracaoMinutos: 30 },
    ]);
    const service = new AgendaOcupacaoService({
      tx: { agendamento: { findMany } },
    } as unknown as TransactionHost<PrismaAdapter>);

    const ocupadas = await service.salasOcupadasEm(agora);

    expect([...ocupadas]).toEqual(['em-curso']);
    expect(findMany.mock.calls[0]?.[0].where.status.in).not.toContain('CANCELADO');
  });
});
