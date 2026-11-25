import { Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  backupExecucaoPageSchema,
  backupExecucaoSchema,
  listBackupsQuerySchema,
  type BackupExecucao,
  type BackupExecucaoPage,
  type BackupTipo,
  type ListBackupsQuery,
} from '@torres/shared';
import { Audit } from '../audit/audit.decorator';
import { CurrentUser, RequirePermission } from '../auth/auth.decorators';
import type { UsuarioAutenticado } from '../auth/usuario-autenticado';
import { ApiErrorResponses, ApiZodQuery, ApiZodResponse } from '../swagger/zod-openapi';
import { ZodValidationPipe } from '../validation/zod-validation.pipe';
import { BackupRegistroService } from './backup-registro.service';
import { BackupService } from './backup.service';

const ENTITY = 'BackupExecucao';

/**
 * Histórico de backups e restaurações de teste, e disparo manual (issue #157). Só a
 * administração: `configuracoes-gestao.backups.ver` e `.executar`.
 */
@ApiTags('Backups')
@Controller('configuracoes-gestao/backups')
export class BackupController {
  constructor(
    private readonly backup: BackupService,
    private readonly registro: BackupRegistroService,
  ) {}

  @Get()
  @RequirePermission('configuracoes-gestao.backups.ver')
  @ApiOperation({ summary: 'Histórico paginado de backups e restaurações de teste' })
  @ApiZodQuery(listBackupsQuerySchema)
  @ApiZodResponse(200, backupExecucaoPageSchema)
  @ApiErrorResponses(400, 401, 403)
  list(
    @Query(new ZodValidationPipe(listBackupsQuerySchema)) query: ListBackupsQuery,
  ): Promise<BackupExecucaoPage> {
    return this.registro.listar(query);
  }

  @Post('executar')
  @HttpCode(202)
  @RequirePermission('configuracoes-gestao.backups.executar')
  @Audit({ entity: ENTITY })
  @ApiOperation({ summary: 'Dispara um backup agora (roda em segundo plano)' })
  @ApiZodResponse(202, backupExecucaoSchema)
  @ApiErrorResponses(401, 403, 409, 422)
  executar(@CurrentUser() usuario: UsuarioAutenticado | undefined): Promise<BackupExecucao> {
    return this.disparar('BACKUP', usuario);
  }

  @Post('restauracao-teste')
  @HttpCode(202)
  @RequirePermission('configuracoes-gestao.backups.executar')
  @Audit({ entity: ENTITY })
  @ApiOperation({
    summary: 'Dispara a restauração de teste do último backup (roda em segundo plano)',
  })
  @ApiZodResponse(202, backupExecucaoSchema)
  @ApiErrorResponses(401, 403, 409, 422)
  restauracaoTeste(
    @CurrentUser() usuario: UsuarioAutenticado | undefined,
  ): Promise<BackupExecucao> {
    return this.disparar('RESTAURACAO_TESTE', usuario);
  }

  private async disparar(
    tipo: BackupTipo,
    usuario: UsuarioAutenticado | undefined,
  ): Promise<BackupExecucao> {
    const { execucao } = await this.backup.disparar(tipo, 'MANUAL', usuario?.id);
    return execucao;
  }
}
