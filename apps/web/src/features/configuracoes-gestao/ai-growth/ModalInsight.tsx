import type { AiGrowthInsight } from '@torres/shared';
import { SparklesIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/shared/Modal';
import { Badge } from '@/components/ui/badge';
import { textosDoInsight } from './textos-insight';

export interface ModalInsightProps {
  insight: AiGrowthInsight | null;
  onFechar: () => void;
}

/** "Ver detalhes" do card: texto completo, status, prioridade e o que fazer. */
export function ModalInsight({ insight, onFechar }: Readonly<ModalInsightProps>) {
  const { t } = useTranslation();
  const textos = insight ? textosDoInsight(t, insight) : null;
  return (
    <Modal
      aberto={insight !== null}
      onAbertoChange={(aberto) => !aberto && onFechar()}
      titulo={textos?.titulo ?? ''}
      tamanho="lg"
    >
      {insight && textos && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{textos.descricao}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{textos.destaque}</Badge>
            <Badge variant="outline">
              {t('aiGrowth.prioridadeChip', {
                nivel: t(`aiGrowth.prioridade.${insight.prioridade}`),
              })}
            </Badge>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
            <p className="font-semibold">{t('aiGrowth.oQueFazer')}</p>
            <p className="mt-1 flex gap-2">
              <SparklesIcon className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
              {textos.acao}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">{t('aiGrowth.rodape')}</p>
        </div>
      )}
    </Modal>
  );
}
