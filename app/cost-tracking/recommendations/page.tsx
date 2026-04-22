import { listRecommendations } from '@/modules/cost-tracking/application/listRecommendationsUseCase';
import type { Recommendation } from '@/modules/cost-tracking/domain/types';
import {
  dismissRecommendationAction,
  generateRecommendationsAction,
} from './actions';
import { RecommendationsView } from './_components/RecommendationsView';
import { RecommendationsErrorView } from './_components/RecommendationsErrorView';

// =============================================================================
// VOID WRAPPERS
// =============================================================================
// Next.js requires form action props to be `(formData: FormData) => void |
// Promise<void>`. The exported actions return ActionResult so they can be
// called programmatically. These thin wrappers satisfy the form prop type
// constraint and are used exclusively in JSX via component props.

async function dismissFormAction(formData: FormData): Promise<void> {
  'use server';
  await dismissRecommendationAction(formData);
}

async function generateFormAction(formData: FormData): Promise<void> {
  'use server';
  await generateRecommendationsAction(formData);
}

// =============================================================================
// PAGE
// =============================================================================

export default async function RecommendationsPage() {
  // ---------------------------------------------------------------------------
  // 1. DATA FETCHING
  // ---------------------------------------------------------------------------
  const result = await listRecommendations({});

  // ---------------------------------------------------------------------------
  // 2. ERROR STATE
  // ---------------------------------------------------------------------------
  if (!result.success) {
    return <RecommendationsErrorView message={result.error.message} />;
  }

  const recommendations: Recommendation[] = result.value;

  // ---------------------------------------------------------------------------
  // 3. DELEGATE RENDERING
  // ---------------------------------------------------------------------------
  return (
    <RecommendationsView
      recommendations={recommendations}
      dismissAction={dismissFormAction}
      generateAction={generateFormAction}
    />
  );
}
