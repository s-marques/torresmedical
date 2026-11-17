import { CAMPANHA_FILTRO_ROTULO, CAMPANHA_FILTROS, type CampanhaFiltro } from '@torres/shared';
import { EyeIcon } from 'lucide-react';
import { useFormContext, useWatch } from 'react-hook-form';
import { FormField } from '@/components/shared/form/FormField';
import { Button } from '@/components/ui/button';
import type { FiltroConsulta } from './use-campanhas';

const OPCOES_FILTRO = CAMPANHA_FILTROS.map((filtro) => ({
  valor: filtro,
  rotulo: CAMPANHA_FILTRO_ROTULO[filtro],
}));

/** "Filtro de Clientes" e o campo que o filtro escolhido pede (origem ou dias). */
export function CamposFiltro() {
  const { control } = useFormContext();
  const filtro = useWatch({ control, name: 'filtro' }) as CampanhaFiltro;
  return (
    <>
      <FormField name="filtro" label="Filtro de Clientes" tipo="select" opcoes={OPCOES_FILTRO} />
      {filtro === 'ORIGEM' && (
        <FormField
          name="origemClienteId"
          label="Origem"
          tipo="entidade"
          entidade="origens-cliente"
          placeholder="Selecione a origem"
          obrigatorio
        />
      )}
      {filtro === 'COMPRA_RECENTE' && (
        <FormField
          name="diasCompra"
          label="Comprou nos últimos (dias)"
          tipo="numero"
          placeholder="Ex: 30"
          obrigatorio
        />
      )}
    </>
  );
}

/** O filtro preenchido no formulário, para o "Visualizar Clientes". */
function useFiltroDoFormulario(): FiltroConsulta {
  const { control } = useFormContext();
  const [filtro, origemClienteId, diasCompra] = useWatch({
    control,
    name: ['filtro', 'origemClienteId', 'diasCompra'],
  }) as [CampanhaFiltro, string | null, number | null];
  return { filtro, origemClienteId, diasCompra };
}

/** Botão "Visualizar Clientes": abre a lista de quem o filtro preenchido alcança. */
export function BotaoVisualizarClientes({
  onVisualizar,
}: Readonly<{ onVisualizar: (filtro: FiltroConsulta) => void }>) {
  const filtro = useFiltroDoFormulario();
  return (
    <div className="flex items-end">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => onVisualizar(filtro)}
      >
        <EyeIcon aria-hidden />
        Visualizar Clientes
      </Button>
    </div>
  );
}
