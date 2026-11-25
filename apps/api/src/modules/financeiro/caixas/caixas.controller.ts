import { Body, Controller, Get, Post, Query, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  abrirCaixaSchema,
  caixaPageSchema,
  caixaSchema,
  exportCaixasQuerySchema,
  listCaixasQuerySchema,
  type AbrirCaixaInput,
  type Caixa,
  type ExportCaixasQuery,
  type ListCaixasQuery,
} from '@torres/shared';
import { Audit } from '../../../common/audit/audit.decorator';
import { RequirePermission } from '../../../common/auth/auth.decorators';
import { toStreamableFile } from '../../../common/export/export-response';
import type { Page } from '../../../common/pagination/paginate';
import {
  ApiErrorResponses,
  ApiZodBody,
  ApiZodQuery,
  ApiZodResponse,
} from '../../../common/swagger/zod-openapi';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { CaixasService } from './caixas.service';

const ENTITY = 'Caixa';

/** Tela Caixas (`/caixas`). */
@ApiTags('Financeiro: Caixas')
@Controller('financeiro/caixas')
export class CaixasController {
  constructor(private readonly caixas: CaixasService) {}

  @Get()
  @RequirePermission('financeiro.caixas.ver')
  @ApiOperation({ summary: 'Lista paginada, com busca, filtro de status e ordenação' })
  @ApiZodQuery(listCaixasQuerySchema)
  @ApiZodResponse(200, caixaPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listCaixasQuerySchema)) query: ListCaixasQuery,
  ): Promise<Page<Caixa>> {
    return this.caixas.list(query);
  }

  // Antes de qualquer rota com parâmetro para "export" não ser tratado como id.
  @Get('export')
  @RequirePermission('financeiro.caixas.exportar')
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({
    summary: 'Exporta em Excel ou PDF com os mesmos filtros e ordenação da listagem',
  })
  @ApiZodQuery(exportCaixasQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
    'text/csv',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportCaixasQuerySchema)) query: ExportCaixasQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.caixas.export(query));
  }

  @Post()
  @RequirePermission('financeiro.caixas.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Abre um caixa (Abrir Caixa) para o usuário autenticado' })
  @ApiZodBody(abrirCaixaSchema)
  @ApiZodResponse(201, caixaSchema)
  @ApiErrorResponses(400, 401, 403, 409)
  abrir(@Body(new ZodValidationPipe(abrirCaixaSchema)) body: AbrirCaixaInput): Promise<Caixa> {
    return this.caixas.abrir(body);
  }
}
