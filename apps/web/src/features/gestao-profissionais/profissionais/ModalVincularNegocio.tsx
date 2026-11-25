import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDebounce } from '@/hooks/use-debounce';
import { formatarData } from '@/lib/formatar';
import { useNegociosVinculaveis, useVincularNegocio } from './use-historico';

const DEBOUNCE_MS = 300;

export interface ModalVincularNegocioProps {
  profissionalId: string;
  onFechar: () => void;
}

/**
 * "Vincular negócio do CRM" (issue #144): escolhe o negócio do lead que virou este profissional.
 * Só aparecem negócios abertos ou ganhos ainda sem profissional ligado.
 */
export function ModalVincularNegocio({
  profissionalId,
  onFechar,
}: Readonly<ModalVincularNegocioProps>) {
  const { t } = useTranslation();
  const [busca, setBusca] = useState('');
  const consulta = useNegociosVinculaveis(useDebounce(busca.trim(), DEBOUNCE_MS));
  const vincular = useVincularNegocio(profissionalId);
  const negocios = consulta.data?.data ?? [];

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={t('historicoProfissional.modal.titulo')}
      descricao={t('historicoProfissional.modal.descricao')}
      tamanho="md"
    >
      <div className="grid gap-3 pb-2">
        <Input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={t('historicoProfissional.modal.busca')}
          aria-label={t('historicoProfissional.modal.busca')}
        />
        {consulta.isError && (
          <p role="alert" className="text-sm text-destructive">
            {t('historicoProfissional.modal.erro')}
          </p>
        )}
        {consulta.data && negocios.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('historicoProfissional.modal.vazio')}</p>
        )}
        <ul className="grid gap-2">
          {negocios.map((negocio) => (
            <li
              key={negocio.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
            >
              <div className="grid gap-0.5">
                <span className="font-medium">{negocio.titulo}</span>
                <span className="text-xs text-muted-foreground">
                  {t('historicoProfissional.modal.estagio', { estagio: negocio.estagio })}
                  {` · ${t(`historicoProfissional.modal.status.${negocio.status}`)}`}
                  {` · ${formatarData(negocio.criadoEm)}`}
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={vincular.isPending}
                aria-label={`${t('historicoProfissional.modal.acao')}: ${negocio.titulo}`}
                onClick={async () => {
                  await vincular.mutateAsync(negocio.id);
                  onFechar();
                }}
              >
                {t('historicoProfissional.modal.acao')}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
