import { ajusteEstoqueSchema, type AjusteEstoqueFormulario } from '@torres/shared';
import { CircleCheckIcon, RefreshCwIcon } from 'lucide-react';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAjustarEstoque } from './use-estoque';

const VALORES_INICIAIS: AjusteEstoqueFormulario = {
  produtoId: '',
  quantidadeReal: null as unknown as number,
  motivo: '',
};

/**
 * Aba Ajustes, "Ajuste Individual" (print `compras-estoque-estoque--ajuste.jpg`): o saldo do
 * produto passa a ser a quantidade contada fisicamente. "Importar Inventário" (.xlsx) ficou para
 * outra issue, por decisão do dev na issue #20.
 */
export function AbaAjustes() {
  const ajustar = useAjustarEstoque();
  const form = useFormulario(ajusteEstoqueSchema, { defaultValues: VALORES_INICIAIS });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <RefreshCwIcon aria-hidden className="size-4 text-primary" />
          Ajuste Individual
        </CardTitle>
      </CardHeader>
      <CardContent>
        <FormLayout
          form={form}
          className="max-w-xl"
          acoes={
            <div>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                <CircleCheckIcon aria-hidden />
                Ajustar
              </Button>
            </div>
          }
          onSubmit={async (valores) => {
            await ajustar.mutateAsync(valores);
            form.reset(VALORES_INICIAIS);
          }}
        >
          <FormField
            name="produtoId"
            label="Produto"
            obrigatorio
            tipo="entidade"
            entidade="produtos"
            filtros={{ tipo: 'produto' }}
            placeholder="Buscar produto por nome ou SKU..."
          />
          <FormField
            name="quantidadeReal"
            label="Quantidade Real"
            obrigatorio
            tipo="numero"
            placeholder="Quantidade contada fisicamente"
          />
          <FormField
            name="motivo"
            label="Motivo"
            obrigatorio
            tipo="textarea"
            placeholder="Descreva o motivo do ajuste..."
          />
        </FormLayout>
      </CardContent>
    </Card>
  );
}
