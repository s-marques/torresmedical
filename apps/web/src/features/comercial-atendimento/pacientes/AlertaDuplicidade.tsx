import type { PacientePossivelDuplicado } from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/ui/button';
import { formatoData } from '@/lib/i18n';

export interface AlertaDuplicidadeProps {
  candidatos: readonly PacientePossivelDuplicado[];
  /** "Abrir registro existente": fecha o cadastro e abre o paciente escolhido. */
  onAbrir: (id: string) => void;
  /** "Continuar cadastro": o usuário assume que não é o mesmo paciente (fica na auditoria). */
  onContinuar: () => void;
  /** Esc ou clique fora: volta ao formulário sem confirmar. */
  onFechar: () => void;
  /** Desabilita os botões enquanto abre o registro escolhido. */
  ocupado?: boolean;
}

/**
 * Alerta de possível paciente duplicado (issue #149): lista os cadastros parecidos, com o motivo,
 * e deixa abrir um deles ou continuar. O CPF vem mascarado e só para quem tem `verDadosSensiveis`.
 */
export function AlertaDuplicidade({
  candidatos,
  onAbrir,
  onContinuar,
  onFechar,
  ocupado = false,
}: Readonly<AlertaDuplicidadeProps>) {
  const { t } = useTranslation();
  const data = (iso: string) =>
    formatoData({ dateStyle: 'short', timeZone: 'UTC' }).format(new Date(iso));

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={t('pacienteDuplicidade.titulo')}
      descricao={t('pacienteDuplicidade.pergunta')}
      rodape={
        <>
          <Button type="button" variant="outline" disabled={ocupado} onClick={onFechar}>
            {t('pacienteDuplicidade.voltar')}
          </Button>
          <Button type="button" disabled={ocupado} onClick={onContinuar}>
            {t('pacienteDuplicidade.continuar')}
          </Button>
        </>
      }
    >
      <ul aria-label={t('pacienteDuplicidade.lista')} className="grid gap-3">
        {candidatos.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
          >
            <div className="grid gap-1 text-sm">
              <span className="font-medium">{c.nome}</span>
              {c.cpfMascarado && (
                <span className="font-mono text-xs text-muted-foreground">
                  {t('pacienteDuplicidade.cpf', { cpf: c.cpfMascarado })}
                </span>
              )}
              {c.dataNascimento && (
                <span className="text-xs text-muted-foreground">
                  {t('pacienteDuplicidade.nascimento', { data: data(c.dataNascimento) })}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {c.motivos.map((m) => t(`pacienteDuplicidade.motivos.${m}`)).join(' · ')}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={ocupado}
              onClick={() => onAbrir(c.id)}
            >
              {t('pacienteDuplicidade.abrir')}
            </Button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
