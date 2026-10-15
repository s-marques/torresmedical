import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { cn } from '@/lib/utils';

export interface ItemBreadcrumb {
  rotulo: string;
  /** Rota do item. O último item (a página atual) fica sem link. */
  para?: string;
}

export interface PageHeaderProps {
  titulo: string;
  descricao?: ReactNode;
  /** Ações principais à direita: "Novo …", "Excel", "PDF". */
  acoes?: ReactNode;
  /** Padrão dos prints: "Painel > <título>". */
  breadcrumb?: ItemBreadcrumb[];
  className?: string;
}

/** Cabeçalho das telas: breadcrumb, título, descrição e ações principais. */
export function PageHeader({
  titulo,
  descricao,
  acoes,
  breadcrumb = [{ rotulo: 'Painel', para: '/' }, { rotulo: titulo }],
  className,
}: Readonly<PageHeaderProps>) {
  return (
    <header className={cn('flex flex-col gap-3', className)}>
      <Breadcrumb>
        <BreadcrumbList>
          {breadcrumb.map((item, i) => (
            <Fragment key={`${item.rotulo}-${i}`}>
              {i > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {item.para && i < breadcrumb.length - 1 ? (
                  <BreadcrumbLink asChild>
                    <Link to={item.para}>{item.rotulo}</Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>{item.rotulo}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
          {descricao && <p className="text-sm text-muted-foreground">{descricao}</p>}
        </div>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>
    </header>
  );
}
