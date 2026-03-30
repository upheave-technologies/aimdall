type ExplorerHeadlineProps = {
  totalCost: string;
  totalRequestCount: number;
  currency: string;
};

function formatCost(raw: string): string {
  const num = parseFloat(raw || '0');
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export function ExplorerHeadline({ totalCost, totalRequestCount, currency: _currency }: ExplorerHeadlineProps) {
  return (
    <div className="rounded-lg border border-foreground/10 bg-foreground/5 p-6">
      <p className="text-sm text-foreground/60">Total Spend</p>
      <p className="text-3xl font-semibold tracking-tight">{formatCost(totalCost)}</p>
      <p className="mt-1 text-sm text-foreground/50">
        {totalRequestCount.toLocaleString()} requests
      </p>
    </div>
  );
}
