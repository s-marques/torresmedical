import {
  type AtendimentoModelo,
  type ModeloCampo,
  type ModeloRespostas,
  type ModeloSecao,
} from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/shared/form/FormField';
import { formatarData } from '@/lib/formatar';
import { nomeResposta } from './respostas-modelo';

/** Opções da escala: do mínimo ao máximo, de 1 em 1 (a escala padrão é de 0 a 10). */
function opcoesEscala(campo: ModeloCampo) {
  const min = campo.min ?? 0;
  const max = campo.max ?? 10;
  return Array.from({ length: Math.max(max - min + 1, 0) }, (_, i) => ({
    valor: String(min + i),
    rotulo: String(min + i),
  }));
}

/** Campos do modelo dentro de um `FormLayout`: um `FormField` por campo, em `respostas.<chave>`. */
export function CamposDoModelo({ secoes }: Readonly<{ secoes: readonly ModeloSecao[] }>) {
  const { t } = useTranslation();
  return (
    <div className="col-span-full grid gap-4">
      {secoes.map((secao) => (
        <fieldset key={secao.titulo} className="grid gap-3 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">{secao.titulo}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {secao.campos.map((campo) => (
              <CampoDoModelo
                key={campo.chave}
                campo={campo}
                placeholderEscala={t('modelosProntuario.atendimento.escala')}
              />
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

function CampoDoModelo({
  campo,
  placeholderEscala,
}: Readonly<{ campo: ModeloCampo; placeholderEscala: string }>) {
  const base = {
    name: nomeResposta(campo.chave),
    label: campo.rotulo,
    obrigatorio: campo.obrigatorio,
  };
  switch (campo.tipo) {
    case 'TEXTO':
      return <FormField {...base} tipo="textarea" className="sm:col-span-2" />;
    case 'NUMERO':
      return <FormField {...base} tipo="numero" />;
    case 'DATA':
      return <FormField {...base} tipo="data" />;
    case 'LISTA':
      return (
        <FormField
          {...base}
          tipo="select"
          opcoes={(campo.opcoes ?? []).map((opcao) => ({ valor: opcao, rotulo: opcao }))}
        />
      );
    case 'ESCALA':
      return (
        <FormField
          {...base}
          tipo="select"
          placeholder={placeholderEscala}
          opcoes={opcoesEscala(campo)}
        />
      );
  }
}

/** Leitura das respostas do atendimento, com as seções da versão do modelo que ele usou. */
export function RespostasDoModelo({
  modelo,
  respostas,
}: Readonly<{ modelo: AtendimentoModelo; respostas: ModeloRespostas | null }>) {
  const { t } = useTranslation();
  const exibir = (campo: ModeloCampo): string => {
    const valor = respostas?.[campo.chave] ?? null;
    if (valor === null || valor === '') return t('modelosProntuario.atendimento.semResposta');
    if (campo.tipo === 'DATA') return formatarData(String(valor));
    if (campo.tipo === 'ESCALA') return `${valor}/${campo.max ?? 10}`;
    return String(valor);
  };

  return (
    <section aria-label={t('modelosProntuario.atendimento.respostas')} className="grid gap-3">
      <p className="text-sm font-medium">
        {t('modelosProntuario.atendimento.modeloUsado', {
          nome: modelo.nome,
          versao: modelo.versao,
        })}
      </p>
      {modelo.secoes.map((secao) => (
        <div key={secao.titulo} className="grid gap-2">
          <h4 className="text-sm text-muted-foreground">{secao.titulo}</h4>
          <dl className="grid gap-2 text-sm">
            {secao.campos.map((campo) => (
              <div key={campo.chave}>
                <dt className="text-muted-foreground">{campo.rotulo}</dt>
                <dd className="whitespace-pre-wrap">{exibir(campo)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </section>
  );
}
