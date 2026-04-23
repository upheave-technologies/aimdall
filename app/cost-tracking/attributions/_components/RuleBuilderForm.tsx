import type { CredentialWithProvider } from '@/modules/cost-tracking/domain/types';
import type { RulePreview } from './_types';
import { formatCost } from './_types';

const DIMENSIONS = [
  { value: 'credential', label: 'Credential' },
  { value: 'segment', label: 'Segment' },
  { value: 'provider', label: 'Provider' },
  { value: 'model', label: 'Model' },
  { value: 'model_slug', label: 'Model Slug' },
  { value: 'service_category', label: 'Service Category' },
  { value: 'service_tier', label: 'Service Tier' },
  { value: 'region', label: 'Region' },
] as const;

const MATCH_TYPES = [
  { value: 'exact', label: 'Exact' },
  { value: 'prefix', label: 'Prefix' },
  { value: 'regex', label: 'Regex' },
  { value: 'in_list', label: 'In List' },
] as const;

// =============================================================================
// PROPS
// =============================================================================

type RuleBuilderFormProps = {
  credentials: CredentialWithProvider[];
  dimension: string;
  matchType: string;
  matchValue: string;
  priority: number;
  preview: RulePreview | null;
  previewLoading: boolean;
  onDimensionChange: (value: string) => void;
  onMatchTypeChange: (value: string) => void;
  onMatchValueChange: (value: string) => void;
  onPriorityChange: (value: number) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

// =============================================================================
// COMPONENT
// =============================================================================

export function RuleBuilderForm({
  credentials,
  dimension,
  matchType,
  matchValue,
  priority,
  preview,
  previewLoading,
  onDimensionChange,
  onMatchTypeChange,
  onMatchValueChange,
  onPriorityChange,
  onSubmit,
  onCancel,
}: RuleBuilderFormProps) {
  return (
    <div className="space-y-3 rounded-lg border border-foreground/10 bg-foreground/[0.03] p-4">
      <h4 className="text-sm font-semibold">New Rule</h4>

      {/* Dimension + Match Type row */}
      <div className="flex gap-2">
        <div className="flex-1 space-y-1">
          <label className="text-xs font-medium text-foreground/60">Dimension</label>
          <select
            value={dimension}
            onChange={(e) => onDimensionChange(e.target.value)}
            className="w-full rounded border border-foreground/15 bg-background px-2.5 py-1.5 text-sm"
          >
            {DIMENSIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 space-y-1">
          <label className="text-xs font-medium text-foreground/60">Match Type</label>
          <select
            value={matchType}
            onChange={(e) => onMatchTypeChange(e.target.value)}
            className="w-full rounded border border-foreground/15 bg-background px-2.5 py-1.5 text-sm"
          >
            {MATCH_TYPES.map((mt) => (
              <option key={mt.value} value={mt.value}>
                {mt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Match Value */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground/60">Match Value</label>
        <input
          type="text"
          value={matchValue}
          onChange={(e) => onMatchValueChange(e.target.value)}
          placeholder="Value to match against"
          className="w-full rounded border border-foreground/15 bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
        />
      </div>

      {/* Credential picker (when dimension is credential) */}
      {dimension === 'credential' && credentials.length > 0 && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground/60">Or pick a credential</label>
          <select
            value={matchValue}
            onChange={(e) => onMatchValueChange(e.target.value)}
            className="w-full rounded border border-foreground/15 bg-background px-2.5 py-1.5 text-sm"
          >
            <option value="">Select credential…</option>
            {credentials.map((c) => (
              <option key={c.id} value={c.id}>
                {c.providerDisplayName} — {c.label}
                {c.keyHint ? ` (**** ${c.keyHint})` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Priority */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground/60">Priority</label>
        <input
          type="number"
          value={priority}
          onChange={(e) => onPriorityChange(parseInt(e.target.value, 10) || 0)}
          className="w-24 rounded border border-foreground/15 bg-background px-2.5 py-1.5 text-sm"
        />
      </div>

      {/* Live preview */}
      {previewLoading && (
        <div className="h-14 animate-pulse rounded bg-foreground/5" />
      )}
      {!previewLoading && preview !== null && (
        <div
          className={`rounded-lg p-3 text-sm ${
            preview.matchedRecords === 0
              ? 'bg-red-500/10 text-red-600'
              : 'bg-foreground/5 text-foreground'
          }`}
        >
          {preview.matchedRecords > 0 ? (
            <>
              <p>
                This rule matches <strong>{preview.matchedRecords}</strong> records ({formatCost(preview.matchedCost)})
              </p>
              {preview.sampleValues.length > 0 && (
                <p className="mt-1 text-xs text-foreground/50">
                  Sample values: {preview.sampleValues.join(', ')}
                </p>
              )}
            </>
          ) : (
            <p>This rule matches nothing. Check the value.</p>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-3 py-1.5 text-xs font-medium text-foreground/60 hover:bg-foreground/5"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSubmit}
          className="rounded bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
        >
          Add Rule
        </button>
      </div>
    </div>
  );
}
