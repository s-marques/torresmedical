import {
  diaDaSemana,
  MATRIZ_TURNO_FAIXAS,
  turnoDoMinuto,
  type AgendamentoStatus,
  type ContratoSala,
  type MatrizTurno,
  type SalaBloqueioTipo,
} from '@torres/shared';
import type { AgendamentoDaOcupacao } from '../../modules/comercial-atendimento/agenda/agenda-ocupacao.service';

/**
 * Cálculo da ocupação efetiva (issue #139). Função pura: o service busca os dados nos módulos
 * donos e entrega aqui.
 *
 * O **período** é a célula Sala × Dia × Turno (manhã, tarde e noite; mesmos turnos da Agenda
 * matricial, #137). Definições confirmadas pelo dev:
 * - **capacidade:** períodos das salas nos dias de funcionamento, sem os bloqueados (bloqueio e
 *   manutenção);
 * - **contratado:** há contrato vigente da sala que cobre (total ou parcialmente) o turno;
 * - **utilizado:** há agendamento `ATENDIDO` ou `EM_ATENDIMENTO` na sala no turno;
 * - **contratado sem uso:** contratado e sem nenhum atendimento realizado (do profissional
 *   filtrado, quando há filtro);
 * - **ocupado:** contratado, utilizado ou reservado (reserva, cortesia e uso avulso);
 * - **vago:** capacidade menos ocupados. Vem sempre da sala inteira, mesmo com filtro de
 *   profissional.
 */
export const STATUS_UTILIZADO: readonly AgendamentoStatus[] = ['ATENDIDO', 'EM_ATENDIMENTO'];

const TIPOS_BLOQUEADOS: readonly SalaBloqueioTipo[] = ['BLOQUEIO', 'MANUTENCAO'];

export interface BloqueioDaOcupacao {
  salaId: string;
  tipo: SalaBloqueioTipo;
  profissionalId: string | null;
  data: string;
  /** `HH:MM` (ou `24:00`). */
  inicio: string;
  fim: string;
}

export interface EntradaOcupacao {
  salas: ReadonlyArray<{ id: string; nome: string }>;
  /** Dias já filtrados: só os de funcionamento e, se houver filtro, o dia da semana pedido. */
  dias: readonly string[];
  turnos: readonly MatrizTurno[];
  contratos: readonly ContratoSala[];
  bloqueios: readonly BloqueioDaOcupacao[];
  agendamentos: readonly AgendamentoDaOcupacao[];
  /** Profissionais que sempre aparecem na tabela, mesmo sem contrato nem atendimento. */
  profissionalIds: readonly string[];
  /** Filtro de profissional: contratado e utilizado só dele. */
  profissionalId?: string;
}

export interface Contagem {
  capacidade: number;
  contratados: number;
  utilizados: number;
  contratadosSemUso: number;
  ocupados: number;
  vagos: number;
}

export interface OcupacaoProfissional {
  profissionalId: string;
  contratados: number;
  /** Períodos com atendimento realizado dele, contratados ou não. */
  utilizados: number;
  /** Períodos contratados em que ele atendeu. */
  contratadosUsados: number;
  /** `contratadosUsados ÷ contratados`, em %. `null` sem períodos contratados. */
  taxaUso: number | null;
}

export interface ResultadoOcupacao {
  total: Contagem;
  porSala: Array<Contagem & { salaId: string; sala: string }>;
  porTurno: Array<Contagem & { turno: MatrizTurno }>;
  porDia: Array<{ data: string; ocupadosPorTurno: Record<MatrizTurno, number>; vagos: number }>;
  porProfissional: OcupacaoProfissional[];
  /** Agendamentos por hora do dia (horários de maior demanda). */
  demandaPorHora: Array<{ hora: number; agendamentos: number; utilizados: number }>;
  /** Dia da semana × turno, com os períodos vagos (horários ociosos). */
  ociosos: Array<{ diaSemana: number; turno: MatrizTurno; vagos: number; capacidade: number }>;
}

/** Percentual com 1 casa; `null` sem base de cálculo. */
export function percentual(parte: number, total: number): number | null {
  return total === 0 ? null : Math.round((parte / total) * 1000) / 10;
}

