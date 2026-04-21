// =============================================================================
// ContextPanel — Zone 4: Dynamic insights panel
// =============================================================================
// Pure presentational. Computes insight items from props and renders cards.
// No hooks. Returns null when there are no insights to show.
// =============================================================================

import type {
  ExplorerDimension,
  ExplorerResultRow,
  TimeSeriesPoint,
} from '@/modules/cost-tracking/domain/types';
import { formatCost } from './formatters';

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

type FilterItem = {
  dimension: ExplorerDimension;
  value: string;
  label: string;
};

type UnassignedCredential = {
  credentialId: string;
  credentialLabel: string;
  keyHint: string | null;
  providerDisplayName: string;
  totalCost: number;
  totalRequests: number;
};

type ContextItem = {
  type: 'anomaly' | 'ghost_keys' | 'concentration' | 'model_migration';
  title: string;
  description: string;
  severity: 'warning' | 'info' | 'success';
  details?: React.ReactNode;
};

type ContextPanelProps = {
  anomalyDays: number;
  timeSeries: TimeSeriesPoint[];
  unassignedCredentials: UnassignedCredential[];
  groupBy: ExplorerDimension | undefined;
  filters: FilterItem[];
  rows: ExplorerResultRow[];
  totalCost: string;
};

// =============================================================================
// SECTION 2: INSIGHT COMPUTATION
// =============================================================================

function computeContextItems(props: ContextPanelProps): ContextItem[] {
  const {
    anomalyDays,
    timeSeries,
    unassignedCredentials,
    groupBy,
    filters,
    rows,
    totalCost,
  } = props;

  const items: ContextItem[] = [];
  const totalCostNum = parseFloat(totalCost);

  // --- Anomaly insight ---
  if (anomalyDays > 0) {
    // Find the anomalous dates: aggregate by date, compute mean+stddev, flag outliers
    const byDate = new Map<string, number>();
    for (const p of timeSeries) {
      byDate.set(p.date, (byDate.get(p.date) ?? 0) + parseFloat(p.totalCost || '0'));
    }
    const entries = Array.from(byDate.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const values = entries.map(([, v]) => v);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    const stddev = Math.sqrt(variance);
    const anomalousDates = entries
      .filter(([, v]) => Math.abs(v - mean) > 2 * stddev)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    items.push({
      type: 'anomaly',
      title: 'Spend anomalies detected',
      description: `${anomalyDays} day${anomalyDays !== 1 ? 's' : ''} with unusual spend patterns in this period.`,
      severity: anomalyDays >= 5 ? 'warning' : 'info',
      details:
        anomalousDates.length > 0 ? (
          <div className="mt-2 space-y-1">
            {anomalousDates.map(([date, cost]) => (
              <div key={date} className="flex items-center justify-between">
                <span className="text-xs text-foreground/50">
                  {new Date(date + 'T00:00:00Z').toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    timeZone: 'UTC',
                  })}
                </span>
                <span className="tabular-nums text-xs font-medium text-foreground/70">
                  {formatCost(cost)}
                </span>
              </div>
            ))}
          </div>
        ) : undefined,
    });
  }

  // --- Ghost keys / unassigned credentials ---
  const hasCredentialFilter = filters.some((f) => f.dimension === 'credential');
  if (unassignedCredentials.length > 0 && !hasCredentialFilter) {
    const topKeys = unassignedCredentials
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 3);

    items.push({
      type: 'ghost_keys',
      title: 'Unassigned API keys',
      description: `${unassignedCredentials.length} API key${unassignedCredentials.length !== 1 ? 's' : ''} without attribution rules, generating untracked spend.`,
      severity: 'warning',
      details: (
        <div className="mt-2 space-y-1">
          {topKeys.map((cred) => (
            <div key={cred.credentialId} className="flex items-center justify-between gap-2">
              <span className="truncate text-xs text-foreground/50">
                {cred.credentialLabel}
                {cred.keyHint ? (
                  <span className="ml-1 font-mono text-foreground/35">
                    ({cred.keyHint})
                  </span>
                ) : null}
              </span>
              <span className="flex-shrink-0 tabular-nums text-xs font-medium text-foreground/70">
                {formatCost(cred.totalCost)}
              </span>
            </div>
          ))}
        </div>
      ),
    });
  }

  // --- Concentration insight ---
  const hasGroupFilter =
    filters.some((f) => f.dimension === 'attributionGroup' || f.dimension === 'segment') &&
    groupBy === 'provider';
  const topRow = rows[0];
  if (
    hasGroupFilter &&
    topRow &&
    totalCostNum > 0
  ) {
    const topShare = parseFloat(topRow.totalCost) / totalCostNum;
    if (topShare > 0.8) {
      items.push({
        type: 'concentration',
        title: 'Provider concentration',
        description: `${topRow.groupLabel || topRow.groupKey} accounts for ${(topShare * 100).toFixed(0)}% of spend in this slice. Consider diversifying to reduce risk.`,
        severity: 'info',
      });
    }
  }

  // --- Model migration signal ---
  if (groupBy === 'model' && rows.length >= 2) {
    // Split timeSeries into first half vs second half by date
    const dates = Array.from(new Set(timeSeries.map((p) => p.date))).sort();
    const midpoint = Math.floor(dates.length / 2);
    const firstHalfDates = new Set(dates.slice(0, midpoint));
    const secondHalfDates = new Set(dates.slice(midpoint));

    const spendByModel = new Map<
      string,
      { label: string; first: number; second: number }
    >();

    for (const p of timeSeries) {
      if (!p.groupKey) continue;
      if (!spendByModel.has(p.groupKey)) {
        spendByModel.set(p.groupKey, {
          label: p.groupLabel ?? p.groupKey,
          first: 0,
          second: 0,
        });
      }
      const entry = spendByModel.get(p.groupKey)!;
      const cost = parseFloat(p.totalCost || '0');
      if (firstHalfDates.has(p.date)) entry.first += cost;
      else if (secondHalfDates.has(p.date)) entry.second += cost;
    }

    let decliningModel: { label: string; pct: number } | null = null;
    let risingModel: { label: string; pct: number } | null = null;

    for (const entry of spendByModel.values()) {
      if (entry.first === 0) continue;
      const change = ((entry.second - entry.first) / entry.first) * 100;
      if (change < -20 && (!decliningModel || change < -decliningModel.pct)) {
        decliningModel = { label: entry.label, pct: Math.abs(change) };
      }
      if (change > 20 && (!risingModel || change > risingModel.pct)) {
        risingModel = { label: entry.label, pct: change };
      }
    }

    if (decliningModel && risingModel) {
      items.push({
        type: 'model_migration',
        title: 'Model migration signal',
        description: `${decliningModel.label} spend is down ${decliningModel.pct.toFixed(0)}% while ${risingModel.label} is up ${risingModel.pct.toFixed(0)}% over this period.`,
        severity: 'info',
      });
    }
  }

  return items;
}

