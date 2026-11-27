import { z } from 'zod';
import type { Permissao } from '../../auth/permissoes';

/**
 * Central de notificações e tarefas do dia (issue #160). Cada alerta é um contador por tipo e por
 * dia ("3 contas vencidas"), gerado pelo job diário. Os tipos entram por etapa: esta traz o
 * financeiro; contratos, documentos, leads, confirmações e os demais seguem nas próximas.
 */
export const TIPOS_ALERTA = [
  'CONTAS_PAGAR_VENCENDO',
  'CONTAS_PAGAR_VENCIDAS',
  'RECEBIVEIS_VENCIDOS',
  'CONTAS_PAGAR_AGUARDANDO_APROVACAO',
  'COBRANCAS_REGUA',
] as const;
export type TipoAlerta = (typeof TIPOS_ALERTA)[number];
export const tipoAlertaSchema = z.enum(TIPOS_ALERTA, { error: 'Tipo de alerta inválido' });

interface DefinicaoAlerta {
  /** Quem pode ver a tela da lista vê o alerta (permissão da tela de origem do dado). */
  permissao: Permissao;
  /** Dado de profissional: some para o perfil com escopo restrito (a contagem é da clínica toda). */
  dadoPorProfissional: boolean;
  /** Rota do front com a lista já filtrada, calculada para o dia do alerta. */
  rota: (dia: string) => string;
}

export const DEFINICAO_ALERTA: Readonly<Record<TipoAlerta, DefinicaoAlerta>> = {
  CONTAS_PAGAR_VENCENDO: {
    permissao: 'financeiro.contas-pagar.ver',
    dadoPorProfissional: false,
    rota: (dia) => `/pagar?status=PENDENTE&vencimentoDe=${dia}&vencimentoAte=${dia}`,
  },
  CONTAS_PAGAR_VENCIDAS: {
    permissao: 'financeiro.contas-pagar.ver',
    dadoPorProfissional: false,
    rota: () => '/pagar?status=VENCIDO',
  },
  CONTAS_PAGAR_AGUARDANDO_APROVACAO: {
    permissao: 'financeiro.contas-pagar.aprovar',
    dadoPorProfissional: false,
    rota: () => '/pagar?status=PENDENTE&aprovacao=LANCADA',
  },
  COBRANCAS_REGUA: {
    permissao: 'financeiro.inadimplencia.ver',
    dadoPorProfissional: false,
    rota: () => '/financeiro/inadimplencia',
  },
  RECEBIVEIS_VENCIDOS: {
    permissao: 'financeiro.contas-receber.ver',
    dadoPorProfissional: false,
    rota: () => '/receber?status=VENCIDO',
  },
};

export function rotaAlerta(tipo: TipoAlerta, dia: string): string {
  return DEFINICAO_ALERTA[tipo].rota(dia);
}

/** Tipos que o usuário pode ver, pela permissão da tela de origem e pelo escopo de dados. */
export function tiposVisiveis(
  permissoes: ReadonlySet<string>,
  escopoRestrito: boolean,
): TipoAlerta[] {
  return TIPOS_ALERTA.filter((tipo) => {
    const definicao = DEFINICAO_ALERTA[tipo];
    if (escopoRestrito && definicao.dadoPorProfissional) return false;
    return permissoes.has(definicao.permissao);
  });
}

export const alertaSchema = z.object({
  id: z.uuid(),
  tipo: tipoAlertaSchema,
  /** Dia a que a contagem se refere (`AAAA-MM-DD`). */
  data: z.iso.date(),
  quantidade: z.number().int().nonnegative(),
  /** Lista já filtrada no front. */
  rota: z.string(),
  lido: z.boolean(),
  resolvido: z.boolean(),
});
export type Alerta = z.infer<typeof alertaSchema>;

/** `GET /api/painel/alertas`: os alertas do dia do usuário e o total ainda não lido. */
export const alertasResumoSchema = z.object({
  data: z.array(alertaSchema),
  naoLidos: z.number().int().nonnegative(),
});
export type AlertasResumo = z.infer<typeof alertasResumoSchema>;

export const listAlertasQuerySchema = z.strictObject({
  /** Inclui os que o usuário já marcou como resolvidos. */
  incluirResolvidos: z
    .enum(['true', 'false'], { error: 'Valor inválido' })
    .default('false')
    .transform((valor) => valor === 'true'),
});
export type ListAlertasQuery = z.output<typeof listAlertasQuerySchema>;
