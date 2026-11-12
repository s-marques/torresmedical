import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  descreverValorContrato,
  minutosEntre,
  valorDasHoras,
  type ContaReceber,
  type ContratoHora as ContratoHoraDto,
  type ContratoHorasResponse,
  type CreateContratoHoraInput,
  type ListContratoHorasQuery,
} from '@torres/shared';
import { isUuid } from '../../../common/auth/tokens';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { ContratoSala, ContratoSalaHora } from '../../../generated/prisma/client';
import { ContasReceberService } from '../../financeiro/contas-receber/contas-receber.service';
import { dataVencimentoDoMes } from './competencia-cobranca';
import { ContratosSalaService } from './contratos-sala.service';

const diaISO = (data: Date) => data.toISOString().slice(0, 10);
const paraData = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function toDto(hora: ContratoSalaHora): ContratoHoraDto {
  return {
    id: hora.id,
    contratoId: hora.contratoId,
    data: diaISO(hora.data),
    entrada: hora.entrada,
    saida: hora.saida,
    duracaoMinutos: minutosEntre(hora.entrada, hora.saida),
    observacao: hora.observacao,
    createdAt: hora.createdAt.toISOString(),
  };
}

/** Primeiro dia do mês `AAAA-MM` e do mês seguinte, em UTC (as datas são dias de calendário). */
function limitesDoMes(mes: string): { inicio: Date; fim: Date } {
  const [ano = 0, numero = 1] = mes.split('-').map(Number);
  return {
    inicio: new Date(Date.UTC(ano, numero - 1, 1)),
    fim: new Date(Date.UTC(ano, numero, 1)),
  };
}

/** Horas utilizadas dos contratos de Hora Avulsa (modal "Horas Utilizadas"). */
@Injectable()
export class ContratosSalaHorasService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly contratos: ContratosSalaService,
    private readonly contasReceber: ContasReceberService,
  ) {}

  async list(contratoId: string, query: ListContratoHorasQuery): Promise<ContratoHorasResponse> {
    const contrato = await this.buscarContrato(contratoId);
    const { inicio, fim } = limitesDoMes(query.mes);
    const horas = await this.txHost.tx.contratoSalaHora.findMany({
      where: { contratoId, data: { gte: inicio, lt: fim } },
      orderBy: [{ data: 'asc' }, { entrada: 'asc' }, { id: 'asc' }],
    });
    const dados = horas.map(toDto);
    const minutosUtilizados = dados.reduce((total, hora) => total + hora.duracaoMinutos, 0);
    const valorHora = Number(contrato.valorUnitario);
    return {
      data: dados,
      resumo: {
        valorHora,
        horasContratadas:
          contrato.quantidadeMensal === null ? null : Number(contrato.quantidadeMensal),
        minutosUtilizados,
        valorTotal: valorDasHoras(minutosUtilizados, valorHora),
      },
    };
  }

  async create(contratoId: string, input: CreateContratoHoraInput): Promise<ContratoHoraDto> {
    await this.buscarContrato(contratoId);
    const criada = await this.txHost.tx.contratoSalaHora.create({
      data: { ...input, contratoId, data: paraData(input.data) },
    });
    return toDto(criada);
  }

  async remove(contratoId: string, horaId: string): Promise<ContratoHoraDto> {
    await this.buscarContrato(contratoId);
    const hora = isUuid(horaId)
      ? await this.txHost.tx.contratoSalaHora.findFirst({ where: { id: horaId, contratoId } })
      : null;
    if (!hora) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Lançamento não encontrado', {
        status: 404,
      });
    }
    await this.txHost.tx.contratoSalaHora.delete({ where: { id: horaId } });
    return toDto(hora);
  }

  /** "Gerar Cobrança" do modal: cobra as horas lançadas no mês, sem duplicar. */
  @Transactional()
  async gerarCobranca(contratoId: string, mes: string): Promise<ContaReceber> {
    const contrato = await this.buscarContrato(contratoId);
    const { inicio, fim } = limitesDoMes(mes);
    const horas = await this.txHost.tx.contratoSalaHora.findMany({
      where: { contratoId, data: { gte: inicio, lt: fim } },
    });
    const minutosUtilizados = horas.reduce(
      (total, hora) => total + minutosEntre(hora.entrada, hora.saida),
      0,
    );
    const valorHora = Number(contrato.valorUnitario);
    const valorTotal = valorDasHoras(minutosUtilizados, valorHora);
    if (valorTotal <= 0) {
      throw new BusinessException(
        'CONTRATO_SEM_HORAS_NO_MES',
        'Não há horas lançadas nesse mês para gerar a cobrança.',
        { status: 409 },
      );
    }
    const existente = await this.txHost.tx.contratoSalaCobranca.findUnique({
      where: { contratoSalaId_competencia: { contratoSalaId: contratoId, competencia: mes } },
    });
    if (existente) {
      throw new BusinessException(
        'CONTRATO_JA_TEM_COBRANCA',
        'A cobrança desse mês já foi gerada.',
        { status: 409 },
      );
    }
    const dto = await this.contratos.findById(contratoId);
    const conta = await this.contasReceber.criarDeOrigemExterna({
      descricao: `Aluguel de sala - ${dto.salaNome} - ${dto.locatarioNome} (${descreverValorContrato(dto)})`,
      pacienteId: dto.locatarioTipo === 'CLIENTE' ? dto.locatarioId : null,
      valor: valorTotal,
      dataVencimento: dataVencimentoDoMes(mes, dto.diaVencimento),
      formaPagamentoId: dto.formaPagamentoId,
      planoContaId: null,
      documento: null,
      totalParcelas: 1,
      status: 'PENDENTE',
      observacoes: null,
    });
    await this.txHost.tx.contratoSalaCobranca.create({
      data: { contratoSalaId: contratoId, competencia: mes, contaReceberId: conta.id },
    });
    return conta;
  }

  /** Contrato não excluído e de Hora Avulsa: só ele tem horas utilizadas. */
  private async buscarContrato(contratoId: string): Promise<ContratoSala> {
    const contrato = isUuid(contratoId)
      ? await this.txHost.tx.contratoSala.findFirst({ where: { id: contratoId, deletedAt: null } })
      : null;
    if (!contrato) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Contrato não encontrado', { status: 404 });
    }
    if (contrato.modalidade !== 'HORA') {
      throw new BusinessException(
        'CONTRATO_NAO_HORA_AVULSA',
        'Horas utilizadas só existem em contratos de Hora Avulsa.',
        { status: 409 },
      );
    }
    return contrato;
  }
}
