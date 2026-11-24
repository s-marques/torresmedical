import type { ClassificacaoParceiro } from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { StatusBadge, type TomStatus } from '@/components/shared/StatusBadge';

const TONS: Readonly<Record<ClassificacaoParceiro, TomStatus>> = {
  NOVO: 'info',
  ATIVO: 'sucesso',
  ESTRATEGICO: 'destaque',
  EM_EXPANSAO: 'sucesso',
  EM_RISCO: 'perigo',
  INATIVO: 'neutro',
};

/** Selo da classificação do parceiro; sem cálculo ainda, um traço. */
export function ClassificacaoBadge({
  classificacao,
}: Readonly<{ classificacao: ClassificacaoParceiro | null }>) {
  const { t } = useTranslation();
  if (classificacao === null) return <span className="text-muted-foreground">-</span>;
  return (
    <StatusBadge tom={TONS[classificacao]}>
      {t(`classificacao.rotulos.${classificacao}`)}
    </StatusBadge>
  );
}
