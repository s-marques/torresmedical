import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  PESQUISA_PROFISSIONAL_CONFIG_PADRAO,
  type PesquisaProfissionalConfig,
  type PesquisaProfissionalConfigInput,
} from '@torres/shared';
import type { ConfiguracaoPesquisaProfissional } from '../../../generated/prisma/client';
import { AuditService } from '../../../common/audit/audit.service';
import { EscopoDadosService, semPermissao } from '../../../common/auth/escopo-dados.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';

function toDto(c: ConfiguracaoPesquisaProfissional | null): PesquisaProfissionalConfig {
  const base = c ?? PESQUISA_PROFISSIONAL_CONFIG_PADRAO;
  return {
    ativo: base.ativo,
    periodicidadeMeses: base.periodicidadeMeses,
    mensagem: base.mensagem,
    atualizadoEm: c ? c.updatedAt.toISOString() : null,
  };
}

/** Configuração da pesquisa do profissional: uma linha (`id = 1`), com padrões enquanto não salva. */
@Injectable()
export class PesquisaProfissionalConfigService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly audit: AuditService,
    private readonly escopo: EscopoDadosService,
  ) {}

  async configuracao(): Promise<PesquisaProfissionalConfig> {
    return toDto(
      await this.txHost.tx.configuracaoPesquisaProfissional.findUnique({ where: { id: 1 } }),
    );
  }

  /** Configuração geral da clínica: só a administração (perfil sem restrição) altera. */
  @Transactional()
  async salvar(input: PesquisaProfissionalConfigInput): Promise<PesquisaProfissionalConfig> {
    if (this.escopo.restrito()) throw semPermissao();
    const antes = await this.txHost.tx.configuracaoPesquisaProfissional.findUnique({
      where: { id: 1 },
    });
    const depois = await this.txHost.tx.configuracaoPesquisaProfissional.upsert({
      where: { id: 1 },
      create: { id: 1, ...input },
      update: input,
    });
    await this.audit.record({
      action: 'UPDATE',
      entity: 'ConfiguracaoPesquisaProfissional',
      entityId: '1',
      before: toDto(antes),
      after: toDto(depois),
    });
    return toDto(depois);
  }
}
