import { Body, Controller, Get, Post, Query, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  createPrescricaoSchema,
  exportPrescricoesQuerySchema,
  listPrescricoesQuerySchema,
  prescricaoPageSchema,
  prescricaoSchema,
  type CreatePrescricaoInput,
  type ExportPrescricoesQuery,
  type ListPrescricoesQuery,
  type Prescricao,
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
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { PrescricoesService } from './prescricoes.service';

const ENTITY = 'Prescricao';

/** Tela Receituários (`/receituarios`), aba Prescricoes. */
@ApiTags('Consultório / Assistencial: Receituários')
@Controller('consultorio-assistencial/receituarios/prescricoes')
export class PrescricoesController {
  constructor(private readonly prescricoes: PrescricoesService) {}

  @Get()
  @RequirePermission('consultorio-assistencial.receituarios.ver')
  @ApiOperation({
    summary: 'Lista paginada de prescrições, com busca, tipo, período De/Até e ordenação',
  })
  @ApiZodQuery(listPrescricoesQuerySchema)
  @ApiZodResponse(200, prescricaoPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listPrescricoesQuerySchema)) query: ListPrescricoesQuery,
  ): Promise<Page<Prescricao>> {
    return this.prescricoes.list(query);
  }

  @Get('export')
  @RequirePermission('consultorio-assistencial.receituarios.exportar')
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({
    summary: 'Exporta em Excel ou PDF com os mesmos filtros e ordenação da listagem',
  })
  @ApiZodQuery(exportPrescricoesQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportPrescricoesQuerySchema)) query: ExportPrescricoesQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.prescricoes.export(query));
  }

  @Post()
  @RequirePermission('consultorio-assistencial.receituarios.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({
    summary:
      'Prescreve (Nova Prescricao): usa a próxima folha do bloco e o médico dele; a última folha finaliza o bloco',
  })
  @ApiZodBody(createPrescricaoSchema)
  @ApiZodResponse(201, prescricaoSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  create(
    @Body(new ZodValidationPipe(createPrescricaoSchema)) body: CreatePrescricaoInput,
  ): Promise<Prescricao> {
    return this.prescricoes.create(body);
  }
}
