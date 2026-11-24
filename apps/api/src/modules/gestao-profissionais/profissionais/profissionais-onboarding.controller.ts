import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  listOnboardingQuerySchema,
  onboardingPageSchema,
  onboardingRecepcaoInputSchema,
  onboardingResponseSchema,
  onboardingSchema,
  type ListOnboardingQuery,
  type Onboarding,
  type OnboardingRecepcaoInput,
  type OnboardingResponse,
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
import { ProfissionaisOnboardingService } from './profissionais-onboarding.service';

const PERMISSAO = 'gestao-profissionais.onboarding';

/** Onboarding do profissional (issue #142): lista "em andamento" e checklist de cada um. */
@ApiTags('Gestão Profissionais: Onboarding do profissional')
@Controller('gestao-profissionais')
export class ProfissionaisOnboardingController {
  constructor(private readonly onboarding: ProfissionaisOnboardingService) {}

  @Get('onboarding')
  @RequirePermission(`${PERMISSAO}.ver`)
  @ApiOperation({ summary: 'Onboardings em andamento, com filtro por situação' })
  @ApiZodQuery(listOnboardingQuerySchema)
  @ApiZodResponse(200, onboardingPageSchema)
  @ApiErrorResponses(400, 401, 403)
  listar(
    @Query(new ZodValidationPipe(listOnboardingQuerySchema)) query: ListOnboardingQuery,
  ): Promise<Page<Onboarding>> {
    return this.onboarding.listar(query);
  }

  @Get('profissionais/:id/onboarding')
  @RequirePermission('gestao-profissionais.profissionais.ver')
  @ApiOperation({ summary: 'Checklist do profissional (nulo se não passou por contrato assinado)' })
  @ApiZodResponse(200, onboardingResponseSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  async obter(@IdParam() id: string): Promise<OnboardingResponse> {
    return { onboarding: await this.onboarding.obter(id) };
  }

  // O `:id` é o do onboarding, para o @Audit carregar o `before` pelo registro.
  @Put('onboarding/:id/recepcao')
  @RequirePermission(`${PERMISSAO}.editar`)
  @Audit({ entity: 'ProfissionalOnboarding' })
  @ApiOperation({ summary: 'Marca ou desmarca "Recepção orientada" (única etapa manual)' })
  @ApiZodBody(onboardingRecepcaoInputSchema)
  @ApiZodResponse(200, onboardingSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  definirRecepcao(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(onboardingRecepcaoInputSchema)) body: OnboardingRecepcaoInput,
  ): Promise<Onboarding> {
    return this.onboarding.definirRecepcao(id, body.orientada);
  }
}
