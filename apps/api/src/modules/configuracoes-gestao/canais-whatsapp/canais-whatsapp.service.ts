import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type {
  CanalWhatsapp as CanalWhatsappDto,
  CreateCanalWhatsappInput,
  DefinirUsuariosCanalWhatsappInput,
  ListCanaisWhatsappQuery,
  LookupItem,
  LookupQuery,
  UpdateCanalWhatsappInput,
  UsuarioCanalWhatsapp,
} from '@torres/shared';
import { Prisma, type CanalWhatsapp } from '../../../generated/prisma/client';
import { RequestContextService } from '../../../common/context/request-context.service';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { EntidadeLookupService, type FonteLookup } from '../../../common/lookups/lookup-query';
import { paginate, searchWhere, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

const COM_RELACOES = {
  profissional: { select: { nome: true } },
  usuarios: { select: { usuarioId: true } },
} satisfies Prisma.CanalWhatsappInclude;

type CanalComRelacoes = Prisma.CanalWhatsappGetPayload<{ include: typeof COM_RELACOES }>;

const NUMERO_DUPLICADO = 'Já existe um canal com este número';
const PROFISSIONAL_INVALIDO = 'Profissional não encontrado';

/**
 * Canais WhatsApp (números conectados ao provedor), tela Agentes IA (#26): cadastro, edição,
 * usuários com acesso e exclusão. O lookup e `filtroAcesso` aplicam a regra de segurança do
 * cliente: o usuário só vê os canais a que tem acesso (canal sem vínculo é visível a todos).
 * A conexão com o provedor (sessão, QR Code) é uma integração à parte (#173).
 */
@Injectable()
export class CanaisWhatsappService extends EntidadeLookupService<
  LookupQuery<'canais-whatsapp'>,
  Prisma.CanalWhatsappWhereInput,
  CanalWhatsapp
> {
  protected readonly naoEncontrado = 'Canal não encontrado';
  protected readonly fonte: FonteLookup<Prisma.CanalWhatsappWhereInput, CanalWhatsapp> = {
    findMany: (args) => this.txHost.tx.canalWhatsapp.findMany(args),
    count: (args) => this.txHost.tx.canalWhatsapp.count(args),
    findFirst: (args) =>
      this.txHost.tx.canalWhatsapp.findFirst({
        where: { AND: [args.where, this.filtroAcesso()] },
      }),
  };

  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly contexto: RequestContextService,
  ) {
    super();
  }

  /**
   * Canais que o usuário da requisição pode usar: sem nenhum usuário vinculado (todos) ou com
   * o usuário vinculado. Fora de uma requisição (sem usuário), não restringe.
   */
  filtroAcesso(): Prisma.CanalWhatsappWhereInput {
    const usuarioId = this.contexto.getUserId();
    if (!usuarioId) return {};
    return { OR: [{ usuarios: { none: {} } }, { usuarios: { some: { usuarioId } } }] };
  }

  protected filtro(query: LookupQuery<'canais-whatsapp'>): Prisma.CanalWhatsappWhereInput {
    return {
      AND: [
        { deletedAt: null, ...searchWhere(query.search, ['nome', 'numero']) },
        this.filtroAcesso(),
      ],
    };
  }

  /** Chip "Nome (número)": o número vai no texto secundário. */
  protected toItem(canal: CanalWhatsapp): LookupItem {
    return { id: canal.id, label: canal.nome, descricao: canal.numero };
  }

  /**
   * Canal conectado para mensagens de um profissional: a linha dele, ou a da clínica (sem
   * profissional) quando ele não tem uma conectada. `null` = nenhum canal disponível.
   */
  async canalParaProfissional(profissionalId: string): Promise<string | null> {
    const conectados = await this.txHost.tx.canalWhatsapp.findMany({
      where: {
        deletedAt: null,
        status: 'CONECTADO',
        OR: [{ profissionalId }, { profissionalId: null }],
      },
      select: { id: true, profissionalId: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return (conectados.find((c) => c.profissionalId !== null) ?? conectados[0])?.id ?? null;
  }

  // --- Tela Agentes IA (gestão dos canais, sem o filtro de acesso) ---

  list(query: ListCanaisWhatsappQuery): Promise<Page<CanalWhatsappDto>> {
    const where: Prisma.CanalWhatsappWhereInput = {
      deletedAt: null,
      ...searchWhere(query.search, ['nome', 'numero']),
    };
    const orderBy = toOrderBy(query.sort);
    return paginate(query, {
      findMany: async (page) =>
        (
          await this.txHost.tx.canalWhatsapp.findMany({
            where,
            orderBy,
            include: COM_RELACOES,
            ...page,
          })
        ).map(toDto),
      count: () => this.txHost.tx.canalWhatsapp.count({ where }),
    });
  }

  async findByIdDto(id: string): Promise<CanalWhatsappDto> {
    return toDto(await this.carregar(id));
  }

  /** Usuários ativos para marcar o acesso (modais "Novo Canal" e "Usuários"). */
  async usuariosDisponiveis(): Promise<UsuarioCanalWhatsapp[]> {
    const usuarios = await this.txHost.tx.usuario.findMany({
      where: { deletedAt: null, ativo: true },
      select: { id: true, nome: true, email: true, perfil: { select: { nome: true } } },
      orderBy: [{ nome: 'asc' }, { id: 'asc' }],
    });
    return usuarios.map((u) => ({
      id: u.id,
      nome: u.nome,
      email: u.email,
      perfil: u.perfil?.nome ?? null,
    }));
  }

  /** O canal nasce desconectado: a conexão com o provedor é feita à parte (#173). */
  async create(input: CreateCanalWhatsappInput): Promise<CanalWhatsappDto> {
    await this.garantirNumeroDisponivel(input.numero);
    await this.garantirUsuarios(input.usuarioIds);
    const { usuarioIds, ...dados } = input;
    const canal = await this.gravarComProfissional(() =>
      this.txHost.tx.canalWhatsapp.create({
        data: {
          ...dados,
          usuarios: { createMany: { data: usuarioIds.map((usuarioId) => ({ usuarioId })) } },
        },
        include: COM_RELACOES,
      }),
    );
    return toDto(canal);
  }

  async update(id: string, input: UpdateCanalWhatsappInput): Promise<CanalWhatsappDto> {
    await this.carregar(id);
    await this.garantirNumeroDisponivel(input.numero, id);
    const canal = await this.gravarComProfissional(() =>
      this.txHost.tx.canalWhatsapp.update({ where: { id }, data: input, include: COM_RELACOES }),
    );
    return toDto(canal);
  }

  /** Substitui os usuários com acesso. Lista vazia = todos os usuários têm acesso. */
  async definirUsuarios(
    id: string,
    { usuarioIds }: DefinirUsuariosCanalWhatsappInput,
  ): Promise<CanalWhatsappDto> {
    await this.carregar(id);
    await this.garantirUsuarios(usuarioIds);
    await this.txHost.tx.canalWhatsappUsuario.deleteMany({ where: { canalId: id } });
    await this.txHost.tx.canalWhatsappUsuario.createMany({
      data: usuarioIds.map((usuarioId) => ({ canalId: id, usuarioId })),
    });
    return toDto(await this.carregar(id));
  }

  /** Exclusão lógica: libera o número para outro canal. As conversas continuam no histórico. */
  async remove(id: string): Promise<CanalWhatsappDto> {
    await this.carregar(id);
    const canal = await this.txHost.tx.canalWhatsapp.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: COM_RELACOES,
    });
    return toDto(canal);
  }

  private async carregar(id: string): Promise<CanalComRelacoes> {
    const canal = await this.txHost.tx.canalWhatsapp.findFirst({
      where: { id, deletedAt: null },
      include: COM_RELACOES,
    });
    if (!canal) {
      throw new BusinessException(ErrorCode.NOT_FOUND, this.naoEncontrado, { status: 404 });
    }
    return canal;
  }

  /**
   * O profissional é de outro módulo: em vez de consultar a tabela dele, a FK valida o id e a
   * violação (P2003) vira um erro no campo Profissional.
   */
  private async gravarComProfissional<T>(gravar: () => Promise<T>): Promise<T> {
    try {
      return await gravar();
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2003') {
        throw new BusinessException('PROFISSIONAL_INVALIDO', PROFISSIONAL_INVALIDO, {
          status: 400,
          details: [{ field: 'profissionalId', message: PROFISSIONAL_INVALIDO }],
        });
      }
      throw erro;
    }
  }

  private async garantirNumeroDisponivel(numero: string, ignorarId?: string): Promise<void> {
    const existente = await this.txHost.tx.canalWhatsapp.findFirst({
      where: { deletedAt: null, numero, id: ignorarId ? { not: ignorarId } : undefined },
      select: { id: true },
    });
    if (existente) {
      throw new BusinessException('NUMERO_DUPLICADO', NUMERO_DUPLICADO, {
        status: 400,
        details: [{ field: 'numero', message: NUMERO_DUPLICADO }],
      });
    }
  }

  private async garantirUsuarios(usuarioIds: readonly string[]): Promise<void> {
    if (usuarioIds.length === 0) return;
    const encontrados = await this.txHost.tx.usuario.count({
      where: { id: { in: [...usuarioIds] }, deletedAt: null, ativo: true },
    });
    if (encontrados !== usuarioIds.length) {
      throw new BusinessException('USUARIO_INVALIDO', 'Há usuários inválidos ou inativos', {
        status: 400,
        details: [{ field: 'usuarioIds', message: 'Há usuários inválidos ou inativos' }],
      });
    }
  }
}

function toDto(canal: CanalComRelacoes): CanalWhatsappDto {
  return {
    id: canal.id,
    nome: canal.nome,
    numero: canal.numero,
    tipo: canal.tipo,
    status: canal.status,
    profissionalId: canal.profissionalId,
    profissionalNome: canal.profissional?.nome ?? null,
    usuarioIds: canal.usuarios.map((u) => u.usuarioId),
    createdAt: canal.createdAt.toISOString(),
    updatedAt: canal.updatedAt.toISOString(),
  };
}
