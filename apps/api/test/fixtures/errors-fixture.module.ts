import { Controller, Get, Module } from '@nestjs/common';
import { Public } from '../../src/common/auth/auth.decorators';
import { PrismaService } from '../../src/common/prisma/prisma.service';

/** Rotas que falham de propósito, para testar o filtro global de exceções. */
@Public()
@Controller('test-fixtures/erros')
class ErrorsFixtureController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('inesperado')
  inesperado(): never {
    throw new Error('Falha inesperada com dado sensível 123.456.789-00');
  }

  @Get('sql')
  async sql(): Promise<unknown> {
    return this.prisma.$queryRawUnsafe('SELECT * FROM tabela_que_nao_existe');
  }

  @Get('registro-inexistente')
  async registroInexistente(): Promise<unknown> {
    return this.prisma.empresa.update({
      where: { id: '00000000-0000-4000-8000-000000000000' },
      data: { nome: 'x' },
    });
  }
}

@Module({ controllers: [ErrorsFixtureController] })
export class ErrorsFixtureModule {}
