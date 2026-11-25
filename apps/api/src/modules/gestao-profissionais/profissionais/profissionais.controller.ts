import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  bloqueiosResponseSchema,
  bloqueioAgendaSchema,
  contratosProfissionalResponseSchema,
  createProfissionalSchema,
  criarBloqueioSchema,
  exportProfissionaisQuerySchema,
  horariosResponseSchema,
  listProfissionaisQuerySchema,
  profissionalArquivoCampoSchema,
  profissionalArquivoInputSchema,
  profissionalPageSchema,
  profissionalSchema,
  profissionalStatusSchema,
  salvarHorariosSchema,
  updateProfissionalSchema,
  type BloqueioAgenda,
  type CreateProfissionalInput,
  type ContratoSala,
  type CriarBloqueioData,
  type ExportProfissionaisQuery,
  type HorarioAtendimento,
  type ListProfissionaisQuery,
  type Profissional,
  type ProfissionalArquivoCampo,
  type ProfissionalArquivoInput,
  type ProfissionalStatusInput,
  type SalvarHorariosInput,
  type UpdateProfissionalInput,
} from '@torres/shared';
import { Audit } from '../../../common/audit/audit.decorator';
import { ExportaDadosPessoais, RequirePermission } from '../../../common/auth/auth.decorators';
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
import { ContratosSalaService } from '../salas/contratos-sala.service';
import { ProfissionalAgendaService } from './profissional-agenda.service';
import { ProfissionaisService } from './profissionais.service';

const ENTITY = 'Profissional';

/** Tela Profissionais (`/profissionais`). O combobox das outras telas é `/api/lookups/profissionais`. */
@ApiTags('Gestão Profissionais: Profissionais')
@Controller('gestao-profissionais/profissionais')
export class ProfissionaisController {
  constructor(
    private readonly profissionais: ProfissionaisService,
    private readonly agenda: ProfissionalAgendaService,
    private readonly contratos: ContratosSalaService,
  ) {}

