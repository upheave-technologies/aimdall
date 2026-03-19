// =============================================================================
// Application — Cost Tracking Error
// =============================================================================
// Custom error class for Cost Tracking module operations.
// Includes a structured error code for programmatic handling by consumers.
//
// Error codes:
//   SYNC_FAILED       — One or more providers failed during usage sync
//   VALIDATION_ERROR  — Input validation failed
//   SERVICE_ERROR     — Unexpected infrastructure or external service failure
// =============================================================================

export class CostTrackingError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'CostTrackingError';
  }
}
