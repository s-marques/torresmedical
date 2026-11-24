import { Body, Controller, Get, HttpCode, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  classificacaoHistoricoPageSchema,
  estrategicoInputSchema,
  listClassificacoesQuerySchema,
  profissionalSchema,
  recalculoClassificacaoSchema,
  type ClassificacaoHistorico,
  type EstrategicoInput,
  type ListClassificacoesQuery,
  type Profissional,
  type RecalculoClassificacao,
} from '@torres/shared';
import { Audit } from '../../../common/audit/audit.decorator';
import { RequirePermission } from '../../../common/auth/auth.decorators';
import type { Page } from '../../../common/pagination/paginate';
import {
  ApiErrorResponses,
  ApiZodBody,
  ApiZodQuery,
  ApiZodResponse,
} from '../../../common/swagger/zod-openapi';
import { IdParam } from '../../../common/validation/id-param.decorator';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { ProfissionaisClassificacaoService } from './profissionais-classificacao.service';

/** Classificação automática do parceiro (issue #143): histórico, "Estratégico" e recálculo. */
@ApiTags('Gestão Profissionais: Classificação do parceiro')
@Controller('gestao-profissionais/profissionais')
export class ProfissionaisClassificacaoController {
  constructor(private readonly classificacao: ProfissionaisClassificacaoService) {}

  @Get(':id/classificacoes')
  @RequirePermission('gestao-profissionais.profissionais.ver')
  @ApiOperation({ summary: 'Histórico das mudanças de classificação do profissional' })
  @ApiZodQuery(listClassificacoesQuerySchema)
  @ApiZodResponse(200, classificacaoHistoricoPageSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  historico(
    @IdParam() id: string,
    @Query(new ZodValidationPipe(listClassificacoesQuerySchema)) query: ListClassificacoesQuery,
  ): Promise<Page<ClassificacaoHistorico>> {
    return this.classificacao.historico(id, query);
  }

  @Put(':id/estrategico')
  @RequirePermission('gestao-profissionais.profissionais.editar')
  @Audit({ entity: 'Profissional' })
  @ApiOperation({
    summary: 'Marca ou desmarca o parceiro estratégico e reclassifica na hora',
    description: 'A marcação vale sobre as demais classes, menos "Inativo".',
  })
  @ApiZodBody(estrategicoInputSchema)
  @ApiZodResponse(200, profissionalSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  definirEstrategico(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(estrategicoInputSchema)) body: EstrategicoInput,
  ): Promise<Profissional> {
    return this.classificacao.definirEstrategico(id, body.estrategico);
  }

  @Post('classificacao/recalcular')
  @HttpCode(200)
  @RequirePermission('gestao-profissionais.profissionais.editar')
  @ApiOperation({
    summary: 'Recalcula a classificação de todos os profissionais (o cálculo diário, sob demanda)',
    description: 'Só a administração (visão da clínica toda). Cada mudança entra no histórico.',
  })
  @ApiZodResponse(200, recalculoClassificacaoSchema)
  @ApiErrorResponses(401, 403)
  recalcular(): Promise<RecalculoClassificacao> {
    return this.classificacao.recalcular();
  }
}
