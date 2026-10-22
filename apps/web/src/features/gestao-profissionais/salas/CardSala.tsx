import { SALA_TIPO_ROTULOS, type Sala } from '@torres/shared';
import { PencilIcon, SearchIcon, Trash2Icon } from 'lucide-react';
import { SePermitido } from '@/components/shared/SePermitido';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatarMoeda } from '@/lib/forms/mascaras';

export interface CardSalaProps {
  sala: Sala;
  onDetalhar: () => void;
  onEditar: () => void;
  onExcluir: () => void;
}

/** Card da aba Salas: identificação, valor mensal, situação e as ações da sala. */
export function CardSala({ sala, onDetalhar, onEditar, onExcluir }: Readonly<CardSalaProps>) {
  return (
    <li className="flex min-h-40 flex-col gap-3 rounded-xl border bg-card p-5 shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-lg font-semibold">{sala.nome}</h3>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-blue-600 hover:text-blue-600"
            aria-label={`Detalhes de ${sala.nome}`}
            title="Detalhar"
            onClick={onDetalhar}
          >
            <SearchIcon aria-hidden />
          </Button>
          <SePermitido permissao="gestao-profissionais.salas.editar">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Editar ${sala.nome}`}
              title="Editar"
              onClick={onEditar}
            >
              <PencilIcon aria-hidden />
            </Button>
          </SePermitido>
          <SePermitido permissao="gestao-profissionais.salas.excluir">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-destructive hover:text-destructive"
              aria-label={`Excluir ${sala.nome}`}
              title={sala.emUso ? 'Sala com contratos não pode ser excluída' : 'Excluir'}
              disabled={sala.emUso}
              onClick={onExcluir}
            >
              <Trash2Icon aria-hidden />
            </Button>
          </SePermitido>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{SALA_TIPO_ROTULOS[sala.tipo]}</Badge>
        {sala.numero && <Badge variant="outline">Nº {sala.numero}</Badge>}
        {sala.andar && <Badge variant="outline">{sala.andar}</Badge>}
      </div>
      <p className="flex justify-between text-sm text-muted-foreground">
        <span>Valor mensal:</span>
        <span>{formatarMoeda(sala.valorMensal) || '-'}</span>
      </p>
      {sala.locatarios.length > 0 && (
        <div className="grid gap-1 text-xs">
          <p className="text-muted-foreground">Locatários:</p>
          <ul className="grid gap-1">
            {sala.locatarios.map((locatario) => (
              <li key={locatario.contratoId} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">{locatario.nome}</span>
                <span className="shrink-0 whitespace-nowrap">
                  {formatarMoeda(locatario.valorTotalMensal)}/mês
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!sala.ocupada && (
        <div>
          <StatusBadge tom={sala.ativo ? 'sucesso' : 'perigo'}>
            {sala.ativo ? 'Disponível' : 'Inativa'}
          </StatusBadge>
        </div>
      )}
    </li>
  );
}
