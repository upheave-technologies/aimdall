'use client';

import { useState, useCallback } from 'react';
import { PROVIDER_OPTIONS, type ProviderSlug, type ConnectStatus } from '../_components/ProviderWizardView';
import { ProviderWizardLayout } from '../_components/ProviderWizardLayout';

// =============================================================================
// TYPES
// =============================================================================

type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };

type AvailableProvider = {
  slug: string;
  displayName: string;
  description: string;
};

type ProviderWizardProps = {
  testConnectionAction: (formData: FormData) => Promise<ActionResult<{ detail?: string }>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connectProviderAction: (formData: FormData) => Promise<ActionResult<any>>;
  availableProviders: AvailableProvider[];
};

// =============================================================================
// CONTAINER
// =============================================================================

export function ProviderWizard({
  testConnectionAction,
  connectProviderAction,
  availableProviders,
}: ProviderWizardProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [selectedSlug, setSelectedSlug] = useState<ProviderSlug | null>(null);
  const [connectStatus, setConnectStatus] = useState<ConnectStatus>('idle');
  const [connectError, setConnectError] = useState('');
  // Container owns all credential values — no DOM queries needed
  const [credentials, setCredentials] = useState<Record<string, string>>({});

  const openWizard = useCallback((slug?: ProviderSlug) => {
    setConnectStatus('idle');
    setConnectError('');
    setCredentials({});
    if (slug) {
      setSelectedSlug(slug);
      setStep(2);
    } else {
      setSelectedSlug(null);
      setStep(1);
    }
    setOpen(true);
  }, []);

  function handleClose() {
    setOpen(false);
  }

  function handleSelectProvider(slug: ProviderSlug) {
    setSelectedSlug(slug);
    setConnectStatus('idle');
    setConnectError('');
    if (step === 1) setStep(2);
  }

  function handleReset() {
    setStep(1);
    setSelectedSlug(null);
    setConnectStatus('idle');
    setConnectError('');
    setCredentials({});
  }

  // Container builds FormData from credentials state — no DOM queries
  function handleCredentialChange(name: string, value: string) {
    setCredentials((prev) => ({ ...prev, [name]: value }));
  }

  async function handleConnect() {
    if (!selectedSlug) return;
    setConnectStatus('connecting');
    setConnectError('');

    const provider = PROVIDER_OPTIONS.find((p) => p.slug === selectedSlug);

    // Build FormData from credentials state
    const fd = new FormData();
    fd.set('providerSlug', selectedSlug);
    fd.set('displayName', provider?.displayName ?? selectedSlug);
    for (const [key, value] of Object.entries(credentials)) {
      if (value) fd.set(key, value);
    }

    // Step 1: Test connection first
    const testResult = await testConnectionAction(fd);
    if (!testResult.success) {
      setConnectStatus('failed');
      setConnectError(testResult.error);
      return;
    }

    // Step 2: Store credentials and redirect.
    // connectProviderAction redirects to /cost-tracking?connected=<slug> on
    // success — it never returns on the happy path. Only the error path returns.
    const connectResult = await connectProviderAction(fd);
    if (!connectResult.success) {
      setConnectStatus('failed');
      setConnectError(connectResult.error);
      return;
    }
    // If we reach here, the action returned without redirecting (unexpected).
    // Fall back gracefully to the failed state rather than hanging on step 2.
    setConnectStatus('failed');
    setConnectError('Something unexpected happened. Please try again.');
  }

  return (
    <ProviderWizardLayout
      availableProviders={availableProviders}
      open={open}
      step={step}
      selectedSlug={selectedSlug}
      connectStatus={connectStatus}
      connectError={connectError}
      onOpenWizard={openWizard}
      onClose={handleClose}
      onSelectProvider={handleSelectProvider}
      onConnect={handleConnect}
      onReset={handleReset}
      onCredentialChange={handleCredentialChange}
    />
  );

}
