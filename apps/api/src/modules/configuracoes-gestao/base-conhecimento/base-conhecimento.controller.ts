import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createDocumentoConhecimentoSchema,
  documentoConhecimentoPageSchema,
  documentoConhecimentoSchema,
  listDocumentosConhecimentoQuerySchema,
  updateDocumentoConhecimentoSchema,
  type CreateDocumentoConhecimentoInput,
  type ListDocumentosConhecimentoQuery,
  type UpdateDocumentoConhecimentoInput,
} from '@torres/shared';
import type { DocumentoConhecimento } from '../../../generated/prisma/client';
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
import { BaseConhecimentoService } from './base-conhecimento.service';

const ENTITY = 'DocumentoConhecimento';

/** Tela Base de Conhecimento (`/base-conhecimento`). */
@ApiTags('Configurações / Gestão: Base de Conhecimento')
@Controller('configuracoes-gestao/base-conhecimento')
export class BaseConhecimentoController {
  constructor(private readonly documentos: BaseConhecimentoService) {}

  @Get()
  @RequirePermission('configuracoes-gestao.base-conhecimento.ver')
  @ApiOperation({
    summary: 'Lista paginada, com busca (título, conteúdo) e filtros de profissional e categoria',
  })
  @ApiZodQuery(listDocumentosConhecimentoQuerySchema)
  @ApiZodResponse(200, documentoConhecimentoPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listDocumentosConhecimentoQuerySchema))
    query: ListDocumentosConhecimentoQuery,
  ): Promise<Page<DocumentoConhecimento>> {
    return this.documentos.list(query);
  }

  @Get(':id')
  @RequirePermission('configuracoes-gestao.base-conhecimento.ver')
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, documentoConhecimentoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<DocumentoConhecimento> {
    return this.documentos.findById(id);
  }

  @Post()
  @RequirePermission('configuracoes-gestao.base-conhecimento.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria e indexa ("Salvar e Indexar")' })
  @ApiZodBody(createDocumentoConhecimentoSchema)
  @ApiZodResponse(201, documentoConhecimentoSchema)
  @ApiErrorResponses(400, 401, 403)
  create(
    @Body(new ZodValidationPipe(createDocumentoConhecimentoSchema))
    body: CreateDocumentoConhecimentoInput,
  ): Promise<DocumentoConhecimento> {
    return this.documentos.create(body);
  }

  @Patch(':id')
  @RequirePermission('configuracoes-gestao.base-conhecimento.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera (substitui todos os campos) e reindexa' })
  @ApiZodBody(updateDocumentoConhecimentoSchema)
  @ApiZodResponse(200, documentoConhecimentoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateDocumentoConhecimentoSchema))
    body: UpdateDocumentoConhecimentoInput,
  ): Promise<DocumentoConhecimento> {
    return this.documentos.update(id, body);
  }
}
