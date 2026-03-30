import { DIMENSION_LABELS } from './constants';

type GroupBySelectorProps = {
  current?: string;
  onSelect: (dimension: string) => void;
  onNone: () => void;
};

const DIMENSIONS = Object.keys(DIMENSION_LABELS) as Array<keyof typeof DIMENSION_LABELS>;

export function GroupBySelector({ current, onSelect, onNone }: GroupBySelectorProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-foreground/40 select-none mr-1">Group by</span>

      <button
        onClick={onNone}
        className={
          !current
            ? 'rounded-full px-3 py-1 text-sm font-medium bg-foreground text-background transition-opacity hover:opacity-90'
            : 'rounded-full px-3 py-1 text-sm font-medium border border-foreground/20 text-foreground/60 transition-colors hover:border-foreground/40 hover:text-foreground/80'
        }
      >
        None
      </button>

      {DIMENSIONS.map((dimension) => {
        const isActive = current === dimension;
        return (
          <button
            key={dimension}
            onClick={() => onSelect(dimension)}
            className={
              isActive
                ? 'rounded-full px-3 py-1 text-sm font-medium bg-foreground text-background transition-opacity hover:opacity-90'
                : 'rounded-full px-3 py-1 text-sm font-medium border border-foreground/20 text-foreground/60 transition-colors hover:border-foreground/40 hover:text-foreground/80'
            }
          >
            {DIMENSION_LABELS[dimension]}
          </button>
        );
      })}
    </div>
  );
}
