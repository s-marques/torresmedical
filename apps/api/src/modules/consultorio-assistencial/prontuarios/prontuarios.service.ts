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
  type ModeloSecoes,
  type Paciente as PacienteApiDto,
  type PacienteComRegistros,
  type PacienteResumoProntuario,
  type Prescricao,
  type Prontuario as ProntuarioDto,
  mensagemObrigatoria,
  RECEITUARIO_TIPO_ROTULOS,
  type UpsertProntuarioInput,
} from '@torres/shared';
import type {
  Anamnese as AnamneseModel,
  Atendimento as AtendimentoModel,
  Prontuario as ProntuarioModel,
} from '../../../generated/prisma/client';
import { EscopoDadosService } from '../../../common/auth/escopo-dados.service';
import { ValidationException } from '../../../common/errors/api.exception';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { PacientesService } from '../../comercial-atendimento/pacientes/pacientes.service';
import { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import {
  ModelosProntuarioService,
  toAtendimentoModelo,
} from '../modelos-prontuario/modelos-prontuario.service';
import { PacientesVinculadosService } from '../pacientes-vinculados/pacientes-vinculados.service';
import { PrescricoesService } from '../receituarios/prescricoes.service';
import { AcessoProntuarioService } from './acesso-prontuario.service';
import { AtendimentoAssinaturaService } from './atendimento-assinatura.service';
import { toAtendimentoDto } from './atendimento.mapper';

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
    private readonly vinculados: PacientesVinculadosService,
    private readonly escopo: EscopoDadosService,
    private readonly prescricoes: PrescricoesService,
    private readonly acessos: AcessoProntuarioService,
    private readonly assinaturas: AtendimentoAssinaturaService,
    private readonly modelos: ModelosProntuarioService,
  ) {}

  /** Cabeçalho do paciente (nome, contato, nascimento, sexo), ao abrir a tela de detalhe. */
  async paciente(pacienteId: string): Promise<PacienteResumoProntuario> {
    return toResumo(await this.pacienteNoEscopo(pacienteId));
  }

  /** Card "Pacientes com Prontuário": só quem tem ao menos 1 atendimento ou anamnese. */
  async listarComRegistros(query: ListPacientesComRegistrosQuery): Promise<{
    data: PacienteComRegistros[];
    meta: PageRequest & { total: number; totalPages: number };
  }> {
    const [porAtendimento, porAnamnese] = await Promise.all([
      this.txHost.tx.atendimento.groupBy({
        by: ['pacienteId'],
        where: { ...NAO_EXCLUIDOS, profissionalId: this.escopo.filtroProfissional() },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      this.txHost.tx.anamnese.groupBy({
        by: ['pacienteId'],
        where: { ...NAO_EXCLUIDOS, profissionalId: this.escopo.filtroProfissional() },
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
    await this.pacienteNoEscopo(pacienteId);
    await this.acessos.registrar(pacienteId, 'PRONTUARIO');
    const registro = await this.txHost.tx.prontuario.findUnique({ where: { id: pacienteId } });
    return toProntuarioDto(pacienteId, registro);
  }

  /** "Salvar" do Prontuário Médico: cria se ainda não existir, senão substitui os campos. */
  async salvarProntuario(pacienteId: string, input: UpsertProntuarioInput): Promise<ProntuarioDto> {
    await this.pacienteNoEscopo(pacienteId);
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
    await this.pacienteNoEscopo(pacienteId);
    await this.acessos.registrar(pacienteId, 'ATENDIMENTOS');
    const where = {
      pacienteId,
      ...NAO_EXCLUIDOS,
      profissionalId: this.escopo.filtroProfissional(),
    };
    const [registros, total] = await Promise.all([
      this.txHost.tx.atendimento.findMany({
        where,
        orderBy: [{ createdAt: 'desc' as const }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.txHost.tx.atendimento.count({ where }),
    ]);
    const [nomes, resumos, versoes] = await Promise.all([
      this.nomesProfissionais(registros.map((r) => r.profissionalId)),
      this.assinaturas.resumos(registros),
      this.modelos.versoesPorId(registros.map((r) => r.modeloVersaoId)),
    ]);
    return {
      data: registros.map((r) =>
        toAtendimentoDto(
          r,
          nomes.get(r.profissionalId) ?? null,
          resumos.get(r.id),
          versoes.get(r.modeloVersaoId ?? '') ?? null,
        ),
      ),
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
    // O atendimento cria o vínculo do paciente: o usuário restrito pode registrá-lo para um
    // profissional seu mesmo sem atendimento anterior (issue #153).
    this.escopo.garantirProfissional(input.profissionalId);
    await this.pacientes.detalhe(pacienteId);
    const profissional = await this.profissionais.detalhe(input.profissionalId);

    // Modelo de prontuário (#152): o atendimento guarda a versão atual do modelo e as respostas.
    const { modeloId, respostas, ...dados } = input;
    if (!modeloId && respostas && Object.keys(respostas).length > 0) {
      throw new ValidationException([{ field: 'modeloId', message: 'Selecione o modelo.' }]);
    }
    const versao = modeloId
      ? await this.modelos.versaoParaAtendimento(modeloId, input.profissionalId)
      : null;
    const respostasValidas = versao
      ? this.modelos.conferirRespostas(
          versao.secoes as unknown as ModeloSecoes,
          respostas ?? {},
          dados.status === 'FINALIZADO',
        )
      : null;

    const criado = await this.txHost.tx.atendimento.create({
      data: {
        pacienteId,
        ...dados,
        modeloVersaoId: versao?.id ?? null,
        respostas: respostasValidas ?? undefined,
      },
    });
    return toAtendimentoDto(
      criado,
      profissional.nome,
      undefined,
      versao ? toAtendimentoModelo(versao) : null,
    );
  }

  async listarAnamneses(
    pacienteId: string,
    query: ListRegistrosQuery,
  ): Promise<{ data: Anamnese[]; meta: PageRequest & { total: number; totalPages: number } }> {
    await this.pacienteNoEscopo(pacienteId);
    await this.acessos.registrar(pacienteId, 'ANAMNESES');
    const where = {
      pacienteId,
      ...NAO_EXCLUIDOS,
      profissionalId: this.escopo.filtroProfissional(),
    };
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

  /**
   * Usuário restrito precisa informar um profissional seu: sem ele, a anamnese ficaria fora do
   * escopo e sumiria da própria lista (issue #153).
   */
  async criarAnamnese(pacienteId: string, input: CreateAnamneseInput): Promise<Anamnese> {
    await this.pacienteNoEscopo(pacienteId);
    if (this.escopo.restrito()) {
      if (!input.profissionalId) {
        throw new ValidationException([
          { field: 'profissionalId', message: mensagemObrigatoria('Profissional') },
        ]);
      }
      this.escopo.garantirProfissional(input.profissionalId);
    }
    const profissional = input.profissionalId
      ? await this.profissionais.detalhe(input.profissionalId)
      : null;
    const criado = await this.txHost.tx.anamnese.create({ data: { pacienteId, ...input } });
    return toAnamneseDto(criado, profissional?.nome ?? null);
  }

  /** Aba "Receitas": prescrições do paciente feitas na tela Receituários (#42). */
  async listarReceitas(
    pacienteId: string,
    query: ListRegistrosQuery,
  ): Promise<{ data: Prescricao[]; meta: PageRequest & { total: number; totalPages: number } }> {
    await this.pacienteNoEscopo(pacienteId);
    await this.acessos.registrar(pacienteId, 'RECEITAS');
    return this.prescricoes.doPaciente(pacienteId, query);
  }

  /**
   * Aba "Histórico Clínico": linha do tempo somente leitura, agregando Atendimentos, Anamneses
   * e Prescrições (tela Receituários, #42) do paciente. O resumo de cada item é o primeiro campo
   * clínico não vazio do registro; na prescrição, a medicação.
   */
  async historicoClinico(
    pacienteId: string,
    query: ListRegistrosQuery,
  ): Promise<{
    data: HistoricoClinicoItem[];
    meta: PageRequest & { total: number; totalPages: number };
  }> {
    await this.pacienteNoEscopo(pacienteId);
    await this.acessos.registrar(pacienteId, 'HISTORICO_CLINICO');
    const where = {
      pacienteId,
      ...NAO_EXCLUIDOS,
      profissionalId: this.escopo.filtroProfissional(),
    };
    const [atendimentos, anamneses, prescricoes] = await Promise.all([
      this.txHost.tx.atendimento.findMany({ where, orderBy: { createdAt: 'desc' } }),
      this.txHost.tx.anamnese.findMany({ where, orderBy: { createdAt: 'desc' } }),
      this.prescricoes.todasDoPaciente(pacienteId),
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
      ...prescricoes.map((p): HistoricoClinicoItem => ({
        id: p.id,
        tipo: 'PRESCRICAO',
        rotulo: `Receita ${RECEITUARIO_TIPO_ROTULOS[p.tipo]}`,
        data: p.createdAt,
        profissionalNome: p.profissionalNome,
        resumo: p.medicacao,
      })),
    ].sort((x, y) => y.data.localeCompare(x.data));

    return paginarEmMemoria(itens, query);
  }

  /** Paciente existente (404) e vinculado ao usuário restrito (403, issue #153). */
  private async pacienteNoEscopo(pacienteId: string): Promise<PacienteApiDto> {
    const paciente = await this.pacientes.detalhe(pacienteId);
    await this.vinculados.garantir(pacienteId);
    return paciente;
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
