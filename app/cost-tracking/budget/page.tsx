import { getBudgetStatus } from '@/modules/cost-tracking/application/getBudgetStatusUseCase';
import { getSpendForecast } from '@/modules/cost-tracking/application/getSpendForecastUseCase';
import { resolveSelectedPeriod } from '@/modules/cost-tracking/domain/types';
import { createBudgetAction, deleteBudgetAction } from './actions';
import { BudgetView } from './_components/BudgetView';
import type { BudgetStatusData, ForecastData } from './_components/BudgetView';

// =============================================================================
// VOID WRAPPERS
// =============================================================================
// Next.js requires form action props to be `(formData: FormData) => void |
// Promise<void>`. These thin wrappers satisfy the form prop type constraint.

async function createAction(formData: FormData): Promise<void> {
  'use server';
  await createBudgetAction(formData);
}

async function deleteAction(formData: FormData): Promise<void> {
  'use server';
  await deleteBudgetAction(formData);
}

// =============================================================================
// PAGE
// =============================================================================

type SearchParams = Promise<{
  period?: string;
  from?: string;
  to?: string;
}>;

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // ---------------------------------------------------------------------------
  // 1. RESOLVE PERIOD — unified URL contract: `period` + optional `from`/`to`
  // ---------------------------------------------------------------------------
  const params = await searchParams;
  const { startDate, endDate } = resolveSelectedPeriod({
    period: params.period,
    from: params.from,
    to: params.to,
  });

  // ---------------------------------------------------------------------------
  // 2. DATA FETCHING
  // getSpendForecast opts out of the global period per RFC Section 3.7 —
  // forecast is always the current calendar month by definition.
  // ---------------------------------------------------------------------------
  const [budgetsResult, forecastResult] = await Promise.all([
    getBudgetStatus({ startDate, endDate }),
    getSpendForecast({}),
  ]);

  if (!budgetsResult.success) {
    throw new Error(budgetsResult.error.message);
  }

  const budgets: BudgetStatusData = budgetsResult.value;
  const forecast: ForecastData = forecastResult.success ? forecastResult.value : null;

  return (
    <BudgetView
      budgets={budgets}
      forecast={forecast}
      createAction={createAction}
      deleteAction={deleteAction}
    />
  );
}
