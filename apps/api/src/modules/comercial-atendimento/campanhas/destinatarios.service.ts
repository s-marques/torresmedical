import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  mascararTelefone,
  type CampanhaFiltro,
  type Destinatario,
  type DestinatariosQuery,
} from '@torres/shared';
import { Prisma } from '../../../generated/prisma/client';
import { paginate, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { agoraNaClinica, formatarDiaClinica, type AgoraClinica } from './relogio-clinica';

const DIA_MS = 86_400_000;

/** O que o "Filtro de Clientes" guarda numa campanha ou mensagem automática. */
export interface FiltroDestinatarios {
  filtro: CampanhaFiltro;
  origemClienteId: string | null;
  diasCompra: number | null;
}

/** Dados de cada destinatário para as variáveis da mensagem. */
export interface DadosDestinatario {
  nome: string;
  celular: string | null;
  /** Consentimento vigente de campanhas e de comunicação (LGPD), conferido na hora do envio. */
  aceitaContato: boolean;
  /** `dd/mm/aaaa` da última venda finalizada, ou null. */
  ultimaCompra: string | null;
}

/**
 * Quem recebe campanhas e mensagens automáticas: pacientes não excluídos, novos ou ativos, com
 * celular e sem consentimento revogado (campanhas ou comunicação), que atendem ao filtro (todos, aniversariantes do dia, origem ou compra recente).
 */
@Injectable()
export class DestinatariosService {
  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {}

  /** "Visualizar Clientes": nome e telefone mascarado, em ordem alfabética. */
  async listar(query: DestinatariosQuery): Promise<Page<Destinatario>> {
    const where = await this.where(query, agoraNaClinica());
    return paginate(query, {
      findMany: async (p) =>
        (
          await this.txHost.tx.paciente.findMany({
            where,
            orderBy: [{ nome: 'asc' }, { id: 'asc' }],
            select: { id: true, nome: true, celular: true },
            ...p,
          })
        ).map((pac) => ({
          pacienteId: pac.id,
          nome: pac.nome,
          telefone: mascararTelefone(pac.celular ?? ''),
        })),
      count: () => this.txHost.tx.paciente.count({ where }),
    });
  }

  /** Ids dos destinatários, em ordem alfabética; `limite` = "Quantidade de Envios". */
  async ids(
    filtro: FiltroDestinatarios,
    agora: AgoraClinica,
    limite: number | null = null,
  ): Promise<string[]> {
    const pacientes = await this.txHost.tx.paciente.findMany({
      where: await this.where(filtro, agora),
      orderBy: [{ nome: 'asc' }, { id: 'asc' }],
      select: { id: true },
      ...(limite ? { take: limite } : {}),
    });
    return pacientes.map((p) => p.id);
  }

  /** Nome, celular e data da última compra de cada paciente. */
  async dados(pacienteIds: readonly string[]): Promise<Map<string, DadosDestinatario>> {
    const unicos = [...new Set(pacienteIds)];
    if (unicos.length === 0) return new Map();
    const [pacientes, compras] = await Promise.all([
      this.txHost.tx.paciente.findMany({
        where: { id: { in: unicos } },
        select: {
          id: true,
          nome: true,
          celular: true,
          aceitaCampanhasWhatsapp: true,
          aceitaComunicacao: true,
        },
      }),
      this.txHost.tx.venda.groupBy({
        by: ['pacienteId'],
        where: { pacienteId: { in: unicos }, status: 'FINALIZADA', deletedAt: null },
        _max: { createdAt: true },
      }),
    ]);
    const ultima = new Map(compras.map((c) => [c.pacienteId, c._max.createdAt]));
    return new Map(
      pacientes.map((p) => {
        const data = ultima.get(p.id);
        return [
          p.id,
          {
            nome: p.nome,
            celular: p.celular,
            aceitaContato: p.aceitaCampanhasWhatsapp && p.aceitaComunicacao,
            ultimaCompra: data ? formatarDiaClinica(data) : null,
          },
        ];
      }),
    );
  }

  private async where(
    filtro: FiltroDestinatarios,
    agora: AgoraClinica,
  ): Promise<Prisma.PacienteWhereInput> {
    const base: Prisma.PacienteWhereInput = {
      deletedAt: null,
      status: { in: ['NOVO', 'ATIVO'] },
      // LGPD (#148): consentimento revogado de campanhas ou de comunicação tira da lista.
      aceitaCampanhasWhatsapp: true,
      aceitaComunicacao: true,
      celular: { not: null },
      NOT: { celular: '' },
    };
    switch (filtro.filtro) {
      case 'ORIGEM':
        return { ...base, origemClienteId: filtro.origemClienteId ?? undefined };
      case 'COMPRA_RECENTE':
        return {
          ...base,
          vendas: {
            some: {
              status: 'FINALIZADA',
              deletedAt: null,
              createdAt: {
                gte: new Date(agora.instante.getTime() - (filtro.diasCompra ?? 0) * DIA_MS),
              },
            },
          },
        };
      case 'ANIVERSARIANTES_DIA':
        return { ...base, id: { in: await this.aniversariantes(agora) } };
      default:
        return base;
    }
  }

  /** Dia e mês de nascimento iguais aos de hoje (o Prisma não filtra partes da data). */
  private async aniversariantes(agora: AgoraClinica): Promise<string[]> {
    const linhas = await this.txHost.tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM pacientes
      WHERE data_nascimento IS NOT NULL
        AND EXTRACT(MONTH FROM data_nascimento) = ${agora.mes}
        AND EXTRACT(DAY FROM data_nascimento) = ${agora.diaDoMes}
    `);
    return linhas.map((l) => l.id);
  }
}
