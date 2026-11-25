import { Body, Controller, Delete, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  adendoInputSchema,
  arquivoLinkSchema,
  assinaturaInputSchema,
  atendimentoAnexoInputSchema,
  atendimentoAnexoListaSchema,
  atendimentoAnexoSchema,
  atendimentoAtualizacaoSchema,
  atendimentoDocumentoInputSchema,
  atendimentoDocumentoListaSchema,
  atendimentoDocumentoSchema,
  atendimentoSchema,
  atendimentoVersaoListaSchema,
  atendimentoVersaoSchema,
  type ArquivoLink,
  type AssinaturaInput,
  type Atendimento,
  type AtendimentoAnexo,
  type AtendimentoAnexoLista,
  type AtendimentoDocumento,
  type AtendimentoDocumentoLista,
  type AtendimentoVersao,
  type AtendimentoVersaoLista,
  type CreateAdendoInput,
  type CreateAtendimentoAnexoInput,
  type CreateAtendimentoDocumentoInput,
  type UpdateAtendimentoInput,
} from '@torres/shared';
import { Audit } from '../../../common/audit/audit.decorator';
import { RequirePermission } from '../../../common/auth/auth.decorators';
import { ApiErrorResponses, ApiZodBody, ApiZodResponse } from '../../../common/swagger/zod-openapi';
import { IdParam } from '../../../common/validation/id-param.decorator';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { AtendimentoAnexosService } from './atendimento-anexos.service';
import { AtendimentoAssinaturaService } from './atendimento-assinatura.service';
import { AtendimentoDocumentosService } from './atendimento-documentos.service';

const BASE = ':pacienteId/atendimentos/:atendimentoId';

/**
 * Exames, anexos, documentos, assinatura e histórico de versões do atendimento (issue #151),
 * na aba "Atendimentos" da tela Prontuários.
 */
@ApiTags('Consultório / Assistencial: Prontuários (atendimento)')
@Controller('consultorio-assistencial/prontuarios')
export class AtendimentoRegistrosController {
  constructor(
    private readonly assinatura: AtendimentoAssinaturaService,
    private readonly anexos: AtendimentoAnexosService,
    private readonly documentos: AtendimentoDocumentosService,
  ) {}

  // --- Edição, assinatura e versões ----------------------------------------------------------

