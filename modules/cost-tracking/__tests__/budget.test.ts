import { describe, it, expect } from 'vitest';
import { evaluateBudgetStatus, type Budget } from '../domain/budget';

describe('evaluateBudgetStatus', () => {
  const now = new Date();
  const baseBudget: Budget = {
    id: 'b1',
    name: 'Monthly Engineering',
    scope: { providerId: 'prov_1' },
    budgetType: 'soft_alert',
    periodType: 'monthly',
    amount: '1000.00000000',
    currency: 'USD',
    alertThresholds: [50, 75, 90, 100],
    currentSpend: '0.00000000',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  it('returns active with 0% when no spend', () => {
    const result = evaluateBudgetStatus(baseBudget);
    expect(result.status).toBe('active');
    expect(result.percentUsed).toBe(0);
    expect(result.breachedThresholds).toEqual([]);
  });

  it('calculates correct percentUsed', () => {
    const budget = { ...baseBudget, currentSpend: '750.00000000' };
    const result = evaluateBudgetStatus(budget);
    expect(result.status).toBe('active');
    expect(result.percentUsed).toBe(75);
    expect(result.breachedThresholds).toEqual([50, 75]);
  });

  it('returns exceeded when spend >= amount', () => {
    const budget = { ...baseBudget, currentSpend: '1000.00000000' };
    const result = evaluateBudgetStatus(budget);
    expect(result.status).toBe('exceeded');
    expect(result.percentUsed).toBe(100);
    expect(result.breachedThresholds).toEqual([50, 75, 90, 100]);
  });

  it('returns exceeded when spend exceeds amount', () => {
    const budget = { ...baseBudget, currentSpend: '1500.00000000' };
    const result = evaluateBudgetStatus(budget);
    expect(result.status).toBe('exceeded');
    expect(result.percentUsed).toBe(150);
    expect(result.breachedThresholds).toEqual([50, 75, 90, 100]);
  });

  it('returns paused status without re-evaluating', () => {
    const budget = { ...baseBudget, status: 'paused' as const, currentSpend: '999.00000000' };
    const result = evaluateBudgetStatus(budget);
    expect(result.status).toBe('paused');
    expect(result.percentUsed).toBe(0);
    expect(result.breachedThresholds).toEqual([]);
  });

  it('returns archived status without re-evaluating', () => {
    const budget = { ...baseBudget, status: 'archived' as const, currentSpend: '1500.00000000' };
    const result = evaluateBudgetStatus(budget);
    expect(result.status).toBe('archived');
    expect(result.percentUsed).toBe(0);
  });

  it('handles zero-dollar budget as exceeded', () => {
    const budget = { ...baseBudget, amount: '0.00000000' };
    const result = evaluateBudgetStatus(budget);
    expect(result.status).toBe('exceeded');
    expect(result.percentUsed).toBe(100);
  });

  it('handles negative amount as exceeded', () => {
    const budget = { ...baseBudget, amount: '-100.00000000' };
    const result = evaluateBudgetStatus(budget);
    expect(result.status).toBe('exceeded');
    expect(result.percentUsed).toBe(100);
  });

  it('handles missing alertThresholds gracefully', () => {
    const budget = { ...baseBudget, alertThresholds: undefined, currentSpend: '500.00000000' };
    const result = evaluateBudgetStatus(budget);
    expect(result.status).toBe('active');
    expect(result.percentUsed).toBe(50);
    expect(result.breachedThresholds).toEqual([]);
  });

  it('returns breached thresholds in ascending order', () => {
    const budget = {
      ...baseBudget,
      alertThresholds: [90, 50, 75, 100],
      currentSpend: '800.00000000',
    };
    const result = evaluateBudgetStatus(budget);
    expect(result.breachedThresholds).toEqual([50, 75]);
  });

  it('clamps percentUsed to minimum 0', () => {
    const budget = { ...baseBudget, currentSpend: '-50.00000000' };
    const result = evaluateBudgetStatus(budget);
    expect(result.percentUsed).toBe(0);
    expect(result.status).toBe('active');
  });
});
