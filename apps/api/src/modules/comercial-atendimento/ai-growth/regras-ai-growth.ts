import { AI_GROWTH_DIAS_ANIVERSARIO, AI_GROWTH_OCUPACAO_MINIMA } from '@torres/shared';
import { toLocalWallClock } from '../../../common/export/export-values';

const DIA_MS = 24 * 60 * 60 * 1000;

export function diasAtras(agora: Date, dias: number): Date {
  return new Date(agora.getTime() - dias * DIA_MS);
}

/** `MM-DD` da data de nascimento (coluna `@db.Date`, lida em UTC). */
const mesDia = (data: Date): string => data.toISOString().slice(5, 10);

/**
 * Pacientes que fazem aniversário de hoje até os próximos 7 dias (dia seguinte ao último
 * incluído), no relógio da clínica. Considera só mês e dia.
 */
export function contarAniversariantes(nascimentos: readonly Date[], agora: Date): number {
  const hoje = toLocalWallClock(agora);
  const janela = new Set<string>();
  for (let i = 0; i <= AI_GROWTH_DIAS_ANIVERSARIO; i += 1) {
    janela.add(mesDia(new Date(hoje.getTime() + i * DIA_MS)));
  }
  return nascimentos.filter((nascimento) => janela.has(mesDia(nascimento))).length;
}

/**
 * Faixas horárias (dia da semana + hora cheia) com ocupação abaixo de 50% da média das faixas
 * em que a clínica atendeu. Só entram faixas com algum agendamento: sem horário de
 * funcionamento cadastrado por faixa, é o que mostra onde a clínica trabalha.
 */
export function contarFaixasBaixaOcupacao(inicios: readonly Date[]): number {
  const porFaixa = new Map<string, number>();
  for (const inicio of inicios) {
    const parede = toLocalWallClock(inicio);
    const faixa = `${parede.getUTCDay()}-${parede.getUTCHours()}`;
    porFaixa.set(faixa, (porFaixa.get(faixa) ?? 0) + 1);
  }
  if (porFaixa.size === 0) return 0;
  const media = inicios.length / porFaixa.size;
  return [...porFaixa.values()].filter((total) => total < media * AI_GROWTH_OCUPACAO_MINIMA).length;
}

export interface ProducaoProfissional {
  atendimentos: number;
  faturado: number;
}

/**
 * Profissionais com menos de 50% da média de atendimentos do período. Quem não atendeu
 * ninguém entra na média e conta como subutilizado.
 */
export function profissionaisSubutilizados(producao: readonly ProducaoProfissional[]): {
  quantidade: number;
  media: number;
  faturado: number;
} {
  if (producao.length === 0) return { quantidade: 0, media: 0, faturado: 0 };
  const total = producao.reduce((soma, p) => soma + p.atendimentos, 0);
  const media = total / producao.length;
  const abaixo = producao.filter((p) => p.atendimentos < media * AI_GROWTH_OCUPACAO_MINIMA);
  return {
    quantidade: abaixo.length,
    media: Math.round(media * 10) / 10,
    faturado: Math.round(abaixo.reduce((soma, p) => soma + p.faturado, 0) * 100) / 100,
  };
}

export interface UltimoAtendimento {
  pacienteId: string;
  profissionalId: string;
  ultimo: Date;
}

/**
 * Pacientes e vínculos (paciente + profissional) sem atendimento desde `limite` e sem consulta
 * marcada à frente. Devolve a contagem de pacientes e de profissionais que têm algum.
 */
export function inativos(
  atendimentos: readonly UltimoAtendimento[],
  futuros: readonly { pacienteId: string; profissionalId: string }[],
  limite: Date,
): { pacientes: number; profissionais: number } {
  const pacientesComFuturo = new Set(futuros.map((f) => f.pacienteId));
  const vinculosComFuturo = new Set(futuros.map((f) => `${f.pacienteId}|${f.profissionalId}`));

  const ultimoPorPaciente = new Map<string, Date>();
  for (const { pacienteId, ultimo } of atendimentos) {
    const atual = ultimoPorPaciente.get(pacienteId);
    if (!atual || ultimo > atual) ultimoPorPaciente.set(pacienteId, ultimo);
  }
  const pacientes = [...ultimoPorPaciente].filter(
    ([id, ultimo]) => ultimo < limite && !pacientesComFuturo.has(id),
  ).length;

  const profissionais = new Set(
    atendimentos
      .filter(
        (a) => a.ultimo < limite && !vinculosComFuturo.has(`${a.pacienteId}|${a.profissionalId}`),
      )
      .map((a) => a.profissionalId),
  ).size;
  return { pacientes, profissionais };
}
