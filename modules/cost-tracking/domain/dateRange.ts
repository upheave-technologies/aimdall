/**
 * Resolves optional start/end dates into a concrete date range.
 *
 * End-of-day adjustment: when an endDate falls at exactly midnight UTC
 * (as happens when parsing a date-only string like '2026-03-27'), it is
 * adjusted to 23:59:59.999 UTC so the entire calendar day is included.
 * This prevents the common bug where hourly bucket_start timestamps
 * within that day are excluded by the <= comparison.
 *
 * Default range: last 30 calendar days when no dates are provided.
 */
export function resolveDateRange(
  startDate?: Date,
  endDate?: Date,
): { startDate: Date; endDate: Date } {
  const resolvedEnd = new Date(endDate ?? new Date());
  // Adjust end-of-day: if the time is exactly midnight, the caller likely
  // passed a date-only string — include the full day.
  if (
    resolvedEnd.getUTCHours() === 0 &&
    resolvedEnd.getUTCMinutes() === 0 &&
    resolvedEnd.getUTCSeconds() === 0 &&
    resolvedEnd.getUTCMilliseconds() === 0
  ) {
    resolvedEnd.setUTCHours(23, 59, 59, 999);
  }

  const resolvedStart =
    startDate ?? new Date(resolvedEnd.getTime() - 30 * 24 * 60 * 60 * 1_000);

  return { startDate: resolvedStart, endDate: resolvedEnd };
}
