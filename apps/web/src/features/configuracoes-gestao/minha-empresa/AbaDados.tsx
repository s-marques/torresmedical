import { empresaInputSchema, type Empresa, type EmpresaInput } from '@torres/shared';
import { Building2Icon } from 'lucide-react';
import { FileUpload } from '@/components/shared/FileUpload';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { useAtualizarEmpresa, useDefinirLogoEmpresa, useLinkArquivo } from './use-minha-empresa';

function valoresIniciais(empresa: Empresa): EmpresaInput {
  return {
    nome: empresa.nome,
    documento: empresa.documento,
    email: empresa.email ?? '',
    telefone: empresa.telefone ?? '',
  };
}

export interface AbaDadosProps {
  empresa: Empresa;
}

/** Aba "Dados": cadastro da empresa e logo. Só o botão "Salvar Alterações" grava os campos. */
export function AbaDados({ empresa }: Readonly<AbaDadosProps>) {
  const atualizar = useAtualizarEmpresa();
  const definirLogo = useDefinirLogoEmpresa();
  const link = useLinkArquivo(empresa.logoArquivoId);
  const form = useFormulario(empresaInputSchema, { defaultValues: valoresIniciais(empresa) });

  return (
    <div className="grid gap-6 rounded-lg border p-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Building2Icon aria-hidden className="size-5" />
          Dados da Empresa
        </h2>
        <p className="text-sm text-muted-foreground">Informações cadastrais da sua empresa</p>
      </div>
      <FormLayout
        form={form}
        colunas={2}
        rotuloEnviar="Salvar Alterações"
        onSubmit={(valores) => atualizar.mutateAsync(valores)}
      >
        <FormField name="nome" label="Nome da Empresa" obrigatorio />
        <FormField name="documento" label="CNPJ / CPF" tipo="cpf-cnpj" obrigatorio />
        <FormField name="email" label="E-mail" tipo="email" />
        <FormField name="telefone" label="Telefone" tipo="telefone" />
        <div className="grid gap-2 sm:col-span-2">
          <span className="text-sm font-medium">Logo da Empresa</span>
          <div className="flex items-center gap-4">
            {link.data && (
              <img
                src={link.data.url}
                alt="Logo da empresa"
                className="size-16 rounded-md border object-contain"
              />
            )}
            <div className="max-w-sm flex-1">
              <FileUpload
                uso="logo-empresa"
                label="Trocar logo"
                disabled={definirLogo.isPending}
                onUploaded={(arquivo) => definirLogo.mutate(arquivo.id)}
              />
            </div>
          </div>
        </div>
      </FormLayout>
    </div>
  );
}
