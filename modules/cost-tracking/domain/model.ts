// =============================================================================
// Domain — Model Entity
// =============================================================================
// The canonical registry entry for a specific AI model version
// (e.g. claude-sonnet-4-20250514, gpt-4o, gemini-2.5-flash).
//
// Design decisions:
//   - slug is the provider's own model identifier string, used to join with
//     usage records. Uniqueness within a provider is enforced at the
//     infrastructure layer.
//   - serviceCategory classifies what the model does (text generation,
//     embedding, image generation, etc.) — this drives which pricing rate
//     keys and usage metrics apply.
//   - No deletedAt: models transition through available → deprecated →
//     retired. Historical usage records continue to reference retired models.
//   - Zero external imports — all values are plain TypeScript primitives.
// =============================================================================

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

/**
 * The type of AI service a model provides.
 * Mirrors the cost_tracking_service_category Postgres enum.
 * Also used by UsageRecord and SyncCursor domain types.
 */
export type ServiceCategory =
  | 'text_generation'
  | 'embedding'
  | 'image_generation'
  | 'audio_speech'
  | 'audio_transcription'
  | 'moderation'
  | 'video_generation'
  | 'code_execution'
  | 'vector_storage'
  | 'web_search'
  | 'reranking'
  | 'other';

/** Availability lifecycle state of a model. */
export type ModelStatus = 'available' | 'deprecated' | 'retired';

export type Model = {
  id: string;
  providerId: string;
  slug: string;
  displayName: string;
  serviceCategory: ServiceCategory;
  status: ModelStatus;
  capabilities?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};
