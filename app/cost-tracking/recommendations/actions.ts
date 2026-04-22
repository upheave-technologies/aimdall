'use server';

import { revalidatePath } from 'next/cache';
import { dismissRecommendation } from '@/modules/cost-tracking/application/dismissRecommendationUseCase';
import { generateRecommendations } from '@/modules/cost-tracking/application/generateRecommendationsUseCase';

// =============================================================================
// Action Result Type
// =============================================================================

type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };

// =============================================================================
// dismissRecommendationAction
// =============================================================================

/**
 * Marks a recommendation as dismissed so it no longer appears in active lists.
 *
 * Presence validation: id must be provided.
 * Existence check and status transition are enforced by the use case.
 */
export async function dismissRecommendationAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const id = formData.get('id') as string | null;

  if (!id || id.trim().length === 0) {
    return { success: false, error: 'Recommendation ID is required' };
  }

  const result = await dismissRecommendation({ id: id.trim() });

  if (!result.success) {
    return { success: false, error: result.error.message };
  }

  revalidatePath('/cost-tracking/recommendations');
  return { success: true, data: { id: result.value.id } };
}

// =============================================================================
// generateRecommendationsAction
// =============================================================================

/**
 * Runs all recommendation analyzers and replaces existing active recommendations
 * with freshly generated ones.
 *
 * No presence validation needed — analysisDays is optional and defaults to 30
 * inside the use case.
 */
export async function generateRecommendationsAction(
  _formData: FormData,
): Promise<ActionResult<{ count: number; generatedAt: string }>> {
  const result = await generateRecommendations({ analysisDays: 30 });

  if (!result.success) {
    return { success: false, error: result.error.message };
  }

  revalidatePath('/cost-tracking/recommendations');
  return {
    success: true,
    data: {
      count: result.value.recommendations.length,
      generatedAt: result.value.generatedAt,
    },
  };
}
