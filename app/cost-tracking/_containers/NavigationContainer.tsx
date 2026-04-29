'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { NavigationView, type NavItem } from '../_components/NavigationView';

// ---------------------------------------------------------------------------
// Static nav definition
// ---------------------------------------------------------------------------

const NAV_CONFIG: Omit<NavItem, 'active'>[] = [
  { href: '/cost-tracking', label: 'Overview', icon: 'overview' },
  { href: '/cost-tracking/providers', label: 'Providers', icon: 'providers' },
  { href: '/cost-tracking/explore', label: 'Explorer', icon: 'explorer' },
  { href: '/cost-tracking/recommendations', label: 'Recommendations', icon: 'recommendations' },
  { href: '/cost-tracking/attributions', label: 'Attribution', icon: 'attribution' },
  { href: '/cost-tracking/budget', label: 'Budgets', icon: 'budget' },
  { href: '/cost-tracking/alerts', label: 'Alerts', icon: 'alerts' },
  { href: '/cost-tracking/report', label: 'Report', icon: 'report' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a nav href that appends the current period selection params
 * (`period`, `from`, `to`) to the destination path.
 *
 * Per-dimension explore filter params (`provider`, `model`, etc.) are NOT
 * forwarded — only the three unified period params are sticky across navigation
 * (RFC Section 3.4, step 4 note; task acceptance criteria).
 */
function withPeriodParams(
  href: string,
  searchParams: ReturnType<typeof useSearchParams>,
): string {
  const period = searchParams.get('period');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  const params = new URLSearchParams();
  if (period) params.set('period', period);
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  const qs = params.toString();
  return qs ? `${href}?${qs}` : href;
}

// ---------------------------------------------------------------------------
// Container — computes active state from pathname, delegates rendering
// ---------------------------------------------------------------------------

export function NavigationContainer() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const items: NavItem[] = NAV_CONFIG.map((item) => {
    const isExact = item.href === '/cost-tracking';
    const active = isExact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(item.href + '/');

    return {
      ...item,
      href: withPeriodParams(item.href, searchParams),
      active,
    };
  });

  return <NavigationView items={items} />;
}