  @Patch(BASE)
  @RequirePermission('consultorio-assistencial.prontuarios.editar')
  @Audit({ entity: 'Atendimento', idParam: 'atendimentoId' })
  @ApiOperation({ summary: 'Corrige o atendimento enquanto não assinado (assinado: 409)' })
  @ApiZodBody(atendimentoAtualizacaoSchema)
  @ApiZodResponse(200, atendimentoSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  atualizar(
    @IdParam('pacienteId') pacienteId: string,
    @IdParam('atendimentoId') atendimentoId: string,
    @Body(new ZodValidationPipe(atendimentoAtualizacaoSchema)) body: UpdateAtendimentoInput,
  ): Promise<Atendimento> {
    return this.assinatura.atualizar(pacienteId, atendimentoId, body);
  }

  @Post(`${BASE}/assinatura`)
  @HttpCode(200)
  @RequirePermission('consultorio-assistencial.prontuarios.assinar')
  @Audit({ entity: 'Atendimento', action: 'UPDATE', idParam: 'atendimentoId' })
  @ApiOperation({
    summary: 'Assina o atendimento com a senha do profissional responsável; depois não é editado',
  })
  @ApiZodBody(assinaturaInputSchema)
  @ApiZodResponse(200, atendimentoSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409, 422)
  assinar(
    @IdParam('pacienteId') pacienteId: string,
    @IdParam('atendimentoId') atendimentoId: string,
    @Body(new ZodValidationPipe(assinaturaInputSchema)) body: AssinaturaInput,
  ): Promise<Atendimento> {
    return this.assinatura.assinar(pacienteId, atendimentoId, body);
  }

  @Post(`${BASE}/adendos`)
  @RequirePermission('consultorio-assistencial.prontuarios.assinar')
  @Audit({ entity: 'AtendimentoVersao' })
  @ApiOperation({ summary: 'Adendo (nova versão) de um atendimento já assinado' })
  @ApiZodBody(adendoInputSchema)
  @ApiZodResponse(201, atendimentoVersaoSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  adendo(
    @IdParam('pacienteId') pacienteId: string,
    @IdParam('atendimentoId') atendimentoId: string,
    @Body(new ZodValidationPipe(adendoInputSchema)) body: CreateAdendoInput,
  ): Promise<AtendimentoVersao> {
    return this.assinatura.adendo(pacienteId, atendimentoId, body);
  }

  @Get(`${BASE}/versoes`)
  @RequirePermission('consultorio-assistencial.prontuarios.ver')
  @ApiOperation({
    summary: 'Histórico de versões: assinatura e adendos (quem, quando, antes/depois)',
  })
  @ApiZodResponse(200, atendimentoVersaoListaSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  versoes(
    @IdParam('pacienteId') pacienteId: string,
    @IdParam('atendimentoId') atendimentoId: string,
  ): Promise<AtendimentoVersaoLista> {
    return this.assinatura.versoes(pacienteId, atendimentoId);
  }

  // --- Exames e anexos -----------------------------------------------------------------------

  @Get(`${BASE}/anexos`)
  @RequirePermission('consultorio-assistencial.prontuarios.ver')
  @ApiOperation({ summary: 'Exames e anexos do atendimento' })
  @ApiZodResponse(200, atendimentoAnexoListaSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  listarAnexos(
    @IdParam('pacienteId') pacienteId: string,
    @IdParam('atendimentoId') atendimentoId: string,
  ): Promise<AtendimentoAnexoLista> {
    return this.anexos.listar(pacienteId, atendimentoId);
  }

  @Post(`${BASE}/anexos`)
  @RequirePermission('consultorio-assistencial.prontuarios.criar')
  @Audit({ entity: 'AtendimentoAnexo' })
  @ApiOperation({ summary: 'Vincula um arquivo já enviado (uso anexo-atendimento) ao atendimento' })
  @ApiZodBody(atendimentoAnexoInputSchema)
  @ApiZodResponse(201, atendimentoAnexoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  criarAnexo(
    @IdParam('pacienteId') pacienteId: string,
    @IdParam('atendimentoId') atendimentoId: string,
    @Body(new ZodValidationPipe(atendimentoAnexoInputSchema)) body: CreateAtendimentoAnexoInput,
  ): Promise<AtendimentoAnexo> {
    return this.anexos.criar(pacienteId, atendimentoId, body);
  }

  @Get(`${BASE}/anexos/:anexoId/link`)
  @RequirePermission('consultorio-assistencial.prontuarios.ver')
  @ApiOperation({ summary: 'Link temporário de download do exame ou anexo' })
  @ApiZodResponse(200, arquivoLinkSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  linkAnexo(
    @IdParam('pacienteId') pacienteId: string,
    @IdParam('atendimentoId') atendimentoId: string,
    @IdParam('anexoId') anexoId: string,
  ): Promise<ArquivoLink> {
    return this.anexos.link(pacienteId, atendimentoId, anexoId);
  }

  @Delete(`${BASE}/anexos/:anexoId`)
  @RequirePermission('consultorio-assistencial.prontuarios.excluir')
  @Audit({ entity: 'AtendimentoAnexo', idParam: 'anexoId' })
  @ApiOperation({ summary: 'Exclui o anexo (lógica); atendimento assinado: 409' })
  @ApiZodResponse(200, atendimentoAnexoSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  removerAnexo(
    @IdParam('pacienteId') pacienteId: string,
    @IdParam('atendimentoId') atendimentoId: string,
    @IdParam('anexoId') anexoId: string,
  ): Promise<AtendimentoAnexo> {
    return this.anexos.remover(pacienteId, atendimentoId, anexoId);
  }

  // --- Documentos emitidos -------------------------------------------------------------------

  @Get(`${BASE}/documentos`)
  @RequirePermission('consultorio-assistencial.prontuarios.ver')
  @ApiOperation({ summary: 'Documentos emitidos no atendimento' })
  @ApiZodResponse(200, atendimentoDocumentoListaSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  listarDocumentos(
    @IdParam('pacienteId') pacienteId: string,
    @IdParam('atendimentoId') atendimentoId: string,
  ): Promise<AtendimentoDocumentoLista> {
    return this.documentos.listar(pacienteId, atendimentoId);
  }

  @Post(`${BASE}/documentos`)
  @RequirePermission('consultorio-assistencial.prontuarios.criar')
  @Audit({ entity: 'AtendimentoDocumento' })
  @ApiOperation({ summary: 'Emite atestado, declaração ou solicitação de exame' })
  @ApiZodBody(atendimentoDocumentoInputSchema)
  @ApiZodResponse(201, atendimentoDocumentoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  criarDocumento(
    @IdParam('pacienteId') pacienteId: string,
    @IdParam('atendimentoId') atendimentoId: string,
    @Body(new ZodValidationPipe(atendimentoDocumentoInputSchema))
    body: CreateAtendimentoDocumentoInput,
  ): Promise<AtendimentoDocumento> {
    return this.documentos.criar(pacienteId, atendimentoId, body);
  }

  @Delete(`${BASE}/documentos/:documentoId`)
  @RequirePermission('consultorio-assistencial.prontuarios.excluir')
  @Audit({ entity: 'AtendimentoDocumento', idParam: 'documentoId' })
  @ApiOperation({ summary: 'Exclui o documento (lógica); atendimento assinado: 409' })
  @ApiZodResponse(200, atendimentoDocumentoSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  removerDocumento(
    @IdParam('pacienteId') pacienteId: string,
    @IdParam('atendimentoId') atendimentoId: string,
    @IdParam('documentoId') documentoId: string,
  ): Promise<AtendimentoDocumento> {
    return this.documentos.remover(pacienteId, atendimentoId, documentoId);
  }
}
