type PaginationProps = {
  currentPage: number;
  pageSize: number;
  totalRows: number;
  onGoToPage: (page: number) => void;
};

export function Pagination({ currentPage, pageSize, totalRows, onGoToPage }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const firstRow = Math.min((currentPage - 1) * pageSize + 1, totalRows);
  const lastRow = Math.min(currentPage * pageSize, totalRows);

  if (totalRows === 0) return null;

  return (
    <div className="flex items-center justify-between text-sm text-foreground/60">
      <span>
        Showing {firstRow.toLocaleString()}–{lastRow.toLocaleString()} of {totalRows.toLocaleString()} results
      </span>

      <div className="flex items-center gap-2">
        <span>Page {currentPage} of {totalPages}</span>

        <button
          onClick={() => onGoToPage(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label="Previous page"
          className="inline-flex h-8 w-8 items-center justify-center rounded border border-foreground/20 text-foreground/60 transition-colors hover:border-foreground/40 hover:text-foreground/80 disabled:pointer-events-none disabled:opacity-30"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M8 2L4 6L8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <button
          onClick={() => onGoToPage(currentPage + 1)}
          disabled={currentPage >= totalPages}
          aria-label="Next page"
          className="inline-flex h-8 w-8 items-center justify-center rounded border border-foreground/20 text-foreground/60 transition-colors hover:border-foreground/40 hover:text-foreground/80 disabled:pointer-events-none disabled:opacity-30"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
