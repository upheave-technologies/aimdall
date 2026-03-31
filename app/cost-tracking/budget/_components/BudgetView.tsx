// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BudgetStatusRow = {
  id: string;
  name: string;
  amount: number;
  periodType: string;
  currentSpend: number;
  projectedSpend: number;
  percentUsed: number;
  projectedPercentUsed: number;
  daysElapsed: number;
  daysTotal: number;
  daysRemaining: number;
  status: 'on_track' | 'at_risk' | 'exceeded';
  currency: string;
  alertThresholds: number[];
};

export type BudgetStatusData = {
  budgets: BudgetStatusRow[];
  totalBudgeted: number;
  totalSpent: number;
  overallStatus: 'on_track' | 'at_risk' | 'exceeded';
};

export type ForecastData = {
  periodStart: string;
  periodEnd: string;
  daysElapsed: number;
  daysTotal: number;
  actualSpendToDate: number;
  projectedMonthlySpend: number;
  projectedLow: number;
  projectedHigh: number;
  dailyRunRate: number;
  trend: 'accelerating' | 'decelerating' | 'stable';
  confidence: number;
  byProvider: Array<{
    providerSlug: string;
    providerDisplayName: string;
    actualSpend: number;
    projectedSpend: number;
    percentage: number;
  }>;
} | null;

export type BudgetViewProps = {
  budgets: BudgetStatusData;
  forecast: ForecastData;
  createAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatCurrencyCompact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return formatCurrency(n);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProgressBar({
  percent,
  status,
}: {
  percent: number;
  status: 'on_track' | 'at_risk' | 'exceeded';
}) {
  const colorMap = {
    on_track: 'bg-emerald-500',
    at_risk: 'bg-amber-500',
    exceeded: 'bg-red-500',
  };
  return (
    <div className="h-1.5 w-full rounded-full bg-foreground/10">
      <div
        className={`h-1.5 rounded-full transition-all ${colorMap[status]}`}
        style={{ width: `${Math.min(100, percent)}%` }}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: 'on_track' | 'at_risk' | 'exceeded' }) {
  if (status === 'on_track') {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
        On Track
      </span>
    );
  }
  if (status === 'at_risk') {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
        At Risk
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-300">
      Exceeded
    </span>
  );
}

