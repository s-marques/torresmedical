import { Body, Controller, Delete, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  contaBancariaListaSchema,
  contaBancariaSchema,
  createContaBancariaSchema,
  listContasBancariasQuerySchema,
  type ContaBancaria,
  type CreateContaBancariaInput,
  type ListContasBancariasQuery,
} from '@torres/shared';
import { Audit } from '../../../common/audit/audit.decorator';
import { RequirePermission } from '../../../common/auth/auth.decorators';
import {
  ApiErrorResponses,
  ApiZodBody,
  ApiZodQuery,
  ApiZodResponse,
} from '../../../common/swagger/zod-openapi';
import { IdParam } from '../../../common/validation/id-param.decorator';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { ContasBancariasService } from './contas-bancarias.service';

const ENTITY = 'ContaBancaria';

/**
 * Contas bancárias: aba "Contas Bancárias" da Conciliação (`/conciliacao`, #46) e comboboxes
 * "Conta Bancária" da Baixa (Contas a Pagar) e do recebimento (Contas a Receber).
 */
@ApiTags('Financeiro: Contas Bancárias')
@Controller('financeiro/contas-bancarias')
export class ContasBancariasController {
  constructor(private readonly contasBancarias: ContasBancariasService) {}

  @Get()
  @RequirePermission(
    'financeiro.conciliacao.ver',
    'financeiro.contas-pagar.ver',
    'financeiro.contas-receber.ver',
  )
  @ApiOperation({
    summary: 'Lista as contas bancárias ativas com o saldo (sem paginação), com busca',
  })
  @ApiZodQuery(listContasBancariasQuerySchema)
  @ApiZodResponse(200, contaBancariaListaSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listContasBancariasQuerySchema)) query: ListContasBancariasQuery,
  ): Promise<{ data: ContaBancaria[]; total: number }> {
    return this.contasBancarias.list(query);
  }

  @Post()
  @RequirePermission('financeiro.conciliacao.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria (Nova Conta)' })
  @ApiZodBody(createContaBancariaSchema)
  @ApiZodResponse(201, contaBancariaSchema)
  @ApiErrorResponses(400, 401, 403)
  create(
    @Body(new ZodValidationPipe(createContaBancariaSchema)) body: CreateContaBancariaInput,
  ): Promise<ContaBancaria> {
    return this.contasBancarias.create(body);
  }

  @Delete(':id')
  @RequirePermission('financeiro.conciliacao.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (exclusão lógica)' })
  @ApiZodResponse(200, contaBancariaSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<ContaBancaria> {
    return this.contasBancarias.remove(id);
  }
}
