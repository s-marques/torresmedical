import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  listPesquisasProfissionalQuerySchema,
  pesquisaProfissionalConfigInputSchema,
  pesquisaProfissionalConfigSchema,
  pesquisaProfissionalPageSchema,
  resumoPesquisaProfissionalQuerySchema,
  resumoPesquisaProfissionalSchema,
  type ListPesquisasProfissionalQuery,
  type PesquisaProfissional,
  type PesquisaProfissionalConfig,
  type PesquisaProfissionalConfigInput,
  type ResumoPesquisaProfissional,
  type ResumoPesquisaProfissionalQuery,
} from '@torres/shared';
import { RequirePermission } from '../../../common/auth/auth.decorators';
import type { Page } from '../../../common/pagination/paginate';
import {
  ApiErrorResponses,
  ApiZodBody,
  ApiZodQuery,
  ApiZodResponse,
} from '../../../common/swagger/zod-openapi';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { PesquisaProfissionalConfigService } from './pesquisa-profissional-config.service';
import { PesquisaProfissionalService } from './pesquisa-profissional.service';

const PERMISSAO = 'comercial-atendimento.pesquisa-profissional';

/** Tela Pesquisa do Profissional (`/pesquisa-profissional`): resultados, respostas e configuração. */
@ApiTags('Comercial / Atendimento: Pesquisa do Profissional')
@Controller('comercial-atendimento/pesquisa-profissional')
export class PesquisaProfissionalController {
  constructor(
    private readonly pesquisas: PesquisaProfissionalService,
    private readonly config: PesquisaProfissionalConfigService,
  ) {}

  @Get()
  @RequirePermission(`${PERMISSAO}.ver`)
  @ApiOperation({ summary: 'Respostas: pesquisas enviadas no período (De/Até), paginadas' })
  @ApiZodQuery(listPesquisasProfissionalQuerySchema)
  @ApiZodResponse(200, pesquisaProfissionalPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listPesquisasProfissionalQuerySchema))
    query: ListPesquisasProfissionalQuery,
  ): Promise<Page<PesquisaProfissional>> {
    return this.pesquisas.list(query);
  }

  // Rotas fixas: não conflitam com a listagem.
  @Get('resumo')
  @RequirePermission(`${PERMISSAO}.ver`)
  @ApiOperation({ summary: 'Resultados: NPS dos profissionais, envios e média por categoria' })
  @ApiZodQuery(resumoPesquisaProfissionalQuerySchema)
  @ApiZodResponse(200, resumoPesquisaProfissionalSchema)
  @ApiErrorResponses(400, 401, 403)
  resumo(
    @Query(new ZodValidationPipe(resumoPesquisaProfissionalQuerySchema))
    query: ResumoPesquisaProfissionalQuery,
  ): Promise<ResumoPesquisaProfissional> {
    return this.pesquisas.resumo(query);
  }

  @Get('configuracao')
  @RequirePermission(`${PERMISSAO}.ver`)
  @ApiOperation({ summary: 'Configuração (padrões enquanto nada foi salvo)' })
  @ApiZodResponse(200, pesquisaProfissionalConfigSchema)
  @ApiErrorResponses(401, 403)
  configuracao(): Promise<PesquisaProfissionalConfig> {
    return this.config.configuracao();
  }

  @Put('configuracao')
  @RequirePermission(`${PERMISSAO}.editar`)
  @ApiOperation({ summary: 'Salva a configuração (ativação, periodicidade e mensagem)' })
  @ApiZodBody(pesquisaProfissionalConfigInputSchema)
  @ApiZodResponse(200, pesquisaProfissionalConfigSchema)
  @ApiErrorResponses(400, 401, 403)
  salvarConfiguracao(
    @Body(new ZodValidationPipe(pesquisaProfissionalConfigInputSchema))
    body: PesquisaProfissionalConfigInput,
  ): Promise<PesquisaProfissionalConfig> {
    return this.config.salvar(body);
  }
}
