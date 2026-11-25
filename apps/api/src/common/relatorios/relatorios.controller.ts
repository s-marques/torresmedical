import { Controller, Get, Inject, Param, Query, StreamableFile, type Type } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  catalogoRelatoriosSchema,
  consultaRelatorioSchema,
  exportRelatorioSchema,
  paginaRelatorioSchema,
  type CatalogoRelatorios,
  type LinhaRelatorio,
  type TelaRelatorios,
} from '@torres/shared';
import { Audit } from '../audit/audit.decorator';
import { CurrentUser, RequirePermission } from '../auth/auth.decorators';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado';
import { toStreamableFile } from '../export/export-response';
import type { Page } from '../pagination/paginate';
import { ApiErrorResponses, ApiZodQuery, ApiZodResponse } from '../swagger/zod-openapi';
import type { ProvedorRelatorios } from './relatorio.types';
import { RelatoriosService, type PermissoesUsuario } from './relatorios.service';

/** Entidade gravada no audit_log da exportação; o `entityId` é o id do relatório. */
export const ENTIDADE_RELATORIO = 'Relatorio';

const SUFIXO = '.relatorios';

// Só para a documentação: cada relatório tem a própria whitelist de `sort`, colunas e filtros.
const DOC_OPCOES = { colunas: ['coluna'], ordenaveis: [], filtros: [] } as const;
const DOC_OBSERVACAO =
  'Aceita também `sort=<coluna>:asc|desc` (colunas ordenáveis do catálogo) e os filtros do relatório.';

const SEM_PERMISSOES: PermissoesUsuario = new Set();

function permissoesDe(usuario: UsuarioAutenticado | undefined): PermissoesUsuario {
  return usuario?.permissoes ?? SEM_PERMISSOES;
}

/**
 * Controller da tela de Relatórios do módulo (`tela`, ex.: `financeiro.relatorios`):
 * - `GET /api/<modulo>/relatorios`: catálogo permitido ao usuário;
 * - `GET /api/<modulo>/relatorios/:id?de=&ate=`: resultado paginado;
 * - `GET /api/<modulo>/relatorios/:id/export?format=`: Excel/PDF, auditado como `EXPORT`.
 *
 * Registrado pelo módulo com o provider dos relatórios dele, como o `criarLookupController`.
 */
export function criarRelatoriosController(
  tela: TelaRelatorios,
  provedor: Type<ProvedorRelatorios>,
): Type<unknown> {
  const modulo = tela.slice(0, -SUFIXO.length);

  @ApiTags(`Relatórios: ${modulo}`)
  @Controller(`${modulo}/relatorios`)
  class RelatoriosController {
    constructor(
      @Inject(provedor) private readonly provedor: ProvedorRelatorios,
      private readonly relatorios: RelatoriosService,
    ) {}

    @Get()
    @RequirePermission(`${tela}.ver` as const)
    @ApiOperation({ summary: 'Relatórios permitidos ao usuário, com colunas e filtros' })
    @ApiZodResponse(200, catalogoRelatoriosSchema)
    @ApiErrorResponses(401, 403)
    catalogo(@CurrentUser() usuario?: UsuarioAutenticado): CatalogoRelatorios {
      return this.relatorios.catalogo(this.provedor.relatorios, permissoesDe(usuario));
    }

    // Antes de ":id" por clareza; as rotas não colidem.
    @Get(':id/export')
    @RequirePermission(`${tela}.exportar` as const)
    @Audit({ entity: ENTIDADE_RELATORIO, action: 'EXPORT' })
    @ApiOperation({
      summary: 'Exporta o relatório em Excel ou PDF, com o período e os filtros da consulta',
      description: DOC_OBSERVACAO,
    })
    @ApiParam({ name: 'id', description: 'Código do relatório, ex.: FIN-01' })
    @ApiZodQuery(exportRelatorioSchema(DOC_OPCOES))
    @ApiProduces(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/pdf',
      'text/csv',
    )
    @ApiErrorResponses(400, 401, 403, 404, 422)
    async exportar(
      @Param('id') id: string,
      @Query() query: Record<string, unknown>,
      @CurrentUser() usuario?: UsuarioAutenticado,
    ): Promise<StreamableFile> {
      const definicao = this.relatorios.resolver(
        this.provedor.relatorios,
        id,
        permissoesDe(usuario),
      );
      return toStreamableFile(await this.relatorios.exportar(definicao, query));
    }

    @Get(':id')
    @RequirePermission(`${tela}.ver` as const)
    @ApiOperation({
      summary: 'Resultado paginado do relatório no período',
      description: DOC_OBSERVACAO,
    })
    @ApiParam({ name: 'id', description: 'Código do relatório, ex.: FIN-01' })
    @ApiZodQuery(consultaRelatorioSchema(DOC_OPCOES))
    @ApiZodResponse(200, paginaRelatorioSchema)
    @ApiErrorResponses(400, 401, 403, 404)
    consultar(
      @Param('id') id: string,
      @Query() query: Record<string, unknown>,
      @CurrentUser() usuario?: UsuarioAutenticado,
    ): Promise<Page<LinhaRelatorio>> {
      const definicao = this.relatorios.resolver(
        this.provedor.relatorios,
        id,
        permissoesDe(usuario),
      );
      return this.relatorios.consultar(definicao, query);
    }
  }

  Object.defineProperty(RelatoriosController, 'name', {
    value: `${modulo.replaceAll(/(^|-)([a-z])/g, (_trecho, _hifen, letra: string) => letra.toUpperCase())}RelatoriosController`,
  });
  return RelatoriosController;
}
