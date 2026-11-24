import {
  listOnboardingQuerySchema,
  ONBOARDING_SITUACOES,
  onboardingPageSchema,
  type Onboarding,
} from '@torres/shared';
import { ListChecksIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, FiltroGrid } from '@/components/shared/data-grid/tipos';
import { Modal } from '@/components/shared/Modal';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { formatarData } from '@/lib/formatar';
import { ChecklistOnboarding } from '../profissionais/ChecklistOnboarding';
import { URL_ONBOARDING, useOnboardingProfissional } from '../profissionais/use-onboarding';

/**
 * Onboarding em andamento (`/onboarding`, issue #142, R §6): profissionais que assinaram o
 * contrato e ainda não concluíram o checklist, com o progresso e as etapas atrasadas (mais de
 * 7 dias da assinatura). Abrir uma linha mostra o checklist, onde se marca a recepção orientada.
 */
export default function OnboardingPage() {
  const { t } = useTranslation();
  const [aberto, setAberto] = useState<Onboarding | null>(null);

  const filtros = useMemo(
    (): readonly FiltroGrid[] => [
      {
        tipo: 'select',
        parametro: 'situacao',
        rotulo: t('onboarding.lista.filtros.situacao'),
        rotuloTodos: t('onboarding.lista.filtros.todas'),
        opcoes: ONBOARDING_SITUACOES.map((valor) => ({
          valor,
          rotulo: t(`onboarding.lista.situacoes.${valor}`),
        })),
      },
    ],
    [t],
  );

  const colunas = useMemo(
    (): ColunaGrid<Onboarding>[] => [
      {
        id: 'profissionalNome',
        titulo: t('onboarding.lista.colunas.profissional'),
        ordenavel: true,
        celula: (linha) => <span className="font-medium">{linha.profissionalNome}</span>,
      },
      {
        id: 'salaNome',
        titulo: t('onboarding.lista.colunas.sala'),
        celula: (linha) => linha.salaNome ?? '-',
      },
      {
        id: 'iniciadoEm',
        titulo: t('onboarding.lista.colunas.assinatura'),
        ordenavel: true,
        celula: (linha) => formatarData(linha.iniciadoEm),
      },
      {
        id: 'concluidas',
        titulo: t('onboarding.lista.colunas.progresso'),
        ordenavel: true,
        celula: (linha) => `${linha.concluidas}/${linha.total}`,
      },
      {
        id: 'proxima',
        titulo: t('onboarding.lista.colunas.proxima'),
        celula: (linha) => {
          const proxima = linha.etapas.find((e) => !e.concluida);
          return proxima ? t(`onboarding.etapas.${proxima.etapa}`) : '-';
        },
      },
      {
        id: 'situacao',
        titulo: t('onboarding.lista.colunas.situacao'),
        celula: (linha) => (
          <StatusBadge tom={linha.atrasada ? 'perigo' : 'info'}>
            {t(`onboarding.lista.situacoes.${linha.atrasada ? 'ATRASADO' : 'EM_ANDAMENTO'}`)}
          </StatusBadge>
        ),
      },
      {
        id: 'acoes',
        titulo: t('onboarding.lista.colunas.acoes'),
        ocultavel: false,
        className: 'text-right',
        celula: (linha) => (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('onboarding.lista.verEtapas', { nome: linha.profissionalNome })}
            title={t('onboarding.lista.verEtapasTitulo')}
            onClick={() => setAberto(linha)}
          >
            <ListChecksIcon aria-hidden />
          </Button>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo={t('onboarding.lista.titulo')}
        descricao={t('onboarding.lista.descricao')}
      />
      <DataGrid
        url={URL_ONBOARDING}
        schema={onboardingPageSchema}
        querySchema={listOnboardingQuerySchema}
        colunas={colunas}
        filtros={filtros}
        busca={t('onboarding.lista.buscar')}
        mensagemVazio={t('onboarding.lista.vazio')}
      />
      {aberto && (
        <Modal
          aberto
          onAbertoChange={(valor) => valor || setAberto(null)}
          titulo={t('onboarding.lista.modalTitulo', { nome: aberto.profissionalNome })}
          tamanho="lg"
        >
          <ModalChecklist inicial={aberto} />
        </Modal>
      )}
    </div>
  );
}

/** Checklist da linha aberta, em dia com o servidor (recarrega ao marcar a recepção orientada). */
function ModalChecklist({ inicial }: Readonly<{ inicial: Onboarding }>) {
  const consulta = useOnboardingProfissional(inicial.profissionalId);
  return <ChecklistOnboarding onboarding={consulta.data?.onboarding ?? inicial} />;
}