function minutos(hora: string): number {
  const [h = 0, m = 0] = hora.split(':').map(Number);
  return h * 60 + m;
}

function contagemVazia(): Contagem {
  return {
    capacidade: 0,
    contratados: 0,
    utilizados: 0,
    contratadosSemUso: 0,
    ocupados: 0,
    vagos: 0,
  };
}

function somar(destino: Contagem, parcela: Contagem): void {
  destino.capacidade += parcela.capacidade;
  destino.contratados += parcela.contratados;
  destino.utilizados += parcela.utilizados;
  destino.contratadosSemUso += parcela.contratadosSemUso;
  destino.ocupados += parcela.ocupados;
  destino.vagos += parcela.vagos;
}

function agrupar<T>(itens: readonly T[], chave: (item: T) => string): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const item of itens) {
    const k = chave(item);
    const lista = mapa.get(k);
    if (lista) lista.push(item);
    else mapa.set(k, [item]);
  }
  return mapa;
}

/** Contrato vigente no dia que cobre o turno. `true` se a faixa do dia cruza o turno. */
function contratoCobre(
  contrato: ContratoSala,
  data: string,
  faixa: { inicio: number; fim: number },
): boolean {
  const vigente =
    data >= contrato.dataInicio && (contrato.dataFim === null || data <= contrato.dataFim);
  if (!vigente) return false;
  return contrato.dias.some(
    (d) =>
      d.diaSemana === diaDaSemana(data) &&
      minutos(d.inicio) < faixa.fim &&
      faixa.inicio < minutos(d.fim),
  );
}

