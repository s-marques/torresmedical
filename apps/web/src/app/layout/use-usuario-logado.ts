import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { sair } from '@/lib/auth/sessao';
import { useSessao } from '@/lib/auth/use-sessao';

export interface UsuarioExibido {
  nome: string;
  perfil: string;
  /** Avatar da tela Configurações (issue #30), ou `null` para mostrar as iniciais. */
  avatarArquivoId: string | null;
}

/** Nome, perfil e avatar do usuário logado, para o cabeçalho e o menu. */
export function useUsuarioExibido(): UsuarioExibido {
  const sessao = useSessao();
  const { t } = useTranslation();
  if (sessao.status !== 'autenticado') return { nome: '', perfil: '', avatarArquivoId: null };
  const { nome, perfil, avatarArquivoId } = sessao.usuario;
  return { nome, perfil: perfil?.nome ?? t('layout.semPerfil'), avatarArquivoId };
}

/** Encerra a sessão e vai para o login. */
export function useSair(): () => void {
  const navigate = useNavigate();
  return () => {
    void sair().then(() => navigate('/login', { replace: true }));
  };
}
