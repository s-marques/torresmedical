import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  BUSCA_CONVERSAS_MIN,
  CONVERSA_WHATSAPP_PREVIA_MAX,
  CONVERSA_WHATSAPP_STATUS,
  CONVERSA_WHATSAPP_STATUS_DO_FILTRO,
  normalizarTelefoneWhatsapp,
  type ContadoresConversasWhatsapp,
  type ContadoresConversasWhatsappQuery,
  type ListConversasWhatsappQuery,
  type NovaConversaWhatsappInput,
} from '@torres/shared';
import type {
  ContatoWhatsapp,
  ConversaWhatsappStatus,
  Paciente,
  Prisma,
} from '../../../generated/prisma/client';
import { AuditService } from '../../../common/audit/audit.service';
import { BusinessException } from '../../../common/errors/api.exception';
import { paginate, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { CanaisWhatsappService } from '../../configuracoes-gestao/canais-whatsapp/canais-whatsapp.service';
import { PacientesService } from '../pacientes/pacientes.service';

const COM_RELACOES = {
  contato: { select: { id: true, nome: true, telefone: true } },
  canal: { select: { id: true, nome: true } },
  mensagens: { select: { conteudo: true }, orderBy: { enviadaEm: 'desc' }, take: 1 },
} satisfies Prisma.ConversaWhatsappInclude;

type ConversaComRelacoes = Prisma.ConversaWhatsappGetPayload<{ include: typeof COM_RELACOES }>;

/** Item da lista lateral (`conversaWhatsappSchema`). */
export interface ConversaWhatsappDto {
  id: string;
  status: ConversaWhatsappStatus;
  naoLidas: number;
  ultimaMensagem: string | null;
  ultimaMensagemEm: Date | null;
  contato: { id: string; nome: string | null; telefone: string };
  canal: { id: string; nome: string };
  createdAt: Date;
}

/**
 * Tela WhatsApp (`/atendimento`): lista de conversas por canal e status, contadores dos chips,
 * busca do modal "Buscar Conversas" e "Nova conversa" com um paciente. O envio e o recebimento
 * de mensagens dependem da integração com o provedor (issue própria).
 */
@Injectable()
export class ConversasWhatsappService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly pacientes: PacientesService,
    private readonly canais: CanaisWhatsappService,
    private readonly audit: AuditService,
  ) {}

  /** Mais recentes primeiro; conversa nova, ainda sem mensagem, fica no topo. */
  list(query: ListConversasWhatsappQuery): Promise<Page<ConversaWhatsappDto>> {
    const where = this.where(query);
    const { direction } = query.sort;
    const orderBy: Prisma.ConversaWhatsappOrderByWithRelationInput[] = [
      { ultimaMensagemEm: { sort: direction, nulls: direction === 'desc' ? 'first' : 'last' } },
      { createdAt: direction },
      { id: 'asc' },
    ];
    return paginate(query, {
      findMany: async (page) =>
        (
          await this.txHost.tx.conversaWhatsapp.findMany({
            where,
            orderBy,
            include: COM_RELACOES,
            ...page,
          })
        ).map(toDto),
      count: () => this.txHost.tx.conversaWhatsapp.count({ where }),
    });
  }

  /** Quantidade de conversas em cada status (chips), no canal escolhido ou em todos. */
  async contadores(query: ContadoresConversasWhatsappQuery): Promise<ContadoresConversasWhatsapp> {
    const grupos = await this.txHost.tx.conversaWhatsapp.groupBy({
      by: ['status'],
      where: { canalId: query.canalId, canal: this.canais.filtroAcesso() },
      _count: { _all: true },
    });
    const contadores = Object.fromEntries(
      CONVERSA_WHATSAPP_STATUS.map((status) => [status, 0]),
    ) as ContadoresConversasWhatsapp;
    for (const grupo of grupos) contadores[grupo.status] = grupo._count._all;
    return contadores;
  }

  /**
   * "Nova conversa": abre uma conversa com o paciente no canal escolhido, já em atendimento.
   * O contato é o do celular (ou telefone) do paciente; se ainda não existir, é criado.
   * Não abre uma segunda conversa enquanto houver outra não finalizada no mesmo canal.
   */
  async criar(input: NovaConversaWhatsappInput): Promise<ConversaWhatsappDto> {
    const paciente = await this.pacientes.findById(input.pacienteId);
    const canal = await this.canais.findById(input.canalId);
    const numero = paciente.celular || paciente.telefone;
    if (!numero) {
      throw new BusinessException(
        'PACIENTE_SEM_TELEFONE',
        'O paciente não tem celular nem telefone cadastrado.',
        { status: 422 },
      );
    }
    const contato = await this.contatoDoPaciente(paciente, normalizarTelefoneWhatsapp(numero));

    const emAndamento = await this.txHost.tx.conversaWhatsapp.findFirst({
      where: { contatoId: contato.id, canalId: canal.id, status: { not: 'FINALIZADA' } },
      select: { id: true },
    });
    if (emAndamento) {
      throw new BusinessException(
        'CONVERSA_EM_ANDAMENTO',
        'Já existe uma conversa em andamento com este paciente neste canal.',
        { status: 409 },
      );
    }

    const conversa = await this.txHost.tx.conversaWhatsapp.create({
      data: { contatoId: contato.id, canalId: canal.id, status: 'EM_ATENDIMENTO' },
      include: COM_RELACOES,
    });
    return toDto(conversa);
  }

  /** Contato do telefone do paciente: cria ou vincula ao paciente, auditando a alteração. */
  private async contatoDoPaciente(paciente: Paciente, telefone: string): Promise<ContatoWhatsapp> {
    const existente = await this.txHost.tx.contatoWhatsapp.findUnique({ where: { telefone } });
    if (existente?.pacienteId) return existente;
    if (existente) {
      const vinculado = await this.txHost.tx.contatoWhatsapp.update({
        where: { id: existente.id },
        data: { pacienteId: paciente.id, nome: existente.nome ?? paciente.nome },
      });
      await this.audit.record({
        action: 'UPDATE',
        entity: 'ContatoWhatsapp',
        entityId: vinculado.id,
        before: existente,
        after: vinculado,
      });
      return vinculado;
    }
    const criado = await this.txHost.tx.contatoWhatsapp.create({
      data: { telefone, nome: paciente.nome, pacienteId: paciente.id },
    });
    await this.audit.record({
      action: 'CREATE',
      entity: 'ContatoWhatsapp',
      entityId: criado.id,
      before: null,
      after: criado,
    });
    return criado;
  }

  private where({
    search,
    status,
    canalId,
  }: Pick<
    ListConversasWhatsappQuery,
    'search' | 'status' | 'canalId'
  >): Prisma.ConversaWhatsappWhereInput {
    return {
      canalId,
      // Só as conversas dos canais a que o usuário tem acesso (aceite de segurança do #26).
      canal: this.canais.filtroAcesso(),
      status: status && CONVERSA_WHATSAPP_STATUS_DO_FILTRO[status],
      OR: search ? busca(search) : undefined,
    };
  }
}

/** Busca do modal: nome ou telefone do contato, nome de tag ou palavra nas mensagens. */
function busca(search: string): Prisma.ConversaWhatsappWhereInput[] {
  const contem = { contains: search, mode: 'insensitive' } as const;
  const digitos = search.replaceAll(/\D/g, '');
  return [
    { contato: { nome: contem } },
    ...(digitos.length >= BUSCA_CONVERSAS_MIN
      ? [{ contato: { telefone: { contains: digitos } } }]
      : []),
    { tags: { some: { tag: { deletedAt: null, nome: contem } } } },
    { mensagens: { some: { conteudo: contem } } },
  ];
}

function toDto(conversa: ConversaComRelacoes): ConversaWhatsappDto {
  const ultima = conversa.mensagens[0]?.conteudo ?? null;
  return {
    id: conversa.id,
    status: conversa.status,
    naoLidas: conversa.naoLidas,
    ultimaMensagem: ultima && ultima.slice(0, CONVERSA_WHATSAPP_PREVIA_MAX),
    ultimaMensagemEm: conversa.ultimaMensagemEm,
    contato: conversa.contato,
    canal: conversa.canal,
    createdAt: conversa.createdAt,
  };
}
