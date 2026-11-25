import { Body, Controller, Get, HttpCode, Post, Query, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  createExportacaoLoteSchema,
  exportacaoLoteEntidadeInfoSchema,
  exportacaoLotePageSchema,
  exportacaoLoteSchema,
  listExportacoesLoteQuerySchema,
  type CreateExportacaoLote,
  type ExportacaoLote,
  type ExportacaoLoteEntidadeInfo,
  type ExportacaoLotePage,
  type ListExportacoesLoteQuery,
} from '@torres/shared';
import { z } from 'zod';
import { Audit } from '../../../common/audit/audit.decorator';
import { ExportaDadosPessoais, RequirePermission } from '../../../common/auth/auth.decorators';
import {
  ApiErrorResponses,
  ApiZodBody,
  ApiZodQuery,
  ApiZodResponse,
} from '../../../common/swagger/zod-openapi';
import { IdParam } from '../../../common/validation/id-param.decorator';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { ExportacaoLoteService } from './exportacao-lote.service';

const ENTITY = 'ExportacaoLote';

/**
 * Exportação completa de dados em lote (issue #158, R §39): ZIP com CSV e arquivos por entidade,
 * gerado em segundo plano. Só a administração: `configuracoes-gestao.exportacao-lote.ver` e
 * `.executar`, além de `configuracoes-gestao.dados-pessoais.exportar` (issue #156).
 */
@ApiTags('Configurações / Gestão: Exportação em lote')
@Controller('configuracoes-gestao/exportacoes-lote')
export class ExportacaoLoteController {
  constructor(private readonly exportacoes: ExportacaoLoteService) {}

  // Declarada antes de ':id' para "entidades" não ser tomada como id.
  @Get('entidades')
  @RequirePermission('configuracoes-gestao.exportacao-lote.ver')
  @ApiOperation({ summary: 'Entidades que podem ser exportadas em lote' })
  @ApiZodResponse(200, z.array(exportacaoLoteEntidadeInfoSchema))
  @ApiErrorResponses(401, 403)
  entidades(): ExportacaoLoteEntidadeInfo[] {
    return this.exportacoes.entidades();
  }

  @Get()
  @RequirePermission('configuracoes-gestao.exportacao-lote.ver')
  @ApiOperation({ summary: 'Histórico paginado das exportações em lote' })
  @ApiZodQuery(listExportacoesLoteQuerySchema)
  @ApiZodResponse(200, exportacaoLotePageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listExportacoesLoteQuerySchema)) query: ListExportacoesLoteQuery,
  ): Promise<ExportacaoLotePage> {
    return this.exportacoes.listar(query);
  }

  @Post()
  @HttpCode(202)
  @RequirePermission('configuracoes-gestao.exportacao-lote.executar')
  @ExportaDadosPessoais()
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Pede a exportação de uma entidade (o ZIP é gerado em segundo plano)' })
  @ApiZodBody(createExportacaoLoteSchema)
  @ApiZodResponse(202, exportacaoLoteSchema)
  @ApiErrorResponses(400, 401, 403, 409, 422)
  solicitar(
    @Body(new ZodValidationPipe(createExportacaoLoteSchema)) body: CreateExportacaoLote,
  ): Promise<ExportacaoLote> {
    return this.exportacoes.solicitar(body);
  }

  @Get(':id')
  @RequirePermission('configuracoes-gestao.exportacao-lote.ver')
  @ApiOperation({ summary: 'Situação de uma exportação em lote' })
  @ApiZodResponse(200, exportacaoLoteSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  detalhe(@IdParam() id: string): Promise<ExportacaoLote> {
    return this.exportacoes.detalhe(id);
  }

  @Get(':id/download')
  @RequirePermission('configuracoes-gestao.exportacao-lote.ver')
  @ExportaDadosPessoais()
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({ summary: 'Baixa o ZIP pronto (vale por 24 h; depois responde 410)' })
  @ApiProduces('application/zip')
  @ApiErrorResponses(400, 401, 403, 404, 410)
  async download(@IdParam() id: string): Promise<StreamableFile> {
    const { arquivo, stream } = await this.exportacoes.baixar(id);
    return new StreamableFile(stream, {
      type: 'application/zip',
      length: arquivo.tamanho,
      disposition: `attachment; filename="${encodeURIComponent(arquivo.nomeOriginal)}"`,
    });
  }
}
