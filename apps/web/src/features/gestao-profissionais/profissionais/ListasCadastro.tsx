import { PROFISSIONAL_CONTATOS_MAX, PROFISSIONAL_RQES_MAX } from '@torres/shared';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { FormField } from '@/components/shared/form/FormField';
import { Button } from '@/components/ui/button';

/** RQE por especialidade: número e a especialidade a que ele se vincula. */
export function ListaRqes() {
  const { control } = useFormContext();
  const { fields, append, remove } = useFieldArray({ control, name: 'rqes' });

  return (
    <fieldset className="grid gap-3 sm:col-span-2">
      <legend className="mb-1 text-sm font-medium">RQE (um por especialidade)</legend>
      {fields.length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhum RQE informado.</p>
      )}
      {fields.map((campo, indice) => (
        <div
          key={campo.id}
          className="grid items-start gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_auto]"
        >
          <FormField
            name={`rqes.${indice}.especialidadeId`}
            label="Especialidade do RQE"
            tipo="entidade"
            entidade="especialidades"
            placeholder="Selecione"
          />
          <FormField name={`rqes.${indice}.numero`} label="Número do RQE" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mt-6"
            aria-label={`Remover RQE ${indice + 1}`}
            onClick={() => remove(indice)}
          >
            <Trash2Icon aria-hidden />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="justify-self-start"
        disabled={fields.length >= PROFISSIONAL_RQES_MAX}
        onClick={() => append({ numero: '', especialidadeId: null })}
      >
        <PlusIcon aria-hidden />
        Adicionar RQE
      </Button>
    </fieldset>
  );
}

/** Contatos administrativos (secretária, financeiro…): nome, função, telefone e e-mail. */
export function ListaContatosAdministrativos() {
  const { control } = useFormContext();
  const { fields, append, remove } = useFieldArray({ control, name: 'contatosAdministrativos' });

  return (
    <fieldset className="grid gap-3 sm:col-span-2">
      <legend className="mb-1 text-sm font-medium">Contatos administrativos</legend>
      {fields.length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhum contato informado.</p>
      )}
      {fields.map((campo, indice) => (
        <div
          key={campo.id}
          className="grid items-start gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_auto]"
        >
          <FormField name={`contatosAdministrativos.${indice}.nome`} label="Nome" obrigatorio />
          <FormField
            name={`contatosAdministrativos.${indice}.funcao`}
            label="Função"
            obrigatorio
            placeholder="Ex.: Secretária, Financeiro"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mt-6 row-span-2 sm:row-span-1"
            aria-label={`Remover contato ${indice + 1}`}
            onClick={() => remove(indice)}
          >
            <Trash2Icon aria-hidden />
          </Button>
          <FormField
            name={`contatosAdministrativos.${indice}.telefone`}
            label="Telefone"
            tipo="telefone"
          />
          <FormField
            name={`contatosAdministrativos.${indice}.email`}
            label="Email"
            tipo="email"
            placeholder="email@exemplo.com"
          />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="justify-self-start"
        disabled={fields.length >= PROFISSIONAL_CONTATOS_MAX}
        onClick={() => append({ nome: '', funcao: '', telefone: '', email: '' })}
      >
        <PlusIcon aria-hidden />
        Adicionar contato
      </Button>
    </fieldset>
  );
}
