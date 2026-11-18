import { TransactionHost } from '@nestjs-cls/transactional';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import type { BaixaInsumo, BaixaInsumoInput, ListBaixasInsumosQuery } from '@torres/shared';
import type { Prisma } from '../../../generated/prisma/client';
import { RequestContextService } from '../../../common/context/request-context.service';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { paginate, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { intervaloDoPeriodo } from '../../../common/relatorios/periodo';
import { PacientesService } from '../../comercial-atendimento/pacientes/pacientes.service';
import { UnidadesService } from '../../configuracoes-gestao/unidades/unidades.service';
import { UsuariosLookupService } from '../../configuracoes-gestao/usuarios/usuarios.service';
import { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import { EstoqueService } from '../estoque/estoque.service';

const INCLUDE = {
  paciente: { select: { nome: true } },
  profissional: { select: { nome: true } },
  unidade: { select: { nome: true } },
  itens: {
    select: { produtoId: true, quantidade: true, produto: { select: { nome: true } } },
    orderBy: { produto: { nome: 'asc' } },
  },
} as const satisfies Prisma.BaixaInsumoInclude;

type BaixaComRelacoes = Prisma.BaixaInsumoGetPayload<{ include: typeof INCLUDE }>;

const MOTIVO_BAIXA = 'Baixa de Insumos';

/**
 * Tela Baixa de Insumos (`/baixa-insumos`, issue #17). Cada item da baixa subtrai o saldo do
 * produto pelo `EstoqueService`, que grava a `MovimentacaoEstoque` de saída (e assim alimenta o
 * consumo médio da sugestão de compra). Tudo na mesma transação do `@Audit`: se um item não tem
 * saldo, nada é gravado. A baixa é imutável (sem edição nem exclusão).
 */
@Injectable()
export class BaixasInsumosService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly contexto: RequestContextService,
    private readonly estoque: EstoqueService,
    @Inject(forwardRef(() => PacientesService)) private readonly pacientes: PacientesService,
    @Inject(forwardRef(() => ProfissionaisService))
    private readonly profissionais: ProfissionaisService,
    private readonly unidades: UnidadesService,
    private readonly usuarios: UsuariosLookupService,
  ) {}

  async list(query: ListBaixasInsumosQuery): Promise<Page<BaixaInsumo>> {
    const where = this.where(query);
    const orderBy = this.orderBy(query.sort);
    const page = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.baixaInsumo.findMany({ where, orderBy, include: INCLUDE, ...p }),
      count: () => this.txHost.tx.baixaInsumo.count({ where }),
    });
    return { ...page, data: await this.toDtos(page.data) };
  }

  /** "Registrar Baixa": valida os vínculos, grava a baixa e subtrai o saldo de cada insumo. */
  async create(input: BaixaInsumoInput): Promise<BaixaInsumo> {
    await this.garantirVinculos(input);
    // Antes de gravar: insumo inexistente (404) ou sem saldo (400) falha com a mensagem do estoque.
    for (const item of input.itens) {
      await this.estoque.saidaComMotivo(item.produtoId, item.quantidade, MOTIVO_BAIXA);
    }
    const baixa = await this.txHost.tx.baixaInsumo.create({
      data: {
        pacienteId: input.pacienteId,
        profissionalId: input.profissionalId,
        unidadeId: input.unidadeId,
        pressaoArterial: input.pressaoArterial,
        dextro: input.dextro,
        observacao: input.observacao,
        usuarioId: this.contexto.getUserId() ?? null,
        itens: {
          create: input.itens.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade })),
        },
      },
      include: INCLUDE,
    });
    const [dto] = await this.toDtos([baixa]);
    return dto as BaixaInsumo;
  }

  // --- Internos ---

  private async garantirVinculos(input: BaixaInsumoInput): Promise<void> {
    const naoEncontrado = (field: string, rotulo: string): never => {
      throw new BusinessException(ErrorCode.NOT_FOUND, `${rotulo} não encontrado`, {
        status: 404,
        details: [{ field, message: `${rotulo} não encontrado` }],
      });
    };
    if (input.pacienteId) {
      const nomes = await this.pacientes.nomesPorIds([input.pacienteId]);
      if (!nomes.has(input.pacienteId)) naoEncontrado('pacienteId', 'Paciente');
    }
    if (input.profissionalId) {
      const nomes = await this.profissionais.nomesPorIds([input.profissionalId]);
      if (!nomes.has(input.profissionalId)) naoEncontrado('profissionalId', 'Profissional');
    }
    if (input.unidadeId) await this.unidades.findById(input.unidadeId);
  }

  private where(query: ListBaixasInsumosQuery): Prisma.BaixaInsumoWhereInput {
    if (!query.dataInicio && !query.dataFim) return {};
    const { gte, lt } = intervaloDoPeriodo(
      query.dataInicio ?? '1900-01-01',
      query.dataFim ?? '9999-12-30',
    );
    return { createdAt: { ...(query.dataInicio && { gte }), ...(query.dataFim && { lt }) } };
  }

  private orderBy(
    sort: ListBaixasInsumosQuery['sort'],
  ): Prisma.BaixaInsumoOrderByWithRelationInput[] {
    const { field, direction } = sort;
    const principal: Record<typeof field, Prisma.BaixaInsumoOrderByWithRelationInput> = {
      data: { createdAt: direction },
      paciente: { paciente: { nome: direction } },
      profissional: { profissional: { nome: direction } },
      unidade: { unidade: { nome: direction } },
    };
    return [principal[field], { createdAt: 'desc' }, { id: 'asc' }];
  }

  private async toDtos(baixas: BaixaComRelacoes[]): Promise<BaixaInsumo[]> {
    const ids = baixas.flatMap((b) => (b.usuarioId ? [b.usuarioId] : []));
    const nomes = await this.usuarios.nomesPorIds(ids);
    return baixas.map((b) => ({
      id: b.id,
      pacienteId: b.pacienteId,
      pacienteNome: b.paciente?.nome ?? null,
      profissionalId: b.profissionalId,
      profissionalNome: b.profissional?.nome ?? null,
      unidadeId: b.unidadeId,
      unidadeNome: b.unidade?.nome ?? null,
      pressaoArterial: b.pressaoArterial,
      dextro: b.dextro,
      observacao: b.observacao,
      responsavelId: b.usuarioId,
      responsavelNome: b.usuarioId ? (nomes.get(b.usuarioId) ?? null) : null,
      itens: b.itens.map((i) => ({
        produtoId: i.produtoId,
        produtoNome: i.produto.nome,
        quantidade: i.quantidade.toString(),
      })),
      createdAt: b.createdAt.toISOString(),
    }));
  }
}
