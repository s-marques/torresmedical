import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ativarMensagemAutomaticaSchema,
  campanhaInputSchema,
  campanhaPageSchema,
  campanhaSchema,
  destinatarioPageSchema,
  destinatariosQuerySchema,
  listCampanhasQuerySchema,
  mensagemAutomaticaInputSchema,
  mensagemAutomaticaListaSchema,
  mensagemAutomaticaSchema,
  resumoCampanhasSchema,
  type AtivarMensagemAutomaticaInput,
  type Campanha,
  type CampanhaInput,
  type Destinatario,
  type DestinatariosQuery,
  type ListCampanhasQuery,
  type MensagemAutomatica,
  type MensagemAutomaticaInput,
  type ResumoCampanhas,
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
import { CampanhasService } from './campanhas.service';
import { DestinatariosService } from './destinatarios.service';
import { MensagensAutomaticasService } from './mensagens-automaticas.service';

const VER = 'comercial-atendimento.campanhas.ver';
const CRIAR = 'comercial-atendimento.campanhas.criar';
const EDITAR = 'comercial-atendimento.campanhas.editar';
const EXCLUIR = 'comercial-atendimento.campanhas.excluir';

/** Tela Campanhas (`/campanhas`), aba Envios Agendados e cartões da aba Relatórios. */
@ApiTags('Comercial / Atendimento: Campanhas')
@Controller('comercial-atendimento/campanhas')
export class CampanhasController {
  constructor(
    private readonly campanhas: CampanhasService,
    private readonly destinatarios: DestinatariosService,
  ) {}

