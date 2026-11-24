import type { ProfissionalDocumento, ProfissionalDocumentoSituacao } from '@torres/shared';
import { CheckIcon, DownloadIcon, PencilIcon, PlusIcon, Trash2Icon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { SePermitido } from '@/components/shared/SePermitido';
import { StatusBadge, type TomStatus } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { formatarData, formatarDataHora } from '@/lib/formatar';
import { ModalDocumentoProfissional } from './ModalDocumentoProfissional';
import { ModalRecusarDocumento } from './ModalRecusarDocumento';
import {
  linkDoDocumento,
  useDecidirDocumento,
  useDocumentosProfissional,
  useRemoverDocumento,
} from './use-documentos-profissional';

const TOM_SITUACAO: Record<ProfissionalDocumentoSituacao, TomStatus> = {
  PENDENTE: 'alerta',
  ENVIADO: 'info',
  VALIDADO: 'sucesso',
  VENCIDO: 'perigo',
  RECUSADO: 'perigo',
};

type Edicao = { tipo: 'novo' } | { tipo: 'editar'; documento: ProfissionalDocumento };

/**
 * Seção "Documentos" do detalhe do profissional (issue #141): contrato, documentos pessoais,
 * registro no conselho, RQE, licenças, certificados e documentos sanitários, com situação,
 * validade e validação. O contrato de sala continua na seção "Contratos" (sem duplicar o PDF).
 */
export function DocumentosProfissional({ profissionalId }: Readonly<{ profissionalId: string }>) {
  const { t } = useTranslation();
  const consulta = useDocumentosProfissional(profissionalId);
  const decidir = useDecidirDocumento(profissionalId);
  const remover = useRemoverDocumento(profissionalId);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [recusando, setRecusando] = useState<ProfissionalDocumento | null>(null);
  const [removendo, setRemovendo] = useState<ProfissionalDocumento | null>(null);

  async function baixar(documento: ProfissionalDocumento) {
    try {
      const link = await linkDoDocumento(profissionalId, documento.id);
      window.open(link.url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error(t('profissionalDocumentos.erroBaixar'));
    }
  }

  const tipo = (valor: string) => t(`profissionalDocumentos.tipos.${valor}`);
  const dados = consulta.data;

  return (
    <section aria-labelledby="titulo-documentos-profissional" className="grid gap-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="titulo-documentos-profissional" className="text-sm font-semibold">
          {t('profissionalDocumentos.titulo')}
        </h3>
        <SePermitido permissao="gestao-profissionais.profissionais.editar">
          <Button type="button" size="sm" onClick={() => setEdicao({ tipo: 'novo' })}>
            <PlusIcon aria-hidden />
            {t('profissionalDocumentos.novo')}
          </Button>
        </SePermitido>
      </div>

      {consulta.isPending && (
        <p className="text-sm text-muted-foreground">{t('profissionalDocumentos.carregando')}</p>
      )}
      {consulta.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t('profissionalDocumentos.erroCarregar')}
        </p>
      )}

      {dados && (
        <>
          <p className="text-sm" data-testid="resumo-documentacao">
            <StatusBadge tom={dados.documentacaoValidada ? 'sucesso' : 'alerta'}>
              {dados.documentacaoValidada
                ? t('profissionalDocumentos.documentacaoValidada')
                : t('profissionalDocumentos.documentacaoPendente')}
            </StatusBadge>
          </p>
          {dados.pendentes.length > 0 && (
            <ul aria-label={t('profissionalDocumentos.pendentes')} className="grid gap-1">
              {dados.pendentes.map((pendente) => (
                <li key={pendente} className="flex items-center gap-2 text-sm">
                  <StatusBadge tom={TOM_SITUACAO.PENDENTE}>
                    {t('profissionalDocumentos.situacoes.PENDENTE')}
                  </StatusBadge>
                  {tipo(pendente)}
                </li>
              ))}
            </ul>
          )}
          {dados.data.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('profissionalDocumentos.vazio')}</p>
          )}
          <ul className="grid gap-2">
            {dados.data.map((documento) => (
              <li key={documento.id} className="grid gap-1 rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {tipo(documento.tipo)}
                    {documento.numero && ` · ${documento.numero}`}
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    {documento.alerta && documento.situacao !== 'VENCIDO' && (
                      <StatusBadge tom="alerta">
                        {t('profissionalDocumentos.venceEm', { dias: documento.diasParaVencer })}
                      </StatusBadge>
                    )}
                    <StatusBadge tom={TOM_SITUACAO[documento.situacao]}>
                      {t(`profissionalDocumentos.situacoes.${documento.situacao}`)}
                    </StatusBadge>
                  </span>
                </div>
                <div className="text-muted-foreground">
                  {t('profissionalDocumentos.datas', {
                    emissao: formatarData(documento.emissao),
                    validade: formatarData(documento.validade),
                  })}
                  {documento.arquivoNome && ` · ${documento.arquivoNome}`}
                </div>
                {documento.validadoEm && (
                  <div className="text-muted-foreground">
                    {t('profissionalDocumentos.validadoPor', {
                      nome: documento.validadoPorNome ?? '-',
                      data: formatarDataHora(documento.validadoEm),
                    })}
                  </div>
                )}
                {documento.motivoRecusa && (
                  <div className="text-destructive">
                    {t('profissionalDocumentos.motivoRecusa', { motivo: documento.motivoRecusa })}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-1 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={t('profissionalDocumentos.baixarDe', {
                      tipo: tipo(documento.tipo),
                    })}
                    onClick={() => void baixar(documento)}
                  >
                    <DownloadIcon aria-hidden />
                    {t('profissionalDocumentos.baixar')}
                  </Button>
                  <SePermitido permissao="gestao-profissionais.profissionais-documentos.validar">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={t('profissionalDocumentos.validarDe', {
                        tipo: tipo(documento.tipo),
                      })}
                      disabled={decidir.isPending}
                      onClick={() =>
                        decidir.mutate({
                          documentoId: documento.id,
                          decisao: { decisao: 'VALIDAR' },
                        })
                      }
                    >
                      <CheckIcon aria-hidden />
                      {t('profissionalDocumentos.validar')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={t('profissionalDocumentos.recusarDe', {
                        tipo: tipo(documento.tipo),
                      })}
                      onClick={() => setRecusando(documento)}
                    >
                      <XIcon aria-hidden />
                      {t('profissionalDocumentos.recusar')}
                    </Button>
                  </SePermitido>
                  <SePermitido permissao="gestao-profissionais.profissionais.editar">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={t('profissionalDocumentos.editarDe', {
                        tipo: tipo(documento.tipo),
                      })}
                      onClick={() => setEdicao({ tipo: 'editar', documento })}
                    >
                      <PencilIcon aria-hidden />
                      {t('profissionalDocumentos.acaoEditar')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={t('profissionalDocumentos.removerDe', {
                        tipo: tipo(documento.tipo),
                      })}
                      onClick={() => setRemovendo(documento)}
                    >
                      <Trash2Icon aria-hidden />
                      {t('profissionalDocumentos.acaoExcluir')}
                    </Button>
                  </SePermitido>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {edicao && (
        <ModalDocumentoProfissional
          profissionalId={profissionalId}
          documento={edicao.tipo === 'editar' ? edicao.documento : undefined}
          onFechar={() => setEdicao(null)}
        />
      )}
      {recusando && (
        <ModalRecusarDocumento
          profissionalId={profissionalId}
          documentoId={recusando.id}
          onFechar={() => setRecusando(null)}
        />
      )}
      <ConfirmDialog
        aberto={removendo !== null}
        onAbertoChange={(aberto) => aberto || setRemovendo(null)}
        titulo={t('profissionalDocumentos.confirmarRemocao')}
        descricao={t('profissionalDocumentos.descricaoRemocao')}
        rotuloConfirmar={t('profissionalDocumentos.acaoExcluir')}
        onConfirmar={async () => {
          if (removendo) await remover.mutateAsync(removendo.id);
        }}
      />
    </section>
  );
}
