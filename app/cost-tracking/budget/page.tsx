import { getBudgetStatus } from '@/modules/cost-tracking/application/getBudgetStatusUseCase';
import { getSpendForecast } from '@/modules/cost-tracking/application/getSpendForecastUseCase';
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

export default async function BudgetPage() {
  const [budgetsResult, forecastResult] = await Promise.all([
    getBudgetStatus({}),
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
