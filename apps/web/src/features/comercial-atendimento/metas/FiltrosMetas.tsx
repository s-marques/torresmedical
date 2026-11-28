import { META_METRICAS, type AcompanhamentoMetasQuery } from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useResponsaveisMetas } from './use-metas';

const TODOS = '__todos__';

export interface FiltrosMetasProps {
  valor: AcompanhamentoMetasQuery;
  onChange: (valor: AcompanhamentoMetasQuery) => void;
}

/** Filtros do acompanhamento: período De/Até, responsável e métrica. */
export function FiltrosMetas({ valor, onChange }: Readonly<FiltrosMetasProps>) {
  const { t } = useTranslation();
  const responsaveis = useResponsaveisMetas();
  const alterar = (parcial: Partial<AcompanhamentoMetasQuery>) =>
    onChange({ ...valor, ...parcial });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="date"
        aria-label={t('metas.filtros.de')}
        className="w-40"
        value={valor.de ?? ''}
        onChange={(e) => alterar({ de: e.target.value || undefined })}
      />
      <Input
        type="date"
        aria-label={t('metas.filtros.ate')}
        className="w-40"
        value={valor.ate ?? ''}
        onChange={(e) => alterar({ ate: e.target.value || undefined })}
      />
      <Select
        value={valor.responsavelId ?? TODOS}
        onValueChange={(v) => alterar({ responsavelId: v === TODOS ? undefined : v })}
      >
        <SelectTrigger aria-label={t('metas.filtros.responsavel')} className="w-52">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>{t('metas.filtros.todosResponsaveis')}</SelectItem>
          {(responsaveis.data ?? []).map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={valor.metrica ?? TODOS}
        onValueChange={(v) =>
          alterar({ metrica: v === TODOS ? undefined : (v as (typeof META_METRICAS)[number]) })
        }
      >
        <SelectTrigger aria-label={t('metas.filtros.metrica')} className="w-52">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>{t('metas.filtros.todasMetricas')}</SelectItem>
          {META_METRICAS.map((m) => (
            <SelectItem key={m} value={m}>
              {t(`metas.metricas.${m}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
