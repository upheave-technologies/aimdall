'use client';

import { usePathname } from 'next/navigation';
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
// Container — computes active state from pathname, delegates rendering
// ---------------------------------------------------------------------------

export function NavigationContainer() {
  const pathname = usePathname();

  const items: NavItem[] = NAV_CONFIG.map((item) => {
    const isExact = item.href === '/cost-tracking';
    const active = isExact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(item.href + '/');
    return { ...item, active };
  });

  return <NavigationView items={items} />;
}
