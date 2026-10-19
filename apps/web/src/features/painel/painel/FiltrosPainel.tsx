import { BASES_PERIODO, MODOS_PERIODO, filtrosPainelSchema } from '@torres/shared';
import { SearchIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  mesesDisponiveis,
  rotuloDoMes,
  ROTULOS_BASE,
  ROTULOS_MODO,
  type FiltrosAplicados,
} from './filtros-painel';

interface FiltrosPainelProps {
  aplicados: FiltrosAplicados;
  onBuscar: (filtros: FiltrosAplicados) => void;
}

/** Filtros do topo: Por mês/Por período, mês (ou De/Até), Recebimento/Competência e Buscar. */
export function FiltrosPainel({ aplicados, onBuscar }: Readonly<FiltrosPainelProps>) {
  const [rascunho, setRascunho] = useState(aplicados);
  const [meses] = useState(() => mesesDisponiveis());
  const [erro, setErro] = useState<string | null>(null);
  const opcoesMes = meses.includes(rascunho.mes) ? meses : [rascunho.mes, ...meses];

  function buscar() {
    const resultado = filtrosPainelSchema.safeParse({
      modo: rascunho.modo,
      mes: rascunho.mes,
      de: rascunho.de,
      ate: rascunho.ate,
      base: rascunho.base,
    });
    if (!resultado.success) {
      setErro(resultado.error.issues[0]?.message ?? 'Período inválido');
      return;
    }
    setErro(null);
    onBuscar(rascunho);
  }

  return (
    <form
      className="flex flex-wrap items-start gap-2"
      aria-label="Filtros do dashboard"
      onSubmit={(evento) => {
        evento.preventDefault();
        buscar();
      }}
    >
      <Select
        value={rascunho.modo}
        onValueChange={(modo) => setRascunho({ ...rascunho, modo: modo as typeof rascunho.modo })}
      >
        <SelectTrigger aria-label="Tipo de período">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MODOS_PERIODO.map((modo) => (
            <SelectItem key={modo} value={modo}>
              {ROTULOS_MODO[modo]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {rascunho.modo === 'mes' ? (
        <Select value={rascunho.mes} onValueChange={(mes) => setRascunho({ ...rascunho, mes })}>
          <SelectTrigger aria-label="Mês">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {opcoesMes.map((mes) => (
              <SelectItem key={mes} value={mes}>
                {rotuloDoMes(mes)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <>
          <Input
            type="date"
            aria-label="Data inicial"
            className="w-40"
            value={rascunho.de}
            onChange={(e) => setRascunho({ ...rascunho, de: e.target.value })}
          />
          <Input
            type="date"
            aria-label="Data final"
            className="w-40"
            value={rascunho.ate}
            onChange={(e) => setRascunho({ ...rascunho, ate: e.target.value })}
          />
        </>
      )}

      <Select
        value={rascunho.base}
        onValueChange={(base) => setRascunho({ ...rascunho, base: base as typeof rascunho.base })}
      >
        <SelectTrigger aria-label="Base do período">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {BASES_PERIODO.map((base) => (
            <SelectItem key={base} value={base}>
              {ROTULOS_BASE[base]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button type="submit">
        <SearchIcon aria-hidden /> Buscar
      </Button>
      {erro && (
        <p role="alert" className="basis-full text-sm text-destructive">
          {erro}
        </p>
      )}
    </form>
  );
}
