import {
  createUnidadeSchema,
  listUnidadesQuerySchema,
  unidadePageSchema,
  type Unidade,
} from '@torres/shared';
import { PencilIcon, Trash2Icon } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { AcaoLinha, ColunaGrid, FiltroStatus } from '@/components/shared/data-grid/tipos';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { StatusAtivo } from '@/components/shared/StatusBadge';
import { formatarDataHora } from '@/lib/formatar';
import { esperar, EXPORTACAO_UNIDADES, simularEnvio, URL_UNIDADES } from './exemplos';

const COLUNAS: ColunaGrid<Unidade>[] = [
  { id: 'nome', titulo: 'Nome', ordenavel: true, exportavel: true, ocultavel: false },
  {
    id: 'status',
    titulo: 'Status',
    ordenavel: 'ativo',
    exportavel: true,
    celula: (u) => <StatusAtivo ativo={u.ativo} />,
  },
  {
    id: 'createdAt',
    titulo: 'Criado em',
    ordenavel: true,
    exportavel: true,
    celula: (u) => formatarDataHora(u.createdAt),
  },
];

const STATUS: FiltroStatus = {
  opcoes: [
    { valor: 'ativo', rotulo: 'Ativo' },
    { valor: 'inativo', rotulo: 'Inativo' },
  ],
};

/** `DataGrid` na API real de Unidades (referência do padrão de API), com ações simuladas. */
export function ExemploGrid() {
  const [editando, setEditando] = useState<Unidade | null>(null);
  const [excluindo, setExcluindo] = useState<Unidade | null>(null);
  const acoes = useCallback(
    (unidade: Unidade): AcaoLinha[] => [
      {
        rotulo: 'Editar',
        icone: PencilIcon,
        permissao: 'configuracoes-gestao.minha-empresa.editar',
        onSelect: () => setEditando(unidade),
      },
      {
        rotulo: 'Excluir',
        icone: Trash2Icon,
        destrutiva: true,
        permissao: 'configuracoes-gestao.minha-empresa.excluir',
        onSelect: () => setExcluindo(unidade),
      },
    ],
    [],
  );

  return (
    <>
      <DataGrid
        url={URL_UNIDADES}
        schema={unidadePageSchema}
        querySchema={listUnidadesQuerySchema}
        colunas={COLUNAS}
        busca="Buscar unidades..."
        status={STATUS}
        exportacao={EXPORTACAO_UNIDADES}
        acoes={acoes}
        mensagemVazio="Nenhuma unidade encontrada."
      />
      {editando && <ModalUnidade unidade={editando} onFechar={() => setEditando(null)} />}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir unidade?"
        descricao={`Exemplo: "${excluindo?.nome ?? ''}" não será excluída de verdade.`}
        rotuloConfirmar="Excluir"
        onConfirmar={async () => {
          await esperar();
          toast.success('Exemplo: nenhuma unidade foi excluída.');
        }}
      />
    </>
  );
}

const unidadeSchema = createUnidadeSchema.pick({ nome: true, ativo: true });

/** `Modal` com `FormLayout`: os botões ficam no rodapé e enviam pelo `id` do formulário. */
export function ModalUnidade({
  unidade,
  onFechar,
}: Readonly<{ unidade?: Unidade; onFechar: () => void }>) {
  const form = useFormulario(unidadeSchema, {
    defaultValues: { nome: unidade?.nome ?? '', ativo: unidade?.ativo ?? true },
  });
  const idForm = 'form-unidade-exemplo';
  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={unidade ? 'Editar unidade' : 'Nova unidade'}
      descricao='Exemplo: nada é gravado. Use o nome "erro" para ver o erro do servidor no campo.'
      rodape={<FormAcoes form={form} formId={idForm} onCancelar={onFechar} />}
    >
      <FormLayout
        id={idForm}
        form={form}
        acoes={null}
        onSubmit={async ({ nome }) => {
          await simularEnvio(nome.toLowerCase() === 'erro' ? 'campo' : 'sucesso', 'nome');
          toast.success('Exemplo: unidade salva (nada foi gravado).');
          onFechar();
        }}
      >
        <FormField name="nome" label="Nome" obrigatorio />
        <FormField name="ativo" label="Ativo" tipo="switch" />
      </FormLayout>
    </Modal>
  );
}
