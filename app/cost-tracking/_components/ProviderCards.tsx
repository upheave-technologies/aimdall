type ProviderSummary = {
  provider: string;
  totalCostUsd: string;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
};

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google_vertex: 'Google Vertex AI',
};

export function ProviderCards({ data }: { data: ProviderSummary[] }) {
  const totalCost = data.reduce(
    (sum, row) => sum + parseFloat(row.totalCostUsd || '0'),
    0,
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-foreground/10 bg-foreground/5 p-6">
        <p className="text-sm text-foreground/60">Total Spend</p>
        <p className="text-3xl font-semibold tracking-tight">
          ${totalCost.toFixed(2)}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {data.map((row) => {
          const cost = parseFloat(row.totalCostUsd || '0');
          return (
            <div
              key={row.provider}
              className="rounded-lg border border-foreground/10 p-4"
            >
              <p className="text-sm text-foreground/60">
                {PROVIDER_LABELS[row.provider] ?? row.provider}
              </p>
              <p className="text-2xl font-semibold">${cost.toFixed(2)}</p>
              <div className="mt-2 flex gap-4 text-xs text-foreground/50">
                <span>{row.totalRequests.toLocaleString()} requests</span>
                <span>
                  {(
                    (row.totalInputTokens + row.totalOutputTokens) /
                    1_000_000
                  ).toFixed(2)}
                  M tokens
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
