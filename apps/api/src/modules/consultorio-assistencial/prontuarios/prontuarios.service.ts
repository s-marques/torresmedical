import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  ATENDIMENTO_TIPO_ROTULOS,
  type Anamnese,
  type AtendimentoTipo,
  type Atendimento as AtendimentoDto,
  type CreateAnamneseInput,
  type CreateAtendimentoInput,
  type HistoricoClinicoItem,
  type ListPacientesComRegistrosQuery,
  type ListRegistrosQuery,
  type Paciente as PacienteApiDto,
  type PacienteComRegistros,
  type PacienteResumoProntuario,
  type Prontuario as ProntuarioDto,
  type UpsertProntuarioInput,
} from '@torres/shared';
import type {
  Anamnese as AnamneseModel,
  Atendimento as AtendimentoModel,
  Prontuario as ProntuarioModel,
} from '../../../generated/prisma/client';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { PacientesService } from '../../comercial-atendimento/pacientes/pacientes.service';
import { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';

const NAO_EXCLUIDOS = { deletedAt: null } as const;

function toResumo(paciente: PacienteApiDto): PacienteResumoProntuario {
  return {
    id: paciente.id,
    nome: paciente.nome,
    email: paciente.email,
    documento: paciente.documento,
    telefone: paciente.telefone,
    celular: paciente.celular,
    dataNascimento: paciente.dataNascimento,
    sexo: paciente.sexo,
  };
}

function toProntuarioDto(pacienteId: string, registro: ProntuarioModel | null): ProntuarioDto {
  if (!registro) {
    return {
      pacienteId,
      alergias: null,
      medicamentosEmUso: null,
      doencasCronicas: null,
      cirurgiasAnteriores: null,
      historicoFamiliar: null,
      observacoes: null,
      createdAt: null,
      updatedAt: null,
    };
  }
  return {
    pacienteId: registro.id,
    alergias: registro.alergias,
    medicamentosEmUso: registro.medicamentosEmUso,
    doencasCronicas: registro.doencasCronicas,
    cirurgiasAnteriores: registro.cirurgiasAnteriores,
    historicoFamiliar: registro.historicoFamiliar,
    observacoes: registro.observacoes,
    createdAt: registro.createdAt.toISOString(),
    updatedAt: registro.updatedAt.toISOString(),
  };
}

function toAtendimentoDto(
  atendimento: AtendimentoModel,
  profissionalNome: string | null,
): AtendimentoDto {
  return {
    id: atendimento.id,
    pacienteId: atendimento.pacienteId,
    profissionalId: atendimento.profissionalId,
    profissionalNome,
    tipo: atendimento.tipo,
    queixa: atendimento.queixa,
    evolucao: atendimento.evolucao,
    diagnostico: atendimento.diagnostico,
    conduta: atendimento.conduta,
    observacoes: atendimento.observacoes,
    status: atendimento.status,
    createdAt: atendimento.createdAt.toISOString(),
    updatedAt: atendimento.updatedAt.toISOString(),
  };
}

function toAnamneseDto(anamnese: AnamneseModel, profissionalNome: string | null): Anamnese {
  return {
    id: anamnese.id,
    pacienteId: anamnese.pacienteId,
    profissionalId: anamnese.profissionalId,
    profissionalNome,
    queixaPrincipal: anamnese.queixaPrincipal,
    historiaDoencaAtual: anamnese.historiaDoencaAtual,
    exameFisico: anamnese.exameFisico,
    hipoteseDiagnostica: anamnese.hipoteseDiagnostica,
    conduta: anamnese.conduta,
    createdAt: anamnese.createdAt.toISOString(),
    updatedAt: anamnese.updatedAt.toISOString(),
  };
}

function resumoAtendimento(a: AtendimentoModel): string | null {
  return a.conduta || a.diagnostico || a.evolucao || a.queixa || null;
}

function resumoAnamnese(a: AnamneseModel): string | null {
  return a.conduta || a.hipoteseDiagnostica || a.historiaDoencaAtual || a.queixaPrincipal || null;
}

interface PageRequest {
  page: number;
  pageSize: number;
}

function paginarEmMemoria<T>(itens: T[], { page, pageSize }: PageRequest) {
  const total = itens.length;
  const inicio = (page - 1) * pageSize;
  return {
    data: itens.slice(inicio, inicio + pageSize),
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

/**
 * Tela Prontuários (`/prontuarios`). Paciente/Profissional são entidades de outros módulos
 * (comercial-atendimento, gestao-profissionais): o acesso é pelos services exportados, sem FK
 * nas tabelas de Prontuário/Atendimento/Anamnese (CLAUDE.md, seção 3).
 */
@Injectable()
export class ProntuariosService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly pacientes: PacientesService,
    private readonly profissionais: ProfissionaisService,
  ) {}

  /** Cabeçalho do paciente (nome, contato, nascimento, sexo), ao abrir a tela de detalhe. */
  async paciente(pacienteId: string): Promise<PacienteResumoProntuario> {
    return toResumo(await this.pacientes.detalhe(pacienteId));
  }

  /** Card "Pacientes com Prontuário": só quem tem ao menos 1 atendimento ou anamnese. */
  async listarComRegistros(query: ListPacientesComRegistrosQuery): Promise<{
    data: PacienteComRegistros[];
    meta: PageRequest & { total: number; totalPages: number };
  }> {
    const [porAtendimento, porAnamnese] = await Promise.all([
      this.txHost.tx.atendimento.groupBy({
        by: ['pacienteId'],
        where: NAO_EXCLUIDOS,
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      this.txHost.tx.anamnese.groupBy({
        by: ['pacienteId'],
        where: NAO_EXCLUIDOS,
        _count: { _all: true },
        _max: { createdAt: true },
      }),
    ]);

    const agregados = new Map<string, { total: number; ultimo: Date }>();
    for (const grupo of [...porAtendimento, ...porAnamnese]) {
      const atual = agregados.get(grupo.pacienteId);
      const ultimoGrupo = grupo._max.createdAt ?? new Date(0);
      agregados.set(grupo.pacienteId, {
        total: (atual?.total ?? 0) + grupo._count._all,
        ultimo: atual && atual.ultimo > ultimoGrupo ? atual.ultimo : ultimoGrupo,
      });
    }

    const linhas = (
      await Promise.all(
        [...agregados.entries()].map(async ([pacienteId, agregado]) => {
          try {
            const paciente = await this.pacientes.detalhe(pacienteId);
            const resumo: PacienteComRegistros = {
              ...toResumo(paciente),
              totalRegistros: agregado.total,
              ultimoRegistro: agregado.ultimo.toISOString(),
            };
            return resumo;
          } catch {
            // Paciente excluído depois dos registros: não aparece na lista.
            return null;
          }
        }),
      )
    ).filter((linha): linha is PacienteComRegistros => linha !== null);

    const busca = query.search?.toLowerCase();
    const digitosBusca = query.search?.replaceAll(/\D/g, '');
    const filtradas = busca
      ? linhas.filter(
          (linha) =>
            linha.nome.toLowerCase().includes(busca) ||
            (digitosBusca && linha.documento?.includes(digitosBusca)) ||
            (digitosBusca && linha.telefone?.includes(digitosBusca)) ||
            (digitosBusca && linha.celular?.includes(digitosBusca)),
        )
      : linhas;

    const direcao = query.sort.direction === 'asc' ? 1 : -1;
    filtradas.sort((a, b) => {
      if (query.sort.field === 'nome') return direcao * a.nome.localeCompare(b.nome);
      return direcao * (a.ultimoRegistro ?? '').localeCompare(b.ultimoRegistro ?? '');
    });

    return paginarEmMemoria(filtradas, query);
  }

  async detalheProntuario(pacienteId: string): Promise<ProntuarioDto> {
    await this.pacientes.detalhe(pacienteId);
    const registro = await this.txHost.tx.prontuario.findUnique({ where: { id: pacienteId } });
    return toProntuarioDto(pacienteId, registro);
  }

  /** "Salvar" do Prontuário Médico: cria se ainda não existir, senão substitui os campos. */
  async salvarProntuario(pacienteId: string, input: UpsertProntuarioInput): Promise<ProntuarioDto> {
    await this.pacientes.detalhe(pacienteId);
    const salvo = await this.txHost.tx.prontuario.upsert({
      where: { id: pacienteId },
      create: { id: pacienteId, ...input },
      update: input,
    });
    return toProntuarioDto(pacienteId, salvo);
  }

  async listarAtendimentos(
    pacienteId: string,
    query: ListRegistrosQuery,
  ): Promise<{
    data: AtendimentoDto[];
    meta: PageRequest & { total: number; totalPages: number };
  }> {
    await this.pacientes.detalhe(pacienteId);
    const where = { pacienteId, ...NAO_EXCLUIDOS };
    const [registros, total] = await Promise.all([
      this.txHost.tx.atendimento.findMany({
        where,
        orderBy: [{ createdAt: 'desc' as const }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.txHost.tx.atendimento.count({ where }),
    ]);
    const nomes = await this.nomesProfissionais(registros.map((r) => r.profissionalId));
    return {
      data: registros.map((r) => toAtendimentoDto(r, nomes.get(r.profissionalId) ?? null)),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async criarAtendimento(
    pacienteId: string,
    input: CreateAtendimentoInput,
  ): Promise<AtendimentoDto> {
    await this.pacientes.detalhe(pacienteId);
    const profissional = await this.profissionais.detalhe(input.profissionalId);
    const criado = await this.txHost.tx.atendimento.create({ data: { pacienteId, ...input } });
    return toAtendimentoDto(criado, profissional.nome);
  }

  async listarAnamneses(
    pacienteId: string,
    query: ListRegistrosQuery,
  ): Promise<{ data: Anamnese[]; meta: PageRequest & { total: number; totalPages: number } }> {
    await this.pacientes.detalhe(pacienteId);
    const where = { pacienteId, ...NAO_EXCLUIDOS };
    const [registros, total] = await Promise.all([
      this.txHost.tx.anamnese.findMany({
        where,
        orderBy: [{ createdAt: 'desc' as const }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.txHost.tx.anamnese.count({ where }),
    ]);
    const nomes = await this.nomesProfissionais(
      registros.map((r) => r.profissionalId).filter((id): id is string => id !== null),
    );
    return {
      data: registros.map((r) =>
        toAnamneseDto(r, r.profissionalId ? (nomes.get(r.profissionalId) ?? null) : null),
      ),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async criarAnamnese(pacienteId: string, input: CreateAnamneseInput): Promise<Anamnese> {
    await this.pacientes.detalhe(pacienteId);
    const profissional = input.profissionalId
      ? await this.profissionais.detalhe(input.profissionalId)
      : null;
    const criado = await this.txHost.tx.anamnese.create({ data: { pacienteId, ...input } });
    return toAnamneseDto(criado, profissional?.nome ?? null);
  }

  /**
   * Aba "Histórico Clínico": linha do tempo somente leitura, agregando Atendimentos e
   * Anamneses do paciente (Receitas ficam para a tela Receituários, #42). O resumo de cada
   * item é o primeiro campo clínico não vazio do registro.
   */
  async historicoClinico(
    pacienteId: string,
    query: ListRegistrosQuery,
  ): Promise<{
    data: HistoricoClinicoItem[];
    meta: PageRequest & { total: number; totalPages: number };
  }> {
    await this.pacientes.detalhe(pacienteId);
    const where = { pacienteId, ...NAO_EXCLUIDOS };
    const [atendimentos, anamneses] = await Promise.all([
      this.txHost.tx.atendimento.findMany({ where, orderBy: { createdAt: 'desc' } }),
      this.txHost.tx.anamnese.findMany({ where, orderBy: { createdAt: 'desc' } }),
    ]);
    const nomes = await this.nomesProfissionais([
      ...atendimentos.map((a) => a.profissionalId),
      ...anamneses.map((a) => a.profissionalId).filter((id): id is string => id !== null),
    ]);

    const itens: HistoricoClinicoItem[] = [
      ...atendimentos.map((a): HistoricoClinicoItem => ({
        id: a.id,
        tipo: 'ATENDIMENTO',
        rotulo: a.tipo ? ATENDIMENTO_TIPO_ROTULOS[a.tipo as AtendimentoTipo] : 'Atendimento',
        data: a.createdAt.toISOString(),
        profissionalNome: nomes.get(a.profissionalId) ?? null,
        resumo: resumoAtendimento(a),
      })),
      ...anamneses.map((a): HistoricoClinicoItem => ({
        id: a.id,
        tipo: 'ANAMNESE',
        rotulo: 'Anamnese',
        data: a.createdAt.toISOString(),
        profissionalNome: a.profissionalId ? (nomes.get(a.profissionalId) ?? null) : null,
        resumo: resumoAnamnese(a),
      })),
    ].sort((x, y) => y.data.localeCompare(x.data));

    return paginarEmMemoria(itens, query);
  }

  /** Nome de cada profissional (sem FK), 1 consulta por id distinto. */
  private async nomesProfissionais(ids: readonly string[]): Promise<Map<string, string>> {
    const distintos = [...new Set(ids)];
    const nomes = new Map<string, string>();
    await Promise.all(
      distintos.map(async (id) => {
        try {
          const profissional = await this.profissionais.detalhe(id);
          nomes.set(id, profissional.nome);
        } catch {
          // Profissional excluído depois do registro: resumo sem nome.
        }
      }),
    );
    return nomes;
  }
}