function BudgetIcon() {
  return (
    <svg
      className="h-6 w-6 text-foreground/30"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Input class — shared for form inputs
// ---------------------------------------------------------------------------

const inputClass =
  'w-full rounded-xl border border-foreground/15 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20';

const selectClass =
  'w-full rounded-xl border border-foreground/15 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20';

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function BudgetView({ budgets, forecast, createAction, deleteAction }: BudgetViewProps) {
  const overallPct =
    budgets.totalBudgeted > 0
      ? (budgets.totalSpent / budgets.totalBudgeted) * 100
      : 0;

  return (
    <main className="mx-auto max-w-5xl px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Budgets & Forecasting</h1>
        <p className="mt-0.5 text-sm text-foreground/50">
          {budgets.totalBudgeted > 0
            ? `${formatCurrencyCompact(budgets.totalSpent)} spent of ${formatCurrencyCompact(budgets.totalBudgeted)} total budgeted (${overallPct.toFixed(1)}%)`
            : 'No budgets configured yet'}
        </p>
      </div>

      {/* Top row: forecast widget + add budget form */}
      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Forecast widget */}
        <div className="rounded-2xl border border-foreground/8 bg-foreground/[0.02] p-6">
          <div className="mb-1 text-sm font-medium text-foreground/60">
            This Month&apos;s Projection
          </div>
          {forecast ? (
            <>
              <div className="font-mono text-3xl font-bold tabular-nums tracking-tight">
                {formatCurrencyCompact(forecast.projectedMonthlySpend)}
              </div>
              <div className="mt-1 text-xs text-foreground/40">
                Range: {formatCurrencyCompact(forecast.projectedLow)} –{' '}
                {formatCurrencyCompact(forecast.projectedHigh)}
              </div>

              {/* Actual vs projection bar */}
              <div className="mt-5 space-y-2">
                <div className="flex justify-between text-xs text-foreground/50">
                  <span>Spent so far</span>
                  <span>{formatCurrencyCompact(forecast.actualSpendToDate)}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-foreground/10">
                  <div
                    className="h-2 rounded-full bg-foreground/40 transition-all"
                    style={{
                      width: `${Math.min(100, (forecast.daysElapsed / forecast.daysTotal) * 100)}%`,
                    }}
                  />
                </div>
                <div className="flex justify-between text-xs text-foreground/40">
                  <span>
                    Day {forecast.daysElapsed} of {forecast.daysTotal}
                  </span>
                  <span>{formatCurrencyCompact(forecast.dailyRunRate)}/day</span>
                </div>
              </div>

              <div className="mt-4 inline-flex items-center gap-1.5 text-xs">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    forecast.trend === 'accelerating'
                      ? 'bg-red-400'
                      : forecast.trend === 'decelerating'
                        ? 'bg-emerald-400'
                        : 'bg-foreground/30'
                  }`}
                />
                <span className="text-foreground/50">
                  Trend:{' '}
                  {forecast.trend === 'accelerating'
                    ? 'Accelerating'
                    : forecast.trend === 'decelerating'
                      ? 'Decelerating'
                      : 'Stable'}
                </span>
              </div>
            </>
          ) : (
            <div className="py-6 text-center">
              <div className="font-mono text-3xl font-bold tabular-nums text-foreground/30">
                N/A
              </div>
              <p className="mt-2 text-xs text-foreground/40">
                Sync usage data to see a forecast
              </p>
            </div>
          )}
        </div>

        {/* Add budget form */}
        <div className="rounded-2xl border border-foreground/8 bg-foreground/[0.02] p-6">
          <h3 className="mb-4 text-sm font-semibold">Add Budget</h3>
          <form action={createAction} className="space-y-3">
            {/* Name */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground/60" htmlFor="budget-name">
                Budget Name
              </label>
              <input
                id="budget-name"
                name="name"
                type="text"
                required
                placeholder="e.g. Monthly AI Spend"
                className={inputClass}
              />
            </div>

            {/* Period type */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground/60" htmlFor="budget-period">
                Period
              </label>
              <select id="budget-period" name="periodType" required className={selectClass}>
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
                <option value="daily">Daily</option>
              </select>
            </div>

            {/* Amount */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground/60" htmlFor="budget-amount">
                Limit (USD)
              </label>
              <input
                id="budget-amount"
                name="amount"
                type="number"
                required
                min="0.01"
                step="0.01"
                placeholder="500.00"
                className={inputClass}
              />
            </div>

            {/* Budget type */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground/60" htmlFor="budget-type">
                Type
              </label>
              <select id="budget-type" name="budgetType" className={selectClass}>
                <option value="soft_alert">Soft Alert (notify only)</option>
                <option value="tracking_only">Tracking Only</option>
              </select>
            </div>

            {/* Alert thresholds */}
            <div className="space-y-1">
              <label
                className="text-xs font-medium text-foreground/60"
                htmlFor="budget-thresholds"
              >
                Alert Thresholds
                <span className="ml-1 text-foreground/40">(comma-separated %)</span>
              </label>
              <input
                id="budget-thresholds"
                name="alertThresholds"
                type="text"
                defaultValue="75,90,100"
                placeholder="75,90,100"
                className={inputClass}
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-80"
            >
              Create Budget
            </button>
          </form>
        </div>
      </div>

      {/* Budget cards */}
      {budgets.budgets.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-foreground/10 p-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground/5">
            <BudgetIcon />
          </div>
          <h3 className="text-base font-semibold">No budgets set</h3>
          <p className="mt-1 text-sm text-foreground/50">
            Create a budget above to track spending limits and get alerts before you overspend.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {budgets.budgets.map((budget) => (
            <div
              key={budget.id}
              className={`rounded-2xl border p-6 ${
                budget.status === 'exceeded'
                  ? 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20'
                  : budget.status === 'at_risk'
                    ? 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20'
                    : 'border-foreground/8 bg-foreground/[0.02]'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold">{budget.name}</h3>
                  <div className="mt-0.5 text-xs capitalize text-foreground/40">
                    {budget.periodType} budget
                  </div>
                </div>
                <StatusBadge status={budget.status} />
              </div>

              <div className="mt-4">
                <ProgressBar percent={budget.percentUsed} status={budget.status} />
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-foreground/60">
                  {formatCurrencyCompact(budget.currentSpend)} spent
                </span>
                <span className="font-medium">{formatCurrencyCompact(budget.amount)} limit</span>
              </div>
              <div className="mt-1 text-xs text-foreground/40">
                {budget.percentUsed.toFixed(1)}% used · projected{' '}
                {formatCurrencyCompact(budget.projectedSpend)} · {budget.daysRemaining}d remaining
              </div>

              {/* Delete */}
              <form action={deleteAction} className="mt-4">
                <input type="hidden" name="id" value={budget.id} />
                <button
                  type="submit"
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:hover:bg-red-950/50"
                >
                  Remove budget
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
