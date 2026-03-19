import { describe, it, expect } from 'vitest';
import { matchesRule, resolveAttribution, type AttributionRule } from '../domain/attributionRule';

// =============================================================================
// matchesRule
// =============================================================================

describe('matchesRule', () => {
  const now = new Date();
  const baseRule: AttributionRule = {
    id: 'r1',
    groupId: 'g1',
    dimension: 'credential',
    matchType: 'exact',
    matchValue: 'cred_abc123',
    priority: 0,
    createdAt: now,
    updatedAt: now,
  };

  describe('exact match', () => {
    it('matches equal strings', () => {
      expect(matchesRule(baseRule, 'cred_abc123')).toBe(true);
    });

    it('rejects non-equal strings', () => {
      expect(matchesRule(baseRule, 'cred_abc124')).toBe(false);
    });

    it('is case-sensitive', () => {
      expect(matchesRule(baseRule, 'CRED_ABC123')).toBe(false);
    });
  });

  describe('prefix match', () => {
    const prefixRule: AttributionRule = { ...baseRule, matchType: 'prefix', matchValue: 'cred_abc' };

    it('matches values starting with prefix', () => {
      expect(matchesRule(prefixRule, 'cred_abc123')).toBe(true);
      expect(matchesRule(prefixRule, 'cred_abc')).toBe(true);
    });

    it('rejects values not starting with prefix', () => {
      expect(matchesRule(prefixRule, 'cred_xyz')).toBe(false);
    });
  });

  describe('regex match', () => {
    const regexRule: AttributionRule = { ...baseRule, matchType: 'regex', matchValue: '^cred_[a-z]+\\d+$' };

    it('matches values against the regex pattern', () => {
      expect(matchesRule(regexRule, 'cred_abc123')).toBe(true);
    });

    it('rejects values that do not match', () => {
      expect(matchesRule(regexRule, 'cred_123abc')).toBe(false);
    });

    it('returns false for invalid regex patterns (no throw)', () => {
      const badRegex: AttributionRule = { ...baseRule, matchType: 'regex', matchValue: '[invalid(' };
      expect(matchesRule(badRegex, 'anything')).toBe(false);
    });
  });

  describe('in_list match', () => {
    const listRule: AttributionRule = {
      ...baseRule,
      matchType: 'in_list',
      matchValue: 'cred_a, cred_b, cred_c',
    };

    it('matches values in the comma-separated list', () => {
      expect(matchesRule(listRule, 'cred_a')).toBe(true);
      expect(matchesRule(listRule, 'cred_b')).toBe(true);
      expect(matchesRule(listRule, 'cred_c')).toBe(true);
    });

    it('trims whitespace around list items', () => {
      expect(matchesRule(listRule, 'cred_b')).toBe(true);
    });

    it('rejects values not in the list', () => {
      expect(matchesRule(listRule, 'cred_d')).toBe(false);
    });
  });
});

// =============================================================================
// resolveAttribution
// =============================================================================

describe('resolveAttribution', () => {
  const now = new Date();

  const makeRule = (
    id: string,
    groupId: string,
    dimension: AttributionRule['dimension'],
    matchType: AttributionRule['matchType'],
    matchValue: string,
    priority: number,
  ): AttributionRule => ({
    id,
    groupId,
    dimension,
    matchType,
    matchValue,
    priority,
    createdAt: now,
    updatedAt: now,
  });

  it('returns matching group IDs', () => {
    const rules = [
      makeRule('r1', 'engineering', 'credential', 'exact', 'cred_eng_1', 10),
    ];
    const result = resolveAttribution(rules, { credential: 'cred_eng_1' });
    expect(result).toEqual(['engineering']);
  });

  it('returns multiple groups when multiple rules match', () => {
    const rules = [
      makeRule('r1', 'engineering', 'credential', 'prefix', 'cred_', 5),
      makeRule('r2', 'production', 'region', 'exact', 'us-east-1', 10),
    ];
    const result = resolveAttribution(rules, {
      credential: 'cred_eng_1',
      region: 'us-east-1',
    });
    expect(result).toContain('engineering');
    expect(result).toContain('production');
  });

  it('sorts results by descending priority', () => {
    const rules = [
      makeRule('r1', 'low_priority', 'provider', 'exact', 'anthropic', 1),
      makeRule('r2', 'high_priority', 'provider', 'exact', 'anthropic', 100),
    ];
    const result = resolveAttribution(rules, { provider: 'anthropic' });
    expect(result[0]).toBe('high_priority');
    expect(result[1]).toBe('low_priority');
  });

  it('deduplicates groups (returns unique group IDs)', () => {
    const rules = [
      makeRule('r1', 'engineering', 'credential', 'exact', 'cred_1', 5),
      makeRule('r2', 'engineering', 'model_slug', 'prefix', 'claude', 10),
    ];
    const result = resolveAttribution(rules, {
      credential: 'cred_1',
      model_slug: 'claude-sonnet-4-6',
    });
    expect(result).toEqual(['engineering']);
  });

  it('uses highest priority when a group matches via multiple rules', () => {
    const rules = [
      makeRule('r1', 'eng', 'credential', 'exact', 'cred_1', 5),
      makeRule('r2', 'eng', 'model_slug', 'prefix', 'claude', 50),
      makeRule('r3', 'sales', 'credential', 'exact', 'cred_1', 25),
    ];
    const result = resolveAttribution(rules, {
      credential: 'cred_1',
      model_slug: 'claude-sonnet-4-6',
    });
    // eng has priority 50 (from r2), sales has priority 25
    expect(result).toEqual(['eng', 'sales']);
  });

  it('skips rules whose dimension has no value', () => {
    const rules = [
      makeRule('r1', 'eng', 'region', 'exact', 'us-east-1', 10),
    ];
    const result = resolveAttribution(rules, { credential: 'cred_1' });
    expect(result).toEqual([]);
  });

  it('skips rules whose dimension value is undefined', () => {
    const rules = [
      makeRule('r1', 'eng', 'credential', 'exact', 'cred_1', 10),
    ];
    const result = resolveAttribution(rules, { credential: undefined });
    expect(result).toEqual([]);
  });

  it('returns empty array when no rules match', () => {
    const rules = [
      makeRule('r1', 'eng', 'credential', 'exact', 'cred_1', 10),
    ];
    const result = resolveAttribution(rules, { credential: 'cred_999' });
    expect(result).toEqual([]);
  });

  it('returns empty array when no rules are provided', () => {
    expect(resolveAttribution([], { credential: 'cred_1' })).toEqual([]);
  });
});
