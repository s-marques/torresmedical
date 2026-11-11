import { Body, Controller, Delete, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createTagAtendimentoSchema,
  listTagsAtendimentoQuerySchema,
  tagAtendimentoPageSchema,
  tagAtendimentoSchema,
  type CreateTagAtendimentoInput,
  type ListTagsAtendimentoQuery,
} from '@torres/shared';
import type { TagAtendimento } from '../../../generated/prisma/client';
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
import { TagsAtendimentoService } from './tags-atendimento.service';

const ENTITY = 'TagAtendimento';

/** Modal "Gerenciar Tags" da tela WhatsApp (`/atendimento`). */
@ApiTags('Comercial / Atendimento: WhatsApp')
@Controller('comercial-atendimento/tags-atendimento')
export class TagsAtendimentoController {
  constructor(private readonly tags: TagsAtendimentoService) {}

  @Get()
  @RequirePermission('comercial-atendimento.whatsapp.ver')
  @ApiOperation({ summary: 'Tags das conversas, por nome' })
  @ApiZodQuery(listTagsAtendimentoQuerySchema)
  @ApiZodResponse(200, tagAtendimentoPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listTagsAtendimentoQuerySchema)) query: ListTagsAtendimentoQuery,
  ): Promise<Page<TagAtendimento>> {
    return this.tags.list(query);
  }

  @Post()
  @RequirePermission('comercial-atendimento.whatsapp.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria uma tag (nome único, sem diferenciar maiúsculas)' })
  @ApiZodBody(createTagAtendimentoSchema)
  @ApiZodResponse(201, tagAtendimentoSchema)
  @ApiErrorResponses(400, 401, 403, 409)
  create(
    @Body(new ZodValidationPipe(createTagAtendimentoSchema)) body: CreateTagAtendimentoInput,
  ): Promise<TagAtendimento> {
    return this.tags.create(body);
  }

  @Delete(':id')
  @RequirePermission('comercial-atendimento.whatsapp.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui a tag (exclusão lógica)' })
  @ApiZodResponse(200, tagAtendimentoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<TagAtendimento> {
    return this.tags.remove(id);
  }
}
