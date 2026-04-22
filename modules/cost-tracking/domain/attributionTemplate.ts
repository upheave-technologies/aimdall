// =============================================================================
// Domain — Attribution Template Entity
// =============================================================================
// Types and pure functions for the template system, auto-discovery, and
// coverage calculation in the Attribution Engine.
//
// Design decisions:
//   - TemplateInput is a pure value type — no validation side effects.
//   - discoverCredentialClusters groups credentials by label prefix patterns
//     so operators can quickly assign many credentials at once.
//   - discoverUsagePatterns identifies credentials used exclusively with one
//     service category, which often signals a logical boundary.
//   - calculateCoverage is extracted as a pure function for testability even
//     though the formula is trivial — callers never need to reimplement it.
//   - Zero external imports — all values are plain TypeScript primitives plus
//     the shared Result type.
// =============================================================================

import { Result } from '@/packages/shared/lib/result';

// =============================================================================
// SECTION 1: TEMPLATE TYPES
// =============================================================================

/** Classification of the reporting group that a template creates. */
export type TemplateType = 'team' | 'project' | 'environment' | 'individual';

/**
 * Input for applying a template that bulk-creates attribution groups and
 * credential-based rules in one operation.
 */
export type TemplateInput = {
  templateType: TemplateType;
  /** Human-readable group names to create, e.g. ["Engineering", "Data Science"]. */
  groupNames: string[];
  /** Maps each groupName to an array of credential IDs to assign. */
  credentialAssignments: Record<string, string[]>;
};

/** Summary returned after a successful template application. */
export type TemplateResult = {
  groupsCreated: number;
  rulesCreated: number;
  groups: Array<{ slug: string; displayName: string; groupType: string }>;
};

// =============================================================================
// SECTION 2: AUTO-DISCOVERY TYPES
// =============================================================================

/**
 * A single suggestion produced by the auto-discovery analysis.
 * The id is deterministic so callers can deduplicate across multiple runs.
 */
export type DiscoverySuggestion = {
  /** Deterministic hash for deduplication, e.g. "cluster-prod". */
  id: string;
  type: 'credential_cluster' | 'usage_pattern' | 'provider_segment';
  title: string;
  description: string;
  suggestedGroupName: string;
  /** Maps to a GroupType value (team | department | project | environment | …). */
  suggestedGroupType: string;
  credentialIds: string[];
  confidence: 'high' | 'medium' | 'low';
};

/**
 * A credential enriched with provider and usage context for auto-discovery
 * analysis. modelSlugs and serviceCategories are populated from usage data.
 */
export type CredentialInfo = {
  id: string;
  label: string;
  keyHint: string | null;
  providerDisplayName: string;
  providerId: string;
  /** Model slugs this credential has been used with. */
  modelSlugs?: string[];
  /** Service categories this credential has been used with. */
  serviceCategories?: string[];
};

// =============================================================================
// SECTION 3: COVERAGE TYPES
// =============================================================================

/**
 * Attribution coverage report: what share of total spend is attributed to
 * a group, and which credentials remain unattributed.
 */
export type CoverageResult = {
  totalSpend: number;
  attributedSpend: number;
  unattributedSpend: number;
  coveragePercentage: number;
  unattributedBreakdown: Array<{
    credentialId: string;
    credentialLabel: string;
    keyHint: string | null;
    providerDisplayName: string;
    cost: number;
    percentage: number;
  }>;
};

/**
 * Result of previewing a proposed attribution rule against existing usage data.
 */
export type RulePreviewResult = {
  matchedRecords: number;
  matchedCost: number;
  /** Actual dimension values from usage data to help operators spot typos. */
  sampleValues: string[];
};

// =============================================================================
// SECTION 4: PURE FUNCTIONS
// =============================================================================

/**
 * Maps a TemplateType to the corresponding GroupType string.
 *
 * Business rule: 'individual' templates create 'user' groups (matching the
 * GroupType union value) because each group represents one user principal.
 */
export const mapTemplateTypeToGroupType = (templateType: TemplateType): string => {
  switch (templateType) {
    case 'team':
      return 'team';
    case 'project':
      return 'project';
    case 'environment':
      return 'environment';
    case 'individual':
      return 'user';
  }
};

/**
 * Generates a URL-safe slug from a human-readable display name.
 *
 * Mirrors the slug logic in createAttributionGroupUseCase:
 *   lowercase → replace non-alphanumeric runs with hyphens → trim leading/trailing hyphens.
 */
export const generateGroupSlug = (displayName: string): string =>
  displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * Returns the conventional environment names used by the 'environment' template
 * preset. Exposed here so the UI can pre-populate the template form.
 */
export const getDefaultEnvironmentNames = (): string[] => [
  'Development',
  'Staging',
  'Production',
];

// Common environment prefix tokens. Used to assign 'high' confidence.
const ENVIRONMENT_PREFIXES = new Set(['prod', 'production', 'staging', 'stg', 'dev', 'development', 'test', 'qa']);

/**
 * Groups credentials by their label prefix (split on -, _, or space) and
 * returns a discovery suggestion for each prefix cluster with 2+ members.
 *
 * Confidence:
 *   - high   when the prefix matches a well-known environment name
 *   - medium for any other recognisable multi-credential prefix
 */
