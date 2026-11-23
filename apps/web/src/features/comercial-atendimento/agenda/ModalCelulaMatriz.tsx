import type { AgendaMatrizCelula, AgendaMatrizColuna, AgendaMatrizItem } from '@torres/shared';
import { PlusIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/shared/Modal';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { formatarData } from '@/lib/formatar';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { cn } from '@/lib/utils';
import { COR_MATRIZ, DESTAQUE_SEM_USO } from './matriz-cores';
import { horaParaAgendar, rotuloStatusMatriz } from './matriz-rotulos';

export interface CelulaSelecionada {
  salaId: string;
  salaNome: string;
  data: string;
  coluna: AgendaMatrizColuna;
  celula: AgendaMatrizCelula | undefined;
}

function ItemDaCelula({ item }: Readonly<{ item: AgendaMatrizItem }>) {
  const { t } = useTranslation();
  const titulo =
    item.tipo === 'BLOQUEIO' && item.bloqueioTipo
      ? t(`salasBloqueios.tipos.${item.bloqueioTipo}`)
      : t(`agenda.matriz.itens.${item.tipo}`);
  return (
    <li className="grid gap-0.5 rounded-lg border p-3 text-sm">
      <span className="font-medium">{titulo}</span>
      <span>{item.oculto ? t('salasBloqueios.ocupado') : (item.nome ?? '-')}</span>
      <span className="text-muted-foreground">
        {item.inicio} - {item.fim}
      </span>
      {item.valorMensal !== null && (
        <span className="text-muted-foreground">
          {t('agenda.matriz.valorMensal', { valor: formatarMoeda(item.valorMensal) })}
        </span>
      )}
    </li>
  );
}

/**
 * Detalhe de uma célula da matriz: quem ocupa, o contrato e o valor. Em horário livre ou
 * contratado sem uso, oferece o agendamento já com sala, dia e hora preenchidos.
 */
export function ModalCelulaMatriz({
  selecionada,
  onFechar,
  onAgendar,
}: Readonly<{
  selecionada: CelulaSelecionada;
  onFechar: () => void;
  onAgendar: (salaId: string, data: string, hora: string) => void;
}>) {
  const { t } = useTranslation();
  const { celula, coluna, salaId, salaNome, data } = selecionada;
  const status = celula?.status ?? 'DISPONIVEL';
  const podeAgendar = status === 'DISPONIVEL' || status === 'CONTRATADO';
  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={`${salaNome} · ${formatarData(data)}`}
      descricao={`${t(`agenda.matriz.turnos.${coluna.turno}`)} · ${coluna.inicio} - ${coluna.fim}`}
      rodape={
        <>
          <Button type="button" variant="outline" onClick={onFechar}>
            {t('comum.fechar')}
          </Button>
          {podeAgendar && (
            <SePermitido permissao="comercial-atendimento.agenda.criar">
              <Button
                type="button"
                onClick={() => onAgendar(salaId, data, horaParaAgendar(coluna))}
              >
                <PlusIcon aria-hidden />
                {t('agenda.matriz.agendar')}
              </Button>
            </SePermitido>
          )}
        </>
      }
    >
      <div className="grid gap-3">
        <span
          className={cn(
            'w-fit rounded-md px-2 py-1 text-xs font-medium',
            COR_MATRIZ[status],
            celula?.semUso && DESTAQUE_SEM_USO,
          )}
        >
          {rotuloStatusMatriz(t, status)}
        </span>
        {celula?.semUso && (
          <p className="text-sm text-orange-700 dark:text-orange-300">
            {t('agenda.matriz.semUsoAviso')}
          </p>
        )}
        {celula && celula.itens.length > 0 ? (
          <ul className="grid gap-2" aria-label={t('agenda.matriz.itensDaCelula')}>
            {celula.itens.map((item) => (
              <ItemDaCelula key={`${item.tipo}-${item.id}`} item={item} />
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">{t('agenda.matriz.livre')}</p>
        )}
      </div>
    </Modal>
  );
}
