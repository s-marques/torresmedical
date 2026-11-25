import { useMutation } from '@tanstack/react-query';
import { FileDownIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EntitySelect } from '@/components/shared/EntitySelect';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { baixarArquivo } from '@/lib/api/download';
import { usePermissoes } from '@/lib/auth/use-sessao';

export interface BotaoExportarProntuarioProps {
  pacienteId: string;
}

/**
 * "Exportar prontuário" (issue #158, R §39): PDF completo do paciente ou ZIP com os anexos.
 * Só entram os registros dos profissionais do escopo do usuário; quem tem acesso a vários pode
 * restringir a um deles. A API exige `prontuarios.exportar` e a exportação de dados pessoais.
 */
export function BotaoExportarProntuario({ pacienteId }: Readonly<BotaoExportarProntuarioProps>) {
  const { t } = useTranslation();
  const permissoes = usePermissoes();
  const [aberto, setAberto] = useState(false);
  const [profissionalId, setProfissionalId] = useState<string | null>(null);
  const [incluirAnexos, setIncluirAnexos] = useState(false);

  const exportar = useMutation({
    mutationFn: () =>
      baixarArquivo(
        `/api/consultorio-assistencial/prontuarios/${pacienteId}/exportar`,
        { profissionalId, incluirAnexos },
        incluirAnexos ? 'prontuario.zip' : 'prontuario.pdf',
      ),
    onSuccess: () => setAberto(false),
  });

  const permitido =
    permissoes.includes('consultorio-assistencial.prontuarios.exportar') &&
    permissoes.includes('configuracoes-gestao.dados-pessoais.exportar');
  if (!permitido) return null;

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)}>
        <FileDownIcon aria-hidden />
        {t('exportarProntuario.botao')}
      </Button>
      <Modal
        aberto={aberto}
        onAbertoChange={setAberto}
        titulo={t('exportarProntuario.titulo')}
        descricao={t('exportarProntuario.descricao')}
        rodape={
          <>
            <Button type="button" variant="outline" onClick={() => setAberto(false)}>
              {t('comum.cancelar')}
            </Button>
            <Button type="button" disabled={exportar.isPending} onClick={() => exportar.mutate()}>
              {t('exportarProntuario.exportar')}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="exportar-prontuario-profissional">
              {t('exportarProntuario.profissional')}
            </Label>
            <EntitySelect
              id="exportar-prontuario-profissional"
              entidade="profissionais"
              value={profissionalId}
              onChange={(id) => setProfissionalId(id)}
              placeholder={t('exportarProntuario.todosProfissionais')}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="exportar-prontuario-anexos"
              checked={incluirAnexos}
              onCheckedChange={(marcado) => setIncluirAnexos(marcado === true)}
            />
            <Label htmlFor="exportar-prontuario-anexos">
              {t('exportarProntuario.incluirAnexos')}
            </Label>
          </div>
        </div>
      </Modal>
    </>
  );
}
