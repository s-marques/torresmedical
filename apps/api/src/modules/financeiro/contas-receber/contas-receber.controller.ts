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
import { z } from 'zod';
import {
  cancelarSemReagendamentoSchema,
  baixarContaReceberSchema,
  contaReceberBaixaSchema,
  contaReceberPageSchema,
  contaReceberSchema,
  createContaReceberSchema,
  exportContasReceberQuerySchema,
  listContasReceberQuerySchema,
  renegociarContaReceberSchema,
  updateContaReceberSchema,
  type CancelarSemReagendamentoInput,
  type BaixarContaReceberInput,
  type ContaReceber,
  type ContaReceberBaixa,
  type CreateContaReceberInput,
  type ExportContasReceberQuery,
  type ListContasReceberQuery,
  type RenegociarContaReceberInput,
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
      'Lista paginada, com busca, status (Todos/A vencer/Vencido/Pago/Parcial/Renegociado/Cancelado), período de vencimento e ordenação',
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

  @Get(':id/baixas')
  @RequirePermission('financeiro.contas-receber.ver')
  @ApiOperation({ summary: 'Histórico de baixas (recebimentos) da conta' })
  @ApiZodResponse(200, z.array(contaReceberBaixaSchema))
  @ApiErrorResponses(400, 401, 403, 404)
  listBaixas(@IdParam() id: string): Promise<ContaReceberBaixa[]> {
    return this.contasReceber.listBaixas(id);
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

  @Post(':id/baixar')
  @RequirePermission('financeiro.contas-receber.editar')
  @HttpCode(200)
  @Audit({ entity: ENTITY, action: 'UPDATE' })
  @ApiOperation({ summary: 'Registra um recebimento (Baixar Conta a Receber), total ou parcial' })
  @ApiZodBody(baixarContaReceberSchema)
  @ApiZodResponse(200, contaReceberSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  baixar(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(baixarContaReceberSchema)) body: BaixarContaReceberInput,
  ): Promise<ContaReceber> {
    return this.contasReceber.baixar(id, body);
  }

  @Post(':id/cancelar-baixa')
  @RequirePermission('financeiro.contas-receber.editar')
  @HttpCode(200)
  @Audit({ entity: ENTITY, action: 'UPDATE' })
  @ApiOperation({ summary: 'Cancela a baixa (recebimento) mais recente' })
  @ApiZodResponse(200, contaReceberSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  cancelarBaixa(@IdParam() id: string): Promise<ContaReceber> {
    return this.contasReceber.cancelarBaixa(id);
  }

  @Post(':id/renegociar')
  @RequirePermission('financeiro.contas-receber.editar')
  @HttpCode(200)
  @Audit({ entity: ENTITY, action: 'UPDATE' })
  @ApiOperation({
    summary:
      'Renegocia o saldo em aberto: o título vira Renegociado e gera novos títulos ligados a ele',
  })
  @ApiZodBody(renegociarContaReceberSchema)
  @ApiZodResponse(200, contaReceberSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  renegociar(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(renegociarContaReceberSchema)) body: RenegociarContaReceberInput,
  ): Promise<ContaReceber> {
    return this.contasReceber.renegociar(id, body);
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
