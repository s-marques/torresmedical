import { TransactionHost } from '@nestjs-cls/transactional';
import { Inject, Injectable } from '@nestjs/common';
import {
  compararNomesSala,
  diaDaSemana,
  type CreateSalaInput,
  type SalaLocatario,
  type ListSalasQuery,
  type LookupItem,
  type LookupQuery,
  type Sala as SalaDto,
  type UpdateSalaInput,
} from '@torres/shared';
import { isUuid } from '../../../common/auth/tokens';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import {
  buscarPorId,
  juntarDescricao,
  listarLookup,
  SELECIONAVEIS,
  type FonteLookup,
} from '../../../common/lookups/lookup-query';
import { paginate, searchWhere, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { Prisma, Sala } from '../../../generated/prisma/client';
import { ContratosSalaService } from './contratos-sala.service';
import { hojeEmSaoPaulo } from './data-local';
import { SALA_EM_USO_VERIFICADORES, type SalaEmUsoVerificador } from './sala-em-uso';

const NAO_EXCLUIDAS = { deletedAt: null } as const;

const numeroOuNull = (valor: { toString(): string } | null) =>
  valor === null ? null : Number(valor);

function toDto(sala: Sala, emUso: boolean, locatarios: SalaLocatario[]): SalaDto {
  return {
    id: sala.id,
    nome: sala.nome,
    numero: sala.numero,
    andar: sala.andar,
    tipo: sala.tipo,
    capacidade: sala.capacidade,
    metragem: numeroOuNull(sala.metragem),
    valorHora: numeroOuNull(sala.valorHora),
    valorTurno: numeroOuNull(sala.valorTurno),
    valorMensal: numeroOuNull(sala.valorMensal),
    equipamentos: sala.equipamentos,
    ativo: sala.ativo,
    emUso,
    ocupada: locatarios.length > 0,
    locatarios,
    createdAt: sala.createdAt.toISOString(),
    updatedAt: sala.updatedAt.toISOString(),
  };
}

function toItemLookup(sala: Sala): LookupItem {
  return { id: sala.id, label: sala.nome, descricao: juntarDescricao(sala.numero, sala.andar) };
}

/** Salas alugadas a profissionais (aba Salas da tela Gestão de Salas). */
@Injectable()
export class SalasService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    @Inject(SALA_EM_USO_VERIFICADORES)
    private readonly verificadores: readonly SalaEmUsoVerificador[],
    private readonly contratos: ContratosSalaService,
  ) {}

  async list(query: ListSalasQuery): Promise<Page<SalaDto>> {
    const where: Prisma.SalaWhereInput = {
      ...NAO_EXCLUIDAS,
      tipo: query.tipo,
      ativo: query.status ? query.status === 'ativo' : undefined,
      ...searchWhere(query.search, ['nome', 'numero', 'andar', 'equipamentos']),
    };
    const page = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.sala.findMany({ where, orderBy: toOrderBy(query.sort), ...p }),
      count: () => this.txHost.tx.sala.count({ where }),
    });
    const ids = page.data.map((s) => s.id);
    const [usadas, locatarios] = await Promise.all([this.idsEmUso(ids), this.locatariosDe(ids)]);
    return {
      ...page,
      data: page.data.map((s) => toDto(s, usadas.has(s.id), locatarios.get(s.id) ?? [])),
    };
  }

  /** Salas ativas e não excluídas para o combobox (Agenda, issue #136). */
  lookup(query: LookupQuery<'salas'>): Promise<Page<LookupItem>> {
    const where: Prisma.SalaWhereInput = {
      ...SELECIONAVEIS,
      ...searchWhere(query.search, ['nome', 'numero', 'andar']),
    };
    return listarLookup(query, this.fonteLookup, where, toItemLookup);
  }

  /** Item pelo id (inclusive sala inativa), para exibir o valor já gravado. */
  async findLookupById(id: string): Promise<LookupItem> {
    return toItemLookup(await buscarPorId(this.fonteLookup, id, 'Sala não encontrada'));
  }

  private readonly fonteLookup: FonteLookup<Prisma.SalaWhereInput, Sala> = {
    findMany: (args) => this.txHost.tx.sala.findMany(args),
    count: (args) => this.txHost.tx.sala.count(args),
    findFirst: (args) => this.txHost.tx.sala.findFirst(args),
  };

  async findById(id: string): Promise<SalaDto> {
    const sala = await this.buscar(id);
    return this.comSituacao(sala);
  }

  async create(input: CreateSalaInput): Promise<SalaDto> {
    const criada = await this.txHost.tx.sala.create({ data: input });
    return toDto(criada, false, []);
  }

  async update(id: string, input: UpdateSalaInput): Promise<SalaDto> {
    await this.buscar(id);
    const alterada = await this.txHost.tx.sala.update({ where: { id }, data: input });
    return this.comSituacao(alterada);
  }

  /**
   * Exclusão lógica (contratos e cobranças antigos continuam apontando para a sala). Sala com
   * contrato não é excluída.
   */
  async remove(id: string): Promise<SalaDto> {
    await this.buscar(id);
    if ((await this.idsEmUso([id])).has(id)) {
      throw new BusinessException(
        'SALA_EM_USO',
        'Esta sala possui contratos e não pode ser excluída.',
        { status: 409 },
      );
    }
    const excluida = await this.txHost.tx.sala.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return toDto(excluida, false, []);
  }

  private async comSituacao(sala: Sala): Promise<SalaDto> {
    const [usadas, locatarios] = await Promise.all([
      this.idsEmUso([sala.id]),
      this.locatariosDe([sala.id]),
    ]);
    return toDto(sala, usadas.has(sala.id), locatarios.get(sala.id) ?? []);
  }

  /** Locatários de hoje por sala: contratos ativos e vigentes. */
  private async locatariosDe(ids: readonly string[]): Promise<Map<string, SalaLocatario[]>> {
    const porSala = new Map<string, SalaLocatario[]>();
    if (ids.length === 0) return porSala;
    const hoje = hojeEmSaoPaulo();
    for (const contrato of await this.contratos.ativosNoPeriodo(hoje, hoje, ids)) {
      const lista = porSala.get(contrato.salaId) ?? [];
      lista.push({
        contratoId: contrato.id,
        nome: contrato.locatarioNome,
        valorTotalMensal: contrato.valorTotalMensal,
      });
      porSala.set(contrato.salaId, lista);
    }
    return porSala;
  }

  /** Salas não excluídas (ou só a pedida), em ordem natural do nome: linhas da Agenda matricial (#137). */
  async listarParaMatriz(salaId?: string): Promise<Array<{ id: string; nome: string }>> {
    const salas = await this.txHost.tx.sala.findMany({
      where: { ...NAO_EXCLUIDAS, id: salaId },
      select: { id: true, nome: true },
    });
    return salas.sort((a, b) => compararNomesSala(a.nome, b.nome));
  }

  /**
   * Trava a sala (`FOR UPDATE`) na transação em curso e confere que ela existe e está ativa.
   * A Agenda (#136) chama antes de checar a ocupação: duas gravações na mesma sala passam uma de
   * cada vez e a segunda enxerga a primeira (a mesma trava dos bloqueios de sala, #138).
   */
  async travarParaAgendamento(id: string): Promise<{ id: string; nome: string }> {
    const linhas = isUuid(id)
      ? await this.txHost.tx.$queryRaw<Array<{ id: string; nome: string; ativo: boolean }>>`
          SELECT id, nome, ativo FROM salas
          WHERE id = ${id}::uuid AND deleted_at IS NULL
          FOR UPDATE`
      : [];
    const sala = linhas[0];
    if (!sala) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Sala não encontrada', { status: 404 });
    }
    if (!sala.ativo) {
      throw new BusinessException('SALA_INATIVA', `A sala ${sala.nome} está inativa.`, {
        status: 409,
      });
    }
    return { id: sala.id, nome: sala.nome };
  }

  /**
   * Sala do contrato ativo do profissional que cobre o dia e o horário (`ContratoSalaDia`), para
   * sugerir no agendamento. `null` quando nenhum contrato cobre. Só sugere: a sala pode ser outra.
   */
  async sugerirDoProfissional(
    profissionalId: string,
    data: string,
    hora: string,
  ): Promise<{ id: string; nome: string } | null> {
    const dia = diaDaSemana(data);
    const contratos = await this.contratos.ativosNoPeriodo(data, data);
    const contrato = contratos.find(
      (c) =>
        c.locatarioTipo === 'PROFISSIONAL' &&
        c.locatarioId === profissionalId &&
        c.dias.some((d) => d.diaSemana === dia && d.inicio <= hora && hora < d.fim),
    );
    return contrato ? { id: contrato.salaId, nome: contrato.salaNome } : null;
  }

  private async idsEmUso(ids: readonly string[]): Promise<ReadonlySet<string>> {
    if (ids.length === 0) return new Set();
    const conjuntos = await Promise.all(this.verificadores.map((v) => v.emUso(ids)));
    return new Set(conjuntos.flatMap((conjunto) => [...conjunto]));
  }

  private async buscar(id: string): Promise<Sala> {
    const sala = isUuid(id)
      ? await this.txHost.tx.sala.findFirst({ where: { id, ...NAO_EXCLUIDAS } })
      : null;
    if (!sala) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Sala não encontrada', { status: 404 });
    }
    return sala;
  }
}