export function calcularOcupacao(entrada: EntradaOcupacao): ResultadoOcupacao {
  const { profissionalId } = entrada;
  const contratosPorSala = agrupar(entrada.contratos, (c) => c.salaId);
  const bloqueiosPorDia = agrupar(entrada.bloqueios, (b) => `${b.salaId}|${b.data}`);
  const agendamentosPorDia = agrupar(entrada.agendamentos, (a) => `${a.salaId}|${a.data}`);
  const dias = new Set(entrada.dias);

  const total = contagemVazia();
  const porSala = new Map<string, Contagem>(entrada.salas.map((s) => [s.id, contagemVazia()]));
  const porTurno = new Map<MatrizTurno, Contagem>(entrada.turnos.map((t) => [t, contagemVazia()]));
  const porDia = new Map<string, { ocupadosPorTurno: Record<MatrizTurno, number>; vagos: number }>(
    entrada.dias.map((d) => [d, { ocupadosPorTurno: { MANHA: 0, TARDE: 0, NOITE: 0 }, vagos: 0 }]),
  );
  const profissionais = new Map<string, OcupacaoProfissional>(
    entrada.profissionalIds.map((id) => [
      id,
      { profissionalId: id, contratados: 0, utilizados: 0, contratadosUsados: 0, taxaUso: null },
    ]),
  );
  const ociosos = new Map<
    string,
    { diaSemana: number; turno: MatrizTurno; vagos: number; capacidade: number }
  >();
  const entradaDoProfissional = (id: string): OcupacaoProfissional => {
    let linha = profissionais.get(id);
    if (!linha) {
      linha = {
        profissionalId: id,
        contratados: 0,
        utilizados: 0,
        contratadosUsados: 0,
        taxaUso: null,
      };
      profissionais.set(id, linha);
    }
    return linha;
  };

  for (const sala of entrada.salas) {
    const contratosDaSala = contratosPorSala.get(sala.id) ?? [];
    for (const data of entrada.dias) {
      const bloqueiosDoDia = bloqueiosPorDia.get(`${sala.id}|${data}`) ?? [];
      const agendamentosDoDia = agendamentosPorDia.get(`${sala.id}|${data}`) ?? [];
      for (const turno of entrada.turnos) {
        const faixa = MATRIZ_TURNO_FAIXAS[turno];
        const cruza = (inicio: number, fim: number) => inicio < faixa.fim && faixa.inicio < fim;
        const naFaixa = bloqueiosDoDia.filter((b) => cruza(minutos(b.inicio), minutos(b.fim)));
        if (naFaixa.some((b) => TIPOS_BLOQUEADOS.includes(b.tipo))) continue;

        const donos = new Set<string | null>();
        for (const c of contratosDaSala) {
          if (contratoCobre(c, data, faixa)) {
            donos.add(c.locatarioTipo === 'PROFISSIONAL' ? c.locatarioId : null);
          }
        }
        const atendidos = new Set(
          agendamentosDoDia
            .filter(
              (a) => STATUS_UTILIZADO.includes(a.status) && cruza(a.inicioMinuto, a.fimMinuto),
            )
            .map((a) => a.profissionalId),
        );

        const contratado = profissionalId ? donos.has(profissionalId) : donos.size > 0;
        const utilizado = profissionalId ? atendidos.has(profissionalId) : atendidos.size > 0;
        const ocupado = donos.size > 0 || atendidos.size > 0 || naFaixa.length > 0;

        const celula: Contagem = {
          capacidade: 1,
          contratados: contratado ? 1 : 0,
          utilizados: utilizado ? 1 : 0,
          contratadosSemUso: contratado && !utilizado ? 1 : 0,
          ocupados: ocupado ? 1 : 0,
          vagos: ocupado ? 0 : 1,
        };
        somar(total, celula);
        somar(porSala.get(sala.id) ?? contagemVazia(), celula);
        somar(porTurno.get(turno) ?? contagemVazia(), celula);
        const dia = porDia.get(data);
        if (dia) {
          dia.ocupadosPorTurno[turno] += celula.ocupados;
          dia.vagos += celula.vagos;
        }
        const chaveOciosa = `${diaDaSemana(data)}|${turno}`;
        const ociosa = ociosos.get(chaveOciosa) ?? {
          diaSemana: diaDaSemana(data),
          turno,
          vagos: 0,
          capacidade: 0,
        };
        ociosa.vagos += celula.vagos;
        ociosa.capacidade += 1;
        ociosos.set(chaveOciosa, ociosa);

        for (const dono of donos) {
          if (dono === null) continue;
          const linha = entradaDoProfissional(dono);
          linha.contratados += 1;
          if (atendidos.has(dono)) linha.contratadosUsados += 1;
        }
        for (const atendido of atendidos) entradaDoProfissional(atendido).utilizados += 1;
      }
    }
  }

  const porHora = new Map<number, { agendamentos: number; utilizados: number }>();
  for (const a of entrada.agendamentos) {
    if (!dias.has(a.data)) continue;
    if (profissionalId && a.profissionalId !== profissionalId) continue;
    if (!entrada.turnos.includes(turnoDoMinuto(a.inicioMinuto))) continue;
    const hora = Math.floor(a.inicioMinuto / 60);
    const linha = porHora.get(hora) ?? { agendamentos: 0, utilizados: 0 };
    linha.agendamentos += 1;
    if (STATUS_UTILIZADO.includes(a.status)) linha.utilizados += 1;
    porHora.set(hora, linha);
  }

  return {
    total,
    porSala: entrada.salas.map((s) => ({
      salaId: s.id,
      sala: s.nome,
      ...(porSala.get(s.id) ?? contagemVazia()),
    })),
    porTurno: entrada.turnos.map((t) => ({ turno: t, ...(porTurno.get(t) ?? contagemVazia()) })),
    porDia: entrada.dias.map((data) => ({
      data,
      ocupadosPorTurno: porDia.get(data)?.ocupadosPorTurno ?? { MANHA: 0, TARDE: 0, NOITE: 0 },
      vagos: porDia.get(data)?.vagos ?? 0,
    })),
    porProfissional: [...profissionais.values()].map((p) => ({
      ...p,
      taxaUso: percentual(p.contratadosUsados, p.contratados),
    })),
    demandaPorHora: [...porHora.entries()]
      .map(([hora, v]) => ({ hora, ...v }))
      .sort((a, b) => b.agendamentos - a.agendamentos || a.hora - b.hora),
    ociosos: [...ociosos.values()].sort((a, b) => b.vagos - a.vagos || a.diaSemana - b.diaSemana),
  };
}
