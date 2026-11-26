import type { CobrancaEnviada } from '@torres/shared';
import type { TFunction } from 'i18next';
import type { ColunaGrid } from '@/components/shared/data-grid/tipos';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { formatarData, formatarDataHora } from '@/lib/formatar';

/** Motivo da falha para quem lê o histórico (`SEM_TELEFONE`, `SEM_CANAL`). */
export function rotuloErroCobranca(t: TFunction, erro: string | null): string {
  return erro ? t(`inadimplencia.historico.erros.${erro}`, { defaultValue: erro }) : '-';
}

export function colunasHistorico(t: TFunction): ColunaGrid<CobrancaEnviada>[] {
  return [
    {
      id: 'contaReceberNumero',
      titulo: t('inadimplencia.historico.colunas.titulo'),
      tituloCartao: true,
      celula: (envio) => `#${envio.contaReceberNumero}`,
    },
    {
      id: 'profissionalNome',
      titulo: t('inadimplencia.historico.colunas.profissional'),
      celula: (envio) => envio.profissionalNome ?? '-',
    },
    {
      id: 'marco',
      titulo: t('inadimplencia.historico.colunas.marco'),
      ordenavel: true,
      celula: (envio) => t(`inadimplencia.regua.marcos.${envio.marco}`),
    },
    {
      id: 'status',
      titulo: t('inadimplencia.historico.colunas.situacao'),
      celula: (envio) => (
        <StatusBadge tom={envio.status === 'ENVIADO' ? 'sucesso' : 'perigo'}>
          {t(`inadimplencia.historico.status.${envio.status}`)}
        </StatusBadge>
      ),
    },
    {
      id: 'erro',
      titulo: t('inadimplencia.historico.colunas.motivo'),
      celula: (envio) => rotuloErroCobranca(t, envio.erro),
    },
    {
      id: 'vencimento',
      titulo: t('inadimplencia.historico.colunas.vencimento'),
      celula: (envio) => formatarData(envio.vencimento),
    },
    {
      id: 'createdAt',
      titulo: t('inadimplencia.historico.colunas.enviadoEm'),
      ordenavel: true,
      celula: (envio) => formatarDataHora(envio.createdAt),
    },
  ];
}
