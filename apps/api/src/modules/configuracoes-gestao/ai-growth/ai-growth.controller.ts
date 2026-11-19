import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  aiGrowthAnaliseSchema,
  aiGrowthPainelSchema,
  type AiGrowthAnalise,
  type AiGrowthPainel,
} from '@torres/shared';
import { Audit } from '../../../common/audit/audit.decorator';
import { RequirePermission } from '../../../common/auth/auth.decorators';
import { ApiErrorResponses, ApiZodResponse } from '../../../common/swagger/zod-openapi';
import { AiGrowthService } from './ai-growth.service';

/** Tela AI Growth (`/ai-growth`). */
@ApiTags('Configurações / Gestão: AI Growth')
@Controller('configuracoes-gestao/ai-growth')
export class AiGrowthController {
  constructor(private readonly aiGrowth: AiGrowthService) {}

  @Get()
  @RequirePermission('configuracoes-gestao.ai-growth.ver')
  @ApiOperation({ summary: 'Insights da última análise concluída e análise em andamento' })
  @ApiZodResponse(200, aiGrowthPainelSchema)
  @ApiErrorResponses(401, 403)
  painel(): Promise<AiGrowthPainel> {
    return this.aiGrowth.painel();
  }

  @Post('analisar')
  @HttpCode(202)
  @RequirePermission('configuracoes-gestao.ai-growth.criar')
  @Audit({ entity: 'AnaliseAiGrowth' })
  @ApiOperation({ summary: '"Analisar Agora": registra o pedido e processa em segundo plano' })
  @ApiZodResponse(202, aiGrowthAnaliseSchema)
  @ApiErrorResponses(401, 403, 409)
  analisar(): Promise<AiGrowthAnalise> {
    return this.aiGrowth.solicitar();
  }
}
