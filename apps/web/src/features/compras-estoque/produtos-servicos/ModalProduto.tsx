import {
  calcularMargem,
  createProdutoSchema,
  type Produto,
  type ProdutoFormInput,
} from '@torres/shared';
import { useWatch } from 'react-hook-form';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OPCOES_TIPO_PRODUTO, tipoDoFormulario } from './opcoes-tipo';
import { useCriarProduto, useEditarProduto } from './use-produtos';

const ID_FORMULARIO = 'form-produto';

export interface ModalProdutoProps {
  /** Sem produto: "Novo Produto/Serviço". Com produto: "Editar Produto". */
  produto?: Produto;
  onFechar: () => void;
}

function numero(valor: string | null | undefined): number | null {
  return valor === null || valor === undefined ? null : Number(valor);
}

/** Os campos de moeda guardam `null` quando vazios; o schema é quem exige o preço de venda. */
function valoresIniciais(produto?: Produto): ProdutoFormInput {
  return {
    nome: produto?.nome ?? '',
    tipo: produto ? tipoDoFormulario(produto.tipo) : 'produto',
    categoriaId: produto?.categoriaId ?? null,
    unidadeMedidaId: produto?.unidadeMedidaId ?? null,
    marca: produto?.marca ?? '',
    codigoBarras: produto?.codigoBarras ?? '',
    sku: produto?.sku ?? '',
    precoCusto: numero(produto?.precoCusto),
    precoVenda: numero(produto?.precoVenda) as number,
    estoqueMinimo: numero(produto?.estoqueMinimo) ?? 0,
    controlaEstoque: produto?.controlaEstoque ?? true,
    ncm: produto?.ncm ?? '',
    descricao: produto?.descricao ?? '',
  };
}

const PORCENTAGEM = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Margem calculada: (venda − custo) / venda. Somente leitura. */
function CampoMargem() {
  const [custo, venda] = useWatch<ProdutoFormInput, ['precoCusto', 'precoVenda']>({
    name: ['precoCusto', 'precoVenda'],
  });
  const margem = calcularMargem(custo ?? null, venda ?? null);
  return (
    <div className="grid gap-2">
      <Label htmlFor="margem-produto">Margem</Label>
      <Input
        id="margem-produto"
        readOnly
        tabIndex={-1}
        className="bg-muted"
        value={margem === null ? '-' : `${PORCENTAGEM.format(margem)}%`}
      />
    </div>
  );
}

/** Modal "Novo Produto/Serviço" e "Editar Produto". */
export function ModalProduto({ produto, onFechar }: Readonly<ModalProdutoProps>) {
  const criar = useCriarProduto();
  const editar = useEditarProduto(produto?.id ?? '');
  const form = useFormulario(createProdutoSchema, { defaultValues: valoresIniciais(produto) });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={produto ? 'Editar Produto' : 'Novo Produto/Serviço'}
      tamanho="lg"
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={produto ? 'Salvar' : 'Cadastrar'}
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        colunas={2}
        onSubmit={async (valores) => {
          await (produto ? editar : criar).mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField name="nome" label="Nome" obrigatorio className="sm:col-span-2" />
        <FormField name="tipo" label="Tipo" tipo="select" opcoes={OPCOES_TIPO_PRODUTO} />
        <FormField
          name="categoriaId"
          label="Categoria"
          tipo="entidade"
          entidade="categorias"
          placeholder="Selecione"
        />
        <FormField
          name="unidadeMedidaId"
          label="Unidade de Medida"
          tipo="entidade"
          entidade="unidades-medida"
          placeholder="Sem unidade"
        />
        <FormField
          name="marca"
          label="Marca"
          placeholder="Ex: Nike, Samsung..."
          className="sm:col-span-2"
        />
        <FormField name="codigoBarras" label="Código de barras" placeholder="EAN/GTIN" />
        <FormField name="sku" label="SKU" placeholder="Código interno" />
        <div className="grid gap-4 sm:col-span-2 sm:grid-cols-3">
          <FormField name="precoCusto" label="Preço de custo (R$)" tipo="moeda" />
          <FormField name="precoVenda" label="Preço de venda (R$)" tipo="moeda" obrigatorio />
          <CampoMargem />
        </div>
        <FormField name="estoqueMinimo" label="Estoque mínimo" tipo="numero" />
        <FormField name="controlaEstoque" label="Controla estoque" tipo="switch" />
        <FormField
          name="ncm"
          label="NCM (fiscal)"
          placeholder="00000000"
          className="sm:col-span-2"
        />
        <FormField
          name="descricao"
          label="Descrição"
          tipo="textarea"
          placeholder="Descrição do produto..."
          className="sm:col-span-2"
        />
      </FormLayout>
    </Modal>
  );
}
