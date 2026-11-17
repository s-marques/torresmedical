import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import type { Negocio } from '@torres/shared';
import { PlusIcon, SearchIcon, SettingsIcon, TrophyIcon, XCircleIcon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useDebounce } from '@/hooks/use-debounce';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { ColunaEstagio } from './ColunaEstagio';
import { ModalConfiguracoesCrm } from './ModalConfiguracoesCrm';
import { ModalFollowUp } from './ModalFollowUp';
import { ModalNegocio } from './ModalNegocio';
import { ModalPerdido } from './ModalPerdido';
import {
  useConcluirAtividade,
  useExcluirNegocio,
  useGanharNegocio,
  useMoverNegocio,
  usePipelines,
  useQuadro,
} from './use-pipeline';

const BUSCA_DEBOUNCE_MS = 300;

/** O que está aberto por cima do quadro. */
type Dialogo =
  | { tipo: 'novo'; estagioId: string }
  | { tipo: 'editar' | 'follow-up' | 'concluir-acao' | 'perdido' | 'excluir'; negocio: Negocio }
  | { tipo: 'configurar' };

const moeda = (valor: string) => formatarMoeda(Number(valor));

/** Tela Pipeline (`/crm`): quadro de negócios por estágio do pipeline escolhido. */
export default function PipelinePage() {
  const pipelines = usePipelines();
  const [pipelineEscolhido, setPipelineEscolhido] = useState<string>();
  const [busca, setBusca] = useState('');
  const search = useDebounce(busca.trim(), BUSCA_DEBOUNCE_MS);
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);

  const lista = pipelines.data ?? [];
  const pipeline = lista.find((p) => p.id === pipelineEscolhido) ?? lista[0];
  const quadro = useQuadro(pipeline?.id, search);
  const estagios = pipeline?.estagios ?? [];

  const mover = useMoverNegocio();
  const ganhar = useGanharNegocio();
  const excluir = useExcluirNegocio();
  const concluir = useConcluirAtividade();

  const sensores = useSensors(
    // Uma distância mínima: clique no cartão e no menu "⋯" não vira arrasto.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  function soltar({ active, over }: DragEndEvent) {
    const origem = active.data.current?.estagioId;
    if (!over || over.id === origem) return;
    mover.mutate({ id: String(active.id), estagioId: String(over.id) });
  }

  // Anúncios do arrastar para leitores de tela, com o título do negócio e o nome da coluna.
  const colunas = quadro.data?.colunas ?? [];
  const titulo = (id: UniqueIdentifier) =>
    colunas.flatMap((c) => c.negocios).find((n) => n.id === id)?.titulo ?? 'Negócio';
  const coluna = (id: UniqueIdentifier | undefined) =>
    colunas.find((c) => c.estagioId === id)?.nome ?? '';
  const anuncios: Announcements = {
    onDragStart: ({ active }) => `${titulo(active.id)} selecionado para mover.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${titulo(active.id)} sobre ${coluna(over.id)}.`
        : `${titulo(active.id)} fora das colunas.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${titulo(active.id)} movido para ${coluna(over.id)}.`
        : `${titulo(active.id)} não foi movido.`,
    onDragCancel: ({ active }) => `Movimento de ${titulo(active.id)} cancelado.`,
  };

  const fechar = () => setDialogo(null);
  const resumo = quadro.data?.resumo;

  return (
    <div className="grid gap-4">
      <PageHeader
        titulo="CRM — Pipeline"
        descricao="Gerencie seus negócios e oportunidades."
        breadcrumb={[{ rotulo: 'Painel', para: '/' }, { rotulo: 'CRM' }]}
        acoes={
          <>
            <div className="relative w-full sm:w-80">
              <SearchIcon
                aria-hidden
                className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                aria-label="Buscar cliente"
                placeholder="Buscar cliente (nome, tel, CPF, CNPJ)..."
                className="pl-8"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <Button variant="outline" onClick={() => setDialogo({ tipo: 'configurar' })}>
              <SettingsIcon /> Configurar
            </Button>
            <SePermitido permissao="comercial-atendimento.pipeline.criar">
              <Button
                disabled={!estagios[0]}
                onClick={() =>
                  estagios[0] && setDialogo({ tipo: 'novo', estagioId: estagios[0].id })
                }
              >
                <PlusIcon /> Novo Negócio
              </Button>
            </SePermitido>
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="uppercase" disabled={lista.length === 0}>
              {pipeline?.nome ?? 'Nenhum pipeline'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {lista.map((p) => (
              <DropdownMenuItem key={p.id} onSelect={() => setPipelineEscolhido(p.id)}>
                {p.nome}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {resumo && (
          <p className="text-sm text-muted-foreground" data-testid="resumo-pipeline">
            Total: <strong className="text-foreground">{moeda(resumo.abertos.total)}</strong> ·{' '}
            {resumo.abertos.quantidade} abertos · {resumo.ganhos.quantidade} ganhos ·{' '}
            {resumo.perdidos.quantidade} perdidos
          </p>
        )}
      </div>

      {pipelines.isSuccess && lista.length === 0 && (
        <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
          Nenhum pipeline cadastrado. Crie um em Configurar.
        </p>
      )}

      {pipeline && estagios.length === 0 && (
        <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
          Este pipeline não tem estágios. Adicione-os em Configurar.
        </p>
      )}

      <DndContext
        sensors={sensores}
        onDragEnd={soltar}
        accessibility={{
          announcements: anuncios,
          screenReaderInstructions: {
            draggable:
              'Para mover o negócio, pressione espaço ou Enter, use as setas para escolher a coluna e pressione espaço ou Enter de novo. Esc cancela.',
          },
        }}
      >
        <div className="flex gap-4 overflow-x-auto pb-2">
          {(quadro.data?.colunas ?? []).map((coluna) => (
            <ColunaEstagio
              key={coluna.estagioId}
              coluna={coluna}
              estagios={estagios}
              onNovo={(estagioId) => setDialogo({ tipo: 'novo', estagioId })}
              onEditar={(negocio) => setDialogo({ tipo: 'editar', negocio })}
              onMover={(negocio, estagioId) => mover.mutate({ id: negocio.id, estagioId })}
              onFollowUp={(negocio) => setDialogo({ tipo: 'follow-up', negocio })}
              onConcluirAcao={(negocio) => {
                const proxima = negocio.proximaAtividade;
                if (!proxima) return;
                if (proxima.exigeProximaAcao) setDialogo({ tipo: 'concluir-acao', negocio });
                else concluir.mutate(proxima.id);
              }}
              onGanho={(negocio) => ganhar.mutate(negocio.id)}
              onPerdido={(negocio) => setDialogo({ tipo: 'perdido', negocio })}
              onExcluir={(negocio) => setDialogo({ tipo: 'excluir', negocio })}
            />
          ))}
        </div>
      </DndContext>

      {resumo && (
        <footer className="flex flex-wrap items-center gap-6 border-t pt-3 text-sm">
          <span className="flex items-center gap-1.5">
            <TrophyIcon aria-hidden className="size-4 text-emerald-600" />
            Ganhos:{' '}
            <strong className="text-emerald-700 dark:text-emerald-400">
              {moeda(resumo.ganhos.total)}
            </strong>
            <span className="rounded-md bg-muted px-1.5 text-xs font-medium">
              {resumo.ganhos.quantidade}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <XCircleIcon aria-hidden className="size-4 text-red-600" />
            Perdidos:{' '}
            <strong className="text-red-700 dark:text-red-400">
              {moeda(resumo.perdidos.total)}
            </strong>
            <span className="rounded-md bg-muted px-1.5 text-xs font-medium">
              {resumo.perdidos.quantidade}
            </span>
          </span>
        </footer>
      )}

      {dialogo?.tipo === 'novo' && (
        <ModalNegocio estagios={estagios} estagioInicial={dialogo.estagioId} onFechar={fechar} />
      )}
      {dialogo?.tipo === 'editar' && (
        <ModalNegocio
          estagios={estagios}
          estagioInicial={dialogo.negocio.estagioId}
          negocio={dialogo.negocio}
          onFechar={fechar}
        />
      )}
      {dialogo?.tipo === 'follow-up' && (
        <ModalFollowUp negocio={dialogo.negocio} onFechar={fechar} />
      )}
      {dialogo?.tipo === 'concluir-acao' && dialogo.negocio.proximaAtividade && (
        <ModalFollowUp
          negocio={dialogo.negocio}
          concluirAtividadeId={dialogo.negocio.proximaAtividade.id}
          onFechar={fechar}
        />
      )}
      {dialogo?.tipo === 'perdido' && <ModalPerdido negocio={dialogo.negocio} onFechar={fechar} />}
      {dialogo?.tipo === 'configurar' && (
        <ModalConfiguracoesCrm pipelines={lista} pipelineAtual={pipeline} onFechar={fechar} />
      )}
      <ConfirmDialog
        aberto={dialogo?.tipo === 'excluir'}
        onAbertoChange={(aberto) => aberto || fechar()}
        titulo="Excluir negócio?"
        descricao={
          dialogo?.tipo === 'excluir'
            ? `"${dialogo.negocio.titulo}" será excluído. Esta ação não pode ser desfeita.`
            : undefined
        }
        rotuloConfirmar="Excluir"
        onConfirmar={() =>
          dialogo?.tipo === 'excluir' ? excluir.mutateAsync(dialogo.negocio.id) : undefined
        }
      />
    </div>
  );
}
