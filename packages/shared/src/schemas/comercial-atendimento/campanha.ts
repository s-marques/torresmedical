import { z } from 'zod';
import { listQuerySchema } from '../common/list-query';
import { erroObrigatorio, mensagemObrigatoria, textoObrigatorio } from '../common/obrigatorio';
import { paginatedResponseSchema, paginationQuerySchema } from '../common/pagination';
import { uuidOpcional } from './negocio';

/**
 * Campanhas (tela Campanhas, `/campanhas`): envios agendados em massa (aba Envios Agendados) e
 * mensagens automáticas recorrentes (aba Mensagens Automáticas), pelo WhatsApp.
 */

export const CAMPANHA_NOME_MAX = 120;
export const CAMPANHA_MENSAGEM_MAX = 4096;
export const CAMPANHA_INTERVALO_PADRAO = 5;
export const CAMPANHA_INTERVALO_MAX = 3600;
export const CAMPANHA_DIAS_COMPRA_MAX = 365;
export const CAMPANHA_QUANTIDADE_MAX = 100_000;

/** "Tipo de Envio". Só texto até existir a integração com o provedor de WhatsApp. */
export const CAMPANHA_TIPOS_ENVIO = ['TEXTO'] as const;
export type CampanhaTipoEnvio = (typeof CAMPANHA_TIPOS_ENVIO)[number];
export const CAMPANHA_TIPO_ENVIO_ROTULO: Readonly<Record<CampanhaTipoEnvio, string>> = {
  TEXTO: 'Texto',
};

/** "Filtro de Clientes": quem recebe. Só pacientes ativos com celular. */
export const CAMPANHA_FILTROS = [
  'TODOS',
  'ANIVERSARIANTES_DIA',
  'ORIGEM',
  'COMPRA_RECENTE',
] as const;
export type CampanhaFiltro = (typeof CAMPANHA_FILTROS)[number];
export const CAMPANHA_FILTRO_ROTULO: Readonly<Record<CampanhaFiltro, string>> = {
  TODOS: 'Todos os clientes',
  ANIVERSARIANTES_DIA: 'Aniversariantes do dia',
  ORIGEM: 'Por origem de cliente',
  COMPRA_RECENTE: 'Com compra recente',
};

export const CAMPANHA_STATUS = ['AGENDADA', 'ENVIANDO', 'CONCLUIDA', 'CANCELADA'] as const;
export type CampanhaStatus = (typeof CAMPANHA_STATUS)[number];
export const CAMPANHA_STATUS_ROTULO: Readonly<Record<CampanhaStatus, string>> = {
  AGENDADA: 'Agendada',
  ENVIANDO: 'Enviando',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
};

/** Variáveis da mensagem, trocadas pelos dados de cada destinatário no envio. */
export const CAMPANHA_VARIAVEIS = ['{nome}', '{telefone}', '{ultima_compra}'] as const;

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const inteiroOpcional = (rotulo: string, min: number, max: number) =>
  z
    .number({ error: `${rotulo} inválido` })
    .int({ error: `${rotulo} deve ser um número inteiro` })
    .min(min, { error: `${rotulo} deve ser no mínimo ${min}` })
    .max(max, { error: `${rotulo} deve ser no máximo ${max}` })
    .nullish()
    .transform((valor) => valor ?? null);

/** Filtro de Clientes e os campos que ele pede (origem ou dias desde a última compra). */
export const filtroDestinatariosCampos = {
  filtro: z.enum(CAMPANHA_FILTROS, { error: 'Filtro de clientes inválido' }).default('TODOS'),
  origemClienteId: uuidOpcional('Origem inválida'),
  diasCompra: inteiroOpcional('Dias', 1, CAMPANHA_DIAS_COMPRA_MAX),
};

type FiltroDestinatarios = {
  filtro: CampanhaFiltro;
  origemClienteId: string | null;
  diasCompra: number | null;
};

function exigirCamposDoFiltro(valor: FiltroDestinatarios, ctx: z.RefinementCtx): void {
  if (valor.filtro === 'ORIGEM' && !valor.origemClienteId) {
    ctx.addIssue({
      code: 'custom',
      path: ['origemClienteId'],
      message: mensagemObrigatoria('Origem', 'f'),
    });
  }
  if (valor.filtro === 'COMPRA_RECENTE' && valor.diasCompra === null) {
    ctx.addIssue({
      code: 'custom',
      path: ['diasCompra'],
      message: mensagemObrigatoria('Dias desde a compra', 'm'),
    });
  }
}

const canalObrigatorio = z.uuid({ error: erroObrigatorio('Canal WhatsApp') });
const mensagemCampo = textoObrigatorio('Mensagem', { genero: 'f', max: CAMPANHA_MENSAGEM_MAX });
const tipoEnvioCampo = z
  .enum(CAMPANHA_TIPOS_ENVIO, { error: 'Tipo de envio inválido' })
  .default('TEXTO');

