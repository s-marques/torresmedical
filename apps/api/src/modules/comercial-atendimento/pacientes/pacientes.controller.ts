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
  consentimentoSchema,
  consentimentosResponseSchema,
  createConsentimentoSchema,
  createPacienteSchema,
  exportPacientesQuerySchema,
  listPacientesQuerySchema,
  pacientePageSchema,
  pacienteResumoSchema,
  pacienteSchema,
  updatePacienteSchema,
  verificacaoDuplicidadePacienteSchema,
  verificarDuplicidadePacienteSchema,
  type Consentimento,
  type ConsentimentosResponse,
  type CreateConsentimentoInput,
  type CreatePacienteInput,
  type ExportPacientesQuery,
  type ListPacientesQuery,
  type Paciente,
  type PacienteResumo,
  type UpdatePacienteInput,
  type VerificacaoDuplicidadePaciente,
  type VerificarDuplicidadePaciente,
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
import { ConsentimentosPacienteService } from './consentimentos-paciente.service';
import { PacientesDuplicidadeService } from './pacientes-duplicidade.service';
import { PacientesService } from './pacientes.service';

const ENTITY = 'Paciente';

/** Tela Pacientes (`/clientes`). O combobox de pacientes das outras telas é `/api/lookups/pacientes`. */
@ApiTags('Comercial / Atendimento: Pacientes')
@Controller('comercial-atendimento/pacientes')
export class PacientesController {
  constructor(
    private readonly pacientes: PacientesService,
    private readonly consentimentos: ConsentimentosPacienteService,
    private readonly duplicidade: PacientesDuplicidadeService,
  ) {}

  @Get()
  @RequirePermission('comercial-atendimento.pacientes.ver')
  @ApiOperation({ summary: 'Lista paginada, com busca, status e ordenação' })
  @ApiZodQuery(listPacientesQuerySchema)
  @ApiZodResponse(200, pacientePageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listPacientesQuerySchema)) query: ListPacientesQuery,
  ): Promise<Page<PacienteResumo>> {
    return this.pacientes.list(query);
  }

  // Antes de ":id" para "export" não ser tratado como id.
  @Get('export')
  @RequirePermission('comercial-atendimento.pacientes.exportar')
  @ExportaDadosPessoais()
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({
    summary: 'Exporta em Excel ou PDF com os mesmos filtros e ordenação da listagem',
  })
  @ApiZodQuery(exportPacientesQuerySchema)
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
    'text/csv',
  )
  @ApiErrorResponses(400, 401, 403, 422)
  async export(
    @Query(new ZodValidationPipe(exportPacientesQuerySchema)) query: ExportPacientesQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.pacientes.export(query));
  }

  @Get(':id')
  @RequirePermission('comercial-atendimento.pacientes.ver')
  @ApiOperation({ summary: 'Detalhe (modal ao clicar na linha), com os dados calculados' })
  @ApiZodResponse(200, pacienteResumoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  findById(@IdParam() id: string): Promise<PacienteResumo> {
    return this.pacientes.detalheNoEscopo(id);
  }

  @Get(':id/consentimentos')
  @RequirePermission('comercial-atendimento.pacientes.ver')
  @ApiOperation({ summary: 'Histórico de consentimentos (LGPD), do mais recente ao mais antigo' })
  @ApiZodResponse(200, consentimentosResponseSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  consentimentosDoPaciente(@IdParam() id: string): Promise<ConsentimentosResponse> {
    return this.consentimentos.listar(id);
  }

  @Post(':id/consentimentos')
  @RequirePermission('comercial-atendimento.pacientes.editar')
  @Audit({ entity: 'ConsentimentoPaciente', action: 'CREATE' })
  @ApiOperation({
    summary: 'Registra um aceite ou uma revogação; o histórico anterior é mantido',
  })
  @ApiZodBody(createConsentimentoSchema)
  @ApiZodResponse(201, consentimentoSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  registrarConsentimento(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(createConsentimentoSchema)) body: CreateConsentimentoInput,
  ): Promise<Consentimento> {
    return this.consentimentos.registrar(id, body);
  }

  @Post('duplicidade')
  @HttpCode(200)
  @RequirePermission(
    'comercial-atendimento.pacientes.criar',
    'comercial-atendimento.pacientes.editar',
  )
  @ApiOperation({
    summary:
      'Procura possíveis duplicados (telefone, e-mail ou nome + nascimento). Só consulta, não grava',
  })
  @ApiZodBody(verificarDuplicidadePacienteSchema)
  @ApiZodResponse(200, verificacaoDuplicidadePacienteSchema)
  @ApiErrorResponses(400, 401, 403)
  verificarDuplicidade(
    @Body(new ZodValidationPipe(verificarDuplicidadePacienteSchema))
    body: VerificarDuplicidadePaciente,
  ): Promise<VerificacaoDuplicidadePaciente> {
    return this.duplicidade.verificar(body);
  }

  @Post()
  @RequirePermission('comercial-atendimento.pacientes.criar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Cadastra (Novo Paciente)' })
  @ApiZodBody(createPacienteSchema)
  @ApiZodResponse(201, pacienteSchema)
  @ApiErrorResponses(400, 401, 403, 409)
  create(
    @Body(new ZodValidationPipe(createPacienteSchema)) body: CreatePacienteInput,
  ): Promise<Paciente> {
    return this.pacientes.create(body);
  }

  @Patch(':id')
  @RequirePermission('comercial-atendimento.pacientes.editar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Altera (Editar): substitui todos os campos do cadastro' })
  @ApiZodBody(updatePacienteSchema)
  @ApiZodResponse(200, pacienteSchema)
  @ApiErrorResponses(400, 401, 403, 404, 409)
  update(
    @IdParam() id: string,
    @Body(new ZodValidationPipe(updatePacienteSchema)) body: UpdatePacienteInput,
  ): Promise<Paciente> {
    return this.pacientes.update(id, body);
  }

  @Delete(':id')
  @RequirePermission('comercial-atendimento.pacientes.excluir')
  @HttpCode(200)
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Exclui (exclusão lógica)' })
  @ApiZodResponse(200, pacienteSchema)
  @ApiErrorResponses(400, 401, 403, 404)
  remove(@IdParam() id: string): Promise<Paciente> {
    return this.pacientes.remove(id);
  }
}
