import { MATRIZ_TURNOS, type MatrizTurno } from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { EntitySelect } from '@/components/shared/EntitySelect';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CAMPOS_OCUPACAO, type FiltrosAplicados } from './filtros-painel';

const TODOS = '__todos__';
const DIAS_DA_SEMANA = ['0', '1', '2', '3', '4', '5', '6'] as const;

interface FiltrosOcupacaoProps {
  filtros: FiltrosAplicados;
  onAlterar: (filtros: FiltrosAplicados) => void;
}

/**
 * Filtros da aba Ocupação (issue #139): sala, profissional, turno e dia da semana. Valem na hora
 * e ficam na URL, junto do período.
 */
export function FiltrosOcupacao({ filtros, onAlterar }: Readonly<FiltrosOcupacaoProps>) {
  const { t } = useTranslation();
  const alterar = (parcial: Partial<FiltrosAplicados>) => onAlterar({ ...filtros, ...parcial });
  const temFiltro = CAMPOS_OCUPACAO.some((campo) => Boolean(filtros[campo]));

  return (
    <div
      role="group"
      aria-label={t('painelOcupacao.filtrosRotulo')}
      className="flex flex-wrap items-center gap-2"
    >
      <EntitySelect
        entidade="salas"
        value={filtros.salaId ?? null}
        onChange={(id) => alterar({ salaId: id ?? undefined })}
        placeholder={t('painelOcupacao.sala')}
        aria-label={t('painelOcupacao.sala')}
        className="w-44"
      />
      <EntitySelect
        entidade="profissionais"
        value={filtros.profissionalId ?? null}
        onChange={(id) => alterar({ profissionalId: id ?? undefined })}
        placeholder={t('painelOcupacao.profissional')}
        aria-label={t('painelOcupacao.profissional')}
        className="w-56"
      />
      <Select
        value={filtros.turno ?? TODOS}
        onValueChange={(v) => alterar({ turno: v === TODOS ? undefined : (v as MatrizTurno) })}
      >
        <SelectTrigger aria-label={t('painelOcupacao.turno')} className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>{t('painelOcupacao.todosTurnos')}</SelectItem>
          {MATRIZ_TURNOS.map((turno) => (
            <SelectItem key={turno} value={turno}>
              {t(`painelOcupacao.turnos.${turno}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filtros.diaSemana ?? TODOS}
        onValueChange={(v) => alterar({ diaSemana: v === TODOS ? undefined : v })}
      >
        <SelectTrigger aria-label={t('painelOcupacao.diaSemana')} className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>{t('painelOcupacao.todosDias')}</SelectItem>
          {DIAS_DA_SEMANA.map((dia) => (
            <SelectItem key={dia} value={dia}>
              {t(`painelOcupacao.dias.${dia}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {temFiltro && (
        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            onAlterar({
              ...filtros,
              salaId: undefined,
              profissionalId: undefined,
              turno: undefined,
              diaSemana: undefined,
            })
          }
        >
          {t('painelOcupacao.limpar')}
        </Button>
      )}
    </div>
  );
}
