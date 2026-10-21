import { PercentIcon, SaveIcon } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const CANAIS = ['Maquininha / InfiniteTap', 'Link de Pagamento'] as const;

/**
 * Aba "Taxas por Bandeira". Por enquanto só o seletor de canal e o estado vazio do inventário:
 * a grade de taxas depende de prints que ainda não existem (issue #49, decisão do dev).
 */
export function AbaTaxas() {
  const [canal, setCanal] = useState<string>(CANAIS[0]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={canal} onValueChange={setCanal}>
          <SelectTrigger aria-label="Canal" className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CANAIS.map((opcao) => (
              <SelectItem key={opcao} value={opcao}>
                {opcao}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">Plano 1 Dia Útil</span>
        <Button type="button" disabled className="ml-auto">
          <SaveIcon aria-hidden />
          Salvar Taxas
        </Button>
      </div>
      <div className="rounded-xl border">
        <EmptyState
          icone={PercentIcon}
          titulo="Nenhuma taxa cadastrada para este canal"
          descricao='Cadastre bandeiras na aba "Bandeiras" primeiro'
        />
      </div>
    </div>
  );
}
