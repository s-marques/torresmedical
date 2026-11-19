import type { PrismaService } from '../../src/common/prisma/prisma.service';

/** Limpa as tabelas entre testes e2e (o banco de teste é exclusivo dos testes). */
export async function truncateAll(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE audit_log, prestadores, preferencias_usuario, agente_instrucao_versoes, agente_instrucoes, agente_instrucoes_extras, agente_alertas_destinos, agente_regras, bypass_agentes, documentos_conhecimento, pesquisas_nps, usuarios_profissionais, configuracao_confirmacao, atividades_negocio, negocios, estagios_pipeline, pipelines, motivos_perda, conversas_tags, mensagens_whatsapp, conversas_whatsapp, contatos_whatsapp, canais_whatsapp, tags_atendimento, respostas_rapidas, outbox_events, processed_events, arquivos, prontuarios, atendimentos, anamneses, agendamentos, pacientes, origens_cliente, horarios_atendimento, bloqueios_agenda, servicos_profissionais, protocolo_mae_semanas, protocolos_mae, protocolo_itens, protocolos, contratos_sala_horas, contratos_sala_dias, contratos_sala, salas, profissionais, especialidades, produtos, categorias, unidades_medida, fornecedores, comissoes, funcionarios, cargos, formas_pagamento, planos_contas, contas_bancarias, bandeiras, tipos_agendamento, redefinicoes_senha, sessoes, perfis_permissoes, perfis, usuarios, unidades, empresas RESTART IDENTITY CASCADE',
  );
}
