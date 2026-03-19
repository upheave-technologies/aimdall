// =============================================================================
// Cost Tracking Module — Structured Logger
// =============================================================================
// Lightweight structured logging for the cost-tracking sync pipeline.
// Outputs JSON to stdout/stderr for easy parsing by log aggregators
// (CloudWatch, Datadog, Grafana Loki, etc.).
//
// Each log entry includes:
//   - timestamp (ISO 8601)
//   - level (info, warn, error)
//   - module (always "cost-tracking")
//   - operation (what is happening)
//   - arbitrary context fields (provider, duration, recordCount, etc.)
// =============================================================================

type LogLevel = 'info' | 'warn' | 'error';

type LogEntry = {
  timestamp: string;
  level: LogLevel;
  module: string;
  operation: string;
  [key: string]: unknown;
};

function emit(level: LogLevel, operation: string, context: Record<string, unknown> = {}) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    module: 'cost-tracking',
    operation,
    ...context,
  };

  const output = JSON.stringify(entry);

  if (level === 'error') {
    console.error(output);
  } else if (level === 'warn') {
    console.warn(output);
  } else {
    console.log(output);
  }
}

export const logger = {
  info: (operation: string, context?: Record<string, unknown>) =>
    emit('info', operation, context),
  warn: (operation: string, context?: Record<string, unknown>) =>
    emit('warn', operation, context),
  error: (operation: string, context?: Record<string, unknown>) =>
    emit('error', operation, context),
};
