import type { ContaPagarPossivelDuplicada } from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/ui/button';
import { formatarData } from '@/lib/formatar';
import { formatarMoeda } from '@/lib/forms/mascaras';

export interface AlertaDuplicidadeContaPagarProps {
  candidatos: readonly ContaPagarPossivelDuplicada[];
  /** "Lançar mesmo assim": o usuário assume que não é a mesma conta (fica na auditoria). */
  onContinuar: () => void;
  /** Esc ou clique fora: volta ao formulário sem confirmar. */
  onFechar: () => void;
}

/**
 * Alerta de possível conta a pagar duplicada (issue #163): lista os títulos parecidos, com o
 * motivo, e deixa voltar ao formulário ou lançar mesmo assim.
 */
export function AlertaDuplicidadeContaPagar({
  candidatos,
  onContinuar,
  onFechar,
}: Readonly<AlertaDuplicidadeContaPagarProps>) {
  const { t } = useTranslation();

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={t('contasPagar.duplicidade.titulo')}
      descricao={t('contasPagar.duplicidade.pergunta')}
      rodape={
        <>
          <Button type="button" variant="outline" onClick={onFechar}>
            {t('contasPagar.duplicidade.voltar')}
          </Button>
          <Button type="button" onClick={onContinuar}>
            {t('contasPagar.duplicidade.continuar')}
          </Button>
        </>
      }
    >
      <ul aria-label={t('contasPagar.duplicidade.lista')} className="grid gap-3">
        {candidatos.map((c) => (
          <li key={c.id} className="grid gap-1 rounded-md border p-3 text-sm">
            <span className="font-medium">
              {t('contasPagar.duplicidade.item', { numero: c.numero, descricao: c.descricao })}
            </span>
            <span className="text-xs text-muted-foreground">
              {t('contasPagar.duplicidade.detalhe', {
                beneficiario: c.beneficiarioNome ?? t('contasPagar.duplicidade.semBeneficiario'),
                valor: formatarMoeda(Number(c.valor)),
                data: formatarData(c.dataVencimento),
              })}
            </span>
            <span className="text-xs text-muted-foreground">
              {c.motivos.map((m) => t(`contasPagar.duplicidade.motivos.${m}`)).join(' · ')}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
