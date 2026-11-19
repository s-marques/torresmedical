import { useEffect } from 'react';
import {
  aplicarCor,
  aplicarDensidade,
  lerCorSalva,
  lerDensidadeSalva,
  TEMA_PARA_THEME,
} from '@/lib/aparencia';
import { useSessao } from '@/lib/auth/use-sessao';
import { aplicarIdioma } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

/**
 * Aplica as preferências do usuário logado (aba Aparência, issue #30): tema, esquema de cores,
 * densidade e idioma. A fonte é a sessão (banco); sem sessão (ex.: login), vale o que ficou
 * guardado no navegador.
 */
export function SincronizarPreferencias() {
  const sessao = useSessao();
  const { setTheme } = useTheme();
  const preferencias = sessao.status === 'autenticado' ? sessao.usuario.preferencias : null;
  const tema = preferencias?.tema;
  const cor = preferencias?.esquemaCor ?? lerCorSalva();
  const densidade = preferencias?.densidade ?? lerDensidadeSalva();
  const idioma = preferencias?.idioma;

  useEffect(() => {
    if (tema) setTheme(TEMA_PARA_THEME[tema]);
  }, [tema, setTheme]);

  useEffect(() => aplicarCor(cor), [cor]);
  useEffect(() => aplicarDensidade(densidade), [densidade]);

  useEffect(() => {
    if (idioma) aplicarIdioma(idioma);
  }, [idioma]);

  return null;
}
