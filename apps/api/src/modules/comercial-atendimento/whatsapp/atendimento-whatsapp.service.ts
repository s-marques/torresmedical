import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import type {
  EnviarMensagemWhatsappInput,
  ListMensagensWhatsappQuery,
  TransferirConversaWhatsappInput,
} from '@torres/shared';
import type {
  ConversaWhatsappStatus,
  MensagemWhatsappAutor,
  MensagemWhatsappStatus,
  MensagemWhatsappTipo,
  Paciente,
  Prisma,
} from '../../../generated/prisma/client';
import { RequestContextService } from '../../../common/context/request-context.service';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { EventPublisher } from '../../../common/messaging/event-publisher';
import { paginate, toOrderBy, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { CanaisWhatsappService } from '../../configuracoes-gestao/canais-whatsapp/canais-whatsapp.service';
import { UsuariosLookupService } from '../../configuracoes-gestao/usuarios/usuarios.service';
import { PacientesService } from '../pacientes/pacientes.service';
import { TagsAtendimentoService } from './tags-atendimento.service';

/** Comando consumido pela integração com o provedor (issue própria). Só leva ids. */
export const COMANDO_ENVIAR_MENSAGEM = 'comercial.whatsapp.enviar-mensagem';

const COM_RELACOES = {
  contato: true,
  canal: { select: { id: true, nome: true } },
  tags: { include: { tag: true } },
} satisfies Prisma.ConversaWhatsappInclude;

type ConversaCompleta = Prisma.ConversaWhatsappGetPayload<{ include: typeof COM_RELACOES }>;

const COM_CITACAO = {
  respondeA: { select: { autor: true, autorUsuarioId: true, conteudo: true } },
} satisfies Prisma.MensagemWhatsappInclude;

type MensagemCompleta = Prisma.MensagemWhatsappGetPayload<{ include: typeof COM_CITACAO }>;

/** `conversaWhatsappDetalheSchema`. */
export interface ConversaWhatsappDetalheDto {
  id: string;
  status: ConversaWhatsappStatus;
  naoLidas: number;
  ultimaMensagemEm: Date | null;
  createdAt: Date;
  contato: {
    id: string;
    nome: string | null;
    telefone: string;
    email: string | null;
    observacoes: string | null;
    pacienteId: string | null;
  };
  canal: { id: string; nome: string };
  atendente: { id: string; nome: string } | null;
  anuncio: { origem: string; titulo: string | null; url: string | null } | null;
  tags: { id: string; nome: string; cor: string }[];
}

/** `mensagemWhatsappSchema`. */
export interface MensagemWhatsappDto {
  id: string;
  autor: MensagemWhatsappAutor;
  autorNome: string | null;
  status: MensagemWhatsappStatus;
  tipo: MensagemWhatsappTipo;
  conteudo: string;
  duracaoSegundos: number | null;
  enviadaEm: Date;
  citacao: { autor: MensagemWhatsappAutor; autorNome: string | null; conteudo: string } | null;
}

/**
 * Painel da conversa da tela WhatsApp: cabeçalho, mensagens, Assumir / Transferir / Encerrar,
 * tags e envio de texto. O envio grava a mensagem como "Pendente" e publica o comando
 * `comercial.whatsapp.enviar-mensagem`; quem fala com o provedor é a integração (issue própria).
 */
@Injectable()
export class AtendimentoWhatsappService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly pacientes: PacientesService,
    private readonly usuarios: UsuariosLookupService,
    private readonly tags: TagsAtendimentoService,
    private readonly events: EventPublisher,
    private readonly contexto: RequestContextService,
    private readonly canais: CanaisWhatsappService,
  ) {}

  async detalhe(id: string): Promise<ConversaWhatsappDetalheDto> {
    return this.toDetalhe(await this.carregar(id));
  }

  /** Mais recentes primeiro; a tela inverte para mostrar a mais antiga no alto. */
  async mensagens(
    id: string,
    query: ListMensagensWhatsappQuery,
  ): Promise<Page<MensagemWhatsappDto>> {
    await this.carregar(id);
    const where = { conversaId: id };
    const orderBy = toOrderBy(query.sort);
    return paginate(query, {
      findMany: async (page) => {
        const mensagens = await this.txHost.tx.mensagemWhatsapp.findMany({
          where,
          orderBy,
          include: COM_CITACAO,
          ...page,
        });
        const nomes = await this.nomesDosAutores(mensagens);
        return mensagens.map((mensagem) => toMensagemDto(mensagem, nomes));
      },
      count: () => this.txHost.tx.mensagemWhatsapp.count({ where }),
    });
  }

  /** Só em atendimento. A mensagem fica "Pendente" até a integração entregá-la ao provedor. */
  async enviarMensagem(
    id: string,
    input: EnviarMensagemWhatsappInput,
  ): Promise<MensagemWhatsappDto> {
    const conversa = await this.carregar(id);
    this.exigirStatus(
      conversa,
      'EM_ATENDIMENTO',
      'CONVERSA_FORA_DE_ATENDIMENTO',
      'Assuma a conversa para enviar mensagens.',
    );
    const enviadaEm = new Date();
    const mensagem = await this.txHost.tx.mensagemWhatsapp.create({
      data: {
        conversaId: id,
        direcao: 'ENVIADA',
        autor: 'ATENDENTE',
        autorUsuarioId: this.contexto.getUserId() ?? null,
        status: 'PENDENTE',
        tipo: 'TEXTO',
        conteudo: input.conteudo,
        enviadaEm,
      },
      include: COM_CITACAO,
    });
    await this.txHost.tx.conversaWhatsapp.update({
      where: { id },
      data: { ultimaMensagemEm: enviadaEm },
    });
    await this.events.publish(COMANDO_ENVIAR_MENSAGEM, { mensagemId: mensagem.id });
    return toMensagemDto(mensagem, await this.nomesDosAutores([mensagem]));
  }

  /** Aguardando → Em Atendimento, com o usuário como atendente. */
  async assumir(id: string): Promise<ConversaWhatsappDetalheDto> {
    const conversa = await this.carregar(id);
    this.exigirStatus(
      conversa,
      'AGUARDANDO',
      'CONVERSA_STATUS_INVALIDO',
      'Só é possível assumir uma conversa que aguarda atendimento.',
    );
    await this.txHost.tx.conversaWhatsapp.update({
      where: { id },
      data: { status: 'EM_ATENDIMENTO', atendenteId: this.contexto.getUserId() ?? null },
    });
    return this.detalhe(id);
  }

  /** Em Atendimento → Finalizada. */
  async encerrar(id: string): Promise<ConversaWhatsappDetalheDto> {
    const conversa = await this.carregar(id);
    this.exigirStatus(
      conversa,
      'EM_ATENDIMENTO',
      'CONVERSA_STATUS_INVALIDO',
      'Só é possível encerrar uma conversa em atendimento.',
    );
    await this.txHost.tx.conversaWhatsapp.update({ where: { id }, data: { status: 'FINALIZADA' } });
    return this.detalhe(id);
  }

  /** Passa a conversa em atendimento para outro usuário ativo. */
  async transferir(
    id: string,
    input: TransferirConversaWhatsappInput,
  ): Promise<ConversaWhatsappDetalheDto> {
    const conversa = await this.carregar(id);
    this.exigirStatus(
      conversa,
      'EM_ATENDIMENTO',
      'CONVERSA_STATUS_INVALIDO',
      'Só é possível transferir uma conversa em atendimento.',
    );
    const destino = await this.usuarios.selecionarPorId(input.usuarioId);
    if (destino.id === conversa.atendenteId) {
      throw new BusinessException(
        'CONVERSA_MESMO_ATENDENTE',
        'A conversa já está com este atendente.',
        { status: 409 },
      );
    }
    await this.txHost.tx.conversaWhatsapp.update({
      where: { id },
      data: { atendenteId: destino.id },
    });
    return this.detalhe(id);
  }

  /** Idempotente: aplicar uma tag que a conversa já tem não muda nada. */
  async aplicarTag(id: string, tagId: string): Promise<ConversaWhatsappDetalheDto> {
    await this.carregar(id);
    await this.tags.findById(tagId);
    await this.txHost.tx.conversaTag.createMany({
      data: [{ conversaId: id, tagId }],
      skipDuplicates: true,
    });
    return this.detalhe(id);
  }

  /** Idempotente: remover uma tag que a conversa não tem não muda nada. */
  async removerTag(id: string, tagId: string): Promise<ConversaWhatsappDetalheDto> {
    await this.carregar(id);
    await this.txHost.tx.conversaTag.deleteMany({ where: { conversaId: id, tagId } });
    return this.detalhe(id);
  }

  private async carregar(id: string): Promise<ConversaCompleta> {
    // Conversa de canal sem acesso para o usuário responde 404, como se não existisse.
    const conversa = await this.txHost.tx.conversaWhatsapp.findFirst({
      where: { id, canal: this.canais.filtroAcesso() },
      include: COM_RELACOES,
    });
    if (!conversa) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Conversa não encontrada', { status: 404 });
    }
    return conversa;
  }

  private exigirStatus(
    conversa: { status: ConversaWhatsappStatus },
    esperado: ConversaWhatsappStatus,
    codigo: string,
    mensagem: string,
  ): void {
    if (conversa.status !== esperado) {
      throw new BusinessException(codigo, mensagem, { status: 409 });
    }
  }

  private async toDetalhe(conversa: ConversaCompleta): Promise<ConversaWhatsappDetalheDto> {
    const { contato } = conversa;
    const [paciente, nomes] = await Promise.all([
      this.pacienteOuNulo(contato.pacienteId),
      this.usuarios.nomesPorIds(conversa.atendenteId ? [conversa.atendenteId] : []),
    ]);
    const atendenteNome = conversa.atendenteId ? nomes.get(conversa.atendenteId) : undefined;
    return {
      id: conversa.id,
      status: conversa.status,
      naoLidas: conversa.naoLidas,
      ultimaMensagemEm: conversa.ultimaMensagemEm,
      createdAt: conversa.createdAt,
      contato: {
        id: contato.id,
        nome: contato.nome,
        telefone: contato.telefone,
        email: paciente?.email ?? null,
        observacoes: paciente?.observacoes ?? null,
        pacienteId: paciente?.id ?? null,
      },
      canal: conversa.canal,
      atendente:
        conversa.atendenteId && atendenteNome
          ? { id: conversa.atendenteId, nome: atendenteNome }
          : null,
      anuncio: conversa.anuncioOrigem
        ? {
            origem: conversa.anuncioOrigem,
            titulo: conversa.anuncioTitulo,
            url: conversa.anuncioUrl,
          }
        : null,
      tags: conversa.tags
        .filter(({ tag }) => tag.deletedAt === null)
        .map(({ tag }) => ({ id: tag.id, nome: tag.nome, cor: tag.cor }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    };
  }

  /** Paciente vinculado ao contato; excluído ou inexistente equivale a "sem paciente". */
  private async pacienteOuNulo(pacienteId: string | null): Promise<Paciente | null> {
    if (!pacienteId) return null;
    try {
      return await this.pacientes.findById(pacienteId);
    } catch (erro) {
      if (erro instanceof BusinessException && erro.getStatus() === 404) return null;
      throw erro;
    }
  }

  private nomesDosAutores(mensagens: MensagemCompleta[]): Promise<Map<string, string>> {
    const ids = mensagens.flatMap((m) => [m.autorUsuarioId, m.respondeA?.autorUsuarioId]);
    return this.usuarios.nomesPorIds(ids.filter((id): id is string => Boolean(id)));
  }
}

function toMensagemDto(
  mensagem: MensagemCompleta,
  nomes: ReadonlyMap<string, string>,
): MensagemWhatsappDto {
  const nomeDe = (id: string | null | undefined) => (id ? (nomes.get(id) ?? null) : null);
  const { respondeA } = mensagem;
  return {
    id: mensagem.id,
    autor: mensagem.autor,
    autorNome: nomeDe(mensagem.autorUsuarioId),
    status: mensagem.status,
    tipo: mensagem.tipo,
    conteudo: mensagem.conteudo,
    duracaoSegundos: mensagem.duracaoSegundos,
    enviadaEm: mensagem.enviadaEm,
    citacao: respondeA
      ? {
          autor: respondeA.autor,
          autorNome: nomeDe(respondeA.autorUsuarioId),
          conteudo: respondeA.conteudo,
        }
      : null,
  };
}
