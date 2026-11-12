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
  catalogoPacotePageSchema,
  catalogoPacoteQuerySchema,
  exportPacotesQuerySchema,
  listPacotesQuerySchema,
  pacoteInputSchema,
  pacotePageSchema,
  pacoteSchema,
  registrarUsoPacoteSchema,
  type CatalogoPacoteItem,
  type CatalogoPacoteQuery,
  type ExportPacotesQuery,
  type ListPacotesQuery,
  type Pacote,
  type PacoteInput,
  type RegistrarUsoPacoteInput,
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
import { PacotesService } from './pacotes.service';

const ENTITY = 'Pacote';

/** Tela Pacotes (`/pacotes`). */
@ApiTags('Comercial/Atendimento: Pacotes')
@Controller('comercial-atendimento/pacotes')
export class PacotesController {
  constructor(private readonly pacotes: PacotesService) {}

  @Get()
  @RequirePermission('comercial-atendimento.pacotes.ver')
  @ApiOperation({
    summary:
      'Lista paginada, com busca por cliente ou pacote, status (Todos/Ativo/Finalizado/Vencido/Cancelado) e ordenação',
  })
  @ApiZodQuery(listPacotesQuerySchema)
  @ApiZodResponse(200, pacotePageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listPacotesQuerySchema)) query: ListPacotesQuery,
  ): Promise<Page<Pacote>> {
    return this.pacotes.list(query);
  }

  // Antes de ":id" para "export" e "catalogo" não virarem id.
  @Get('export')
  @RequirePermission('comercial-atendimento.pacotes.exportar')
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({
    summary: 'Exporta em Excel ou PDF com os mesmos filtros e ordenação da listagem',
  })
  @ApiZodQuery(exportPacotesQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportPacotesQuerySchema)) query: ExportPacotesQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.pacotes.export(query));
  }

  @Get('catalogo')
  @RequirePermission('comercial-atendimento.pacotes.criar')
  @ApiOperation({ summary: 'Produtos e procedimentos que podem entrar no pacote (com preço)' })
  @ApiZodQuery(catalogoPacoteQuerySchema)
  @ApiZodResponse(200, catalogoPacotePageSchema)
  @ApiErrorResponses(400, 401, 403)
  catalogo(
    @Query(new ZodValidationPipe(catalogoPacoteQuerySchema)) query: CatalogoPacoteQuery,
  ): Promise<Page<CatalogoPacoteItem>> {
    return this.pacotes.catalogo(query);
  }

  @Get(':id')
  @RequirePermission('comercial-atendimento.pacotes.ver')
  @ApiOperation({ summary: 'Detalhe, com progresso, itens e histórico de utilizações' })
  @ApiZodResponse(200, pacoteSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<Pacote> {
    return this.pacotes.findById(id);
  }

  @Post()
  @RequirePermission('comercial-atendimento.pacotes.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cria (Novo Pacote)' })
  @ApiZodBody(pacoteInputSchema)
  @ApiZodResponse(201, pacoteSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  create(@Body(new ZodValidationPipe(pacoteInputSchema)) body: PacoteInput): Promise<Pacote> {
    return this.pacotes.create(body);
  }

  @Patch(':id')
  @RequirePermission('comercial-atendimento.pacotes.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera (Editar Pacote)' })
  @ApiZodBody(pacoteInputSchema)
  @ApiZodResponse(200, pacoteSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(pacoteInputSchema)) body: PacoteInput,
  ): Promise<Pacote> {
    return this.pacotes.update(id, body);
  }

  @Delete(':id')
  @RequirePermission('comercial-atendimento.pacotes.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (exclusão lógica)' })
  @ApiZodResponse(200, pacoteSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<Pacote> {
    return this.pacotes.remove(id);
  }

  // O uso muda o saldo do pacote: é auditado como UPDATE do próprio pacote (before/after).
  @Post(':id/usos')
  @RequirePermission('comercial-atendimento.pacotes.editar')
  @Audit({ entity: ENTITY, action: 'UPDATE' })
  @ApiOperation({ summary: 'Registra o uso de sessão (Registrar Uso de Sessão)' })
  @ApiZodBody(registrarUsoPacoteSchema)
  @ApiZodResponse(201, pacoteSchema)
  @ApiErrorResponses(400, 401, 403, 404, 422)
  registrarUso(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(registrarUsoPacoteSchema)) body: RegistrarUsoPacoteInput,
  ): Promise<Pacote> {
    return this.pacotes.registrarUso(id, body);
  }

  @Delete(':id/usos/:usoId')
  @RequirePermission('comercial-atendimento.pacotes.editar')
  @HttpCode(200)
  @Audit({ entity: ENTITY, action: 'UPDATE' })
  @ApiOperation({ summary: 'Remove um uso do histórico e devolve a sessão ao saldo' })
  @ApiZodResponse(200, pacoteSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  removerUso(@IdParam() id: string, @IdParam('usoId') usoId: string): Promise<Pacote> {
    return this.pacotes.removerUso(id, usoId);
  }
}