  @Get()
  @RequirePermission('gestao-profissionais.profissionais.ver')
  @ApiOperation({ summary: 'Lista paginada, com busca, status e ordenação' })
  @ApiZodQuery(listProfissionaisQuerySchema)
  @ApiZodResponse(200, profissionalPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listProfissionaisQuerySchema)) query: ListProfissionaisQuery,
  ): Promise<Page<Profissional>> {
    return this.profissionais.list(query);
  }

  // Antes de ":id" para "export" não ser tratado como id.
  @Get('export')
  @RequirePermission('gestao-profissionais.profissionais.exportar')
  @ExportaDadosPessoais()
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({
    summary: 'Exporta em Excel ou PDF com os mesmos filtros e ordenação da listagem',
  })
  @ApiZodQuery(exportProfissionaisQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportProfissionaisQuerySchema)) query: ExportProfissionaisQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.profissionais.export(query));
  }

  @Get(':id')
  @RequirePermission('gestao-profissionais.profissionais.ver')
  @ApiOperation({ summary: 'Detalhe (modal ao clicar na linha)' })
  @ApiZodResponse(200, profissionalSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<Profissional> {
    return this.profissionais.detalhe(id);
  }

  @Post()
  @RequirePermission('gestao-profissionais.profissionais.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cadastra (Novo Profissional)' })
  @ApiZodBody(createProfissionalSchema)
  @ApiZodResponse(201, profissionalSchema)
  @ApiErrorResponses(400, 401, 403)
  create(
    @Body(new ZodValidationPipe(createProfissionalSchema)) body: CreateProfissionalInput,
  ): Promise<Profissional> {
    return this.profissionais.create(body);
  }

  @Patch(':id')
  @RequirePermission('gestao-profissionais.profissionais.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({
    summary: 'Altera (Editar): substitui os campos do formulário',
    description: 'Secret Key da Memed em branco mantém a chave já gravada.',
  })
  @ApiZodBody(updateProfissionalSchema)
  @ApiZodResponse(200, profissionalSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updateProfissionalSchema)) body: UpdateProfissionalInput,
  ): Promise<Profissional> {
    return this.profissionais.update(id, body);
  }

  @Patch(':id/status')
  @RequirePermission('gestao-profissionais.profissionais.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Ativa ou desativa (menu da linha)' })
  @ApiZodBody(profissionalStatusSchema)
  @ApiZodResponse(200, profissionalSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  alterarStatus(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(profissionalStatusSchema)) body: ProfissionalStatusInput,
  ): Promise<Profissional> {
    return this.profissionais.alterarStatus(id, body.ativo);
  }

  @Put(':id/arquivos/:campo')
  @RequirePermission('gestao-profissionais.profissionais.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({
    summary: 'Define a foto ou a logo da receita (arquivo já enviado em /api/arquivos)',
    description: '`campo`: foto ou logo-receita. `arquivoId: null` remove.',
  })
  @ApiZodBody(profissionalArquivoInputSchema)
  @ApiZodResponse(200, profissionalSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  definirArquivo(
    @IdParam() id: string,
    @Param('campo', new ZodValidationPipe(profissionalArquivoCampoSchema))
    campo: ProfissionalArquivoCampo,
    @Body(new ZodValidationPipe(profissionalArquivoInputSchema)) body: ProfissionalArquivoInput,
  ): Promise<Profissional> {
    return this.profissionais.definirArquivo(id, campo, body.arquivoId);
  }

  @Delete(':id')
  @RequirePermission('gestao-profissionais.profissionais.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (exclusão lógica)' })
  @ApiZodResponse(200, profissionalSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<Profissional> {
    return this.profissionais.remove(id);
  }

  @Get(':id/contratos')
  @RequirePermission('gestao-profissionais.profissionais.ver')
  @ApiOperation({
    summary: 'Contratos de sala do profissional (ativos e encerrados), somente leitura',
  })
  @ApiZodResponse(200, contratosProfissionalResponseSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  async listarContratos(@IdParam() id: string): Promise<{ data: ContratoSala[] }> {
    return { data: await this.contratos.listarDoProfissional(id) };
  }

  // -------------------------------------------------------------------------------------------
  // Horários de atendimento (modal Editar)

  @Get(':id/horarios')
  @RequirePermission('gestao-profissionais.profissionais.ver')
  @ApiOperation({ summary: 'Horários de atendimento (semanais e por data)' })
  @ApiZodResponse(200, horariosResponseSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  async horarios(@IdParam() id: string): Promise<{ data: HorarioAtendimento[] }> {
    return { data: await this.agenda.listarHorarios(id) };
  }

  @Put(':id/horarios')
  @RequirePermission('gestao-profissionais.profissionais.editar')
  @Audit({ entity: 'HorarioAtendimento', model: 'HorarioAtendimento' })
  @ApiOperation({ summary: 'Salvar Horários: substitui a lista do profissional' })
  @ApiZodBody(salvarHorariosSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  salvarHorarios(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(salvarHorariosSchema)) body: SalvarHorariosInput,
  ): Promise<{ id: string; horarios: HorarioAtendimento[] }> {
    return this.agenda.salvarHorarios(id, body);
  }

  // -------------------------------------------------------------------------------------------
  // Bloqueios de Agenda (menu da linha)

  @Get(':id/bloqueios')
  @RequirePermission('gestao-profissionais.profissionais.ver')
  @ApiOperation({ summary: 'Bloqueios ativos (data fim de hoje em diante)' })
  @ApiZodResponse(200, bloqueiosResponseSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  async bloqueios(@IdParam() id: string): Promise<{ data: BloqueioAgenda[] }> {
    return { data: await this.agenda.listarBloqueios(id) };
  }

  @Post(':id/bloqueios')
  @RequirePermission('gestao-profissionais.profissionais.editar')
  @Audit({ entity: 'BloqueioAgenda' })
  @ApiOperation({ summary: 'Bloqueia (Data Única ou Lote/período)' })
  @ApiZodBody(criarBloqueioSchema)
  @ApiZodResponse(201, bloqueioAgendaSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  criarBloqueio(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(criarBloqueioSchema)) body: CriarBloqueioData,
  ): Promise<BloqueioAgenda> {
    return this.agenda.criarBloqueio(id, body);
  }

  @Delete(':id/bloqueios/:bloqueioId')
  @RequirePermission('gestao-profissionais.profissionais.editar')
  @HttpCode(200)
  @Audit({ entity: 'BloqueioAgenda', idParam: 'bloqueioId' })
  @ApiOperation({ summary: 'Remove o bloqueio (exclusão lógica)' })
  @ApiZodResponse(200, bloqueioAgendaSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  removerBloqueio(
    @IdParam() id: string,
    @IdParam('bloqueioId') bloqueioId: string,
  ): Promise<BloqueioAgenda> {
    return this.agenda.removerBloqueio(id, bloqueioId);
  }
}
