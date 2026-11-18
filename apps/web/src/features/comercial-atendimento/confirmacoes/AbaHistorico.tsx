import {
  CONFIRMACAO_ETAPA_ROTULO,
  confirmacaoHistoricoPageSchema,
  listHistoricoConfirmacoesQuerySchema,
  type ConfirmacaoHistorico,
} from '@torres/shared';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid } from '@/components/shared/data-grid/tipos';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { formatarDataHoraCurta } from './formatar';
import { URL_CONFIRMACOES } from './use-confirmacoes';

const MOTIVOS: Record<string, string> = {
  SEM_CANAL: 'falha_canal',
  SEM_CELULAR: 'falha_celular',
};

/** Resultado como no legado: "whatsapp - enviado" ou "whatsapp - falha_canal". */
function resultado(h: ConfirmacaoHistorico): string {
  if (h.status === 'ENVIADO') return 'whatsapp - enviado';
  return `whatsapp - ${(h.erro && MOTIVOS[h.erro]) ?? 'falha'}`;
}

const COLUNAS: ColunaGrid<ConfirmacaoHistorico>[] = [
  {
    id: 'agendamentoNumero',
    titulo: 'Agendamento',
    ocultavel: false,
    celula: (h) => `Agendamento #${h.agendamentoNumero}`,
  },
  {
    id: 'etapa',
    titulo: 'Mensagem',
    celula: (h) => CONFIRMACAO_ETAPA_ROTULO[h.etapa],
  },
  {
    id: 'status',
    titulo: 'Resultado',
    celula: (h) => (
      <StatusBadge tom={h.status === 'ENVIADO' ? 'sucesso' : 'perigo'}>{resultado(h)}</StatusBadge>
    ),
  },
  {
    id: 'ocorridoEm',
    titulo: 'Data',
    celula: (h) => formatarDataHoraCurta(h.ocorridoEm),
  },
];

/** Aba Histórico: cada envio de confirmação e o resultado, do mais recente ao mais antigo. */
export function AbaHistorico() {
  return (
    <div className="grid gap-3">
      <h2 className="text-base font-semibold">Historico de Confirmacoes</h2>
      <DataGrid
        url={`${URL_CONFIRMACOES}/historico`}
        schema={confirmacaoHistoricoPageSchema}
        querySchema={listHistoricoConfirmacoesQuerySchema}
        colunas={COLUNAS}
        busca={false}
        mensagemVazio="Nenhuma confirmação enviada."
      />
    </div>
  );
}
