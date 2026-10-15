import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export interface AuthLayoutProps {
  titulo: string;
  descricao: string;
  children: ReactNode;
}

/** Card centralizado das telas fora do layout: login, esqueci e redefinir a senha. */
export function AuthLayout({ titulo, descricao, children }: Readonly<AuthLayoutProps>) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <span className="mx-auto mb-2 flex size-12 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground">
            TM
          </span>
          <CardTitle className="text-xl">{titulo}</CardTitle>
          <CardDescription>{descricao}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  );
}
