import { FileSpreadsheetIcon, FileTextIcon, PlusIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useExportacao } from '@/components/shared/data-grid/use-exportacao';
import { EmptyState } from '@/components/shared/EmptyState';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge, type TomStatus } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { ExemploFormulario } from './ExemploFormulario';
import { ExemploGrid, ModalUnidade } from './ExemploGrid';
import { EXPORTACAO_UNIDADES, URL_UNIDADES } from './exemplos';

const TONS: [TomStatus, string][] = [
  ['sucesso', 'Ativo'],
  ['perigo', 'Inativo'],
  ['alerta', 'Pendente'],
  ['info', 'Médico / Profissional'],
  ['destaque', 'Administrador / Dono'],
  ['neutro', 'Cancelado'],
];

/**
 * Documentação viva dos componentes de `components/shared` (issue #75). Só existe em
 * desenvolvimento e não aparece no menu: abra `/dev/componentes`. O grid usa a API real de
 * Unidades; as ações e formulários são simulados (nada é gravado).
 */
export function ComponentesPage() {
  const [criando, setCriando] = useState(false);
  const exportacao = useExportacao({ ...EXPORTACAO_UNIDADES, url: `${URL_UNIDADES}/export` });

  return (
    <div className="grid gap-10">
      <PageHeader
        titulo="Componentes compartilhados"
        descricao="Exemplos de uso para as telas (somente em desenvolvimento)."
        acoes={
          <>
            {exportacao.permitido && (
              <>
                <Button
                  variant="outline"
                  aria-busy={exportacao.exportando}
                  onClick={() => exportacao.exportar('xlsx')}
                >
                  <FileSpreadsheetIcon aria-hidden />
                  Excel
                </Button>
                <Button
                  variant="outline"
                  aria-busy={exportacao.exportando}
                  onClick={() => exportacao.exportar('pdf')}
                >
                  <FileTextIcon aria-hidden />
                  PDF
                </Button>
              </>
            )}
            <Button onClick={() => setCriando(true)}>
              <PlusIcon aria-hidden />
              Nova unidade
            </Button>
          </>
        }
      />
      {criando && <ModalUnidade onFechar={() => setCriando(false)} />}

      <Secao
        titulo="DataGrid"
        descricao="Unidades da API real: busca, chips, filtro, colunas, ordenação, paginação, exportação e ações."
      >
        <ExemploGrid />
      </Secao>

      <Secao
        titulo="FormLayout e FormField"
        descricao="Todos os tipos de campo, validação pelo schema Zod e erros do servidor."
      >
        <ExemploFormulario />
      </Secao>

      <Secao titulo="StatusBadge e EmptyState">
        <div className="flex flex-wrap gap-2">
          {TONS.map(([tom, rotulo]) => (
            <StatusBadge key={tom} tom={tom}>
              {rotulo}
            </StatusBadge>
          ))}
        </div>
        <EmptyState
          titulo="Nenhuma resposta rápida cadastrada"
          descricao="Exemplo de estado vazio com ação."
          acao={<Button variant="outline">Criar primeira resposta</Button>}
          className="rounded-md border border-dashed"
        />
      </Secao>
    </div>
  );
}

function Secao({
  titulo,
  descricao,
  children,
}: Readonly<{ titulo: string; descricao?: string; children: ReactNode }>) {
  return (
    <section className="grid gap-4" aria-labelledby={`secao-${titulo}`}>
      <div className="space-y-1 border-b pb-2">
        <h2 id={`secao-${titulo}`} className="text-lg font-semibold">
          {titulo}
        </h2>
        {descricao && <p className="text-sm text-muted-foreground">{descricao}</p>}
      </div>
      {children}
    </section>
  );
}
