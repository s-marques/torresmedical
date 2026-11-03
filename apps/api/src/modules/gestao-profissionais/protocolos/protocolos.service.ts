import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  PROTOCOLO_NOME_DUPLICADO,
  PROTOCOLO_NOME_MAX,
  sessoesDoProtocolo,
  type CreateProtocoloInput,
  type ListProtocolosQuery,
  type Protocolo as ProtocoloDto,
  type ProtocoloCategorias,
  type ProtocoloTipo,
  type UpdateProtocoloInput,
} from '@torres/shared';
import { isUuid } from '../../../common/auth/tokens';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { paginate, searchWhere, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { Prisma, ProtocoloTipo as ProtocoloTipoDb } from '../../../generated/prisma/client';
import { ProdutosService } from '../../compras-estoque/produtos/produtos.service';

const INCLUIR = {
  profissional: { select: { nome: true } },
  itens: { select: { produtoId: true, quantidade: true }, orderBy: { id: 'asc' } },
} satisfies Prisma.ProtocoloInclude;

type ProtocoloCompleto = Prisma.ProtocoloGetPayload<{ include: typeof INCLUIR }>;

const NAO_EXCLUIDOS = { deletedAt: null } as const;
const PREFIXO_COPIA = 'Cópia de ';

function tipoParaDb(tipo: ProtocoloTipo): ProtocoloTipoDb {
  return tipo === 'produto' ? 'PRODUTO' : 'PROCEDIMENTO';
}

function tipoParaDto(tipo: ProtocoloTipoDb): ProtocoloTipo {
  return tipo === 'PRODUTO' ? 'produto' : 'procedimento';
}

function toDto(
  protocolo: ProtocoloCompleto,
  nomes: ReadonlyMap<string, string>,
  emUso: boolean,
): ProtocoloDto {
  return {
    id: protocolo.id,
    nome: protocolo.nome,
    tipo: tipoParaDto(protocolo.tipo),
    categoria: protocolo.categoria,
    profissionalId: protocolo.profissionalId,
    profissionalNome: protocolo.profissional?.nome ?? null,
    totalSemanas: protocolo.totalSemanas,
    valorTotal: Number(protocolo.valorTotal),
    sessoes: sessoesDoProtocolo(protocolo.itens),
    observacoes: protocolo.observacoes,
    itens: protocolo.itens.map((item) => ({
      produtoId: item.produtoId,
      produtoNome: nomes.get(item.produtoId) ?? '',
      quantidade: item.quantidade,
    })),
    emUso,
    createdAt: protocolo.createdAt.toISOString(),
    updatedAt: protocolo.updatedAt.toISOString(),
  };
}

/** Protocolos: conjuntos de procedimentos/produtos aplicados no atendimento (tela Protocolos). */
@Injectable()
export class ProtocolosService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly produtos: ProdutosService,
  ) {}

  /** Agrupada por categoria e, dentro dela, pelo `sort` pedido. */
  async list(query: ListProtocolosQuery): Promise<Page<ProtocoloDto>> {
    const where: Prisma.ProtocoloWhereInput = {
      ...NAO_EXCLUIDOS,
      categoria: query.categoria,
      profissionalId: query.profissionalId,
      ...searchWhere(query.search, ['nome']),
    };
    const orderBy = [{ categoria: 'asc' as const }, ...toOrderBy(query.sort)];
    const page = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.protocolo.findMany({ where, orderBy, include: INCLUIR, ...p }),
      count: () => this.txHost.tx.protocolo.count({ where }),
    });
    return { ...page, data: await this.toDtos(page.data) };
  }

  /** Opções do filtro "Categoria": as categorias em uso, em ordem alfabética. */
  async categorias(): Promise<ProtocoloCategorias> {
    const linhas = await this.txHost.tx.protocolo.findMany({
      where: NAO_EXCLUIDOS,
      distinct: ['categoria'],
      select: { categoria: true },
      orderBy: { categoria: 'asc' },
    });
    return { data: linhas.map((linha) => linha.categoria) };
  }

  async findById(id: string): Promise<ProtocoloDto> {
    return (await this.toDtos([await this.buscar(id)]))[0] as ProtocoloDto;
  }

  async create(input: CreateProtocoloInput): Promise<ProtocoloDto> {
    await this.validar(input);
    await this.garantirNomeDisponivel(input.nome);
    const criado = await this.txHost.tx.protocolo.create({
      data: this.dados(input),
      include: INCLUIR,
    });
    return (await this.toDtos([criado]))[0] as ProtocoloDto;
  }

  async update(id: string, input: UpdateProtocoloInput): Promise<ProtocoloDto> {
    await this.buscar(id);
    await this.validar(input);
    await this.garantirNomeDisponivel(input.nome, id);
    const dados = this.dados(input);
    const alterado = await this.txHost.tx.protocolo.update({
      where: { id },
      data: { ...dados, itens: { deleteMany: {}, ...dados.itens } },
      include: INCLUIR,
    });
    return (await this.toDtos([alterado]))[0] as ProtocoloDto;
  }

  /** Ícone "Duplicar": cria "Cópia de <nome>" (com sufixo numérico se o nome já existir). */
  async duplicar(id: string): Promise<ProtocoloDto> {
    const original = await this.buscar(id);
    const nome = await this.nomeDaCopia(original.nome);
    const criado = await this.txHost.tx.protocolo.create({
      data: {
        nome,
        tipo: original.tipo,
        categoria: original.categoria,
        profissionalId: original.profissionalId,
        totalSemanas: original.totalSemanas,
        valorTotal: original.valorTotal,
        observacoes: original.observacoes,
        itens: {
          create: original.itens.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade })),
        },
      },
      include: INCLUIR,
    });
    return (await this.toDtos([criado]))[0] as ProtocoloDto;
  }

  /** Exclusão lógica. Protocolo usado em semana de protocolo mãe não pode ser excluído. */
  async remove(id: string): Promise<ProtocoloDto> {
    const protocolo = await this.buscar(id);
    if ((await this.idsEmUso([id])).has(id)) {
      throw new BusinessException(
        'PROTOCOLO_EM_USO',
        'Este protocolo é usado em um protocolo mãe e não pode ser excluído.',
        { status: 409 },
      );
    }
    await this.txHost.tx.protocolo.update({ where: { id }, data: { deletedAt: new Date() } });
    return (await this.toDtos([protocolo]))[0] as ProtocoloDto;
  }

  private dados(input: CreateProtocoloInput) {
    return {
      nome: input.nome,
      tipo: tipoParaDb(input.tipo),
      categoria: input.categoria,
      profissionalId: input.profissionalId,
      totalSemanas: input.totalSemanas,
      valorTotal: input.valorTotal,
      observacoes: input.observacoes,
      itens: { create: input.itens },
    };
  }

  private async toDtos(protocolos: readonly ProtocoloCompleto[]): Promise<ProtocoloDto[]> {
    const nomes = await this.produtos.nomesPorIds([
      ...new Set(protocolos.flatMap((p) => p.itens.map((i) => i.produtoId))),
    ]);
    const usados = await this.idsEmUso(protocolos.map((p) => p.id));
    return protocolos.map((p) => toDto(p, nomes, usados.has(p.id)));
  }

  private async idsEmUso(ids: readonly string[]): Promise<ReadonlySet<string>> {
    if (ids.length === 0) return new Set();
    const semanas = await this.txHost.tx.protocoloMaeSemana.findMany({
      where: { protocoloId: { in: [...ids] }, protocoloMae: NAO_EXCLUIDOS },
      select: { protocoloId: true },
      distinct: ['protocoloId'],
    });
    return new Set(semanas.flatMap((s) => (s.protocoloId ? [s.protocoloId] : [])));
  }

  private async buscar(id: string): Promise<ProtocoloCompleto> {
    const protocolo = isUuid(id)
      ? await this.txHost.tx.protocolo.findFirst({
          where: { id, ...NAO_EXCLUIDOS },
          include: INCLUIR,
        })
      : null;
    if (!protocolo) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Protocolo não encontrado', {
        status: 404,
      });
    }
    return protocolo;
  }

  private async validar(input: CreateProtocoloInput): Promise<void> {
    if (input.profissionalId) {
      const existe = await this.txHost.tx.profissional.count({
        where: { id: input.profissionalId, deletedAt: null },
      });
      if (existe === 0) {
        throw new BusinessException('PROFISSIONAL_INVALIDO', 'Profissional inválido', {
          status: 400,
          details: [{ field: 'profissionalId', message: 'Profissional inválido' }],
        });
      }
    }
    const nomes = await this.produtos.nomesPorIds(input.itens.map((i) => i.produtoId));
    const indice = input.itens.findIndex((item) => !nomes.has(item.produtoId));
    if (indice >= 0) {
      throw new BusinessException('PRODUTO_INVALIDO', 'Produto/Serviço inválido', {
        status: 400,
        details: [{ field: `itens.${indice}.produtoId`, message: 'Produto/Serviço inválido' }],
      });
    }
  }

  /** O nome não repete entre os protocolos não excluídos (sem diferenciar maiúsculas). */
  private async garantirNomeDisponivel(nome: string, ignorarId?: string): Promise<void> {
    const existente = await this.txHost.tx.protocolo.findFirst({
      where: {
        ...NAO_EXCLUIDOS,
        nome: { equals: nome, mode: 'insensitive' },
        id: ignorarId ? { not: ignorarId } : undefined,
      },
      select: { id: true },
    });
    if (existente) {
      throw new BusinessException('PROTOCOLO_DUPLICADO', PROTOCOLO_NOME_DUPLICADO, {
        status: 409,
        details: [{ field: 'nome', message: PROTOCOLO_NOME_DUPLICADO }],
      });
    }
  }

  private async nomeDaCopia(nomeOriginal: string): Promise<string> {
    const base = `${PREFIXO_COPIA}${nomeOriginal}`.slice(0, PROTOCOLO_NOME_MAX - 5);
    for (let n = 1; ; n++) {
      const candidato = n === 1 ? base : `${base} (${n})`;
      const existe = await this.txHost.tx.protocolo.count({
        where: { ...NAO_EXCLUIDOS, nome: { equals: candidato, mode: 'insensitive' } },
      });
      if (existe === 0) return candidato;
    }
  }
}
