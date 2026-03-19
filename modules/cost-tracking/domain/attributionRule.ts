// =============================================================================
// Domain — AttributionRule Entity
// =============================================================================
// Rules that map usage dimensions to attribution groups. Each rule says:
//   "if dimension X matches value Y, attribute this usage to group Z."
//
// Design decisions:
//   - dimension specifies WHICH usage column to match against.
//   - matchType specifies HOW to compare: exact, prefix, regex, or in_list.
//   - matchValue is the comparison target. For 'in_list' match type this is a
//     comma-separated list of values.
//   - priority resolves conflicts: higher priority wins when multiple rules
//     match the same usage record.
//   - resolveAttribution returns group IDs (not full group objects) so the
//     domain layer remains free of any cross-entity coupling.
//   - Zero external imports — all values are plain TypeScript primitives.
// =============================================================================

// =============================================================================
// SECTION 1: TYPES
// =============================================================================

/** Which usage dimension a rule matches against. */
export type AttributionDimension =
  | 'credential'
  | 'segment'
  | 'provider'
  | 'model'
  | 'model_slug'
  | 'service_category'
  | 'service_tier'
  | 'region'
  | 'metadata_key';

/** How the rule value is compared to the dimension value. */
export type MatchType = 'exact' | 'prefix' | 'regex' | 'in_list';

export type AttributionRule = {
  id: string;
  groupId: string;
  dimension: AttributionDimension;
  matchType: MatchType;
  matchValue: string;
  priority: number;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
};

// =============================================================================
// SECTION 2: FUNCTIONS
// =============================================================================

/**
 * Evaluates whether a dimension value satisfies a single attribution rule.
 *
 * Business rules by matchType:
 *   exact   — strict equality (case-sensitive)
 *   prefix  — dimensionValue starts with matchValue
 *   regex   — matchValue is treated as a RegExp; test returns true on match
 *   in_list — matchValue is a comma-separated list; value must be in the list
 *
 * Returns false for invalid regex patterns rather than throwing, so a
 * misconfigured rule does not break the entire attribution pass.
 */
export const matchesRule = (rule: AttributionRule, dimensionValue: string): boolean => {
  switch (rule.matchType) {
    case 'exact':
      return dimensionValue === rule.matchValue;

    case 'prefix':
      return dimensionValue.startsWith(rule.matchValue);

    case 'regex': {
      try {
        return new RegExp(rule.matchValue).test(dimensionValue);
      } catch {
        return false;
      }
    }

    case 'in_list': {
      const list = rule.matchValue.split(',').map((s) => s.trim());
      return list.includes(dimensionValue);
    }

    default:
      return false;
  }
};

/**
 * Evaluates all active attribution rules against a map of dimension values
 * and returns the group IDs whose rules matched, sorted by descending priority.
 *
 * @param rules       - Active (non-deleted) attribution rules to evaluate.
 * @param dimensions  - Map of dimension → value for the usage record being attributed.
 * @returns Unique group IDs, sorted by the maximum matched rule priority (highest first).
 *
 * Business rules:
 *   - Each rule is tested independently against its own dimension key.
 *   - A group is included in the result if ANY of its rules match.
 *   - The sort order reflects the highest-priority rule that triggered each group.
 *   - Soft-deleted rules must be filtered before calling this function;
 *     no deletedAt check is performed here.
 */
export const resolveAttribution = (
  rules: AttributionRule[],
  dimensions: Partial<Record<AttributionDimension, string | undefined>>,
): string[] => {
  // Map: groupId → highest matching priority seen so far
  const matched = new Map<string, number>();

  for (const rule of rules) {
    const dimensionValue = dimensions[rule.dimension];
    if (dimensionValue === undefined || dimensionValue === null) continue;

    if (matchesRule(rule, dimensionValue)) {
      const existing = matched.get(rule.groupId) ?? -Infinity;
      if (rule.priority > existing) {
        matched.set(rule.groupId, rule.priority);
      }
    }
  }

  // Sort by descending priority
  return Array.from(matched.entries())
    .sort(([, pa], [, pb]) => pb - pa)
    .map(([groupId]) => groupId);
};