/**
 * `POST /campanhas` e `PATCH /campanhas/:id`: modal "Nova Campanha". Sem data e hora, a campanha
 * sai no próximo minuto; com uma, a outra também é obrigatória. Quantidade vazia = todos.
 */
export const campanhaInputSchema = z
  .strictObject({
    nome: textoObrigatorio('Nome da Campanha', { max: CAMPANHA_NOME_MAX }),
    tipoEnvio: tipoEnvioCampo,
    canalId: canalObrigatorio,
    ...filtroDestinatariosCampos,
    quantidade: inteiroOpcional('Quantidade de envios', 1, CAMPANHA_QUANTIDADE_MAX),
    intervaloSegundos: z
      .number({ error: 'Intervalo inválido' })
      .int({ error: 'Intervalo deve ser um número inteiro' })
      .min(1, { error: 'Intervalo deve ser no mínimo 1 segundo' })
      .max(CAMPANHA_INTERVALO_MAX, {
        error: `Intervalo deve ser no máximo ${CAMPANHA_INTERVALO_MAX} segundos`,
      })
      .nullish()
      .transform((valor) => valor ?? CAMPANHA_INTERVALO_PADRAO),
    data: z
      .union([z.iso.date({ error: 'Data inválida' }), z.literal('')])
      .nullish()
      .transform((valor) => valor || null),
    hora: z
      .union([z.string().regex(HORA, { error: 'Hora inválida (HH:MM)' }), z.literal('')])
      .nullish()
      .transform((valor) => valor || null),
    mensagem: mensagemCampo,
  })
  .superRefine((valor, ctx) => {
    exigirCamposDoFiltro(valor, ctx);
    if (valor.data && !valor.hora) {
      ctx.addIssue({ code: 'custom', path: ['hora'], message: mensagemObrigatoria('Hora', 'f') });
    }
    if (valor.hora && !valor.data) {
      ctx.addIssue({ code: 'custom', path: ['data'], message: mensagemObrigatoria('Data', 'f') });
    }
  });
export type CampanhaInput = z.output<typeof campanhaInputSchema>;
export type CampanhaFormulario = z.input<typeof campanhaInputSchema>;

export const campanhaSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  tipoEnvio: z.enum(CAMPANHA_TIPOS_ENVIO),
  canalId: z.uuid(),
  canal: z.string(),
  filtro: z.enum(CAMPANHA_FILTROS),
  origemClienteId: z.uuid().nullable(),
  origem: z.string().nullable(),
  diasCompra: z.number().int().nullable(),
  quantidade: z.number().int().nullable(),
  intervaloSegundos: z.number().int(),
  agendadaPara: z.iso.datetime(),
  mensagem: z.string(),
  status: z.enum(CAMPANHA_STATUS),
  /** Destinatários programados (definidos quando a campanha começa a sair). */
  totalDestinatarios: z.number().int(),
  /** Mensagens já entregues à fila do WhatsApp. */
  totalEnviados: z.number().int(),
  totalFalhas: z.number().int(),
  iniciadaEm: z.iso.datetime().nullable(),
  concluidaEm: z.iso.datetime().nullable(),
  canceladaEm: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type Campanha = z.infer<typeof campanhaSchema>;
export const campanhaPageSchema = paginatedResponseSchema(campanhaSchema);
export type CampanhaPage = z.infer<typeof campanhaPageSchema>;

/** `GET /campanhas`: cartões da aba Envios Agendados e o Histórico de Campanhas. */
export const listCampanhasQuerySchema = listQuerySchema({
  sortFields: ['agendadaPara', 'nome', 'status', 'createdAt'],
  defaultSort: 'agendadaPara:desc',
  filters: { status: z.enum(CAMPANHA_STATUS, { error: 'Status inválido' }).optional() },
});
export type ListCampanhasQuery = z.infer<typeof listCampanhasQuerySchema>;

/** `GET /campanhas/destinatarios` ("Visualizar Clientes"): quem o filtro alcança. */
export const destinatariosQuerySchema = paginationQuerySchema
  .extend({
    filtro: z.enum(CAMPANHA_FILTROS, { error: 'Filtro de clientes inválido' }).default('TODOS'),
    origemClienteId: z.uuid({ error: 'Origem inválida' }).optional(),
    diasCompra: z.coerce
      .number({ error: 'Dias inválido' })
      .int()
      .min(1)
      .max(CAMPANHA_DIAS_COMPRA_MAX)
      .optional(),
  })
  .transform((valor) => ({
    ...valor,
    origemClienteId: valor.origemClienteId ?? null,
    diasCompra: valor.diasCompra ?? null,
  }))
  .superRefine(exigirCamposDoFiltro);
