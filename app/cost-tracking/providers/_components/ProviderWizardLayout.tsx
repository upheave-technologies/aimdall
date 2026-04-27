// =============================================================================
// ProviderWizardLayout — pure presentational
// =============================================================================
// Renders the provider setup card grid and the wizard modal overlay.
// All state and callbacks are owned by the ProviderWizard container.
// =============================================================================

import { ProviderSetupCard } from './ProviderSetupCard';
import { ProviderWizardView, type ProviderSlug, type ConnectStatus } from './ProviderWizardView';

// =============================================================================
// TYPES
// =============================================================================

type AvailableProvider = {
  slug: string;
  displayName: string;
  description: string;
};

export type ProviderWizardLayoutProps = {
  availableProviders: AvailableProvider[];
  // Wizard state
  open: boolean;
  step: number;
  selectedSlug: ProviderSlug | null;
  connectStatus: ConnectStatus;
  connectError: string;
  // Callbacks
  onOpenWizard: (slug: ProviderSlug) => void;
  onClose: () => void;
  onSelectProvider: (slug: ProviderSlug) => void;
  onConnect: () => void;
  onReset: () => void;
  onCredentialChange: (name: string, value: string) => void;
};

// =============================================================================
// COMPONENT
// =============================================================================

export function ProviderWizardLayout({
  availableProviders,
  open,
  step,
  selectedSlug,
  connectStatus,
  connectError,
  onOpenWizard,
  onClose,
  onSelectProvider,
  onConnect,
  onReset,
  onCredentialChange,
}: ProviderWizardLayoutProps) {
  return (
    <>
      {/* Provider setup cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {availableProviders.map((p) => (
          <ProviderSetupCard
            key={p.slug}
            slug={p.slug}
            displayName={p.displayName}
            description={p.description}
            onConnect={() => onOpenWizard(p.slug as ProviderSlug)}
          />
        ))}
      </div>

      {/* Wizard overlay */}
      <ProviderWizardView
        open={open}
        step={step}
        selectedSlug={selectedSlug}
        connectStatus={connectStatus}
        connectError={connectError}
        onClose={onClose}
        onSelectProvider={onSelectProvider}
        onConnect={onConnect}
        onReset={onReset}
        onCredentialChange={onCredentialChange}
      />
    </>
  );
}
