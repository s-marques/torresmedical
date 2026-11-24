import { Body, Controller, Delete, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  arquivoLinkSchema,
  profissionalDocumentoAlertasResponseSchema,
  profissionalDocumentoDecisaoSchema,
  profissionalDocumentoInputSchema,
  profissionalDocumentoSchema,
  profissionalDocumentosResponseSchema,
  type ArquivoLink,
  type ProfissionalDocumento,
  type ProfissionalDocumentoDecisao,
  type ProfissionalDocumentoInput,
  type ProfissionalDocumentosResponse,
} from '@torres/shared';
import { Audit } from '../../../common/audit/audit.decorator';
import { RequirePermission } from '../../../common/auth/auth.decorators';
import { ApiErrorResponses, ApiZodBody, ApiZodResponse } from '../../../common/swagger/zod-openapi';
import { IdParam } from '../../../common/validation/id-param.decorator';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import {
  ProfissionaisDocumentosService,
  type DocumentoAlertaDto,
} from './profissionais-documentos.service';

const ENTITY = 'ProfissionalDocumento';
const AUDITORIA = { entity: ENTITY, idParam: 'documentoId' } as const;

/** Aba Documentos do profissional (issue #141). O arquivo é enviado antes em `/api/arquivos`. */
@ApiTags('Gestão Profissionais: Documentos do profissional')
@Controller('gestao-profissionais/profissionais')
export class ProfissionaisDocumentosController {
  constructor(private readonly documentos: ProfissionaisDocumentosService) {}

  @Get('documentos/alertas')
  @RequirePermission('gestao-profissionais.profissionais.ver')
  @ApiOperation({ summary: 'Documentos vencidos ou a vencer em até 60 dias (alertas)' })
  @ApiZodResponse(200, profissionalDocumentoAlertasResponseSchema)
  @ApiErrorResponses(401, 403)
  async alertas(): Promise<{ data: DocumentoAlertaDto[] }> {
    return { data: await this.documentos.alertas() };
  }

  @Get(':id/documentos')
  @RequirePermission('gestao-profissionais.profissionais.ver')
  @ApiOperation({ summary: 'Documentos do profissional, pendências e documentação validada' })
  @ApiZodResponse(200, profissionalDocumentosResponseSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  listar(@IdParam() id: string): Promise<ProfissionalDocumentosResponse> {
    return this.documentos.listar(id);
  }

  @Post(':id/documentos')
  @RequirePermission('gestao-profissionais.profissionais.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Registra um documento (arquivo já enviado em /api/arquivos)' })
  @ApiZodBody(profissionalDocumentoInputSchema)
  @ApiZodResponse(201, profissionalDocumentoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  criar(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(profissionalDocumentoInputSchema))
    body: ProfissionalDocumentoInput,
  ): Promise<ProfissionalDocumento> {
    return this.documentos.criar(id, body);
  }

  @Patch(':id/documentos/:documentoId')
  @RequirePermission('gestao-profissionais.profissionais.editar')
  @Audit(AUDITORIA)
  @ApiOperation({ summary: 'Altera o documento e o devolve para "Enviado"' })
  @ApiZodBody(profissionalDocumentoInputSchema)
  @ApiZodResponse(200, profissionalDocumentoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  atualizar(
    @IdParam() id: string,
    @IdParam('documentoId') documentoId: string,
    @Body(new ZodValidationPipe(profissionalDocumentoInputSchema))
    body: ProfissionalDocumentoInput,
  ): Promise<ProfissionalDocumento> {
    return this.documentos.atualizar(id, documentoId, body);
  }

  @Post(':id/documentos/:documentoId/validacao')
  @RequirePermission('gestao-profissionais.profissionais-documentos.validar')
  @HttpCode(200)
  @Audit({ ...AUDITORIA, action: 'UPDATE' })
  @ApiOperation({ summary: 'Valida ou recusa o documento (a recusa exige motivo)' })
  @ApiZodBody(profissionalDocumentoDecisaoSchema)
  @ApiZodResponse(200, profissionalDocumentoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  decidir(
    @IdParam() id: string,
    @IdParam('documentoId') documentoId: string,
    @Body(new ZodValidationPipe(profissionalDocumentoDecisaoSchema))
    body: ProfissionalDocumentoDecisao,
  ): Promise<ProfissionalDocumento> {
    return this.documentos.decidir(id, documentoId, body);
  }

  @Delete(':id/documentos/:documentoId')
  @RequirePermission('gestao-profissionais.profissionais.editar')
  @HttpCode(200)
  @Audit(AUDITORIA)
  @ApiOperation({ summary: 'Remove o documento (exclusão lógica)' })
  @ApiZodResponse(200, profissionalDocumentoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remover(
    @IdParam() id: string,
    @IdParam('documentoId') documentoId: string,
  ): Promise<ProfissionalDocumento> {
    return this.documentos.remover(id, documentoId);
  }

  @Get(':id/documentos/:documentoId/link')
  @RequirePermission('gestao-profissionais.profissionais.ver')
  @ApiOperation({ summary: 'URL temporária para baixar o arquivo do documento' })
  @ApiZodResponse(200, arquivoLinkSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  link(@IdParam() id: string, @IdParam('documentoId') documentoId: string): Promise<ArquivoLink> {
    return this.documentos.link(id, documentoId);
  }
}