  @Get()
  @RequirePermission(VER)
  @ApiOperation({ summary: 'Lista paginada (cartões e Histórico de Campanhas)' })
  @ApiZodQuery(listCampanhasQuerySchema)
  @ApiZodResponse(200, campanhaPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listCampanhasQuerySchema)) query: ListCampanhasQuery,
  ): Promise<Page<Campanha>> {
    return this.campanhas.list(query);
  }

  @Get('resumo')
  @RequirePermission(VER)
  @ApiOperation({ summary: 'Cartões da aba Relatórios' })
  @ApiZodResponse(200, resumoCampanhasSchema)
  @ApiErrorResponses(401, 403)
  resumo(): Promise<ResumoCampanhas> {
    return this.campanhas.resumo();
  }

  @Get('destinatarios')
  @RequirePermission(VER)
  @ApiOperation({
    summary: 'Visualizar Clientes: quem o filtro alcança (nome e telefone mascarado)',
  })
  @ApiZodQuery(destinatariosQuerySchema)
  @ApiZodResponse(200, destinatarioPageSchema)
  @ApiErrorResponses(400, 401, 403)
  destinatariosDoFiltro(
    @Query(new ZodValidationPipe(destinatariosQuerySchema)) query: DestinatariosQuery,
  ): Promise<Page<Destinatario>> {
    return this.destinatarios.listar(query);
  }

  @Get(':id')
  @RequirePermission(VER)
  @ApiOperation({ summary: 'Detalhe da campanha' })
  @ApiZodResponse(200, campanhaSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<Campanha> {
    return this.campanhas.findById(id);
  }

  @Post()
  @RequirePermission(CRIAR)
  @Audit({ entity: 'Campanha' })
  @ApiOperation({ summary: 'Cria (Nova Campanha). Sem data e hora, sai no próximo minuto' })
  @ApiZodBody(campanhaInputSchema)
  @ApiZodResponse(201, campanhaSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  create(@Body(new ZodValidationPipe(campanhaInputSchema)) body: CampanhaInput): Promise<Campanha> {
    return this.campanhas.create(body);
  }

  @Patch(':id')
  @RequirePermission(EDITAR)
  @Audit({ entity: 'Campanha' })
  @ApiOperation({ summary: 'Altera a campanha ainda agendada' })
  @ApiZodBody(campanhaInputSchema)
  @ApiZodResponse(200, campanhaSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(campanhaInputSchema)) body: CampanhaInput,
  ): Promise<Campanha> {
    return this.campanhas.update(id, body);
  }

  @Patch(':id/cancelar')
  @RequirePermission(EDITAR)
  @Audit({ entity: 'Campanha' })
  @ApiOperation({ summary: 'Cancela a campanha agendada ou em envio' })
  @ApiZodResponse(200, campanhaSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  cancelar(@IdParam() id: string): Promise<Campanha> {
    return this.campanhas.cancelar(id);
  }

  @Delete(':id')
  @RequirePermission(EXCLUIR)
  @HttpCode(200)
  @Audit({ entity: 'Campanha' })
  @ApiOperation({ summary: 'Exclui (exclusão lógica). Em envio, cancele antes' })
  @ApiZodResponse(200, campanhaSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  remove(@IdParam() id: string): Promise<Campanha> {
    return this.campanhas.remove(id);
  }
}

/** Tela Campanhas, aba Mensagens Automáticas. */
@ApiTags('Comercial / Atendimento: Campanhas')
@Controller('comercial-atendimento/mensagens-automaticas')
export class MensagensAutomaticasController {
  constructor(private readonly automacoes: MensagensAutomaticasService) {}

  @Get()
  @RequirePermission(VER)
  @ApiOperation({ summary: 'Todas as mensagens automáticas' })
  @ApiZodResponse(200, mensagemAutomaticaListaSchema)
  @ApiErrorResponses(401, 403)
  list(): Promise<MensagemAutomatica[]> {
    return this.automacoes.list();
  }

  @Get(':id')
  @RequirePermission(VER)
  @ApiOperation({ summary: 'Detalhe da mensagem automática' })
  @ApiZodResponse(200, mensagemAutomaticaSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<MensagemAutomatica> {
    return this.automacoes.findById(id);
  }

  @Post()
  @RequirePermission(CRIAR)
  @Audit({ entity: 'MensagemAutomatica' })
  @ApiOperation({ summary: 'Cria (Nova Automação)' })
  @ApiZodBody(mensagemAutomaticaInputSchema)
  @ApiZodResponse(201, mensagemAutomaticaSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  create(
    @Body(new ZodValidationPipe(mensagemAutomaticaInputSchema)) body: MensagemAutomaticaInput,
  ): Promise<MensagemAutomatica> {
    return this.automacoes.create(body);
  }

  @Patch(':id')
  @RequirePermission(EDITAR)
  @Audit({ entity: 'MensagemAutomatica' })
  @ApiOperation({ summary: 'Altera (Editar)' })
  @ApiZodBody(mensagemAutomaticaInputSchema)
  @ApiZodResponse(200, mensagemAutomaticaSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(mensagemAutomaticaInputSchema)) body: MensagemAutomaticaInput,
  ): Promise<MensagemAutomatica> {
    return this.automacoes.update(id, body);
  }

  @Patch(':id/ativa')
  @RequirePermission(EDITAR)
  @Audit({ entity: 'MensagemAutomatica' })
  @ApiOperation({ summary: 'Ativa ou desativa (switch do cartão)' })
  @ApiZodBody(ativarMensagemAutomaticaSchema)
  @ApiZodResponse(200, mensagemAutomaticaSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  alterarAtiva(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(ativarMensagemAutomaticaSchema))
    body: AtivarMensagemAutomaticaInput,
  ): Promise<MensagemAutomatica> {
    return this.automacoes.alterarAtiva(id, body);
  }

  @Delete(':id')
  @RequirePermission(EXCLUIR)
  @HttpCode(200)
  @Audit({ entity: 'MensagemAutomatica' })
  @ApiOperation({ summary: 'Exclui (exclusão lógica)' })
  @ApiZodResponse(200, mensagemAutomaticaSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<MensagemAutomatica> {
    return this.automacoes.remove(id);
  }
}
