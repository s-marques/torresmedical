import {
  createTagAtendimentoSchema,
  TAG_ATENDIMENTO_COR_PADRAO,
  type CreateTagAtendimentoInput,
  type TagAtendimento,
  type TagAtendimentoFormulario,
} from '@torres/shared';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { useCriarTag, useExcluirTag, useTags } from './use-whatsapp';

export interface ModalGerenciarTagsProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
}

/** Modal "Gerenciar Tags": criar (nome + cor), listar e excluir as tags das conversas. */
export function ModalGerenciarTags({ aberto, onAbertoChange }: Readonly<ModalGerenciarTagsProps>) {
  const tags = useTags(aberto);
  const [excluir, setExcluir] = useState<TagAtendimento | null>(null);
  const excluirTag = useExcluirTag();

  return (
    <Modal aberto={aberto} onAbertoChange={onAbertoChange} titulo="Gerenciar Tags" tamanho="sm">
      <div className="grid gap-4">
        <SePermitido permissao="comercial-atendimento.whatsapp.criar">
          <FormNovaTag />
        </SePermitido>
        <ListaTags
          carregando={tags.isPending}
          tags={tags.data?.data ?? []}
          onExcluir={setExcluir}
        />
      </div>
      <ConfirmDialog
        aberto={excluir !== null}
        onAbertoChange={(novo) => !novo && setExcluir(null)}
        titulo="Excluir tag?"
        descricao={excluir && `A tag "${excluir.nome}" deixa de aparecer nas conversas.`}
        rotuloConfirmar="Excluir"
        onConfirmar={() => excluir && excluirTag.mutateAsync(excluir.id)}
      />
    </Modal>
  );
}

function FormNovaTag() {
  const form = useFormulario<TagAtendimentoFormulario, CreateTagAtendimentoInput>(
    createTagAtendimentoSchema,
    { defaultValues: { nome: '', cor: TAG_ATENDIMENTO_COR_PADRAO } },
  );
  const criarTag = useCriarTag();

  return (
    <FormLayout
      form={form}
      colunas={2}
      className="gap-3"
      onSubmit={async (valores) => {
        await criarTag.mutateAsync(valores);
        form.reset({ nome: '', cor: valores.cor });
      }}
      acoes={
        <Button
          type="submit"
          className="bg-emerald-600 text-white hover:bg-emerald-700"
          disabled={form.formState.isSubmitting}
        >
          <PlusIcon aria-hidden />
          Adicionar tag
        </Button>
      }
    >
      <FormField name="nome" label="Nome da tag" placeholder="Nome da tag" obrigatorio />
      <FormField name="cor" label="Cor" tipo="cor" />
    </FormLayout>
  );
}

function ListaTags({
  carregando,
  tags,
  onExcluir,
}: Readonly<{
  carregando: boolean;
  tags: TagAtendimento[];
  onExcluir: (tag: TagAtendimento) => void;
}>) {
  if (carregando) {
    return (
      <p role="status" className="text-center text-sm text-muted-foreground">
        Carregando…
      </p>
    );
  }
  if (tags.length === 0) {
    return (
      <p role="status" className="text-center text-sm text-muted-foreground">
        Nenhuma tag criada.
      </p>
    );
  }
  return (
    <ul aria-label="Tags" className="grid gap-1">
      {tags.map((tag) => (
        <li key={tag.id} className="flex items-center gap-2 rounded-md border px-3 py-1.5">
          <span
            aria-hidden
            className="size-3 shrink-0 rounded-full"
            style={{ backgroundColor: tag.cor }}
          />
          <span className="flex-1 truncate text-sm">{tag.nome}</span>
          <SePermitido permissao="comercial-atendimento.whatsapp.excluir">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label={`Excluir a tag ${tag.nome}`}
              onClick={() => onExcluir(tag)}
            >
              <Trash2Icon aria-hidden />
            </Button>
          </SePermitido>
        </li>
      ))}
    </ul>
  );
}
