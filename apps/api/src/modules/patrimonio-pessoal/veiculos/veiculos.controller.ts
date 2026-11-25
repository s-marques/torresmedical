import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  createVeiculoSchema,
  exportVeiculosQuerySchema,
  veiculoPageSchema,
  veiculoSchema,
  listVeiculosQuerySchema,
  updateVeiculoSchema,
  type CreateVeiculoInput,
  type ExportVeiculosQuery,
  type Veiculo,
  type ListVeiculosQuery,
  type UpdateVeiculoInput,
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
import { VeiculosService } from './veiculos.service';

const ENTITY = 'Veiculo';

/** Tela Veículos (`/veiculos`). */
@ApiTags('Patrimônio & Pessoal: Veículos')
@Controller('patrimonio-pessoal/veiculos')
export class VeiculosController {
  constructor(private readonly veiculos: VeiculosService) {}

  @Get()
  @RequirePermission('patrimonio-pessoal.veiculos.ver')
  @ApiOperation({ summary: 'Lista paginada, com busca e ordenação' })
  @ApiZodQuery(listVeiculosQuerySchema)
  @ApiZodResponse(200, veiculoPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listVeiculosQuerySchema)) query: ListVeiculosQuery,
  ): Promise<Page<Veiculo>> {
    return this.veiculos.list(query);
  }

  // Antes de ":id" para "export" não ser tratado como id.
  @Get('export')
  @RequirePermission('patrimonio-pessoal.veiculos.exportar')
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({
    summary: 'Exporta em Excel ou PDF com a mesma busca e ordenação da listagem',
  })
  @ApiZodQuery(exportVeiculosQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportVeiculosQuerySchema)) query: ExportVeiculosQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.veiculos.export(query));
  }

  @Get(':id')
  @RequirePermission('patrimonio-pessoal.veiculos.ver')
  @ApiOperation({ summary: 'Detalhe' })
  @ApiZodResponse(200, veiculoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<Veiculo> {
    return this.veiculos.findById(id);
  }

  @Post()
  @RequirePermission('patrimonio-pessoal.veiculos.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria (Novo Veículo)' })
  @ApiZodBody(createVeiculoSchema)
  @ApiZodResponse(201, veiculoSchema)
  @ApiErrorResponses(400, 401, 403)
  create(
    @Body(new ZodValidationPipe(createVeiculoSchema)) body: CreateVeiculoInput,
  ): Promise<Veiculo> {
    return this.veiculos.create(body);
  }

  @Patch(':id')
  @RequirePermission('patrimonio-pessoal.veiculos.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera (Editar Veículo)' })
  @ApiZodBody(updateVeiculoSchema)
  @ApiZodResponse(200, veiculoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateVeiculoSchema)) body: UpdateVeiculoInput,
  ): Promise<Veiculo> {
    return this.veiculos.update(id, body);
  }

  @Delete(':id')
  @RequirePermission('patrimonio-pessoal.veiculos.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (exclusão lógica)' })
  @ApiZodResponse(200, veiculoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<Veiculo> {
    return this.veiculos.remove(id);
  }
}
