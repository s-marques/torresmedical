/** Nome e SKU juntos: nenhuma linha sem o produto identificável (falha C7 do sistema atual). */
export function CelulaProduto({ nome, sku }: Readonly<{ nome: string; sku: string | null }>) {
  return (
    <div className="grid">
      <span className="font-medium">{nome}</span>
      {sku && <span className="text-xs text-muted-foreground">SKU {sku}</span>}
    </div>
  );
}