export type DestinatariosQuery = z.output<typeof destinatariosQuerySchema>;

/** Destinatário no "Visualizar Clientes": telefone mascarado, sem outros dados. */
export const destinatarioSchema = z.object({
  pacienteId: z.uuid(),
  nome: z.string(),
  telefone: z.string(),
});
export type Destinatario = z.infer<typeof destinatarioSchema>;
export const destinatarioPageSchema = paginatedResponseSchema(destinatarioSchema);

/** `(65) 99999-0000` → `(65) 9****-0000`: só DDD, primeiro dígito e final. */
export function mascararTelefone(telefone: string): string {
  const d = telefone.replaceAll(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (d.length < 8) return '****';
  const ddd = d.length >= 10 ? `(${d.slice(0, 2)}) ` : '';
  const numero = d.length >= 10 ? d.slice(2) : d;
  return `${ddd}${numero.slice(0, 1)}****-${numero.slice(-4)}`;
}

/**
 * Troca as variáveis da mensagem pelos dados do destinatário. Variável sem valor vira texto
 * vazio (ex.: `{ultima_compra}` de quem nunca comprou).
 */
export function aplicarVariaveis(
  mensagem: string,
  dados: { nome: string; telefone: string; ultimaCompra: string | null },
): string {
  return mensagem
    .replaceAll('{nome}', dados.nome)
    .replaceAll('{telefone}', dados.telefone)
    .replaceAll('{ultima_compra}', dados.ultimaCompra ?? '');
}

// ---------- Mensagens Automáticas ----------

/**
 * `POST /mensagens-automaticas` e `PATCH /mensagens-automaticas/:id`: modal "Nova Automação".
 * Sai todo dia escolhido, no horário, para quem o filtro alcança naquele dia.
 */
export const mensagemAutomaticaInputSchema = z
  .strictObject({
    nome: textoObrigatorio('Nome', { max: CAMPANHA_NOME_MAX }),
    tipoEnvio: tipoEnvioCampo,
    canalId: canalObrigatorio,
    ...filtroDestinatariosCampos,
    horario: z
      .string({ error: erroObrigatorio('Horário') })
      .min(1, { error: erroObrigatorio('Horário'), abort: true })
      .regex(HORA, { error: 'Horário inválido (HH:MM)' }),
    diasSemana: z
      .array(z.number().int().min(0).max(6), { error: 'Dias da semana inválidos' })
      .min(1, { error: 'Selecione ao menos um dia da semana.' })
      .transform((dias) => [...new Set(dias)].sort((a, b) => a - b)),
    ativa: z.boolean().default(true),
    mensagem: mensagemCampo,
  })
  .superRefine(exigirCamposDoFiltro);
export type MensagemAutomaticaInput = z.output<typeof mensagemAutomaticaInputSchema>;
export type MensagemAutomaticaFormulario = z.input<typeof mensagemAutomaticaInputSchema>;

/** `PATCH /mensagens-automaticas/:id/ativa`: o switch do cartão. */
export const ativarMensagemAutomaticaSchema = z.strictObject({
  ativa: z.boolean({ error: 'Informe se a automação fica ativa' }),
});
export type AtivarMensagemAutomaticaInput = z.output<typeof ativarMensagemAutomaticaSchema>;

export const mensagemAutomaticaSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  tipoEnvio: z.enum(CAMPANHA_TIPOS_ENVIO),
  canalId: z.uuid(),
  canal: z.string(),
  filtro: z.enum(CAMPANHA_FILTROS),
  origemClienteId: z.uuid().nullable(),
  origem: z.string().nullable(),
  diasCompra: z.number().int().nullable(),
  horario: z.string(),
  diasSemana: z.array(z.number().int()),
  ativa: z.boolean(),
  mensagem: z.string(),
  totalEnviados: z.number().int(),
  ultimoEnvioEm: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type MensagemAutomatica = z.infer<typeof mensagemAutomaticaSchema>;
export const mensagemAutomaticaListaSchema = z.array(mensagemAutomaticaSchema);

// ---------- Relatórios ----------

/** Cartões da aba Relatórios. */
export const resumoCampanhasSchema = z.object({
  totalCampanhas: z.number().int(),
  concluidas: z.number().int(),
  /** Mensagens que o provedor confirmou (enviada, entregue ou lida). */
  mensagensEnviadas: z.number().int(),
  destinatarios: z.number().int(),
  /** 0 a 100: confirmadas sobre as já entregues à fila. */
  taxaSucesso: z.number(),
  automacoes: z.number().int(),
  automacoesAtivas: z.number().int(),
  automacoesEnviados: z.number().int(),
});
export type ResumoCampanhas = z.infer<typeof resumoCampanhasSchema>;