export const discoverCredentialClusters = (
  credentials: CredentialInfo[],
): DiscoverySuggestion[] => {
  // Build prefix → credential map
  const prefixMap = new Map<string, CredentialInfo[]>();

  for (const cred of credentials) {
    // Split on hyphens, underscores, or spaces and take the first token
    const parts = cred.label.split(/[-_\s]+/);
    const prefix = parts[0].toLowerCase();
    if (!prefix) continue;

    const existing = prefixMap.get(prefix) ?? [];
    existing.push(cred);
    prefixMap.set(prefix, existing);
  }

  const suggestions: DiscoverySuggestion[] = [];

  for (const [prefix, members] of prefixMap.entries()) {
    if (members.length < 2) continue;

    const isEnvironment = ENVIRONMENT_PREFIXES.has(prefix);
    const confidence: DiscoverySuggestion['confidence'] = isEnvironment ? 'high' : 'medium';
    const suggestedGroupType = isEnvironment ? 'environment' : 'team';

    // Capitalise first letter for display
    const displayPrefix = prefix.charAt(0).toUpperCase() + prefix.slice(1);

    suggestions.push({
      id: `cluster-${prefix}`,
      type: 'credential_cluster',
      title: `${displayPrefix} credentials cluster`,
      description: `${members.length} credentials share the "${prefix}" prefix — consider grouping them as one attribution group.`,
      suggestedGroupName: displayPrefix,
      suggestedGroupType,
      credentialIds: members.map((c) => c.id),
      confidence,
    });
  }

  return suggestions;
};

/**
 * Identifies credentials used exclusively with a single service category and
 * suggests creating a group for each such specialised-use pattern.
 *
 * Requires credentials with populated serviceCategories arrays.
 * Confidence is always 'medium' because usage patterns can change over time.
 */
export const discoverUsagePatterns = (
  credentials: CredentialInfo[],
): DiscoverySuggestion[] => {
  // Group credentials by their exclusive service category
  const categoryMap = new Map<string, CredentialInfo[]>();

  for (const cred of credentials) {
    if (!cred.serviceCategories || cred.serviceCategories.length !== 1) continue;
    const category = cred.serviceCategories[0];
    const existing = categoryMap.get(category) ?? [];
    existing.push(cred);
    categoryMap.set(category, existing);
  }

  const suggestions: DiscoverySuggestion[] = [];

  for (const [category, members] of categoryMap.entries()) {
    if (members.length < 2) continue;

    const displayCategory = category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, ' ');

    suggestions.push({
      id: `usage-pattern-${category}`,
      type: 'usage_pattern',
      title: `${displayCategory} usage pattern`,
      description: `${members.length} credentials are used exclusively for ${displayCategory} — consider grouping them by service purpose.`,
      suggestedGroupName: displayCategory,
      suggestedGroupType: 'project',
      credentialIds: members.map((c) => c.id),
      confidence: 'medium',
    });
  }

  return suggestions;
};

/**
 * Validates a TemplateInput before the use case attempts to persist anything.
 *
 * Business rules:
 *   - groupNames must have at least one entry.
 *   - Every groupName must be a non-empty string.
 *   - Group names must be unique (case-insensitive).
 *   - No credential ID may appear in more than one group's assignment list.
 */
export const validateTemplateInput = (input: TemplateInput): Result<void, Error> => {
  if (!input.groupNames || input.groupNames.length === 0) {
    return { success: false, error: new Error('groupNames must have at least one entry') };
  }

  for (const name of input.groupNames) {
    if (!name || name.trim().length === 0) {
      return { success: false, error: new Error('Every group name must be a non-empty string') };
    }
  }

  const lowerNames = input.groupNames.map((n) => n.trim().toLowerCase());
  const uniqueNames = new Set(lowerNames);
  if (uniqueNames.size !== lowerNames.length) {
    return { success: false, error: new Error('Group names must be unique (case-insensitive)') };
  }

  // Collect all assigned credential IDs to detect duplicates across groups
  const seenCredentials = new Set<string>();
  for (const groupName of input.groupNames) {
    const credIds = input.credentialAssignments[groupName] ?? [];
    for (const credId of credIds) {
      if (seenCredentials.has(credId)) {
        return {
          success: false,
          error: new Error(
            `Credential "${credId}" is assigned to more than one group — each credential must be assigned to exactly one group`,
          ),
        };
      }
      seenCredentials.add(credId);
    }
  }

  return { success: true, value: undefined };
};

/**
 * Computes coverage percentage and spend gap from raw totals.
 * Extracted as a pure function so callers never reimplement the formula.
 *
 * @returns percentage in the range [0, 100] and the unattributed spend gap.
 */
export const calculateCoverage = (
  totalSpend: number,
  attributedSpend: number,
): { percentage: number; gap: number } => {
  if (totalSpend <= 0) return { percentage: 0, gap: 0 };
  const percentage = Math.min(100, (attributedSpend / totalSpend) * 100);
  const gap = totalSpend - attributedSpend;
  return { percentage, gap };
};
