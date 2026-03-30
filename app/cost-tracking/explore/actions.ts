'use server';

import { getFilterValues } from '@/modules/cost-tracking/application/getFilterValuesUseCase';
import type { ExplorerDimension } from '@/modules/cost-tracking/domain/types';
import type { FilterValue } from '@/modules/cost-tracking/application/getFilterValuesUseCase';

export type GetFilterValuesActionResult =
  | { values: FilterValue[] }
  | { error: string };

export async function getFilterValuesAction(
  dimension: ExplorerDimension,
): Promise<GetFilterValuesActionResult> {
  const result = await getFilterValues({ dimension });
  if (!result.success) {
    return { error: result.error.message };
  }
  return { values: result.value };
}
