import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  HISTORICO_EVENTO_TIPO,
  type HistoricoEvento,
  type NegocioVinculavel,
  type NegocioVinculavelQuery,
  type NegocioVinculo,
  type ProfissionalHistoricoEvento,
} from '@torres/shared';
import { EscopoDadosService } from '../../../common/auth/escopo-dados.service';
import { isUuid } from '../../../common/auth/tokens';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { paginate, type Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { Prisma } from '../../../generated/prisma/client';
import { UsuariosService } from '../../configuracoes-gestao/usuarios/usuarios.service';
import { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';

const NAO_EXCLUIDO = { deletedAt: null } as const;

/** Evento da linha do tempo de cada marco do CRM, e a coluna do negócio onde ele fica. */
const MARCOS = [
  ['marcoPrimeiroContatoEm', 'PRIMEIRO_CONTATO'],
  ['marcoVisitaEm', 'VISITA_REALIZADA'],
  ['marcoPropostaEm', 'PROPOSTA_ENVIADA'],
  ['marcoContratoEm', 'CONTRATO_FECHADO'],
] as const satisfies readonly (readonly [string, HistoricoEvento])[];

const INCLUDE = {
  estagio: { select: { nome: true } },
  atividades: {
    where: { status: 'CONCLUIDA', deletedAt: null, concluidaEm: { not: null } },
    select: { id: true, titulo: true, concluidaEm: true, responsavelId: true },
  },
} satisfies Prisma.NegocioInclude;

/**
 * Negócios do CRM na linha do tempo do profissional (issue #144): o vínculo do negócio com o
 * profissional e os eventos que o CRM guarda (lead, marcos e atividades concluídas). Os marcos
 * não registram quem os fez, então saem sem autor; as atividades trazem o responsável.
 */
@Injectable()
export class NegociosHistoricoService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly usuarios: UsuariosService,
    private readonly profissionais: ProfissionaisService,
    private readonly escopo: EscopoDadosService,
  ) {}

  /**
   * Eventos do CRM de um profissional: dos negócios ligados a ele pelo vínculo (#144) e dos que
   * já têm o profissional como contato. Não aplica o escopo: quem chama já aplicou o seu.
   */
  async eventosDoProfissional(profissionalId: string): Promise<ProfissionalHistoricoEvento[]> {
    const negocios = await this.txHost.tx.negocio.findMany({
      where: {
        ...NAO_EXCLUIDO,
        OR: [{ profissionalId }, { contatoTipo: 'PROFISSIONAL', contatoId: profissionalId }],
      },
      include: INCLUDE,
    });
    const nomes = await this.usuarios.nomesPorIds(
      negocios.flatMap((n) =>
        n.atividades.flatMap((a) => (a.responsavelId ? [a.responsavelId] : [])),
      ),
    );
    return negocios.flatMap((n) => {
      const evento = (
        chave: string,
        codigo: HistoricoEvento,
        ocorridoEm: Date,
        detalhe: string,
        autor: string | null,
        link: '/negocios' | '/atividades',
      ): ProfissionalHistoricoEvento => ({
        id: `negocio:${n.id}:${chave}`,
        tipo: HISTORICO_EVENTO_TIPO[codigo],
        evento: codigo,
        ocorridoEm: ocorridoEm.toISOString(),
        somenteData: false,
        detalhe,
        autor,
        link,
      });
      const marcos = MARCOS.flatMap(([coluna, codigo]) => {
        const data = n[coluna];
        return data ? [evento(codigo, codigo, data, n.titulo, null, '/negocios')] : [];
      });
      const atividades = n.atividades.flatMap((a) =>
        a.concluidaEm
          ? [
              evento(
                `atividade:${a.id}`,
                'ATIVIDADE_CONCLUIDA',
                a.concluidaEm,
                a.titulo,
                a.responsavelId ? (nomes.get(a.responsavelId) ?? null) : null,
                '/atividades',
              ),
            ]
          : [],
      );
      return [
        evento('LEAD_CRIADO', 'LEAD_CRIADO', n.createdAt, n.titulo, null, '/negocios'),
        ...marcos,
        ...atividades,
      ];
    });
  }

  /** Busca do "Vincular negócio": abertos e ganhos ainda sem profissional ligado. */
  async vinculaveis(query: NegocioVinculavelQuery): Promise<Page<NegocioVinculavel>> {
    const where: Prisma.NegocioWhereInput = {
      ...NAO_EXCLUIDO,
      status: { in: ['ABERTO', 'GANHO'] },
      profissionalId: null,
      // Quem já tem um profissional como contato aparece na linha dele sem precisar de vínculo.
      NOT: { contatoTipo: 'PROFISSIONAL', contatoId: { not: null } },
      ...(query.search ? { titulo: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const pagina = await paginate(query, {
      findMany: (p) =>
        this.txHost.tx.negocio.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          include: { estagio: { select: { nome: true } } },
          ...p,
        }),
      count: () => this.txHost.tx.negocio.count({ where }),
    });
    return {
      meta: pagina.meta,
      data: pagina.data.map((n) => ({
        id: n.id,
        titulo: n.titulo,
        estagio: n.estagio.nome,
        status: n.status,
        criadoEm: n.createdAt.toISOString(),
      })),
    };
  }

  /** Liga o negócio ao profissional (ou desfaz, com `null`). Roda dentro do `@Audit` do endpoint. */
  async vincular(id: string, profissionalId: string | null): Promise<NegocioVinculo> {
    const negocio = isUuid(id)
      ? await this.txHost.tx.negocio.findFirst({
          where: { id, ...NAO_EXCLUIDO },
          include: { estagio: { select: { nome: true } } },
        })
      : null;
    if (!negocio) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Negócio não encontrado', { status: 404 });
    }
    if (profissionalId) {
      await this.profissionais.garantirExiste(profissionalId);
      this.escopo.garantirProfissional(profissionalId);
    }
    if (negocio.profissionalId) this.escopo.garantirProfissional(negocio.profissionalId);
    const alterado = await this.txHost.tx.negocio.update({
      where: { id },
      data: { profissionalId },
    });
    return {
      id: alterado.id,
      titulo: alterado.titulo,
      estagio: negocio.estagio.nome,
      status: alterado.status,
      criadoEm: alterado.createdAt.toISOString(),
      profissionalId: alterado.profissionalId,
    };
  }
}
