import { meuPerfilInputSchema, type MeuPerfil, type MeuPerfilFormulario } from '@torres/shared';
import { UserIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FileUpload } from '@/components/shared/FileUpload';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { AvatarUsuario } from '@/components/shared/AvatarUsuario';
import { usePermissao } from '@/lib/auth/use-sessao';
import { useAtualizarPerfil, useDefinirAvatar } from './use-configuracoes';

function valoresIniciais(perfil: MeuPerfil): MeuPerfilFormulario {
  return {
    nome: perfil.nome,
    email: perfil.email,
    telefone: perfil.telefone ?? '',
    cargo: perfil.cargo ?? '',
  };
}

export interface AbaPerfilProps {
  perfil: MeuPerfil;
}

/**
 * Aba "Perfil": avatar (grava ao enviar) e dados pessoais (gravados só em "Salvar Alterações").
 * Sem `configuracoes.editar`, os campos ficam só para leitura.
 */
export function AbaPerfil({ perfil }: Readonly<AbaPerfilProps>) {
  const { t } = useTranslation();
  const podeEditar = usePermissao('configuracoes-gestao.configuracoes.editar');
  const atualizar = useAtualizarPerfil();
  const definirAvatar = useDefinirAvatar();
  const form = useFormulario(meuPerfilInputSchema, { defaultValues: valoresIniciais(perfil) });

  return (
    <section className="grid gap-6 rounded-lg border p-6" aria-labelledby="titulo-meu-perfil">
      <div>
        <h2 id="titulo-meu-perfil" className="flex items-center gap-2 text-lg font-semibold">
          <UserIcon aria-hidden className="size-5" />
          {t('configuracoes.perfil.titulo')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('configuracoes.perfil.descricao')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-4 border-b pb-6">
        <AvatarUsuario
          nome={perfil.nome}
          arquivoId={perfil.avatarArquivoId}
          className="size-16 text-lg"
        />
        {podeEditar && (
          <div className="max-w-sm flex-1">
            <FileUpload
              uso="avatar"
              label={t('configuracoes.perfil.enviarAvatar')}
              disabled={definirAvatar.isPending}
              onUploaded={(arquivo) => definirAvatar.mutate(arquivo.id)}
            />
          </div>
        )}
      </div>

      <FormLayout
        form={form}
        colunas={2}
        rotuloEnviar={t('configuracoes.perfil.salvar')}
        acoes={podeEditar ? undefined : null}
        onSubmit={(valores) => atualizar.mutateAsync(valores)}
      >
        <FormField
          name="nome"
          label={t('configuracoes.perfil.nome')}
          obrigatorio
          disabled={!podeEditar}
        />
        <FormField
          name="email"
          label={t('configuracoes.perfil.email')}
          tipo="email"
          obrigatorio
          disabled={!podeEditar}
        />
        <FormField
          name="telefone"
          label={t('configuracoes.perfil.telefone')}
          tipo="telefone"
          disabled={!podeEditar}
        />
        <FormField name="cargo" label={t('configuracoes.perfil.cargo')} disabled={!podeEditar} />
      </FormLayout>
    </section>
  );
}
