import Link from 'next/link';

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function OverviewIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function ExplorerIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function AttributionIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
  );
}

function BudgetIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function AlertsIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );
}

function ReportIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NavItem = {
  href: string;
  label: string;
  icon: 'overview' | 'explorer' | 'attribution' | 'budget' | 'alerts' | 'report';
  active: boolean;
};

type NavigationViewProps = {
  items: NavItem[];
};

// ---------------------------------------------------------------------------
// Icon resolver
// ---------------------------------------------------------------------------

function NavIcon({ name }: { name: NavItem['icon'] }) {
  switch (name) {
    case 'overview':
      return <OverviewIcon />;
    case 'explorer':
      return <ExplorerIcon />;
    case 'attribution':
      return <AttributionIcon />;
    case 'budget':
      return <BudgetIcon />;
    case 'alerts':
      return <AlertsIcon />;
    case 'report':
      return <ReportIcon />;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NavigationView({ items }: NavigationViewProps) {
  return (
    <aside className="flex h-screen w-60 flex-col border-r border-foreground/8 bg-background px-3 py-6">
      {/* Brand */}
      <div className="mb-8 px-3">
        <div className="text-lg font-bold tracking-tight">Aimdall</div>
        <div className="text-xs text-foreground/40">AI Cost Intelligence</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={
              item.active
                ? 'flex items-center gap-3 rounded-xl bg-foreground/8 px-3 py-2.5 text-sm font-medium'
                : 'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground'
            }
          >
            <NavIcon name={item.icon} />
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 text-xs text-foreground/30">Data refreshes daily</div>
    </aside>
  );
}
