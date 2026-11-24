import type { Profissional } from '@torres/shared';
import { Loader2Icon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { formatarData, formatarDataHora } from '@/lib/formatar';
import { ClassificacaoBadge } from './ClassificacaoBadge';
import { useDefinirEstrategico, useHistoricoClassificacao } from './use-classificacao';
import { useTextoMotivo } from './use-texto-motivo';

/**
 * Seção "Classificação do parceiro" do detalhe do profissional (issue #143): a classificação
 * vigente com o motivo, a marca de "Estratégico" (só a gerência muda) e o histórico das mudanças.
 * A classificação é calculada todo dia; marcar "Estratégico" reclassifica na hora.
 */
export function ClassificacaoProfissional({
  profissional,
}: Readonly<{ profissional: Profissional }>) {
  const { t } = useTranslation();
  const textoMotivo = useTextoMotivo();
  const [pagina, setPagina] = useState(1);
  const [atual, setAtual] = useState(profissional);
  const historico = useHistoricoClassificacao(profissional.id, pagina);
  const definir = useDefinirEstrategico(profissional.id);

  const motivo = atual.classificacaoMotivo
    ? textoMotivo(atual.classificacaoMotivo, atual.classificacaoParametros)
    : null;

  return (
    <section
      aria-labelledby="titulo-classificacao-profissional"
      className="grid gap-3 border-t pt-4"
    >
      <h3 id="titulo-classificacao-profissional" className="text-sm font-semibold">
        {t('classificacao.titulo')}
      </h3>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <ClassificacaoBadge classificacao={atual.classificacao} />
        {motivo && <span className="text-muted-foreground">{motivo}</span>}
        {atual.classificacao === null && (
          <span className="text-muted-foreground">{t('classificacao.semCalculo')}</span>
        )}
      </div>
      {atual.classificacaoEm && (
        <p className="text-xs text-muted-foreground">
          {t('classificacao.desde', { data: formatarDataHora(atual.classificacaoEm) })}
        </p>
      )}
      <SePermitido permissao="gestao-profissionais.profissionais.editar">
        <div className="flex items-center gap-2">
          <Switch
            id="classificacao-estrategico"
            checked={atual.estrategico}
            disabled={definir.isPending}
            onCheckedChange={(marcado) =>
              definir.mutate(marcado, { onSuccess: (alterado) => setAtual(alterado) })
            }
          />
          <Label htmlFor="classificacao-estrategico">{t('classificacao.estrategico')}</Label>
          {definir.isPending && <Loader2Icon aria-hidden className="size-4 animate-spin" />}
        </div>
        <p className="text-xs text-muted-foreground">{t('classificacao.estrategicoAjuda')}</p>
      </SePermitido>
      <div className="grid gap-2">
        <h4 className="text-sm font-medium">{t('classificacao.historico.titulo')}</h4>
        {historico.isError && (
          <p role="alert" className="text-sm text-destructive">
            {t('classificacao.historico.erro')}
          </p>
        )}
        {historico.data && historico.data.data.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('classificacao.historico.vazio')}</p>
        )}
        {historico.data && historico.data.data.length > 0 && (
          <>
            <ul className="grid gap-1.5">
              {historico.data.data.map((h) => (
                <li key={h.id} className="rounded-md border px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    {h.classificacaoAnterior && (
                      <>
                        <ClassificacaoBadge classificacao={h.classificacaoAnterior} />
                        <span aria-hidden>→</span>
                        <span className="sr-only">{t('classificacao.historico.para')}</span>
                      </>
                    )}
                    <ClassificacaoBadge classificacao={h.classificacao} />
                    <span className="text-xs text-muted-foreground">
                      {formatarData(h.referencia)} · {t(`classificacao.origens.${h.origem}`)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {textoMotivo(h.motivo, h.parametros)}
                  </p>
                </li>
              ))}
            </ul>
            {historico.data.meta.totalPages > 1 && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pagina <= 1}
                  onClick={() => setPagina((p) => p - 1)}
                >
                  {t('classificacao.historico.anterior')}
                </Button>
                <span>
                  {t('classificacao.historico.pagina', {
                    pagina,
                    total: historico.data.meta.totalPages,
                  })}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pagina >= historico.data.meta.totalPages}
                  onClick={() => setPagina((p) => p + 1)}
                >
                  {t('classificacao.historico.proxima')}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
