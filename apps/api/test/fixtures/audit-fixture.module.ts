import { TransactionHost } from '@nestjs-cls/transactional';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Audit } from '../../src/common/audit/audit.decorator';
import { Public, SomenteAutenticado } from '../../src/common/auth/auth.decorators';
import type { PrismaAdapter } from '../../src/common/prisma/prisma-transaction';

interface EmpresaInput {
  nome: string;
  documento: string;
}

/**
 * Endpoints de escrita só para os e2e da auditoria. Seguem o padrão esperado das telas:
 * acesso ao banco por `txHost.tx` e retorno da entidade resultante.
 */
@Controller('test-fixtures/empresas')
@SomenteAutenticado()
class AuditFixtureController {
  constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {}

  @Post()
  @Audit({ entity: 'Empresa' })
  criar(@Body() body: EmpresaInput) {
    return this.txHost.tx.empresa.create({ data: body });
  }

  @Patch(':id')
  @Audit({ entity: 'Empresa' })
  async alterar(@Param('id', ParseUUIDPipe) id: string, @Body() body: Partial<EmpresaInput>) {
    await this.buscar(id);
    return this.txHost.tx.empresa.update({ where: { id }, data: body });
  }

  @Delete(':id')
  @Audit({ entity: 'Empresa' })
  async excluir(@Param('id', ParseUUIDPipe) id: string) {
    await this.buscar(id);
    return this.txHost.tx.empresa.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  /** Rota pública: a auditoria grava "anonymous" quando não há usuário. */
  @Post('publico')
  @Public()
  @Audit({ entity: 'Empresa' })
  criarPublico(@Body() body: EmpresaInput) {
    return this.txHost.tx.empresa.create({ data: body });
  }

  /** Grava e depois falha: a transação deve desfazer a escrita e não auditar. */
  @Post('falha')
  @Audit({ entity: 'Empresa' })
  async criarComFalha(@Body() body: EmpresaInput) {
    await this.txHost.tx.empresa.create({ data: body });
    throw new BadRequestException('Falha de negócio depois da escrita');
  }

  /** Erro de programação: CREATE sem id no retorno não pode ser gravado sem auditoria. */
  @Post('sem-id')
  @Audit({ entity: 'Empresa' })
  async criarSemId(@Body() body: EmpresaInput) {
    const empresa = await this.txHost.tx.empresa.create({ data: body });
    return { nome: empresa.nome };
  }

  /** Retorno com credenciais: não podem chegar ao audit_log. */
  @Patch(':id/credenciais')
  @Audit({ entity: 'Empresa' })
  async alterarComCredenciais(@Param('id', ParseUUIDPipe) id: string) {
    const empresa = await this.txHost.tx.empresa.update({ where: { id }, data: { nome: 'Nova' } });
    return {
      ...empresa,
      passwordHash: 'hash',
      accessToken: 'token',
      integracao: { clientSecret: 'segredo', senha: 'x', ativo: true },
    };
  }

  @Get('exportar')
  @Audit({ entity: 'Empresa', action: 'EXPORT' })
  exportar() {
    return { arquivo: 'empresas.xlsx' };
  }

  private async buscar(id: string) {
    const empresa = await this.txHost.tx.empresa.findUnique({ where: { id } });
    if (!empresa) throw new NotFoundException('Empresa não encontrada');
    return empresa;
  }
}

@Module({ controllers: [AuditFixtureController] })
export class AuditFixtureModule {}
