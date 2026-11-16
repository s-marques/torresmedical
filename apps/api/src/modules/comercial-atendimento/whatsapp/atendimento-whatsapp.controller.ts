import { Body, Controller, Delete, Get, HttpCode, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  conversaWhatsappDetalheSchema,
  enviarMensagemWhatsappSchema,
  listMensagensWhatsappQuerySchema,
  mensagemWhatsappPageSchema,
  mensagemWhatsappSchema,
  transferirConversaWhatsappSchema,
  type EnviarMensagemWhatsappInput,
  type ListMensagensWhatsappQuery,
  type TransferirConversaWhatsappInput,
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
import {
  AtendimentoWhatsappService,
  type ConversaWhatsappDetalheDto,
  type MensagemWhatsappDto,
} from './atendimento-whatsapp.service';

const ATUALIZA_CONVERSA = { entity: 'ConversaWhatsapp', action: 'UPDATE' } as const;

/** Painel da conversa aberta na tela WhatsApp (`/atendimento`). */
@ApiTags('Comercial / Atendimento: WhatsApp')
@Controller('comercial-atendimento/conversas-whatsapp')
export class AtendimentoWhatsappController {
  constructor(private readonly atendimento: AtendimentoWhatsappService) {}

  @Get(':id')
  @RequirePermission('comercial-atendimento.whatsapp.ver')
  @ApiOperation({ summary: 'Conversa aberta: contato, canal, atendente, anúncio e tags' })
  @ApiZodResponse(200, conversaWhatsappDetalheSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  detalhe(@IdParam() id: string): Promise<ConversaWhatsappDetalheDto> {
    return this.atendimento.detalhe(id);
  }

  @Get(':id/mensagens')
  @RequirePermission('comercial-atendimento.whatsapp.ver')
  @ApiOperation({ summary: 'Mensagens da conversa, as mais recentes primeiro' })
  @ApiZodQuery(listMensagensWhatsappQuerySchema)
  @ApiZodResponse(200, mensagemWhatsappPageSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  mensagens(
    @IdParam() id: string,
    @Query(new ZodValidationPipe(listMensagensWhatsappQuerySchema))
    query: ListMensagensWhatsappQuery,
  ): Promise<Page<MensagemWhatsappDto>> {
    return this.atendimento.mensagens(id, query);
  }

  @Post(':id/mensagens')
  @RequirePermission('comercial-atendimento.whatsapp.criar')
  @Audit({ entity: 'MensagemWhatsapp' })
  @ApiOperation({
    summary:
      'Envia texto: grava a mensagem como Pendente e publica o comando de envio. ' +
      '409 se a conversa não estiver em atendimento',
  })
  @ApiZodBody(enviarMensagemWhatsappSchema)
  @ApiZodResponse(201, mensagemWhatsappSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  enviar(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(enviarMensagemWhatsappSchema)) body: EnviarMensagemWhatsappInput,
  ): Promise<MensagemWhatsappDto> {
    return this.atendimento.enviarMensagem(id, body);
  }

  @Post(':id/assumir')
  @HttpCode(200)
  @RequirePermission('comercial-atendimento.whatsapp.editar')
  @Audit(ATUALIZA_CONVERSA)
  @ApiOperation({ summary: 'Assumir: Aguardando → Em Atendimento, com o usuário como atendente' })
  @ApiZodResponse(200, conversaWhatsappDetalheSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  assumir(@IdParam() id: string): Promise<ConversaWhatsappDetalheDto> {
    return this.atendimento.assumir(id);
  }

  @Post(':id/encerrar')
  @HttpCode(200)
  @RequirePermission('comercial-atendimento.whatsapp.editar')
  @Audit(ATUALIZA_CONVERSA)
  @ApiOperation({ summary: 'Encerrar: Em Atendimento → Finalizada' })
  @ApiZodResponse(200, conversaWhatsappDetalheSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  encerrar(@IdParam() id: string): Promise<ConversaWhatsappDetalheDto> {
    return this.atendimento.encerrar(id);
  }

  @Post(':id/transferir')
  @HttpCode(200)
  @RequirePermission('comercial-atendimento.whatsapp.editar')
  @Audit(ATUALIZA_CONVERSA)
  @ApiOperation({ summary: 'Transferir: passa a conversa em atendimento para outro usuário ativo' })
  @ApiZodBody(transferirConversaWhatsappSchema)
  @ApiZodResponse(200, conversaWhatsappDetalheSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  transferir(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(transferirConversaWhatsappSchema))
    body: TransferirConversaWhatsappInput,
  ): Promise<ConversaWhatsappDetalheDto> {
    return this.atendimento.transferir(id, body);
  }

  @Put(':id/tags/:tagId')
  @RequirePermission('comercial-atendimento.whatsapp.editar')
  @Audit(ATUALIZA_CONVERSA)
  @ApiOperation({ summary: 'Aplica uma tag à conversa (idempotente)' })
  @ApiZodResponse(200, conversaWhatsappDetalheSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  aplicarTag(
    @IdParam() id: string,
    @IdParam('tagId') tagId: string,
  ): Promise<ConversaWhatsappDetalheDto> {
    return this.atendimento.aplicarTag(id, tagId);
  }

  @Delete(':id/tags/:tagId')
  @HttpCode(200)
  @RequirePermission('comercial-atendimento.whatsapp.editar')
  @Audit(ATUALIZA_CONVERSA)
  @ApiOperation({ summary: 'Remove uma tag da conversa (idempotente)' })
  @ApiZodResponse(200, conversaWhatsappDetalheSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  removerTag(
    @IdParam() id: string,
    @IdParam('tagId') tagId: string,
  ): Promise<ConversaWhatsappDetalheDto> {
    return this.atendimento.removerTag(id, tagId);
  }
}
