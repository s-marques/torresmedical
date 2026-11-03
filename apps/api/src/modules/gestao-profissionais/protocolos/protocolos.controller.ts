import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createProtocoloSchema,
  listProtocolosQuerySchema,
  protocoloCategoriasSchema,
  protocoloPageSchema,
  protocoloSchema,
  updateProtocoloSchema,
  type CreateProtocoloInput,
  type ListProtocolosQuery,
  type Protocolo,
  type ProtocoloCategorias,
  type UpdateProtocoloInput,
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
import { ProtocolosService } from './protocolos.service';

const ENTITY = 'Protocolo';

/** Tela Protocolos, aba Protocolos (`/protocolos`). */
@ApiTags('Gestão Profissionais: Protocolos')
@Controller('gestao-profissionais/protocolos')
export class ProtocolosController {
  constructor(private readonly protocolos: ProtocolosService) {}

  @Get()
  @RequirePermission('gestao-profissionais.protocolos.ver')
  @ApiOperation({
    summary: 'Lista paginada, agrupada por categoria, com busca e filtros de categoria e profissional',
  })
  @ApiZodQuery(listProtocolosQuerySchema)
  @ApiZodResponse(200, protocoloPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listProtocolosQuerySchema)) query: ListProtocolosQuery,
  ): Promise<Page<Protocolo>> {
    return this.protocolos.list(query);
  }

  @Get('categorias')
  @RequirePermission('gestao-profissionais.protocolos.ver')
  @ApiOperation({ summary: 'Categorias em uso (opções do filtro Categoria)' })
  @ApiZodResponse(200, protocoloCategoriasSchema)
  @ApiErrorResponses(401, 403)
  categorias(): Promise<ProtocoloCategorias> {
    return this.protocolos.categorias();
  }

  @Get(':id')
  @RequirePermission('gestao-profissionais.protocolos.ver')
  @ApiOperation({ summary: 'Detalhe (Detalhar)' })
  @ApiZodResponse(200, protocoloSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<Protocolo> {
    return this.protocolos.findById(id);
  }

  @Post()
  @RequirePermission('gestao-profissionais.protocolos.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria (Novo Protocolo). O nome é obrigatório e não pode repetir' })
  @ApiZodBody(createProtocoloSchema)
  @ApiZodResponse(201, protocoloSchema)
  @ApiErrorResponses(400, 401, 403, 409)
  create(
    @Body(new ZodValidationPipe(createProtocoloSchema)) body: CreateProtocoloInput,
  ): Promise<Protocolo> {
    return this.protocolos.create(body);
  }

  @Post(':id/duplicar')
  @RequirePermission('gestao-profissionais.protocolos.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Duplica (ícone Duplicar): cria "Cópia de <nome>"' })
  @ApiZodResponse(201, protocoloSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  duplicar(@IdParam() id: string): Promise<Protocolo> {
    return this.protocolos.duplicar(id);
  }

  @Patch(':id')
  @RequirePermission('gestao-profissionais.protocolos.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera (Editar Protocolo): substitui os campos do formulário' })
  @ApiZodBody(updateProtocoloSchema)
  @ApiZodResponse(200, protocoloSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateProtocoloSchema)) body: UpdateProtocoloInput,
  ): Promise<Protocolo> {
    return this.protocolos.update(id, body);
  }

  @Delete(':id')
  @RequirePermission('gestao-profissionais.protocolos.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (lógico), só se não for usado em protocolo mãe' })
  @ApiZodResponse(200, protocoloSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  remove(@IdParam() id: string): Promise<Protocolo> {
    return this.protocolos.remove(id);
  }
}
