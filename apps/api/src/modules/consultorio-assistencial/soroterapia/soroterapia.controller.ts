import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  exportSoroterapiaEmAndamentoQuerySchema,
  exportSoroterapiaHistoricoQuerySchema,
  listSoroterapiaEmAndamentoQuerySchema,
  listSoroterapiaHistoricoQuerySchema,
  soroterapiaChecklistPageSchema,
  soroterapiaFilaDiaSchema,
  soroterapiaPacotesSchema,
  type AtendimentoMedicoItem,
  type ExportSoroterapiaEmAndamentoQuery,
  type ExportSoroterapiaHistoricoQuery,
  type ListSoroterapiaEmAndamentoQuery,
  type ListSoroterapiaHistoricoQuery,
  type SoroterapiaChecklist,
  type SoroterapiaPacote,
} from '@torres/shared';
import { Audit } from '../../../common/audit/audit.decorator';
import { RequirePermission } from '../../../common/auth/auth.decorators';
import { toStreamableFile } from '../../../common/export/export-response';
import type { Page } from '../../../common/pagination/paginate';
import {
  ApiErrorResponses,
  ApiZodQuery,
  ApiZodResponse,
} from '../../../common/swagger/zod-openapi';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { SoroterapiaService } from './soroterapia.service';

const ENTITY = 'SoroterapiaChecklist';
const TIPOS_EXPORTACAO = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/pdf',
] as const;

/** Tela Soroterapia (`/soroterapia`): só leitura. */
@ApiTags('Consultório / Assistencial: Soroterapia')
@Controller('consultorio-assistencial/soroterapia')
export class SoroterapiaController {
  constructor(private readonly service: SoroterapiaService) {}

  @Get('fila-dia')
  @RequirePermission('consultorio-assistencial.soroterapia.ver')
  @ApiOperation({ summary: 'Fila do Dia: agendamentos de soroterapia de hoje' })
  @ApiZodResponse(200, soroterapiaFilaDiaSchema)
  @ApiErrorResponses(401, 403)
  filaDia(): Promise<AtendimentoMedicoItem[]> {
    return this.service.filaDia();
  }

  @Get('pacotes')
  @RequirePermission('consultorio-assistencial.soroterapia.ver')
  @ApiOperation({ summary: 'Pacotes: protocolos de orçamentos aprovados' })
  @ApiZodResponse(200, soroterapiaPacotesSchema)
  @ApiErrorResponses(401, 403)
  pacotes(): Promise<SoroterapiaPacote[]> {
    return this.service.pacotes();
  }

  @Get('em-andamento')
  @RequirePermission('consultorio-assistencial.soroterapia.ver')
  @ApiOperation({ summary: 'Em Andamento: checklists, com busca, ordenação e paginação' })
  @ApiZodQuery(listSoroterapiaEmAndamentoQuerySchema)
  @ApiZodResponse(200, soroterapiaChecklistPageSchema)
  @ApiErrorResponses(400, 401, 403)
  listEmAndamento(
    @Query(new ZodValidationPipe(listSoroterapiaEmAndamentoQuerySchema))
    query: ListSoroterapiaEmAndamentoQuery,
  ): Promise<Page<SoroterapiaChecklist>> {
    return this.service.listEmAndamento(query);
  }

  @Get('em-andamento/export')
  @RequirePermission('consultorio-assistencial.soroterapia.exportar')
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({ summary: 'Exporta Em Andamento em Excel ou PDF, com os filtros da listagem' })
  @ApiZodQuery(exportSoroterapiaEmAndamentoQuerySchema)
  @ApiProduces(...TIPOS_EXPORTACAO)
  @ApiErrorResponses(400, 401, 403, 422)
  async exportEmAndamento(
    @Query(new ZodValidationPipe(exportSoroterapiaEmAndamentoQuerySchema))
    query: ExportSoroterapiaEmAndamentoQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.service.exportEmAndamento(query));
  }

  @Get('historico')
  @RequirePermission('consultorio-assistencial.soroterapia.ver')
  @ApiOperation({ summary: 'Historico: checklists Finalizados e Suspensos' })
  @ApiZodQuery(listSoroterapiaHistoricoQuerySchema)
  @ApiZodResponse(200, soroterapiaChecklistPageSchema)
  @ApiErrorResponses(400, 401, 403)
  listHistorico(
    @Query(new ZodValidationPipe(listSoroterapiaHistoricoQuerySchema))
    query: ListSoroterapiaHistoricoQuery,
  ): Promise<Page<SoroterapiaChecklist>> {
    return this.service.listHistorico(query);
  }

  @Get('historico/export')
  @RequirePermission('consultorio-assistencial.soroterapia.exportar')
  @Audit({ entity: ENTITY, action: 'EXPORT' })
  @ApiOperation({ summary: 'Exporta o Historico em Excel ou PDF, com os filtros da listagem' })
  @ApiZodQuery(exportSoroterapiaHistoricoQuerySchema)
  @ApiProduces(...TIPOS_EXPORTACAO)
  @ApiErrorResponses(400, 401, 403, 422)
  async exportHistorico(
    @Query(new ZodValidationPipe(exportSoroterapiaHistoricoQuerySchema))
    query: ExportSoroterapiaHistoricoQuery,
  ): Promise<StreamableFile> {
    return toStreamableFile(await this.service.exportHistorico(query));
  }
}
