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
  baixarContaPagarSchema,
  contaPagarBaixaSchema,
  contaPagarDivergenciaPageSchema,
  contaPagarPageSchema,
  contaPagarSchema,
  createContaPagarSchema,
  exportContasPagarQuerySchema,
  exportDivergenciasContaPagarQuerySchema,
  listContasPagarQuerySchema,
  listDivergenciasContaPagarQuerySchema,
  updateContaPagarSchema,
  verificacaoDuplicidadeContaPagarSchema,
  verificarDuplicidadeContaPagarSchema,
  type BaixarContaPagarInput,
  type ContaPagar,
  type ContaPagarBaixa,
  type ContaPagarDivergencia,
  type CreateContaPagarInput,
  type ExportContasPagarQuery,
  type ExportDivergenciasContaPagarQuery,
  type ListContasPagarQuery,
  type ListDivergenciasContaPagarQuery,
  type UpdateContaPagarInput,
  type VerificacaoDuplicidadeContaPagar,
  type VerificarDuplicidadeContaPagar,
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
import { IdParam } from '../../../common/validation/id-param.decorator';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { ContasPagarDivergenciasService } from './contas-pagar-divergencias.service';
import { ContasPagarDuplicidadeService } from './contas-pagar-duplicidade.service';
import { ContasPagarService } from './contas-pagar.service';

const ENTITY = 'ContaPagar';

/** Tela Contas a Pagar (`/pagar`). */
@ApiTags('Financeiro: Contas a Pagar')
@Controller('financeiro/contas-pagar')
export class ContasPagarController {
  constructor(
    private readonly contasPagar: ContasPagarService,
    private readonly divergencias: ContasPagarDivergenciasService,
    private readonly duplicidade: ContasPagarDuplicidadeService,
  ) {}

  @Get()
  @RequirePermission('financeiro.contas-pagar.ver')
  @ApiOperation({
    summary:
      'Lista paginada, com busca, status (Todos/Pendente/Pago/Vencido), período de vencimento e ordenação',
  })
  @ApiZodQuery(listContasPagarQuerySchema)
  @ApiZodResponse(200, contaPagarPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listContasPagarQuerySchema)) query: ListContasPagarQuery,
  ): Promise<Page<ContaPagar>> {
    return this.contasPagar.list(query);
  }

  // Antes de ":id" para "export" não ser tratado como id.
  @Get('export')
  @RequirePermission('financeiro.contas-pagar.exportar')
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({
    summary: 'Exporta em Excel ou PDF com os mesmos filtros e ordenação da listagem',
  })
  @ApiZodQuery(exportContasPagarQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportContasPagarQuerySchema)) query: ExportContasPagarQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.contasPagar.export(query));
  }

  // Antes de ":id" para "divergencias" não ser tratado como id.
  @Get('divergencias')
  @RequirePermission('financeiro.contas-pagar.ver')
  @ApiOperation({
    summary: 'Relatório de divergências: baixas com valor pago diferente do saldo do título',
  })
  @ApiZodQuery(listDivergenciasContaPagarQuerySchema)
  @ApiZodResponse(200, contaPagarDivergenciaPageSchema)
  @ApiErrorResponses(400, 401, 403)
  listDivergencias(
    @Query(new ZodValidationPipe(listDivergenciasContaPagarQuerySchema))
    query: ListDivergenciasContaPagarQuery,
  ): Promise<Page<ContaPagarDivergencia>> {
    return this.divergencias.list(query);
  }

  @Get('divergencias/export')
  @RequirePermission('financeiro.contas-pagar.exportar')
  @Audit({ entity: 'ContaPagarDivergencia', action: 'EXPORT' })
  @ApiOperation({ summary: 'Exporta o relatório de divergências em Excel ou PDF' })
  @ApiZodQuery(exportDivergenciasContaPagarQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async exportDivergencias(
    @Query(new ZodValidationPipe(exportDivergenciasContaPagarQuerySchema))
    query: ExportDivergenciasContaPagarQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.divergencias.export(query));
  }

  @Post('duplicidade')
  @RequirePermission('financeiro.contas-pagar.criar', 'financeiro.contas-pagar.editar')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Verifica possível duplicidade (mesmo fornecedor, valor e vencimento, ou mesmo documento)',
  })
  @ApiZodBody(verificarDuplicidadeContaPagarSchema)
  @ApiZodResponse(200, verificacaoDuplicidadeContaPagarSchema)
  @ApiErrorResponses(400, 401, 403)
  verificarDuplicidade(
    @Body(new ZodValidationPipe(verificarDuplicidadeContaPagarSchema))
    body: VerificarDuplicidadeContaPagar,
  ): Promise<VerificacaoDuplicidadeContaPagar> {
    return this.duplicidade.verificar(body);
  }

  @Get(':id')
  @RequirePermission('financeiro.contas-pagar.ver')
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, contaPagarSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<ContaPagar> {
    return this.contasPagar.findById(id);
  }

  @Get(':id/baixas')
  @RequirePermission('financeiro.contas-pagar.ver')
  @ApiOperation({ summary: 'Histórico de baixas (pagamentos) da conta' })
  @ApiZodResponse(200, z.array(contaPagarBaixaSchema))
  @ApiErrorResponses(400, 401, 403, 404)
  listBaixas(@IdParam() id: string): Promise<ContaPagarBaixa[]> {
    return this.contasPagar.listBaixas(id);
  }

  @Post()
  @RequirePermission('financeiro.contas-pagar.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria (Nova Conta a Pagar)' })
  @ApiZodBody(createContaPagarSchema)
  @ApiZodResponse(201, contaPagarSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  create(
    @Body(new ZodValidationPipe(createContaPagarSchema)) body: CreateContaPagarInput,
  ): Promise<ContaPagar> {
    return this.contasPagar.create(body);
  }

  @Patch(':id')
  @RequirePermission('financeiro.contas-pagar.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera (Editar Conta a Pagar)' })
  @ApiZodBody(updateContaPagarSchema)
  @ApiZodResponse(200, contaPagarSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateContaPagarSchema)) body: UpdateContaPagarInput,
  ): Promise<ContaPagar> {
    return this.contasPagar.update(id, body);
  }

  @Post(':id/baixar')
  @RequirePermission('financeiro.contas-pagar.editar')
  @HttpCode(200)
  @Audit({ entity: ENTITY, action: 'UPDATE' })
  @ApiOperation({ summary: 'Registra um pagamento (Baixar Conta a Pagar), total ou parcial' })
  @ApiZodBody(baixarContaPagarSchema)
  @ApiZodResponse(200, contaPagarSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  baixar(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(baixarContaPagarSchema)) body: BaixarContaPagarInput,
  ): Promise<ContaPagar> {
    return this.contasPagar.baixar(id, body);
  }

  @Post(':id/cancelar-baixa')
  @RequirePermission('financeiro.contas-pagar.editar')
  @HttpCode(200)
  @Audit({ entity: ENTITY, action: 'UPDATE' })
  @ApiOperation({ summary: 'Cancela a baixa (pagamento) mais recente' })
  @ApiZodResponse(200, contaPagarSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  cancelarBaixa(@IdParam() id: string): Promise<ContaPagar> {
    return this.contasPagar.cancelarBaixa(id);
  }

  @Delete(':id')
  @RequirePermission('financeiro.contas-pagar.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (exclusão lógica)' })
  @ApiZodResponse(200, contaPagarSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<ContaPagar> {
    return this.contasPagar.remove(id);
  }
}
