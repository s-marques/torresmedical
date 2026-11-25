import {
  ATENDIMENTO_STATUS_ROTULOS,
  ATENDIMENTO_TIPO_ROTULOS,
  type Atendimento,
} from '@torres/shared';
import { BadgeCheckIcon, FilePenLineIcon, PenLineIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/shared/Modal';
import { SePermitido } from '@/components/shared/SePermitido';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatarDataHora } from '@/lib/formatar';
import { ModalAdendoAtendimento } from './ModalAdendoAtendimento';
import { ModalAssinarAtendimento } from './ModalAssinarAtendimento';
import { ModalEditarAtendimento } from './ModalEditarAtendimento';
import { SecaoAnexos, SecaoDocumentos, SecaoVersoes } from './SecoesAtendimento';

const CAMPOS = ['queixa', 'evolucao', 'diagnostico', 'conduta', 'observacoes'] as const;

type Acao = 'editar' | 'assinar' | 'adendo';

export interface ModalDetalheAtendimentoProps {
  atendimento: Atendimento;
  onFechar: () => void;
}

/**
 * Detalhe do atendimento (issue #151): conteúdo, exames e anexos, documentos emitidos e histórico
 * de versões, com editar (antes de assinar), assinar e adendo (depois de assinar).
 */
export function ModalDetalheAtendimento({
  atendimento,
  onFechar,
}: Readonly<ModalDetalheAtendimentoProps>) {
  const { t } = useTranslation();
  const [acao, setAcao] = useState<Acao | null>(null);
  const assinado = atendimento.assinadoEm !== null;
  const fecharAcao = () => setAcao(null);

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={t('atendimentoRegistros.titulo')}
      descricao={
        assinado
          ? t('atendimentoRegistros.assinadoPor', {
              nome: atendimento.assinadoPorNome ?? '-',
              data: formatarDataHora(atendimento.assinadoEm),
            })
          : t('atendimentoRegistros.naoAssinado')
      }
      tamanho="xl"
      rodape={
        <div className="flex flex-wrap justify-end gap-2">
          {assinado ? (
            <SePermitido permissao="consultorio-assistencial.prontuarios.assinar">
              <Button type="button" onClick={() => setAcao('adendo')}>
                <FilePenLineIcon aria-hidden />
                {t('atendimentoRegistros.acoes.adendo')}
              </Button>
            </SePermitido>
          ) : (
            <>
              <SePermitido permissao="consultorio-assistencial.prontuarios.editar">
                <Button type="button" variant="outline" onClick={() => setAcao('editar')}>
                  <PenLineIcon aria-hidden />
                  {t('atendimentoRegistros.acoes.editar')}
                </Button>
              </SePermitido>
              <SePermitido permissao="consultorio-assistencial.prontuarios.assinar">
                <Button type="button" onClick={() => setAcao('assinar')}>
                  <BadgeCheckIcon aria-hidden />
                  {t('atendimentoRegistros.acoes.assinar')}
                </Button>
              </SePermitido>
            </>
          )}
          <Button type="button" variant="outline" onClick={onFechar}>
            {t('comum.fechar')}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {atendimento.tipo ? ATENDIMENTO_TIPO_ROTULOS[atendimento.tipo] : 'Atendimento'}
          </Badge>
          <Badge variant="outline">{ATENDIMENTO_STATUS_ROTULOS[atendimento.status]}</Badge>
          {assinado && (
            <Badge>
              <BadgeCheckIcon className="size-3" aria-hidden />
              {t('atendimentoRegistros.assinado')}
            </Badge>
          )}
          {atendimento.totalAdendos > 0 && (
            <Badge variant="outline">
              {t('atendimentoRegistros.totalAdendos', { count: atendimento.totalAdendos })}
            </Badge>
          )}
          {atendimento.profissionalNome && (
            <span className="text-sm text-muted-foreground">{atendimento.profissionalNome}</span>
          )}
        </div>

        <dl className="grid gap-2 text-sm">
          {CAMPOS.filter((campo) => atendimento[campo]).map((campo) => (
            <div key={campo}>
              <dt className="text-muted-foreground">{t(`atendimentoRegistros.campos.${campo}`)}</dt>
              <dd className="whitespace-pre-wrap">{atendimento[campo]}</dd>
            </div>
          ))}
        </dl>

        <SecaoAnexos atendimento={atendimento} />
        <SecaoDocumentos atendimento={atendimento} />
        {assinado && <SecaoVersoes atendimento={atendimento} />}
      </div>

      {acao === 'editar' && (
        <ModalEditarAtendimento atendimento={atendimento} onFechar={fecharAcao} />
      )}
      {acao === 'assinar' && (
        <ModalAssinarAtendimento
          pacienteId={atendimento.pacienteId}
          atendimentoId={atendimento.id}
          onFechar={fecharAcao}
        />
      )}
      {acao === 'adendo' && (
        <ModalAdendoAtendimento
          pacienteId={atendimento.pacienteId}
          atendimentoId={atendimento.id}
          onFechar={fecharAcao}
        />
      )}
    </Modal>
  );
}
