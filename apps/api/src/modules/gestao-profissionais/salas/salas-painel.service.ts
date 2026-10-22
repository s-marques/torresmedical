import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  adicionarDias,
  compararNomesSala,
  diaDaSemana,
  segundaDaSemana,
  type ContratoSala,
  type SalaDashboard,
  type SalaDashboardQuery,
  type SalaOcupacao,
  type SalaOcupacaoBloco,
  type SalaOcupacaoQuery,
} from '@torres/shared';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { ContratosSalaService } from './contratos-sala.service';
import { hojeEmSaoPaulo } from './data-local';

const DIAS_DA_SEMANA = 7;

/** Blocos de um contrato nos dias da semana `[segunda, domingo]` em que ele está vigente. */
function blocosDoContrato(contrato: ContratoSala, segunda: string): SalaOcupacaoBloco[] {
  const blocos: SalaOcupacaoBloco[] = [];
  for (let i = 0; i < DIAS_DA_SEMANA; i++) {
    const data = adicionarDias(segunda, i);
    const vigente =
      data >= contrato.dataInicio && (contrato.dataFim === null || data <= contrato.dataFim);
    const dia = contrato.dias.find((d) => d.diaSemana === diaDaSemana(data));
    if (vigente && dia) {
      blocos.push({
        contratoId: contrato.id,
        data,
        locatarioNome: contrato.locatarioNome,
        inicio: dia.inicio,
        fim: dia.fim,
      });
    }
  }
  return blocos;
}

/** Mapa de Ocupação e Dashboard da tela Gestão de Salas. */
@Injectable()
export class SalasPainelService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly contratos: ContratosSalaService,
  ) {}

  /** Semana de segunda a domingo com os contratos ativos de cada sala, dentro da vigência. */
  async ocupacao(query: SalaOcupacaoQuery): Promise<SalaOcupacao> {
    const segunda = segundaDaSemana(query.inicio ?? hojeEmSaoPaulo());
    const domingo = adicionarDias(segunda, DIAS_DA_SEMANA - 1);
    const [salas, contratos] = await Promise.all([
      this.salas(),
      this.contratos.ativosNoPeriodo(segunda, domingo),
    ]);
    return {
      inicio: segunda,
      fim: domingo,
      salas: salas.map((sala) => ({
        salaId: sala.id,
        salaNome: sala.nome,
        blocos: contratos
          .filter((c) => c.salaId === sala.id)
          .flatMap((c) => blocosDoContrato(c, segunda))
          .sort(
            (a, b) =>
              a.data.localeCompare(b.data) ||
              a.inicio.localeCompare(b.inicio) ||
              a.contratoId.localeCompare(b.contratoId),
          ),
      })),
    };
  }

  /**
   * Total, ocupadas (contrato ativo e vigente na data), disponíveis, taxa e receita mensal
   * contratada por sala (valor total mensal dos contratos, sem os de permuta).
   */
  async dashboard(query: SalaDashboardQuery): Promise<SalaDashboard> {
    const data = query.data ?? hojeEmSaoPaulo();
    const [salas, contratos] = await Promise.all([
      this.salas(),
      this.contratos.ativosNoPeriodo(data, data),
    ]);
    const ocupadas = new Set(contratos.map((c) => c.salaId));
    const receita = new Map<string, number>();
    for (const contrato of contratos) {
      if (contrato.permuta) continue;
      receita.set(
        contrato.salaId,
        Math.round(((receita.get(contrato.salaId) ?? 0) + contrato.valorTotalMensal) * 100) / 100,
      );
    }
    const receitaPorSala = salas
      .map((sala) => ({ salaId: sala.id, salaNome: sala.nome, valor: receita.get(sala.id) ?? 0 }))
      .sort((a, b) => b.valor - a.valor || compararNomesSala(a.salaNome, b.salaNome));
    const total = salas.length;
    return {
      data,
      totalSalas: total,
      ocupadas: ocupadas.size,
      disponiveis: total - ocupadas.size,
      taxaOcupacao: total === 0 ? 0 : Math.round((ocupadas.size / total) * 1000) / 10,
      receitaMensalTotal:
        Math.round(receitaPorSala.reduce((soma, sala) => soma + sala.valor, 0) * 100) / 100,
      receitaPorSala,
    };
  }

  /** Salas não excluídas, em ordem natural do nome. */
  private async salas(): Promise<Array<{ id: string; nome: string }>> {
    const salas = await this.txHost.tx.sala.findMany({
      where: { deletedAt: null },
      select: { id: true, nome: true },
    });
    return salas.sort((a, b) => compararNomesSala(a.nome, b.nome));
  }
}
