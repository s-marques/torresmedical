import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  contaBancariaListaSchema,
  listContasBancariasQuerySchema,
  type ContaBancaria,
  type ListContasBancariasQuery,
} from '@torres/shared';
import { RequirePermission } from '../../../common/auth/auth.decorators';
import {
  ApiErrorResponses,
  ApiZodQuery,
  ApiZodResponse,
} from '../../../common/swagger/zod-openapi';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { ContasBancariasService } from './contas-bancarias.service';

/** Combobox "Conta Bancária" do modal de Baixa (tela Contas a Pagar, `/pagar`). */
@ApiTags('Financeiro: Contas Bancárias')
@Controller('financeiro/contas-bancarias')
export class ContasBancariasController {
  constructor(private readonly contasBancarias: ContasBancariasService) {}

  @Get()
  @RequirePermission('financeiro.contas-pagar.ver')
  @ApiOperation({ summary: 'Lista as contas bancárias ativas (sem paginação), com busca' })
  @ApiZodQuery(listContasBancariasQuerySchema)
  @ApiZodResponse(200, contaBancariaListaSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listContasBancariasQuerySchema)) query: ListContasBancariasQuery,
  ): Promise<{ data: ContaBancaria[]; total: number }> {
    return this.contasBancarias.list(query);
  }
}
