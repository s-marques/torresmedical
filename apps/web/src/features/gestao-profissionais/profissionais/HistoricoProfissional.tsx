import {
  HISTORICO_TIPOS,
  type HistoricoTipo,
  type ProfissionalHistoricoEvento,
} from '@torres/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { formatarData, formatarDataHora } from '@/lib/formatar';
import { ModalVincularNegocio } from './ModalVincularNegocio';
import { useHistoricoProfissional } from './use-historico';

/** Eventos de fonte "só dia" vêm à meia-noite UTC: mostram o dia, sem hora e sem mudar de fuso. */
function quando(evento: ProfissionalHistoricoEvento): string {
  return evento.somenteData
    ? formatarData(evento.ocorridoEm.slice(0, 10))
    : formatarDataHora(evento.ocorridoEm);
}

/**
 * Seção "Histórico do relacionamento" do detalhe do profissional (issue #144): do lead ao
 * primeiro atendimento, em ordem cronológica, com filtro por tipo de evento. O botão "Vincular
 * negócio do CRM" liga o lead (que ainda não era cadastrado) ao profissional.
 */
export function HistoricoProfissional({ profissionalId }: Readonly<{ profissionalId: string }>) {
  const { t } = useTranslation();
  const [tipo, setTipo] = useState<HistoricoTipo | null>(null);
  const [vinculando, setVinculando] = useState(false);
  const consulta = useHistoricoProfissional(profissionalId, tipo);
  const eventos = consulta.data?.data ?? [];

  return (
    <section aria-labelledby="titulo-historico-profissional" className="grid gap-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="titulo-historico-profissional" className="text-sm font-semibold">
          {t('historicoProfissional.titulo')}
        </h3>
        <SePermitido permissao="comercial-atendimento.pipeline.editar">
          <Button type="button" variant="outline" size="sm" onClick={() => setVinculando(true)}>
            {t('historicoProfissional.vincular')}
          </Button>
        </SePermitido>
      </div>

      <div
        role="group"
        aria-label={t('historicoProfissional.filtroTipo')}
        className="flex flex-wrap gap-2"
      >
        {[null, ...HISTORICO_TIPOS].map((opcao) => (
          <Button
            key={opcao ?? 'TODOS'}
            type="button"
            size="sm"
            variant={tipo === opcao ? 'default' : 'outline'}
            aria-pressed={tipo === opcao}
            onClick={() => setTipo(opcao)}
          >
            {t(`historicoProfissional.tipos.${opcao ?? 'TODOS'}`)}
          </Button>
        ))}
      </div>

      {consulta.isPending && (
        <p className="text-sm text-muted-foreground">{t('historicoProfissional.carregando')}</p>
      )}
      {consulta.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t('historicoProfissional.erroCarregar')}
        </p>
      )}
      {consulta.data && eventos.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('historicoProfissional.vazio')}</p>
      )}
      {eventos.length > 0 && (
        <ol className="grid gap-2 border-l pl-4">
          {eventos.map((evento) => (
            <li key={evento.id} className="grid gap-0.5 text-sm">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <time dateTime={evento.ocorridoEm} className="text-xs text-muted-foreground">
                  {quando(evento)}
                </time>
                <span className="font-medium">
                  {t(`historicoProfissional.eventos.${evento.evento}`)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t(`historicoProfissional.tipos.${evento.tipo}`)}
                </span>
              </div>
              {(evento.detalhe ?? evento.autor ?? evento.link) && (
                <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                  {evento.detalhe && <span>{evento.detalhe}</span>}
                  {evento.autor && (
                    <span>{t('historicoProfissional.porAutor', { nome: evento.autor })}</span>
                  )}
                  {evento.link && (
                    <Link to={evento.link} className="text-primary underline">
                      {t('historicoProfissional.abrir', {
                        destino: t(`historicoProfissional.destinos.${evento.link}`),
                      })}
                    </Link>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {vinculando && (
        <ModalVincularNegocio
          profissionalId={profissionalId}
          onFechar={() => setVinculando(false)}
        />
      )}
    </section>
  );
}
