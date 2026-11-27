import type { TipoCancelamento } from '@torres/shared';
import type { MotivoCancelamento } from '../../src/generated/prisma/client';
import type { PrismaService } from '../../src/common/prisma/prisma.service';

/** Motivo fictício do tipo, direto no banco (`truncateAll` apaga os da migration). */
export function criarMotivo(
  prisma: PrismaService,
  tipo: TipoCancelamento,
  extra: Partial<
    Pick<MotivoCancelamento, 'nome' | 'codigo' | 'exigeTexto' | 'sistema' | 'ordem' | 'ativo'>
  > & { deletedAt?: Date } = {},
): Promise<MotivoCancelamento> {
  const nome = extra.nome ?? 'Motivo fictício';
  return prisma.motivoCancelamento.create({
    data: {
      tipo,
      nome,
      codigo: extra.codigo ?? nome.toLowerCase().replaceAll(/\W+/g, '_'),
      exigeTexto: extra.exigeTexto ?? false,
      sistema: extra.sistema ?? false,
      ordem: extra.ordem ?? 1,
      ativo: extra.ativo ?? true,
      deletedAt: extra.deletedAt,
    },
  });
}

/** "Outro" do tipo: motivo de sistema que exige a observação. */
export function criarMotivoOutro(
  prisma: PrismaService,
  tipo: TipoCancelamento,
): Promise<MotivoCancelamento> {
  return criarMotivo(prisma, tipo, {
    nome: 'Outro',
    codigo: 'outro',
    exigeTexto: true,
    sistema: true,
    ordem: 99,
  });
}

/** Motivo de sistema usado pelo cancelamento em cascata das parcelas de um contrato. */
export function criarMotivoContratoEncerrado(prisma: PrismaService): Promise<MotivoCancelamento> {
  return criarMotivo(prisma, 'COBRANCA', {
    nome: 'Contrato encerrado ou cancelado',
    codigo: 'contrato_cancelado',
    sistema: true,
    ordem: 5,
  });
}
