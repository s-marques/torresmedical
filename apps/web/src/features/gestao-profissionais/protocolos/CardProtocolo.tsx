import { PROTOCOLO_TIPO_ROTULOS, valorPorSemana, type Protocolo } from '@torres/shared';
import { CopyIcon, PackageIcon, PencilIcon, SearchIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { SePermitido } from '@/components/shared/SePermitido';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { rotuloSemanas } from './rotulos';

interface CardProtocoloProps {
  protocolo: Protocolo;
  onEditar: () => void;
  onDuplicar: () => void;
  onExcluir: () => void;
}

/** Card de um protocolo: resumo na linha e, em "Detalhar", tipo, sessões, itens e observações. */
export function CardProtocolo({
  protocolo,
  onEditar,
  onDuplicar,
  onExcluir,
}: Readonly<CardProtocoloProps>) {
  const [aberto, setAberto] = useState(false);
  const temValor = protocolo.valorTotal > 0;
  const porSemana = valorPorSemana(protocolo.valorTotal, protocolo.totalSemanas);
  const nome = protocolo.nome;

  return (
    <li className="rounded-xl border bg-card p-3" data-aberto={aberto}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{nome}</h3>
            <Badge variant="destructive">{PROTOCOLO_TIPO_ROTULOS[protocolo.tipo]}</Badge>
            {protocolo.itens.length > 0 && (
              <Badge variant="secondary">
                <PackageIcon aria-hidden />
                {protocolo.itens.length} {protocolo.itens.length === 1 ? 'item' : 'itens'}
              </Badge>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            {protocolo.profissionalNome && (
              <span className="font-medium text-emerald-600 uppercase">
                {protocolo.profissionalNome}
              </span>
            )}
            {temValor && <Badge variant="secondary">{formatarMoeda(protocolo.valorTotal)}</Badge>}
            <Badge variant="secondary">{rotuloSemanas(protocolo.totalSemanas)}</Badge>
            {temValor && (
              <span className="text-emerald-600">({formatarMoeda(porSemana)}/semana)</span>
            )}
            {!aberto && protocolo.observacoes && (
              <span className="max-w-md truncate text-muted-foreground">
                {protocolo.observacoes}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant={aberto ? 'outline' : 'ghost'}
            size="sm"
            aria-expanded={aberto}
            aria-label={`${aberto ? 'Fechar' : 'Detalhar'} ${nome}`}
            onClick={() => setAberto(!aberto)}
          >
            <SearchIcon aria-hidden />
            {aberto ? 'Fechar' : 'Detalhar'}
          </Button>
          <SePermitido permissao="gestao-profissionais.protocolos.criar">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Duplicar ${nome}`}
              title="Duplicar"
              onClick={onDuplicar}
            >
              <CopyIcon aria-hidden />
            </Button>
          </SePermitido>
          <SePermitido permissao="gestao-profissionais.protocolos.editar">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Editar ${nome}`}
              title="Editar"
              onClick={onEditar}
            >
              <PencilIcon aria-hidden />
            </Button>
          </SePermitido>
          <SePermitido permissao="gestao-profissionais.protocolos.excluir">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-destructive hover:text-destructive"
              aria-label={`Excluir ${nome}`}
              title={
                protocolo.emUso ? 'Usado em um protocolo mãe: não pode ser excluído' : 'Excluir'
              }
              disabled={protocolo.emUso}
              onClick={onExcluir}
            >
              <Trash2Icon aria-hidden />
            </Button>
          </SePermitido>
        </div>
      </div>
      {aberto && (
        <div className="mt-3 grid gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
          <dl className="flex flex-wrap gap-x-5 gap-y-1 text-muted-foreground">
            <div className="flex gap-1">
              <dt>Tipo:</dt>
              <dd>{PROTOCOLO_TIPO_ROTULOS[protocolo.tipo]}</dd>
            </div>
            <div className="flex gap-1">
              <dt>Sessões:</dt>
              <dd>{protocolo.sessoes}</dd>
            </div>
            {temValor && (
              <div className="flex gap-1">
                <dt>Valor total:</dt>
                <dd>{formatarMoeda(protocolo.valorTotal)}</dd>
              </div>
            )}
            <div className="flex gap-1">
              <dt>Total semanas:</dt>
              <dd>
                {protocolo.totalSemanas}
                {temValor && ` (${formatarMoeda(porSemana)}/semana)`}
              </dd>
            </div>
          </dl>
          {protocolo.observacoes && <p className="whitespace-pre-line">{protocolo.observacoes}</p>}
          {protocolo.itens.length > 0 ? (
            <div>
              <p className="mb-1 font-medium">Itens/Produtos:</p>
              <ul className="grid gap-1">
                {protocolo.itens.map((item) => (
                  <li key={item.produtoId} className="rounded bg-background px-2 py-1">
                    {item.produtoNome} x{item.quantidade}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-muted-foreground italic">Nenhum item/produto cadastrado</p>
          )}
        </div>
      )}
    </li>
  );
}
