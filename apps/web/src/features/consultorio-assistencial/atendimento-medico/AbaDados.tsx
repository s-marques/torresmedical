import { PACIENTE_SEXO_ROTULOS } from '@torres/shared';
import { ClipboardListIcon, PhoneIcon, UserIcon, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatarData } from '@/lib/formatar';
import { formatarMascara } from '@/lib/forms/mascaras';
import { useDadosPaciente } from './use-atendimento-medico';

function Secao({
  titulo,
  icone: Icone,
  children,
}: Readonly<{ titulo: string; icone: LucideIcon; children: ReactNode }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-primary">
          <Icone aria-hidden className="size-4" />
          {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Linha({ rotulo, valor }: Readonly<{ rotulo: string; valor: string | null }>) {
  return (
    <div className="flex justify-between gap-4 border-b py-1.5 text-sm last:border-b-0">
      <dt className="shrink-0 text-muted-foreground">{rotulo}:</dt>
      <dd className="min-w-0 text-right break-words">{valor || '-'}</dd>
    </div>
  );
}

/** Aba "Dados": informações pessoais, contato e observações do paciente (somente leitura). */
export function AbaDados({ agendamentoId }: Readonly<{ agendamentoId: string }>) {
  const { data: paciente, isPending, isError } = useDadosPaciente(agendamentoId);

  if (isPending) return <Skeleton className="h-40 w-full" aria-label="Carregando" />;
  if (isError || !paciente) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Não foi possível carregar os dados do paciente.
      </p>
    );
  }

  const cidadeUf = [paciente.cidade, paciente.uf].filter(Boolean).join('/');
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Secao titulo="Informações Pessoais" icone={UserIcon}>
          <dl>
            <Linha rotulo="Nome" valor={paciente.nome} />
            <Linha
              rotulo="CPF"
              valor={paciente.documento && formatarMascara('cpf-cnpj', paciente.documento)}
            />
            <Linha rotulo="RG" valor={paciente.rg} />
            <Linha
              rotulo="Nascimento"
              valor={paciente.dataNascimento && formatarData(paciente.dataNascimento)}
            />
            <Linha rotulo="Sexo" valor={paciente.sexo && PACIENTE_SEXO_ROTULOS[paciente.sexo]} />
          </dl>
        </Secao>
        <Secao titulo="Contato" icone={PhoneIcon}>
          <dl>
            <Linha
              rotulo="Telefone"
              valor={paciente.telefone && formatarMascara('telefone', paciente.telefone)}
            />
            <Linha rotulo="Email" valor={paciente.email} />
            <Linha rotulo="Endereço" valor={paciente.endereco} />
            <Linha rotulo="Cidade/UF" valor={cidadeUf} />
          </dl>
        </Secao>
      </div>
      <Secao titulo="Observações" icone={ClipboardListIcon}>
        <p className="text-sm whitespace-pre-wrap text-muted-foreground">
          {paciente.observacoes || '-'}
        </p>
      </Secao>
    </div>
  );
}
