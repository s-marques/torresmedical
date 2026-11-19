import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useLinkArquivo } from '@/hooks/use-link-arquivo';
import { iniciais } from '@/lib/formatar';
import { cn } from '@/lib/utils';

export interface AvatarUsuarioProps {
  nome: string;
  /** Avatar enviado na tela Configurações; sem ele, mostra as iniciais. */
  arquivoId: string | null;
  className?: string;
  /** Classes das iniciais (ex.: cores do menu lateral). */
  classNameIniciais?: string;
}

/** Avatar do usuário (tela Configurações, issue #30) ou as iniciais do nome. */
export function AvatarUsuario({
  nome,
  arquivoId,
  className,
  classNameIniciais,
}: Readonly<AvatarUsuarioProps>) {
  return (
    <Avatar className={cn('size-8', className)}>
      {/* Só busca o link quando há avatar: sem ele, nem precisa da API. */}
      {arquivoId && <ImagemAvatar nome={nome} arquivoId={arquivoId} />}
      <AvatarFallback className={cn('bg-primary/10 font-semibold text-primary', classNameIniciais)}>
        {iniciais(nome)}
      </AvatarFallback>
    </Avatar>
  );
}

function ImagemAvatar({ nome, arquivoId }: Readonly<{ nome: string; arquivoId: string }>) {
  const { t } = useTranslation();
  const link = useLinkArquivo(arquivoId);
  if (!link.data) return null;
  return <AvatarImage src={link.data.url} alt={t('layout.avatarDe', { nome })} />;
}
