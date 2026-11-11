import { CreditCardIcon, InfoIcon, PackageIcon } from 'lucide-react';

/**
 * Aba "Plano e Faturas": só exibição (confirmado com o dev). Não há modelo de plano/assinatura
 * ainda; fica para uma issue futura dedicada a essa funcionalidade.
 */
export function AbaPlanoFaturas() {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 rounded-lg border p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <CreditCardIcon aria-hidden className="size-5" />
          Meu Plano
        </h2>
        <p className="text-sm text-muted-foreground">
          Detalhes do seu plano atual e módulos disponíveis
        </p>
        <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-4 text-sm">
          <PackageIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p>
            Todos os módulos contratados estão disponíveis para o seu usuário, conforme as
            permissões do seu perfil.
          </p>
        </div>
      </div>
      <div className="grid gap-4 rounded-lg border p-6">
        <h2 className="text-lg font-semibold">Minhas Faturas</h2>
        <p className="text-sm text-muted-foreground">Histórico de cobranças e faturas</p>
        <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-4 text-sm">
          <InfoIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p>
            Para consultar faturas, segunda via de boleto ou alterar forma de pagamento, entre em
            contato com o administrador do sistema.
          </p>
        </div>
      </div>
    </div>
  );
}
