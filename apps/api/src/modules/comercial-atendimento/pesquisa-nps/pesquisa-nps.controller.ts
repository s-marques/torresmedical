import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  listPesquisasNpsQuerySchema,
  pesquisaNpsPageSchema,
  resumoNpsQuerySchema,
  resumoNpsSchema,
  type ListPesquisasNpsQuery,
  type PesquisaNps,
  type ResumoNps,
  type ResumoNpsQuery,
} from '@torres/shared';
import { RequirePermission } from '../../../common/auth/auth.decorators';
import type { Page } from '../../../common/pagination/paginate';
import {
  ApiErrorResponses,
  ApiZodQuery,
  ApiZodResponse,
} from '../../../common/swagger/zod-openapi';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { PesquisaNpsService } from './pesquisa-nps.service';

const PERMISSAO = 'comercial-atendimento.pesquisa-nps';

/** Tela Pesquisa NPS (`/pesquisa-satisfacao`): abas Dashboard e Respostas. */
@ApiTags('Comercial / Atendimento: Pesquisa NPS')
@Controller('comercial-atendimento/pesquisa-nps')
export class PesquisaNpsController {
  constructor(private readonly pesquisas: PesquisaNpsService) {}

  @Get()
  @RequirePermission(`${PERMISSAO}.ver`)
  @ApiOperation({ summary: 'Aba Respostas: pesquisas enviadas no período (De/Até), paginadas' })
  @ApiZodQuery(listPesquisasNpsQuerySchema)
  @ApiZodResponse(200, pesquisaNpsPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listPesquisasNpsQuerySchema)) query: ListPesquisasNpsQuery,
  ): Promise<Page<PesquisaNps>> {
    return this.pesquisas.list(query);
  }

  // Rota fixa: não conflita com a listagem.
  @Get('resumo')
  @RequirePermission(`${PERMISSAO}.ver`)
  @ApiOperation({ summary: 'Aba Dashboard: score NPS, envios e promotores/neutros/detratores' })
  @ApiZodQuery(resumoNpsQuerySchema)
  @ApiZodResponse(200, resumoNpsSchema)
  @ApiErrorResponses(400, 401, 403)
  resumo(
    @Query(new ZodValidationPipe(resumoNpsQuerySchema)) query: ResumoNpsQuery,
  ): Promise<ResumoNps> {
    return this.pesquisas.resumo(query);
  }
}
