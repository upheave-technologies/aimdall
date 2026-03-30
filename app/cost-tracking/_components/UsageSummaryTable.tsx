import { ExploreLink } from './ExploreLink';

type SummaryRow = {
  provider: string;
  model: string;
  credential: string;
  accountSegment?: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedInputTokens: number;
  totalCacheCreationTokens: number;
  totalRequests: number;
  totalCostUsd: string;
  providerId?: string;
  modelSlug?: string;
  credentialId?: string;
};

function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function UsageSummaryTable({
  title,
  data,
  groupBy,
}: {
  title: string;
  data: SummaryRow[];
  groupBy: 'model' | 'credential';
}) {
  const sorted = [...data].sort(
    (a, b) => parseFloat(b.totalCostUsd) - parseFloat(a.totalCostUsd),
  );

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      <div className="overflow-x-auto rounded-lg border border-foreground/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-foreground/10 bg-foreground/5 text-left">
              <th className="px-4 py-2 font-medium">Provider</th>
              <th className="px-4 py-2 font-medium">
                {groupBy === 'model' ? 'Model' : 'Credential'}
              </th>
              {groupBy === 'credential' && (
                <th className="px-4 py-2 font-medium">Account</th>
              )}
              <th className="px-4 py-2 text-right font-medium">Input</th>
              <th className="px-4 py-2 text-right font-medium">Output</th>
              <th className="px-4 py-2 text-right font-medium">Cached</th>
              <th className="px-4 py-2 text-right font-medium">Requests</th>
              <th className="px-4 py-2 text-right font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td
                  colSpan={groupBy === 'credential' ? 8 : 7}
                  className="px-4 py-8 text-center text-foreground/40"
                >
                  No usage data available
                </td>
              </tr>
            )}
            {sorted.map((row, i) => {
              const cost = parseFloat(row.totalCostUsd);
              const hasTokensButNoCost =
                cost === 0 &&
                (row.totalInputTokens > 0 || row.totalOutputTokens > 0);

              return (
                <tr
                  key={i}
                  className="border-b border-foreground/5 last:border-0"
                >
                  <td className="px-4 py-2">
                    {row.providerId ? (
                      <ExploreLink dimension="provider" value={row.providerId} label={row.provider}>
                        {row.provider}
                      </ExploreLink>
                    ) : (
                      row.provider
                    )}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {groupBy === 'model' ? (
                      row.modelSlug ? (
                        <ExploreLink dimension="model" value={row.modelSlug} label={row.model}>
                          {row.model}
                        </ExploreLink>
                      ) : (
                        row.model
                      )
                    ) : row.credentialId ? (
                      <ExploreLink dimension="credential" value={row.credentialId} label={row.credential}>
                        {row.credential}
                      </ExploreLink>
                    ) : (
                      row.credential
                    )}
                  </td>
                  {groupBy === 'credential' && (
                    <td className="px-4 py-2 text-foreground/60">
                      {row.accountSegment || '—'}
                    </td>
                  )}
                  <td className="px-4 py-2 text-right font-mono">
                    {formatTokens(row.totalInputTokens)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {formatTokens(row.totalOutputTokens)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {formatTokens(row.totalCachedInputTokens)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {row.totalRequests.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    <span className={hasTokensButNoCost ? 'text-yellow-500' : ''}>
                      ${cost.toFixed(2)}
                      {hasTokensButNoCost && ' *'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
