import type { SalaBloqueio } from '@torres/shared';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { ProfissionalAgendaService } from '../../gestao-profissionais/profissionais/profissional-agenda.service';
import type { SalasBloqueiosService } from '../../gestao-profissionais/salas/salas-bloqueios.service';
import type { SalasService } from '../../gestao-profissionais/salas/salas.service';
import { AgendaConflitosService, type OcupacaoPretendida } from './agenda-conflitos.service';
import { instanteDeInicio } from './agenda-tempo';

const SALA = '4b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const PROF = '1b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const OUTRO_PROF = '3b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

/** 20/11/2026, 14:00 a 14:30 no fuso da clínica. */
const PRETENDIDA: OcupacaoPretendida = {
  salaId: SALA,
  profissionalId: PROF,
  data: '2026-11-20',
  hora: '14:00',
  inicio: instanteDeInicio('2026-11-20', '14:00'),
  duracaoMinutos: 30,
};

function existente(hora: string, duracaoMinutos: number, extra: Record<string, unknown> = {}) {
  return {
    id: ID,
    numero: 1,
    inicio: instanteDeInicio('2026-11-20', hora),
    duracaoMinutos,
    profissionalId: PROF,
    salaId: SALA,
    sala: { nome: 'Sala 1' },
    profissional: { nome: 'Dra. Fictícia' },
    ...extra,
  };
}

function bloqueioSala(extra: Partial<SalaBloqueio> = {}): SalaBloqueio {
  return {
    id: ID,
    salaId: SALA,
    salaNome: 'Sala 1',
    tipo: 'MANUTENCAO',
    status: 'ATIVO',
    profissionalId: null,
    oculto: false,
    ...extra,
  } as SalaBloqueio;
}

function criar() {
  const ordem: string[] = [];
  const findMany = jest.fn().mockResolvedValue([]);
  const executeRaw = jest.fn().mockImplementation(() => {
    ordem.push('trava-profissional');
    return Promise.resolve(1);
  });
  const txHost = {
    tx: { $executeRaw: executeRaw, agendamento: { findMany } },
  } as unknown as import('@nestjs-cls/transactional').TransactionHost<PrismaAdapter>;
  const salas = {
    travarParaAgendamento: jest.fn().mockImplementation(() => {
      ordem.push('trava-sala');
      return Promise.resolve({ id: SALA, nome: 'Sala 1' });
    }),
  };
  const bloqueiosSala = { sobrepostosAoHorario: jest.fn().mockResolvedValue([]) };
  const agendaProfissional = { disponibilidade: jest.fn().mockResolvedValue(null) };
  const service = new AgendaConflitosService(
    txHost,
    salas as unknown as SalasService,
    bloqueiosSala as unknown as SalasBloqueiosService,
    agendaProfissional as unknown as ProfissionalAgendaService,
  );
  return { service, findMany, executeRaw, salas, bloqueiosSala, agendaProfissional, ordem };
}

async function erro(promessa: Promise<unknown>) {
  try {
    await promessa;
  } catch (e) {
    return e as { status: number; message: string; code?: string; getStatus(): number };
  }
  throw new Error('esperava uma exceção');
}

