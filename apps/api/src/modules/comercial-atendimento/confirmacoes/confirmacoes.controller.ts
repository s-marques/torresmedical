import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  confirmacaoConfigInputSchema,
  confirmacaoConfigSchema,
  confirmacaoHistoricoPageSchema,
  confirmacaoModeloInputSchema,
  confirmacaoModeloListaSchema,
  confirmacaoModeloSchema,
  confirmacaoPageSchema,
  confirmacaoSchema,
  exportConfirmacoesQuerySchema,
  listConfirmacoesQuerySchema,
  listHistoricoConfirmacoesQuerySchema,
  resumoConfirmacoesQuerySchema,
  resumoConfirmacoesSchema,
  type Confirmacao,
  type ConfirmacaoConfig,
  type ConfirmacaoConfigInput,
  type ConfirmacaoHistorico,
  type ConfirmacaoModelo,
  type ConfirmacaoModeloInput,
  type ExportConfirmacoesQuery,
  type ListConfirmacoesQuery,
  type ListHistoricoConfirmacoesQuery,
  type ResumoConfirmacoes,
  type ResumoConfirmacoesQuery,
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
import { ConfirmacoesConfigService } from './confirmacoes-config.service';
import { ConfirmacoesService } from './confirmacoes.service';

const PERMISSAO = 'comercial-atendimento.confirmacoes';

/** Tela Confirmações (`/confirmacoes`): abas Pendentes, Histórico e Modelos e Config. */
@ApiTags('Comercial / Atendimento: Confirmações')
@Controller('comercial-atendimento/confirmacoes')
export class ConfirmacoesController {
  constructor(
    private readonly confirmacoes: ConfirmacoesService,
    private readonly config: ConfirmacoesConfigService,
  ) {}

