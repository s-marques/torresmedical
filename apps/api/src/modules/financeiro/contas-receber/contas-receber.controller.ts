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
  cancelarSemReagendamentoSchema,
  contaReceberPageSchema,
  contaReceberSchema,
  createContaReceberSchema,
  exportContasReceberQuerySchema,
  listContasReceberQuerySchema,
  updateContaReceberSchema,
  type CancelarSemReagendamentoInput,
  type ContaReceber,
  type CreateContaReceberInput,
  type ExportContasReceberQuery,
  type ListContasReceberQuery,
  type UpdateContaReceberInput,
} from '@torres/shared';
import { Audit } from '../../../common/audit/audit.decorator';
import { ExportaDadosPessoais, RequirePermission } from '../../../common/auth/auth.decorators';
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
import { ContasReceberService } from './contas-receber.service';

const ENTITY = 'ContaReceber';

/** Tela Contas a Receber (`/receber`). */
@ApiTags('Financeiro: Contas a Receber')
@Controller('financeiro/contas-receber')
export class ContasReceberController {
  constructor(private readonly contasReceber: ContasReceberService) {}

  @Get()
  @RequirePermission('financeiro.contas-receber.ver')
  @ApiOperation({
    summary:
      'Lista paginada, com busca, status (Todos/Pendente/Recebido/Vencido), período de vencimento e ordenação',
  })
  @ApiZodQuery(listContasReceberQuerySchema)
  @ApiZodResponse(200, contaReceberPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listContasReceberQuerySchema)) query: ListContasReceberQuery,
  ): Promise<Page<ContaReceber>> {
    return this.contasReceber.list(query);
  }

  // Antes de ":id" para "export" não ser tratado como id.
  @Get('export')
  @RequirePermission('financeiro.contas-receber.exportar')
  @ExportaDadosPessoais()
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({
    summary: 'Exporta em Excel ou PDF com os mesmos filtros e ordenação da listagem',
  })
  @ApiZodQuery(exportContasReceberQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
    'text/csv',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportContasReceberQuerySchema)) query: ExportContasReceberQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.contasReceber.export(query));
  }

  @Get(':id')
  @RequirePermission('financeiro.contas-receber.ver')
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, contaReceberSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<ContaReceber> {
    return this.contasReceber.findById(id);
  }

  @Post()
  @RequirePermission('financeiro.contas-receber.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria (Nova Conta a Receber)' })
  @ApiZodBody(createContaReceberSchema)
  @ApiZodResponse(201, contaReceberSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  create(
    @Body(new ZodValidationPipe(createContaReceberSchema)) body: CreateContaReceberInput,
  ): Promise<ContaReceber> {
    return this.contasReceber.create(body);
  }

  @Patch(':id')
  @RequirePermission('financeiro.contas-receber.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera (Editar Conta a Receber)' })
  @ApiZodBody(updateContaReceberSchema)
  @ApiZodResponse(200, contaReceberSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateContaReceberSchema)) body: UpdateContaReceberInput,
  ): Promise<ContaReceber> {
    return this.contasReceber.update(id, body);
  }

  @Post(':id/cancelar')
  @RequirePermission('financeiro.contas-receber.editar')
  @HttpCode(200)
  @Audit({ entity: ENTITY, action: 'UPDATE' })
  @ApiOperation({ summary: 'Cancela a conta pendente, com o motivo da lista (issue #162)' })
  @ApiZodBody(cancelarSemReagendamentoSchema)
  @ApiZodResponse(200, contaReceberSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  cancelar(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(cancelarSemReagendamentoSchema))
    body: CancelarSemReagendamentoInput,
  ): Promise<ContaReceber> {
    return this.contasReceber.cancelar(id, body);
  }

  @Delete(':id')
  @RequirePermission('financeiro.contas-receber.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (exclusão lógica)' })
  @ApiZodResponse(200, contaReceberSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<ContaReceber> {
    return this.contasReceber.remove(id);
  }
}
