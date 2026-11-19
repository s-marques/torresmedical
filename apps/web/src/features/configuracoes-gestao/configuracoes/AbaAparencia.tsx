import {
  DENSIDADES,
  ESQUEMAS_COR,
  IDIOMAS,
  TEMAS,
  type Densidade,
  type EsquemaCor,
  type Preferencias,
  type Tema,
} from '@torres/shared';
import {
  GlobeIcon,
  type LucideIcon,
  MonitorIcon,
  MoonIcon,
  Rows2Icon,
  Rows3Icon,
  Rows4Icon,
  SunIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePermissao } from '@/lib/auth/use-sessao';
import { NOMES_IDIOMA } from '@/lib/i18n';
import { GrupoOpcoes } from './GrupoOpcoes';
import { useAtualizarPreferencias } from '@/hooks/use-atualizar-preferencias';

const ICONE_TEMA: Record<Tema, LucideIcon> = {
  claro: SunIcon,
  escuro: MoonIcon,
  sistema: MonitorIcon,
};

const ICONE_DENSIDADE: Record<Densidade, LucideIcon> = {
  compacto: Rows4Icon,
  confortavel: Rows3Icon,
  espacoso: Rows2Icon,
};

/** Amostra de cada esquema (as mesmas cores primárias de `index.css`). */
const AMOSTRA_COR: Record<EsquemaCor, string> = {
  esmeralda: 'oklch(0.527 0.154 150.069)',
  azul: 'oklch(0.546 0.245 262.881)',
  violeta: 'oklch(0.541 0.281 293.009)',
  rosa: 'oklch(0.592 0.249 0.584)',
  laranja: 'oklch(0.646 0.222 41.116)',
  ardosia: 'oklch(0.446 0.043 257.281)',
};

export interface AbaAparenciaProps {
  preferencias: Preferencias;
}

/**
 * Aba "Aparência": tema, esquema de cores, densidade e idioma. Grava ao escolher e aplica na
 * hora; vale para o usuário em qualquer computador (banco, confirmado pelo dev).
 */
export function AbaAparencia({ preferencias }: Readonly<AbaAparenciaProps>) {
  const { t } = useTranslation();
  const podeEditar = usePermissao('configuracoes-gestao.configuracoes.editar');
  const atualizar = useAtualizarPreferencias();
  const icone = (Icone: LucideIcon) => <Icone aria-hidden className="size-5" />;

  return (
    <section className="grid gap-6 rounded-lg border p-6" aria-labelledby="titulo-aparencia">
      <div>
        <h2 id="titulo-aparencia" className="text-lg font-semibold">
          {t('configuracoes.aparencia.titulo')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('configuracoes.aparencia.descricao')}</p>
      </div>

      <GrupoOpcoes
        titulo={t('configuracoes.aparencia.tema')}
        valor={preferencias.tema}
        disabled={!podeEditar}
        onChange={(tema) => atualizar.mutate({ tema })}
        opcoes={TEMAS.map((tema) => ({
          valor: tema,
          rotulo: t(`temas.${tema}`),
          icone: icone(ICONE_TEMA[tema]),
        }))}
      />
      <GrupoOpcoes
        titulo={t('configuracoes.aparencia.esquemaCor')}
        valor={preferencias.esquemaCor}
        disabled={!podeEditar}
        onChange={(esquemaCor) => atualizar.mutate({ esquemaCor })}
        opcoes={ESQUEMAS_COR.map((cor) => ({
          valor: cor,
          rotulo: t(`configuracoes.aparencia.cores.${cor}`),
          icone: (
            <span
              aria-hidden
              className="size-5 rounded-full"
              style={{ backgroundColor: AMOSTRA_COR[cor] }}
            />
          ),
        }))}
      />
      <GrupoOpcoes
        titulo={t('configuracoes.aparencia.densidade')}
        valor={preferencias.densidade}
        disabled={!podeEditar}
        onChange={(densidade) => atualizar.mutate({ densidade })}
        opcoes={DENSIDADES.map((densidade) => ({
          valor: densidade,
          rotulo: t(`configuracoes.aparencia.densidades.${densidade}`),
          icone: icone(ICONE_DENSIDADE[densidade]),
        }))}
      />
      <GrupoOpcoes
        titulo={t('configuracoes.aparencia.idioma')}
        valor={preferencias.idioma}
        disabled={!podeEditar}
        onChange={(idioma) => atualizar.mutate({ idioma })}
        opcoes={IDIOMAS.map((idioma) => ({
          valor: idioma,
          rotulo: NOMES_IDIOMA[idioma],
          icone: icone(GlobeIcon),
        }))}
      />
    </section>
  );
}
