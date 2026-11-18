import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  lancamentoConciliacaoPageSchema,
  listLancamentosConciliacaoQuerySchema,
  resumoConciliacaoQuerySchema,
  resumoConciliacaoSchema,
  type LancamentoConciliacao,
  type ListLancamentosConciliacaoQuery,
  type ResumoConciliacao,
  type ResumoConciliacaoQuery,
} from '@torres/shared';
import { RequirePermission } from '../../../common/auth/auth.decorators';
import type { Page } from '../../../common/pagination/paginate';
import {
  ApiErrorResponses,
  ApiZodQuery,
  ApiZodResponse,
} from '../../../common/swagger/zod-openapi';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { ConciliacaoService } from './conciliacao.service';

/** Tela Conciliação (`/conciliacao`, #46), aba "Bancaria". */
@ApiTags('Financeiro: Conciliação')
@Controller('financeiro/conciliacao')
export class ConciliacaoController {
  constructor(private readonly conciliacao: ConciliacaoService) {}

  @Get('lancamentos')
  @RequirePermission('financeiro.conciliacao.ver')
  @ApiOperation({
    summary:
      'Lançamentos do Sistema (A Pagar ou A Receber) no período, com filtro de conta bancária',
  })
  @ApiZodQuery(listLancamentosConciliacaoQuerySchema)
  @ApiZodResponse(200, lancamentoConciliacaoPageSchema)
  @ApiErrorResponses(400, 401, 403)
  lancamentos(
    @Query(new ZodValidationPipe(listLancamentosConciliacaoQuerySchema))
    query: ListLancamentosConciliacaoQuery,
  ): Promise<Page<LancamentoConciliacao>> {
    return this.conciliacao.lancamentos(query);
  }

  @Get('resumo')
  @RequirePermission('financeiro.conciliacao.ver')
  @ApiOperation({ summary: 'Card "Saldo Sistema": recebido, pago e saldo do período' })
  @ApiZodQuery(resumoConciliacaoQuerySchema)
  @ApiZodResponse(200, resumoConciliacaoSchema)
  @ApiErrorResponses(400, 401, 403)
  resumo(
    @Query(new ZodValidationPipe(resumoConciliacaoQuerySchema)) query: ResumoConciliacaoQuery,
  ): Promise<ResumoConciliacao> {
    return this.conciliacao.resumo(query);
  }
}
