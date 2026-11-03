import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createProtocoloMaeSchema,
  listProtocolosMaeQuerySchema,
  protocoloMaePageSchema,
  protocoloMaeSchema,
  updateProtocoloMaeSchema,
  type CreateProtocoloMaeInput,
  type ListProtocolosMaeQuery,
  type ProtocoloMae,
  type UpdateProtocoloMaeInput,
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
import { ProtocolosMaeService } from './protocolos-mae.service';

const ENTITY = 'ProtocoloMae';

/** Tela Protocolos, aba Protocolos Mãe (`/protocolos`). */
@ApiTags('Gestão Profissionais: Protocolos Mãe')
@Controller('gestao-profissionais/protocolos-mae')
export class ProtocolosMaeController {
  constructor(private readonly maes: ProtocolosMaeService) {}

  @Get()
  @RequirePermission('gestao-profissionais.protocolos.ver')
  @ApiOperation({
    summary: 'Lista paginada, agrupada por categoria, com busca e filtro de categoria',
  })
  @ApiZodQuery(listProtocolosMaeQuerySchema)
  @ApiZodResponse(200, protocoloMaePageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listProtocolosMaeQuerySchema)) query: ListProtocolosMaeQuery,
  ): Promise<Page<ProtocoloMae>> {
    return this.maes.list(query);
  }

  @Get(':id')
  @RequirePermission('gestao-profissionais.protocolos.ver')
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, protocoloMaeSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<ProtocoloMae> {
    return this.maes.findById(id);
  }

  @Post()
  @RequirePermission('gestao-profissionais.protocolos.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria (Novo Protocolo Mãe). Nome e total de semanas obrigatórios; o nome não pode repetir' })
  @ApiZodBody(createProtocoloMaeSchema)
  @ApiZodResponse(201, protocoloMaeSchema)
  @ApiErrorResponses(400, 401, 403, 409)
  create(
    @Body(new ZodValidationPipe(createProtocoloMaeSchema)) body: CreateProtocoloMaeInput,
  ): Promise<ProtocoloMae> {
    return this.maes.create(body);
  }

  @Patch(':id')
  @RequirePermission('gestao-profissionais.protocolos.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera (Editar Protocolo Mãe): substitui os campos do formulário' })
  @ApiZodBody(updateProtocoloMaeSchema)
  @ApiZodResponse(200, protocoloMaeSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateProtocoloMaeSchema)) body: UpdateProtocoloMaeInput,
  ): Promise<ProtocoloMae> {
    return this.maes.update(id, body);
  }

  @Delete(':id')
  @RequirePermission('gestao-profissionais.protocolos.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (lógico)' })
  @ApiZodResponse(200, protocoloMaeSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<ProtocoloMae> {
    return this.maes.remove(id);
  }
}
