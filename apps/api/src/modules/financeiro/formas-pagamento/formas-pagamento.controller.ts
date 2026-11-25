import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  createFormaPagamentoSchema,
  exportFormasPagamentoQuerySchema,
  formaPagamentoPageSchema,
  formaPagamentoSchema,
  listFormasPagamentoQuerySchema,
  updateFormaPagamentoSchema,
  type CreateFormaPagamentoInput,
  type ExportFormasPagamentoQuery,
  type ListFormasPagamentoQuery,
  type UpdateFormaPagamentoInput,
} from '@torres/shared';
import type { FormaPagamento } from '../../../generated/prisma/client';
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
import { IdParam } from '../../../common/validation/id-param.decorator';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { FormasPagamentoService } from './formas-pagamento.service';

const ENTITY = 'FormaPagamento';

/** Tela Formas de Pagamento (`/formas-pgto`), aba Formas de Pagamento. */
@ApiTags('Financeiro: Formas de Pagamento')
@Controller('financeiro/formas-pagamento')
export class FormasPagamentoController {
  constructor(private readonly formas: FormasPagamentoService) {}

  @Get()
  @RequirePermission('financeiro.formas-pagamento.ver')
  @ApiOperation({ summary: 'Lista paginada, com busca, filtros e ordenação' })
  @ApiZodQuery(listFormasPagamentoQuerySchema)
  @ApiZodResponse(200, formaPagamentoPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listFormasPagamentoQuerySchema)) query: ListFormasPagamentoQuery,
  ): Promise<Page<FormaPagamento>> {
    return this.formas.list(query);
  }

  // Antes de ":id" para "export" não ser tratado como id.
  @Get('export')
  @RequirePermission('financeiro.formas-pagamento.exportar')
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({
    summary: 'Exporta em Excel ou PDF com os mesmos filtros e ordenação da listagem',
  })
  @ApiZodQuery(exportFormasPagamentoQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
    'text/csv',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportFormasPagamentoQuerySchema))
    query: ExportFormasPagamentoQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.formas.export(query));
  }

  @Get(':id')
  @RequirePermission('financeiro.formas-pagamento.ver')
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, formaPagamentoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<FormaPagamento> {
    return this.formas.findById(id);
  }

  @Post()
  @RequirePermission('financeiro.formas-pagamento.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria (Nova Forma de Pagamento)' })
  @ApiZodBody(createFormaPagamentoSchema)
  @ApiZodResponse(201, formaPagamentoSchema)
  @ApiErrorResponses(400, 401, 403)
  create(
    @Body(new ZodValidationPipe(createFormaPagamentoSchema)) body: CreateFormaPagamentoInput,
  ): Promise<FormaPagamento> {
    return this.formas.create(body);
  }

  @Patch(':id')
  @RequirePermission('financeiro.formas-pagamento.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera (Editar Forma de Pagamento e Ativar/Desativar com `ativo`)' })
  @ApiZodBody(updateFormaPagamentoSchema)
  @ApiZodResponse(200, formaPagamentoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateFormaPagamentoSchema)) body: UpdateFormaPagamentoInput,
  ): Promise<FormaPagamento> {
    return this.formas.update(id, body);
  }

  @Delete(':id')
  @RequirePermission('financeiro.formas-pagamento.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (exclusão lógica)' })
  @ApiZodResponse(200, formaPagamentoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<FormaPagamento> {
    return this.formas.remove(id);
  }
}
