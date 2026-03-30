type EmptyStateProps = {
  hasFilters: boolean;
};

export function EmptyState({ hasFilters }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-foreground/10 bg-foreground/5 px-6 py-16 text-center">
      <p className="text-base font-medium text-foreground/70">
        No usage data matches your current selection.
      </p>
      <p className="mt-1 text-sm text-foreground/50">
        {hasFilters
          ? 'Try removing a filter or broadening the date range.'
          : 'Try selecting a wider date range.'}
      </p>
    </div>
  );
}
