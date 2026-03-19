import { describe, it, expect } from 'vitest';
import { validateProviderSlug, createProvider } from '../domain/provider';

// =============================================================================
// validateProviderSlug
// =============================================================================

describe('validateProviderSlug', () => {
  it('accepts valid slugs', () => {
    expect(validateProviderSlug('anthropic').success).toBe(true);
    expect(validateProviderSlug('openai').success).toBe(true);
    expect(validateProviderSlug('google_vertex').success).toBe(true);
    expect(validateProviderSlug('aws_bedrock').success).toBe(true);
    expect(validateProviderSlug('provider123').success).toBe(true);
  });

  it('rejects empty strings', () => {
    const result = validateProviderSlug('');
    expect(result.success).toBe(false);
  });

  it('rejects whitespace-only strings', () => {
    const result = validateProviderSlug('   ');
    expect(result.success).toBe(false);
  });

  it('rejects uppercase characters', () => {
    const result = validateProviderSlug('OpenAI');
    expect(result.success).toBe(false);
  });

  it('rejects dashes', () => {
    const result = validateProviderSlug('google-vertex');
    expect(result.success).toBe(false);
  });

  it('rejects special characters', () => {
    const result = validateProviderSlug('provider!');
    expect(result.success).toBe(false);
  });

  it('trims and validates', () => {
    const result = validateProviderSlug('  anthropic  ');
    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toBe('anthropic');
  });
});

// =============================================================================
// createProvider
// =============================================================================

describe('createProvider', () => {
  it('creates a provider with default active status', () => {
    const result = createProvider('openai', 'OpenAI');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.slug).toBe('openai');
      expect(result.value.displayName).toBe('OpenAI');
      expect(result.value.status).toBe('active');
    }
  });

  it('creates a provider with custom options', () => {
    const result = createProvider('anthropic', 'Anthropic', {
      apiBaseUrl: 'https://api.anthropic.com',
      status: 'paused',
      configuration: { version: '2023-06-01' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.apiBaseUrl).toBe('https://api.anthropic.com');
      expect(result.value.status).toBe('paused');
      expect(result.value.configuration).toEqual({ version: '2023-06-01' });
    }
  });

  it('rejects invalid slug', () => {
    const result = createProvider('Invalid-Slug', 'Test');
    expect(result.success).toBe(false);
  });

  it('rejects empty display name', () => {
    const result = createProvider('valid_slug', '');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain('displayName');
  });

  it('rejects whitespace-only display name', () => {
    const result = createProvider('valid_slug', '   ');
    expect(result.success).toBe(false);
  });

  it('trims display name', () => {
    const result = createProvider('test', '  My Provider  ');
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.displayName).toBe('My Provider');
  });
});
