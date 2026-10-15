import { useNavigate } from 'react-router';
import { sair } from '@/lib/auth/sessao';
import { useSessao } from '@/lib/auth/use-sessao';

export interface UsuarioExibido {
  nome: string;
  perfil: string;
  iniciais: string;
}

/** Iniciais do primeiro e do último nome: "Ana Maria Souza" → "AS". */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const primeira = partes[0]?.[0] ?? '';
  const ultima = partes.length > 1 ? (partes.at(-1)?.[0] ?? '') : '';
  return `${primeira}${ultima}`.toUpperCase() || '?';
}

/** Nome, perfil e iniciais do usuário logado, para o cabeçalho e o menu. */
export function useUsuarioExibido(): UsuarioExibido {
  const sessao = useSessao();
  if (sessao.status !== 'autenticado') return { nome: '', perfil: '', iniciais: '?' };
  const { nome, perfil } = sessao.usuario;
  return { nome, perfil: perfil?.nome ?? 'Sem perfil', iniciais: iniciais(nome) };
}

/** Encerra a sessão e vai para o login. */
export function useSair(): () => void {
  const navigate = useNavigate();
  return () => {
    void sair().then(() => navigate('/login', { replace: true }));
  };
}
