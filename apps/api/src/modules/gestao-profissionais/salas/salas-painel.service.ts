import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  adicionarDias,
  compararNomesSala,
  diaDaSemana,
  SALA_BLOQUEIO_TIPOS_OCUPAM,
  segundaDaSemana,
  type ContratoSala,
  type SalaDashboard,
  type SalaDashboardQuery,
  type SalaOcupacao,
  type SalaOcupacaoBloco,
  type SalaOcupacaoBloqueio,
  type SalaOcupacaoQuery,
} from '@torres/shared';
import { EscopoDadosService, semPermissao } from '../../../common/auth/escopo-dados.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { ContratosSalaService } from './contratos-sala.service';
import { hojeEmSaoPaulo } from './data-local';
import { SalasBloqueiosService, type OcorrenciaBloqueioSala } from './salas-bloqueios.service';

const DIAS_DA_SEMANA = 7;

/** Nome exibido no lugar do locatário de outro profissional para o usuário restrito (issue #153). */
export const LOCATARIO_OCULTO = 'Ocupado';

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

/** Dia de bloqueio no Mapa; o DTO já vem `oculto` para o restrito (issue #153). */
function paraBloqueioDoMapa(o: OcorrenciaBloqueioSala): SalaOcupacaoBloqueio {
  return {
    bloqueioId: o.bloqueio.id,
    tipo: o.bloqueio.tipo,
    data: o.data,
    inicio: o.inicio,
    fim: o.fim,
    profissionalNome: o.bloqueio.profissionalNome,
    oculto: o.bloqueio.oculto,
  };
}

/** Mapa de Ocupação e Dashboard da tela Gestão de Salas. */
@Injectable()
export class SalasPainelService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly contratos: ContratosSalaService,
    private readonly bloqueios: SalasBloqueiosService,
    private readonly escopo: EscopoDadosService,
  ) {}

  /**
   * Semana de segunda a domingo com os contratos ativos de cada sala, dentro da vigência.
   * Usuário restrito (issue #153, confirmado pelo dev) vê só as salas em que um profissional seu
   * tem contrato na semana; os horários dos outros locatários aparecem só como "Ocupado".
   */
  async ocupacao(query: SalaOcupacaoQuery): Promise<SalaOcupacao> {
    const segunda = segundaDaSemana(query.inicio ?? hojeEmSaoPaulo());
    const domingo = adicionarDias(segunda, DIAS_DA_SEMANA - 1);
    const [salas, contratos, bloqueios] = await Promise.all([
      this.salas(),
      this.contratos.ativosNoPeriodo(segunda, domingo),
      this.bloqueios.ocorrenciasNoPeriodo(segunda, domingo),
    ]);
    const proprio = (c: ContratoSala) =>
      this.escopo.permite(c.locatarioTipo === 'PROFISSIONAL' ? c.locatarioId : null);
    const bloqueioProprio = (o: OcorrenciaBloqueioSala) =>
      o.bloqueio.profissionalId !== null && this.escopo.permite(o.bloqueio.profissionalId);
    // Restrito também vê a sala em que um profissional seu tem reserva/uso na semana (#138).
    const visiveis = this.escopo.restrito()
      ? salas.filter(
          (sala) =>
            contratos.some((c) => c.salaId === sala.id && proprio(c)) ||
            bloqueios.some((o) => o.bloqueio.salaId === sala.id && bloqueioProprio(o)),
        )
      : salas;
    return {
      inicio: segunda,
      fim: domingo,
      salas: visiveis.map((sala) => ({
        salaId: sala.id,
        salaNome: sala.nome,
        blocos: contratos
          .filter((c) => c.salaId === sala.id)
          .map((c) => (proprio(c) ? c : { ...c, locatarioNome: LOCATARIO_OCULTO }))
          .flatMap((c) => blocosDoContrato(c, segunda))
          .sort(
            (a, b) =>
              a.data.localeCompare(b.data) ||
              a.inicio.localeCompare(b.inicio) ||
              a.contratoId.localeCompare(b.contratoId),
          ),
        bloqueios: bloqueios
          .filter((o) => o.bloqueio.salaId === sala.id)
          .map(paraBloqueioDoMapa)
          .sort(
            (a, b) =>
              a.data.localeCompare(b.data) ||
              a.inicio.localeCompare(b.inicio) ||
              a.bloqueioId.localeCompare(b.bloqueioId),
          ),
      })),
    };
  }

  /**
   * Total, ocupadas (contrato ativo e vigente na data, ou reserva/uso avulso ativo no dia: issue
   * #138; cortesia não conta e bloqueio/manutenção não mudam o total), disponíveis, taxa e receita mensal
   * contratada por sala (valor total mensal dos contratos, sem os de permuta).
   */
  async dashboard(query: SalaDashboardQuery): Promise<SalaDashboard> {
    // Ocupação e receita de todas as salas são dados da administração (R §37): 403 para restrito.
    if (this.escopo.restrito()) throw semPermissao();
    const data = query.data ?? hojeEmSaoPaulo();
    const [salas, contratos, bloqueios] = await Promise.all([
      this.salas(),
      this.contratos.ativosNoPeriodo(data, data),
      this.bloqueios.ocorrenciasNoPeriodo(data, data),
    ]);
    const existentes = new Set(salas.map((sala) => sala.id));
    const ocupadas = new Set(
      [
        ...contratos.map((c) => c.salaId),
        ...bloqueios
          .filter((o) => SALA_BLOQUEIO_TIPOS_OCUPAM.includes(o.bloqueio.tipo))
          .map((o) => o.bloqueio.salaId),
      ].filter((id) => existentes.has(id)),
    );
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
