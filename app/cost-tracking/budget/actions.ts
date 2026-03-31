'use server';

import { revalidatePath } from 'next/cache';
import { createBudget } from '@/modules/cost-tracking/application/createBudgetUseCase';
import { deleteBudget } from '@/modules/cost-tracking/application/deleteBudgetUseCase';
import type { BudgetPeriodType, BudgetType } from '@/modules/cost-tracking/domain/types';

export async function createBudgetAction(formData: FormData): Promise<void> {
  const name = formData.get('name') as string;
  const periodType = formData.get('periodType') as string;
  const amount = formData.get('amount') as string;
  const budgetType = (formData.get('budgetType') as string) || 'soft_alert';

  const thresholdsRaw = formData.get('alertThresholds') as string;
  const alertThresholds = thresholdsRaw
    ? thresholdsRaw.split(',').map(Number).filter((n) => !isNaN(n))
    : [75, 90, 100];

  await createBudget({
    name,
    periodType: periodType as BudgetPeriodType,
    amount,
    budgetType: budgetType as BudgetType,
    alertThresholds,
  });

  revalidatePath('/cost-tracking/budget');
  revalidatePath('/cost-tracking');
}

export async function deleteBudgetAction(formData: FormData): Promise<void> {
  const id = formData.get('id') as string;
  await deleteBudget({ id });
  revalidatePath('/cost-tracking/budget');
  revalidatePath('/cost-tracking');
}
