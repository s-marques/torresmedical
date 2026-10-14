import { ClsPluginTransactional } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { PrismaModule } from './prisma.module';
import { PrismaService } from './prisma.service';

/**
 * Adapter do Prisma para o `TransactionHost`. Os services acessam o banco por
 * `TransactionHost<PrismaAdapter>` (`this.txHost.tx`): dentro de uma transação aberta
 * (ex.: endpoints com `@Audit`) usam o client dela; fora, o `PrismaService`.
 */
export type PrismaAdapter = TransactionalAdapterPrisma<PrismaService>;

export function prismaTransactionalPlugin(): ClsPluginTransactional {
  return new ClsPluginTransactional({
    imports: [PrismaModule],
    adapter: new TransactionalAdapterPrisma<PrismaService>({
      prismaInjectionToken: PrismaService,
      // Habilita transações aninhadas (savepoints).
      sqlFlavor: 'postgresql',
    }),
  });
}
