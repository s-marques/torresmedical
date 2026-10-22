import type { PrismaService } from '../../src/common/prisma/prisma.service';

/** Limpa as tabelas entre testes e2e (o banco de teste é exclusivo dos testes). */
export async function truncateAll(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE audit_log, outbox_events, processed_events, arquivos, pacientes, origens_cliente, horarios_atendimento, bloqueios_agenda, servicos_profissionais, contratos_sala_horas, contratos_sala_dias, contratos_sala, salas, profissionais, especialidades, produtos, categorias, unidades_medida, fornecedores, funcionarios, cargos, formas_pagamento, bandeiras, tipos_agendamento, redefinicoes_senha, sessoes, perfis_permissoes, perfis, usuarios, unidades, empresas RESTART IDENTITY CASCADE',
  );
}