describe('AgendaConflitosService', () => {
  it('horário livre: passa e trava a sala antes do profissional', async () => {
    const { service, ordem, bloqueiosSala, agendaProfissional } = criar();

    await expect(service.garantirLivre(PRETENDIDA)).resolves.toBeUndefined();

    expect(ordem).toEqual(['trava-sala', 'trava-profissional']);
    expect(agendaProfissional.disponibilidade).toHaveBeenCalledWith(PROF, '2026-11-20', 840, 870);
    expect(bloqueiosSala.sobrepostosAoHorario).toHaveBeenCalledWith(
      SALA,
      '2026-11-20',
      '14:00',
      '14:30',
    );
  });

  describe('profissional atende no horário', () => {
    it.each([
      [
        { motivo: 'SEM_HORARIO_CADASTRADO' },
        'AGENDA_SEM_HORARIO',
        'não tem horário de atendimento',
      ],
      [
        { motivo: 'BLOQUEADO', descricao: 'Férias' },
        'AGENDA_PROFISSIONAL_BLOQUEADO',
        'bloqueio de agenda (Férias) em 20/11/2026, das 14:00 às 14:30',
      ],
      [{ motivo: 'FORA_DO_HORARIO' }, 'AGENDA_FORA_DO_HORARIO', 'fora do horário de atendimento'],
      [{ motivo: 'NO_ALMOCO' }, 'AGENDA_FORA_DO_HORARIO', 'coincide com o almoço'],
    ])('%j vira 409 %s', async (motivo, codigo, trecho) => {
      const { service, agendaProfissional, findMany } = criar();
      agendaProfissional.disponibilidade.mockResolvedValue(motivo);

      const e = await erro(service.garantirLivre(PRETENDIDA));

      expect(e.getStatus()).toBe(409);
      expect(e.message).toContain(trecho);
      expect(e.code).toBe(codigo);
      expect(findMany).not.toHaveBeenCalled();
    });
  });

  describe('sobreposição de agendamentos', () => {
    it('profissional com agendamento sobreposto: 409 com nome e horário', async () => {
      const { service, findMany } = criar();
      findMany.mockResolvedValueOnce([existente('13:45', 30)]);

      const e = await erro(service.garantirLivre(PRETENDIDA));

      expect(e.getStatus()).toBe(409);
      expect(e.message).toBe('Dra. Fictícia já tem agendamento em 20/11/2026, das 13:45 às 14:15.');
    });

    it('sala com agendamento sobreposto: 409 com a sala e o horário, sem nome do paciente', async () => {
      const { service, findMany } = criar();
      findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([existente('14:15', 30)]);

      const e = await erro(service.garantirLivre(PRETENDIDA));

      expect(e.getStatus()).toBe(409);
      expect(e.message).toBe('A sala Sala 1 já tem agendamento em 20/11/2026, das 14:15 às 14:45.');
    });

    it('agendamento que termina quando o outro começa não conflita (borda)', async () => {
      const { service, findMany } = criar();
      // 13:30–14:00 e 14:30–15:00 encostam no intervalo, mas não o invadem.
      findMany.mockResolvedValue([existente('13:30', 30), existente('14:30', 30)]);

      await expect(service.garantirLivre(PRETENDIDA)).resolves.toBeUndefined();
    });

    it('agendamento que engloba o intervalo conflita', async () => {
      const { service, findMany } = criar();
      findMany.mockResolvedValueOnce([existente('13:00', 120)]);

      await expect(service.garantirLivre(PRETENDIDA)).rejects.toMatchObject({ status: 409 });
    });

    it('a consulta ignora cancelados e excluídos e o próprio agendamento editado', async () => {
      const { service, findMany } = criar();

      await service.garantirLivre({ ...PRETENDIDA, ignorarId: ID });

      const { where } = findMany.mock.calls[0][0];
      expect(where).toMatchObject({
        profissionalId: PROF,
        deletedAt: null,
        status: { notIn: ['CANCELADO'] },
        id: { not: ID },
      });
      expect(findMany.mock.calls[1][0].where).toMatchObject({ salaId: SALA });
    });

    it('sem ignorarId, não filtra por id', async () => {
      const { service, findMany } = criar();
      await service.garantirLivre(PRETENDIDA);
      expect(findMany.mock.calls[0][0].where.id).toBeUndefined();
    });
  });

  describe('bloqueios da sala (#138)', () => {
    it.each(['BLOQUEIO', 'MANUTENCAO', 'RESERVA', 'CORTESIA', 'USO_AVULSO'] as const)(
      '%s de outro profissional (ou oculto) impede',
      async (tipo) => {
        const { service, bloqueiosSala } = criar();
        bloqueiosSala.sobrepostosAoHorario.mockResolvedValue([
          bloqueioSala({ tipo, profissionalId: tipo === 'BLOQUEIO' ? null : OUTRO_PROF }),
        ]);

        const e = await erro(service.garantirLivre(PRETENDIDA));

        expect(e.getStatus()).toBe(409);
        expect(e.message).toContain('A sala Sala 1 tem ');
        expect(e.message).toContain('em 20/11/2026, das 14:00 às 14:30');
        expect(e.message).toContain('não pode receber agendamentos');
      },
    );

    it.each(['RESERVA', 'CORTESIA', 'USO_AVULSO'] as const)(
      '%s em nome do próprio profissional libera',
      async (tipo) => {
        const { service, bloqueiosSala } = criar();
        bloqueiosSala.sobrepostosAoHorario.mockResolvedValue([
          bloqueioSala({ tipo, profissionalId: PROF }),
        ]);

        await expect(service.garantirLivre(PRETENDIDA)).resolves.toBeUndefined();
      },
    );

    it.each(['BLOQUEIO', 'MANUTENCAO'] as const)(
      '%s impede até quando é do próprio profissional',
      async (tipo) => {
        const { service, bloqueiosSala } = criar();
        bloqueiosSala.sobrepostosAoHorario.mockResolvedValue([
          bloqueioSala({ tipo, profissionalId: PROF }),
        ]);

        await expect(service.garantirLivre(PRETENDIDA)).rejects.toMatchObject({ status: 409 });
      },
    );

    it('uma reserva do próprio profissional não esconde outro bloqueio no mesmo horário', async () => {
      const { service, bloqueiosSala } = criar();
      bloqueiosSala.sobrepostosAoHorario.mockResolvedValue([
        bloqueioSala({ tipo: 'RESERVA', profissionalId: PROF }),
        bloqueioSala({ tipo: 'MANUTENCAO' }),
      ]);

      const e = await erro(service.garantirLivre(PRETENDIDA));
      expect(e.message).toContain('manutenção');
    });
  });

  it('sala inexistente ou inativa interrompe antes de qualquer outra consulta', async () => {
    const { service, salas, findMany, agendaProfissional } = criar();
    salas.travarParaAgendamento.mockRejectedValue(new Error('sala inválida'));

    await expect(service.garantirLivre(PRETENDIDA)).rejects.toThrow('sala inválida');
    expect(agendaProfissional.disponibilidade).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });
});
