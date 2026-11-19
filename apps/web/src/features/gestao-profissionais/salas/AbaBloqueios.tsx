import {
  exportSalaBloqueiosQuerySchema,
  listSalaBloqueiosQuerySchema,
  SALA_BLOQUEIO_STATUS,
  SALA_BLOQUEIO_TIPOS,
  salaBloqueioPageSchema,
  type SalaBloqueio,
} from '@torres/shared';
import { PencilIcon, XCircleIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, ExportacaoGrid, FiltroGrid } from '@/components/shared/data-grid/tipos';
import { SePermitido } from '@/components/shared/SePermitido';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatarDataHora } from '@/lib/formatar';
import { cn } from '@/lib/utils';
import { COR_BLOQUEIO } from './cores-bloqueio';
import { ModalBloqueioSala } from './ModalBloqueioSala';
import { ModalCancelarBloqueio } from './ModalCancelarBloqueio';
import { periodoDoBloqueio } from './periodo-bloqueio';
import { URL_BLOQUEIOS } from './use-bloqueios-sala';
import { useSalas } from './use-salas';

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'gestao-profissionais.salas.exportar',
  nomeArquivo: 'bloqueios-salas',
  schema: exportSalaBloqueiosQuerySchema,
};

export interface AbaBloqueiosProps {
  criando: boolean;
  onFecharCriar: () => void;
}

/**
 * Aba Bloqueios da tela Salas (issue #138): bloqueios e reservas da sala (manutenção, reserva,
 * cortesia, uso avulso), com filtros, edição e cancelamento (sem exclusão).
 */
export function AbaBloqueios({ criando, onFecharCriar }: Readonly<AbaBloqueiosProps>) {
  const { t } = useTranslation();
  const salas = useSalas();
  const [editando, setEditando] = useState<SalaBloqueio | null>(null);
  const [cancelando, setCancelando] = useState<SalaBloqueio | null>(null);
  const coluna = (id: string) => t(`salasBloqueios.colunas.${id}`);

  const horario = (b: SalaBloqueio) =>
    b.recorrente
      ? b.dias
          .map((d) => `${t(`salasBloqueios.diasAbrev.${d.diaSemana}`)} ${d.inicio}-${d.fim}`)
          .join(', ')
      : `${b.horaInicio ?? ''}-${b.horaFim ?? ''}`;

  const filtros: FiltroGrid[] = [
    {
      tipo: 'select',
      parametro: 'tipo',
      rotulo: t('salasBloqueios.filtros.tipo'),
      rotuloTodos: t('salasBloqueios.filtros.todosTipos'),
      opcoes: SALA_BLOQUEIO_TIPOS.map((valor) => ({
        valor,
        rotulo: t(`salasBloqueios.tipos.${valor}`),
      })),
    },
    {
      tipo: 'select',
      parametro: 'salaId',
      rotulo: t('salasBloqueios.filtros.sala'),
      rotuloTodos: t('salasBloqueios.filtros.todasSalas'),
      opcoes: (salas.data?.data ?? []).map((sala) => ({ valor: sala.id, rotulo: sala.nome })),
    },
    {
      tipo: 'periodo',
      rotulo: t('salasBloqueios.filtros.periodo'),
      parametroDe: 'de',
      parametroAte: 'ate',
    },
  ];

  const colunas: ColunaGrid<SalaBloqueio>[] = [
    {
      id: 'sala',
      titulo: coluna('sala'),
      exportavel: true,
      ocultavel: false,
      celula: (b) => <span className="font-medium">{b.salaNome}</span>,
    },
    {
      id: 'tipo',
      titulo: coluna('tipo'),
      ordenavel: true,
      exportavel: true,
      celula: (b) => (
        <Badge variant="outline" className={cn('border-transparent', COR_BLOQUEIO[b.tipo])}>
          {t(`salasBloqueios.tipos.${b.tipo}`)}
        </Badge>
      ),
    },
    {
      id: 'dataInicio',
      titulo: coluna('periodo'),
      ordenavel: true,
      exportavel: 'periodo',
      celula: (b) => (
        <span className="whitespace-nowrap">{periodoDoBloqueio(b, t('salasBloqueios.ate'))}</span>
      ),
    },
    { id: 'horario', titulo: coluna('horario'), exportavel: true, celula: horario },
    {
      id: 'profissional',
      titulo: coluna('profissional'),
      exportavel: true,
      celula: (b) => (b.oculto ? t('salasBloqueios.ocupado') : (b.profissionalNome ?? '-')),
    },
    { id: 'motivo', titulo: coluna('motivo'), exportavel: true, celula: (b) => b.motivo ?? '-' },
    {
      id: 'responsavel',
      titulo: coluna('responsavel'),
      exportavel: true,
      celula: (b) => b.criadoPorNome ?? '-',
    },
    {
      id: 'status',
      titulo: coluna('status'),
      exportavel: true,
      celula: (b) => (
        <div className="grid justify-items-start gap-0.5">
          <Badge variant={b.status === 'ATIVO' ? 'secondary' : 'outline'}>
            {t(`salasBloqueios.status.${b.status}`)}
          </Badge>
          {b.canceladoEm && (
            <span className="text-xs text-muted-foreground">
              {b.canceladoPorNome
                ? t('salasBloqueios.canceladoPor', {
                    data: formatarDataHora(b.canceladoEm),
                    nome: b.canceladoPorNome,
                  })
                : t('salasBloqueios.canceladoEm', { data: formatarDataHora(b.canceladoEm) })}
            </span>
          )}
          {b.motivoCancelamento && (
            <span className="text-xs text-muted-foreground">{b.motivoCancelamento}</span>
          )}
        </div>
      ),
    },
    {
      id: 'acoes',
      titulo: coluna('acoes'),
      ocultavel: false,
      celula: (b) =>
        b.status === 'ATIVO' &&
        !b.oculto && (
          <SePermitido permissao="gestao-profissionais.salas.editar">
            <div className="flex items-center justify-end gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('salasBloqueios.acoes.editar', { sala: b.salaNome })}
                title={t('salasBloqueios.acoes.tituloEditar')}
                onClick={() => setEditando(b)}
              >
                <PencilIcon aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-destructive hover:text-destructive"
                aria-label={t('salasBloqueios.acoes.cancelar', { sala: b.salaNome })}
                title={t('salasBloqueios.acoes.tituloCancelar')}
                onClick={() => setCancelando(b)}
              >
                <XCircleIcon aria-hidden />
              </Button>
            </div>
          </SePermitido>
        ),
    },
  ];

  return (
    <>
      <DataGrid
        url={URL_BLOQUEIOS}
        schema={salaBloqueioPageSchema}
        querySchema={listSalaBloqueiosQuerySchema}
        colunas={colunas}
        busca={false}
        status={{
          opcoes: SALA_BLOQUEIO_STATUS.map((valor) => ({
            valor,
            rotulo: t(`salasBloqueios.status.${valor}`),
          })),
        }}
        filtros={filtros}
        exportacao={EXPORTACAO}
        mensagemVazio={t('salasBloqueios.vazio')}
      />
      {criando && <ModalBloqueioSala onFechar={onFecharCriar} />}
      {editando && <ModalBloqueioSala bloqueio={editando} onFechar={() => setEditando(null)} />}
      {cancelando && (
        <ModalCancelarBloqueio bloqueio={cancelando} onFechar={() => setCancelando(null)} />
      )}
    </>
  );
}
