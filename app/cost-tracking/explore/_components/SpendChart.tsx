type SpendChartShellProps = {
  children: React.ReactNode;
  isEmpty: boolean;
};

export function SpendChartShell({ children, isEmpty }: SpendChartShellProps) {
  if (isEmpty) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-foreground/10 bg-foreground/5">
        <p className="text-sm text-foreground/40">No time series data</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-foreground/10 bg-foreground/5 p-4">
      <p className="mb-4 text-sm text-foreground/60">Spend over time</p>
      {children}
    </div>
  );
}
