import { Body, Controller, Get, Patch, Post, Query, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  createLicencaSchema,
  createTipoLicencaSchema,
  exportLicencasQuerySchema,
  licencaListaSchema,
  licencaPageSchema,
  licencaResumoQuerySchema,
  licencaResumoSchema,
  licencaSchema,
  listLicencasQuerySchema,
  tipoLicencaListSchema,
  tipoLicencaSchema,
  updateLicencaSchema,
  type CreateLicencaInput,
  type CreateTipoLicencaInput,
  type ExportLicencasQuery,
  type Licenca,
  type LicencaResumo,
  type LicencaResumoQuery,
  type ListLicencasQuery,
  type TipoLicenca,
  type UpdateLicencaInput,
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
import { AlvarasLicencasService } from './alvaras-licencas.service';

const VER = 'regulatorio-qualidade.alvaras-licencas.ver';

/** Tela Alvarás e Licenças (`/alvaras`): licenças por unidade e seus tipos. */
@ApiTags('Regulatório / Qualidade: Alvarás e Licenças')
@Controller('regulatorio-qualidade')
export class AlvarasLicencasController {
  constructor(private readonly alvaras: AlvarasLicencasService) {}

  @Get('tipos-licenca')
  @RequirePermission(VER)
  @ApiOperation({ summary: 'Tipos de licença (combo "Tipo de Licenca")' })
  @ApiZodResponse(200, tipoLicencaListSchema)
  @ApiErrorResponses(401, 403)
  listTipos(): Promise<TipoLicenca[]> {
    return this.alvaras.listTipos();
  }

  @Post('tipos-licenca')
  @RequirePermission('regulatorio-qualidade.alvaras-licencas.criar')
  @Audit({ entity: 'TipoLicenca' })
  @ApiOperation({
    summary: 'Cria tipo (Novo Tipo); gera uma licença "Não se aplica" por unidade (paridade)',
  })
  @ApiZodBody(createTipoLicencaSchema)
  @ApiZodResponse(201, tipoLicencaSchema)
  @ApiErrorResponses(400, 401, 403)
  createTipo(
    @Body(new ZodValidationPipe(createTipoLicencaSchema)) body: CreateTipoLicencaInput,
  ): Promise<TipoLicenca> {
    return this.alvaras.createTipo(body);
  }

  @Get('licencas')
  @RequirePermission(VER)
  @ApiOperation({ summary: 'Lista paginada, com busca, unidade, status e ordenação' })
  @ApiZodQuery(listLicencasQuerySchema)
  @ApiZodResponse(200, licencaPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listLicencasQuerySchema)) query: ListLicencasQuery,
  ): Promise<Page<Licenca>> {
    return this.alvaras.list(query);
  }

  @Get('licencas/export')
  @RequirePermission('regulatorio-qualidade.alvaras-licencas.exportar')
  @Audit({ entity: 'Licenca', action: 'EXPORT' })
  @ApiOperation({ summary: 'Exporta em Excel ou PDF com os mesmos filtros e ordenação' })
  @ApiZodQuery(exportLicencasQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
    'text/csv',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportLicencasQuerySchema)) query: ExportLicencasQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.alvaras.export(query));
  }

  @Get('licencas/resumo')
  @RequirePermission(VER)
  @ApiOperation({ summary: 'Totais por status (cartões do topo)' })
  @ApiZodQuery(licencaResumoQuerySchema)
  @ApiZodResponse(200, licencaResumoSchema)
  @ApiErrorResponses(400, 401, 403)
  resumo(
    @Query(new ZodValidationPipe(licencaResumoQuerySchema)) query: LicencaResumoQuery,
  ): Promise<LicencaResumo> {
    return this.alvaras.resumo(query);
  }

  @Get('licencas/alertas')
  @RequirePermission(VER)
  @ApiOperation({ summary: 'Aba Alertas: vencidas e a vencer em até 60 dias' })
  @ApiZodQuery(licencaResumoQuerySchema)
  @ApiZodResponse(200, licencaListaSchema)
  @ApiErrorResponses(400, 401, 403)
  alertas(
    @Query(new ZodValidationPipe(licencaResumoQuerySchema)) query: LicencaResumoQuery,
  ): Promise<Licenca[]> {
    return this.alvaras.alertas(query);
  }

  @Get('licencas/ordem-renovacao')
  @RequirePermission(VER)
  @ApiOperation({ summary: 'Aba Ordem Renovação: licenças por vencimento mais próximo' })
  @ApiZodQuery(licencaResumoQuerySchema)
  @ApiZodResponse(200, licencaListaSchema)
  @ApiErrorResponses(400, 401, 403)
  ordemRenovacao(
    @Query(new ZodValidationPipe(licencaResumoQuerySchema)) query: LicencaResumoQuery,
  ): Promise<Licenca[]> {
    return this.alvaras.ordemRenovacao(query);
  }

  @Get('licencas/:id')
  @RequirePermission(VER)
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, licencaSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<Licenca> {
    return this.alvaras.findById(id);
  }

  @Post('licencas')
  @RequirePermission('regulatorio-qualidade.alvaras-licencas.criar')
  @Audit({ entity: 'Licenca' })
  @ApiOperation({ summary: 'Cria (Nova Licenca)' })
  @ApiZodBody(createLicencaSchema)
  @ApiZodResponse(201, licencaSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  create(
    @Body(new ZodValidationPipe(createLicencaSchema)) body: CreateLicencaInput,
  ): Promise<Licenca> {
    return this.alvaras.create(body);
  }

  @Patch('licencas/:id')
  @RequirePermission('regulatorio-qualidade.alvaras-licencas.editar')
  @Audit({ entity: 'Licenca' })
  @ApiOperation({ summary: 'Altera' })
  @ApiZodBody(updateLicencaSchema)
  @ApiZodResponse(200, licencaSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateLicencaSchema)) body: UpdateLicencaInput,
  ): Promise<Licenca> {
    return this.alvaras.update(id, body);
  }
}
