// =============================================================================
// PROPS
// =============================================================================

type PillInputViewProps = {
  pills: string[];
  inputValue: string;
  placeholder?: string;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onRemovePill: (index: number) => void;
};

// =============================================================================
// COMPONENT
// =============================================================================

export function PillInputView({
  pills,
  inputValue,
  placeholder,
  onInputChange,
  onKeyDown,
  onRemovePill,
}: PillInputViewProps) {
  return (
    <div className="flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-lg border border-foreground/20 bg-background px-2.5 py-2 focus-within:ring-2 focus-within:ring-foreground/20">
      {pills.map((pill, i) => (
        <span
          key={pill}
          className="flex items-center gap-1 rounded-full bg-foreground/10 px-3 py-1 text-sm"
        >
          {pill}
          <button
            type="button"
            onClick={() => onRemovePill(i)}
            className="ml-0.5 rounded-full p-0.5 text-foreground/40 hover:bg-foreground/10 hover:text-foreground/70"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </span>
      ))}
      <input
        type="text"
        value={inputValue}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={pills.length === 0 ? placeholder : ''}
        className="min-w-[120px] flex-1 bg-transparent text-sm outline-none placeholder:text-foreground/30"
      />
    </div>
  );
}
