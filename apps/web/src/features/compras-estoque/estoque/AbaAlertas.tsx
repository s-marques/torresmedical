import { ROTULO_ESTOQUE_STATUS } from '@torres/shared';
import { CalendarIcon, CircleCheckIcon, TriangleAlertIcon } from 'lucide-react';
import { EmptyState } from '@/components/shared/EmptyState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatarQuantidade } from './formatar';
import { TOM_STATUS_ESTOQUE } from './opcoes';
import { useAlertasEstoque } from './use-estoque';

/**
 * Aba Alertas (print `compras-estoque-estoque--alertas.jpg`): "Produtos Abaixo do Mínimo" e
 * "Lotes Vencendo". Os lotes dependem da tela Lotes / Validade (#22), decisão do dev na issue #20.
 */
export function AbaAlertas() {
  const alertas = useAlertasEstoque();
  const produtos = alertas.data?.abaixoMinimo ?? [];

  return (
    <div className="grid gap-6">
      <section className="grid gap-3" aria-labelledby="titulo-abaixo-minimo">
        <h2 id="titulo-abaixo-minimo" className="flex items-center gap-2 text-sm font-semibold">
          <TriangleAlertIcon aria-hidden className="size-4 text-amber-500" />
          Produtos Abaixo do Mínimo
        </h2>
        <Card className="py-0">
          <CardContent className="px-0">
            {alertas.isPending && (
              <p className="p-6 text-sm text-muted-foreground">Carregando alertas…</p>
            )}
            {alertas.isError && (
              <p role="alert" className="p-6 text-sm text-destructive">
                Não foi possível carregar os alertas.
              </p>
            )}
            {alertas.isSuccess && produtos.length === 0 && (
              <EmptyState icone={CircleCheckIcon} titulo="Nenhum produto abaixo do mínimo." />
            )}
            {produtos.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Estoque Atual</TableHead>
                    <TableHead className="text-right">Mínimo</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {produtos.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.nome}</TableCell>
                      <TableCell>{p.sku ?? '-'}</TableCell>
                      <TableCell>{p.categoriaNome ?? '-'}</TableCell>
                      <TableCell className="text-right">
                        {formatarQuantidade(p.estoqueAtual)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatarQuantidade(p.estoqueMinimo)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tom={TOM_STATUS_ESTOQUE[p.status]}>
                          {ROTULO_ESTOQUE_STATUS[p.status]}
                        </StatusBadge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-3" aria-labelledby="titulo-lotes-vencendo">
        <h2 id="titulo-lotes-vencendo" className="flex items-center gap-2 text-sm font-semibold">
          <CalendarIcon aria-hidden className="size-4 text-destructive" />
          Lotes Vencendo
        </h2>
        <Card className="py-0">
          <CardContent>
            <EmptyState
              titulo="Controle de lotes ainda não disponível."
              descricao="Os lotes vencendo nos próximos 60 dias aparecem aqui quando a tela Lotes / Validade estiver pronta."
            />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