// =============================================================================
// SECTION 3: CARD COMPONENT
// =============================================================================

const SEVERITY_CARD_STYLES: Record<ContextItem['severity'], string> = {
  warning: 'border-amber-500/20 bg-amber-500/5',
  info: 'border-blue-500/15 bg-blue-500/[0.04]',
  success: 'border-emerald-500/15 bg-emerald-500/[0.04]',
};

const SEVERITY_ICON_COLOR: Record<ContextItem['severity'], string> = {
  warning: 'text-amber-500',
  info: 'text-blue-500',
  success: 'text-emerald-500',
};

function WarningIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className="h-4 w-4 flex-shrink-0"
      aria-hidden="true"
    >
      <path
        d="M8 1.5L14.5 13H1.5L8 1.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8 6v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11" r="0.75" fill="currentColor" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className="h-4 w-4 flex-shrink-0"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 7v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="5" r="0.75" fill="currentColor" />
    </svg>
  );
}

function ContextCard({ item }: { item: ContextItem }) {
  return (
    <div className={`rounded-xl border p-4 ${SEVERITY_CARD_STYLES[item.severity]}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${SEVERITY_ICON_COLOR[item.severity]}`}>
          {item.severity === 'warning' ? <WarningIcon /> : <InfoIcon />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground/80">{item.title}</p>
          <p className="mt-1 text-xs text-foreground/55">{item.description}</p>
          {item.details && <div className="mt-2">{item.details}</div>}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// SECTION 4: PANEL
// =============================================================================

export function ContextPanel(props: ContextPanelProps) {
  const items = computeContextItems(props);

  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-medium uppercase tracking-wide text-foreground/40">
        Insights
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item, i) => (
          <ContextCard key={`${item.type}-${i}`} item={item} />
        ))}
      </div>
    </div>
  );
}
