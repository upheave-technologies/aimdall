import { ExploreLink } from './ExploreLink';

type DailySpendRow = {
  date: string;
  providerSlug: string;
  providerDisplayName: string;
  totalCostUsd: string;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
};

const PROVIDER_COLORS: Record<string, string> = {
  openai: 'bg-green-500',
  anthropic: 'bg-orange-500',
  google_vertex: 'bg-blue-500',
};

function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function DailySpendTable({ data }: { data: DailySpendRow[] }) {
  // Group by date, summing across providers for totals
  const byDate = new Map<
    string,
    { total: number; providers: Map<string, number>; requests: number; tokens: number }
  >();

  let maxDailyCost = 0;

  for (const row of data) {
    const cost = parseFloat(row.totalCostUsd || '0');
    const existing = byDate.get(row.date) ?? {
      total: 0,
      providers: new Map(),
      requests: 0,
      tokens: 0,
    };

    existing.total += cost;
    existing.providers.set(
      row.providerSlug,
      (existing.providers.get(row.providerSlug) ?? 0) + cost,
    );
    existing.requests += row.totalRequests;
    existing.tokens += row.totalInputTokens + row.totalOutputTokens;
    byDate.set(row.date, existing);
  }

  for (const day of byDate.values()) {
    if (day.total > maxDailyCost) maxDailyCost = day.total;
  }

  // Sort dates descending (most recent first)
  const dates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));
  const allProviderSlugs = [...new Set(data.map((r) => r.providerSlug))].sort();
  const slugToDisplayName = new Map(
    data.map((r) => [r.providerSlug, r.providerDisplayName]),
  );

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Daily Spend</h2>
      <div className="overflow-x-auto rounded-lg border border-foreground/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-foreground/10 bg-foreground/5 text-left">
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Breakdown</th>
              <th className="px-4 py-2 text-right font-medium">Requests</th>
              <th className="px-4 py-2 text-right font-medium">Tokens</th>
              <th className="px-4 py-2 text-right font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {dates.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-foreground/40">
                  No daily data available
                </td>
              </tr>
            )}
            {dates.map((date) => {
              const day = byDate.get(date)!;
              const barWidth = maxDailyCost > 0 ? (day.total / maxDailyCost) * 100 : 0;

              return (
                <tr key={date} className="border-b border-foreground/5 last:border-0">
                  <td className="px-4 py-2 font-mono text-xs">
                    <ExploreLink dimension="from" value={date} params={{ to: date }}>
                      {date}
                    </ExploreLink>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex h-4 w-full overflow-hidden rounded-sm">
                      {allProviderSlugs.map((slug) => {
                        const providerCost = day.providers.get(slug) ?? 0;
                        if (providerCost === 0) return null;
                        const segmentWidth = (providerCost / day.total) * barWidth;
                        return (
                          <div
                            key={slug}
                            className={`${PROVIDER_COLORS[slug] ?? 'bg-gray-500'} h-full`}
                            style={{ width: `${segmentWidth}%` }}
                            title={`${slugToDisplayName.get(slug) ?? slug}: $${providerCost.toFixed(2)}`}
                          />
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {day.requests.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {formatTokens(day.tokens)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono font-medium">
                    ${day.total.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {allProviderSlugs.length > 1 && (
          <div className="flex gap-4 border-t border-foreground/5 px-4 py-2">
            {allProviderSlugs.map((slug) => (
              <div key={slug} className="flex items-center gap-1.5 text-xs text-foreground/60">
                <div className={`h-2.5 w-2.5 rounded-sm ${PROVIDER_COLORS[slug] ?? 'bg-gray-500'}`} />
                {slugToDisplayName.get(slug) ?? slug}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