  @Get()
  @RequirePermission(`${PERMISSAO}.ver`)
  @ApiOperation({ summary: 'Aba Pendentes: agendamentos do dia, com busca, ordenação e paginação' })
  @ApiZodQuery(listConfirmacoesQuerySchema)
  @ApiZodResponse(200, confirmacaoPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listConfirmacoesQuerySchema)) query: ListConfirmacoesQuery,
  ): Promise<Page<Confirmacao>> {
    return this.confirmacoes.list(query);
  }

  // Rotas fixas antes de ":id" para não serem lidas como id.
  @Get('resumo')
  @RequirePermission(`${PERMISSAO}.ver`)
  @ApiOperation({ summary: 'Cartões: Pendentes e MSG1/MSG2/MSG3 enviadas' })
  @ApiZodQuery(resumoConfirmacoesQuerySchema)
  @ApiZodResponse(200, resumoConfirmacoesSchema)
  @ApiErrorResponses(400, 401, 403)
  resumo(
    @Query(new ZodValidationPipe(resumoConfirmacoesQuerySchema)) query: ResumoConfirmacoesQuery,
  ): Promise<ResumoConfirmacoes> {
    return this.confirmacoes.resumo(query);
  }

  @Get('export')
  @RequirePermission(`${PERMISSAO}.exportar`)
  @Audit({ entity: 'Confirmacao', action: 'EXPORT' })
  @ApiOperation({ summary: 'Exporta em Excel ou PDF com os mesmos filtros e ordenação do grid' })
  @ApiZodQuery(exportConfirmacoesQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
    'text/csv',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportConfirmacoesQuerySchema)) query: ExportConfirmacoesQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.confirmacoes.export(query));
  }

  @Get('historico')
  @RequirePermission(`${PERMISSAO}.ver`)
  @ApiOperation({ summary: 'Aba Histórico: envios de confirmação, do mais recente ao mais antigo' })
  @ApiZodQuery(listHistoricoConfirmacoesQuerySchema)
  @ApiZodResponse(200, confirmacaoHistoricoPageSchema)
  @ApiErrorResponses(400, 401, 403)
  historico(
    @Query(new ZodValidationPipe(listHistoricoConfirmacoesQuerySchema))
    query: ListHistoricoConfirmacoesQuery,
  ): Promise<Page<ConfirmacaoHistorico>> {
    return this.confirmacoes.historico(query);
  }

  // ---------- Modelos e Config ----------

  @Get('configuracao')
  @RequirePermission(`${PERMISSAO}.ver`)
  @ApiOperation({ summary: 'Configuração Geral (padrões do legado enquanto nada foi salvo)' })
  @ApiZodResponse(200, confirmacaoConfigSchema)
  @ApiErrorResponses(401, 403)
  configuracao(): Promise<ConfirmacaoConfig> {
    return this.config.configuracao();
  }

  @Put('configuracao')
  @RequirePermission(`${PERMISSAO}.editar`)
  @ApiOperation({ summary: 'Salva a Configuração Geral' })
  @ApiZodBody(confirmacaoConfigInputSchema)
  @ApiZodResponse(200, confirmacaoConfigSchema)
  @ApiErrorResponses(400, 401, 403)
  salvarConfiguracao(
    @Body(new ZodValidationPipe(confirmacaoConfigInputSchema)) body: ConfirmacaoConfigInput,
  ): Promise<ConfirmacaoConfig> {
    return this.config.salvarConfiguracao(body);
  }

  @Get('modelos')
  @RequirePermission(`${PERMISSAO}.ver`)
  @ApiOperation({ summary: 'Modelos de Mensagem por Tipo' })
  @ApiZodResponse(200, confirmacaoModeloListaSchema)
  @ApiErrorResponses(401, 403)
  modelos(): Promise<ConfirmacaoModelo[]> {
    return this.config.listarModelos();
  }

  @Post('modelos')
  @RequirePermission(`${PERMISSAO}.criar`)
  @Audit({ entity: 'ModeloConfirmacao' })
  @ApiOperation({ summary: 'Novo Modelo' })
  @ApiZodBody(confirmacaoModeloInputSchema)
  @ApiZodResponse(201, confirmacaoModeloSchema)
  @ApiErrorResponses(400, 401, 403)
  criarModelo(
    @Body(new ZodValidationPipe(confirmacaoModeloInputSchema)) body: ConfirmacaoModeloInput,
  ): Promise<ConfirmacaoModelo> {
    return this.config.criarModelo(body);
  }

  @Get('modelos/:id')
  @RequirePermission(`${PERMISSAO}.ver`)
  @ApiOperation({ summary: 'Detalhe do modelo' })
  @ApiZodResponse(200, confirmacaoModeloSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  modelo(@IdParam() id: string): Promise<ConfirmacaoModelo> {
    return this.config.modelo(id);
  }

  @Patch('modelos/:id')
  @RequirePermission(`${PERMISSAO}.editar`)
  @Audit({ entity: 'ModeloConfirmacao' })
  @ApiOperation({ summary: 'Editar modelo' })
  @ApiZodBody(confirmacaoModeloInputSchema)
  @ApiZodResponse(200, confirmacaoModeloSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  alterarModelo(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(confirmacaoModeloInputSchema)) body: ConfirmacaoModeloInput,
  ): Promise<ConfirmacaoModelo> {
    return this.config.alterarModelo(id, body);
  }

  @Delete('modelos/:id')
  @RequirePermission(`${PERMISSAO}.excluir`)
  @HttpCode(200)
  @Audit({ entity: 'ModeloConfirmacao' })
  @ApiOperation({ summary: 'Excluir modelo (exclusão lógica; o tipo volta ao texto padrão)' })
  @ApiZodResponse(200, confirmacaoModeloSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  removerModelo(@IdParam() id: string): Promise<ConfirmacaoModelo> {
    return this.config.removerModelo(id);
  }

  // ---------- Ações da linha ----------

  @Post(':id/enviar')
  @RequirePermission(`${PERMISSAO}.editar`)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Enviar confirmacao: manda a próxima mensagem (MSG1→MSG3) que ainda não saiu',
  })
  @ApiZodResponse(200, confirmacaoSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  enviar(@IdParam() id: string): Promise<Confirmacao> {
    return this.confirmacoes.enviar(id);
  }

  @Post(':id/confirmar')
  @RequirePermission(`${PERMISSAO}.editar`)
  @HttpCode(200)
  @Audit({ entity: 'Agendamento', action: 'UPDATE' })
  @ApiOperation({ summary: 'Confirmar: o agendamento passa para Confirmado' })
  @ApiZodResponse(200, confirmacaoSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  confirmar(@IdParam() id: string): Promise<Confirmacao> {
    return this.confirmacoes.responder(id, 'CONFIRMAR');
  }

  @Post(':id/cancelar')
  @RequirePermission(`${PERMISSAO}.editar`)
  @HttpCode(200)
  @Audit({ entity: 'Agendamento', action: 'UPDATE' })
  @ApiOperation({ summary: 'Cancelar: o agendamento passa para Cancelado e libera o horário' })
  @ApiZodResponse(200, confirmacaoSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  cancelar(@IdParam() id: string): Promise<Confirmacao> {
    return this.confirmacoes.responder(id, 'CANCELAR');
  }
}
