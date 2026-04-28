// =============================================================================
// ProviderWizardView — pure presentational
// =============================================================================
// Renders the 3-step provider setup wizard as a full-screen modal overlay.
// All state, handlers, and action calls live in the ProviderWizard container.
// This component is a pure function of its props — zero DOM queries, zero forms.
// =============================================================================

import { ProviderIcon } from './ProviderIcon';

// =============================================================================
// PROVIDER METADATA
// =============================================================================

export const PROVIDER_OPTIONS = [
  {
    slug: 'openai',
    displayName: 'OpenAI',
    description: 'Track API costs across GPT models.',
  },
  {
    slug: 'anthropic',
    displayName: 'Anthropic',
    description: 'Monitor Claude usage and spend.',
  },
  {
    slug: 'google_vertex',
    displayName: 'Google Vertex AI',
    description: 'Attribute Vertex AI model costs.',
  },
  {
    slug: 'google_gemini',
    displayName: 'Google Gemini',
    description: 'Track Gemini API usage and costs.',
  },
] as const;

export type ProviderSlug = (typeof PROVIDER_OPTIONS)[number]['slug'];

// =============================================================================
// TYPES
// =============================================================================

export type ConnectStatus = 'idle' | 'connecting' | 'success' | 'failed';

type ProviderWizardViewProps = {
  open: boolean;
  step: number;
  selectedSlug: ProviderSlug | null;
  connectStatus: ConnectStatus;
  connectError: string;
  onClose: () => void;
  onSelectProvider: (slug: ProviderSlug) => void;
  onConnect: () => void;
  onReset: () => void;
  onCredentialChange: (name: string, value: string) => void;
};

// =============================================================================
// ACTION BAR — Test + Connect buttons with status feedback
// =============================================================================

function ActionBar({
  connectStatus,
  connectError,
  displayName,
  onConnect,
}: {
  connectStatus: ConnectStatus;
  connectError: string;
  displayName: string;
  onConnect: () => void;
}) {
  const isConnecting = connectStatus === 'connecting';
  const failed = connectStatus === 'failed';

  return (
    <div className="space-y-3">
      {/* Error feedback */}
      {failed && connectError && (
        <div className="flex items-start gap-2 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-500">
          <svg className="h-4 w-4 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <span>{connectError}</span>
        </div>
      )}

      {/* Single connect button */}
      <button
        type="submit"
        disabled={isConnecting}
        className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
          isConnecting
            ? 'bg-foreground/10 text-foreground/40 cursor-not-allowed'
            : 'bg-foreground text-background hover:opacity-90'
        }`}
      >
        {isConnecting ? (
          <>
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 12a8 8 0 018-8V4" />
            </svg>
            Connecting...
          </>
        ) : failed ? (
          `Retry`
        ) : (
          `Connect ${displayName}`
        )}
      </button>
    </div>
  );
}

// =============================================================================
// CREDENTIAL FORM — provider-specific instructions + inputs
// =============================================================================

function CredentialForm({
  slug,
  displayName,
  connectStatus,
  connectError,
  onConnect,
  onCredentialChange,
}: {
  slug: ProviderSlug;
  displayName: string;
  connectStatus: ConnectStatus;
  connectError: string;
  onConnect: () => void;
  onCredentialChange: (name: string, value: string) => void;
}) {

  // ----------------------------------------------------------------
  // OpenAI
  // ----------------------------------------------------------------
  if (slug === 'openai') {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-xl font-semibold">Connect OpenAI</h3>
          <p className="mt-1 text-sm text-foreground/60">Follow these steps to get your API key.</p>
        </div>

        <ol className="space-y-3 text-sm text-foreground/70">
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-xs font-bold">1</span>
            <span>
              Open{' '}
              <a href="https://platform.openai.com/settings/organization/admin-keys" target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline underline-offset-2 hover:text-foreground/80">
                OpenAI Admin API Keys
              </a>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-xs font-bold">2</span>
            <span>Click <strong>Create new admin key</strong> → name it (e.g. &quot;Aimdall&quot;) → under Permissions, enable <strong>only</strong> &quot;Usage: Read&quot; and &quot;Costs: Read&quot; → click <strong>Create</strong></span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-xs font-bold">3</span>
            <span>Copy the key and paste it below</span>
          </li>
        </ol>

        <div className="rounded-lg bg-foreground/[0.03] px-4 py-3 text-xs text-foreground/50">
          <strong className="text-foreground/70">Least privilege:</strong> Aimdall only reads usage and cost reports. These are the only two permissions your key needs — it cannot create completions, manage keys, or modify any settings.
        </div>

        <form onSubmit={(e) => { e.preventDefault(); onConnect(); }} className="space-y-4">
          <div>
            <label htmlFor="openai-apiKey" className="mb-1.5 block text-sm font-medium">
              API Key
            </label>
            <input
              id="openai-apiKey"
              type="password"
              name="apiKey"
              placeholder="sk-..."
              required
              onChange={(e) => onCredentialChange('apiKey', e.target.value)}
              className="w-full rounded-xl border border-foreground/15 bg-foreground/[0.03] px-4 py-2.5 text-sm placeholder:text-foreground/30 focus:border-foreground/30 focus:outline-none"
            />
            <p className="mt-1.5 text-xs text-foreground/40">
              Organization admin key. Starts with <code className="rounded bg-foreground/8 px-1 py-0.5 font-mono">sk-admin-...</code>
            </p>
          </div>

          <ActionBar
            connectStatus={connectStatus}
            connectError={connectError}
            displayName={displayName}
            onConnect={onConnect}
          />
        </form>
      </div>
    );
  }

  // ----------------------------------------------------------------
  // Anthropic
  // ----------------------------------------------------------------
  if (slug === 'anthropic') {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-xl font-semibold">Connect Anthropic</h3>
          <p className="mt-1 text-sm text-foreground/60">Follow these steps to get your Admin API key.</p>
        </div>

        <ol className="space-y-3 text-sm text-foreground/70">
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-xs font-bold">1</span>
            <span>
              Open{' '}
              <a href="https://console.anthropic.com/settings/admin-keys" target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline underline-offset-2 hover:text-foreground/80">
                Anthropic Admin API Keys
              </a>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-xs font-bold">2</span>
            <span>Click <strong>Create Admin Key</strong> → name it anything (e.g. &quot;Aimdall&quot;) → click <strong>Create Key</strong></span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-xs font-bold">3</span>
            <span>Copy the key and paste it below</span>
          </li>
        </ol>

        <div className="space-y-2">
          <div className="rounded-lg bg-foreground/[0.03] px-4 py-3 text-xs text-foreground/50">
            <strong className="text-foreground/70">Why Admin?</strong> Anthropic requires an Admin key to access usage and cost reports — they do not offer scoped read-only keys. Aimdall only reads usage and cost data.
          </div>
          <div className="rounded-lg bg-amber-500/8 px-4 py-3 text-xs text-foreground/50">
            <strong className="text-amber-600 dark:text-amber-400">Security note:</strong> Anthropic Admin keys have broad access (manage keys, members, workspaces). We only use it for read-only usage queries, but if you disconnect this provider, we recommend rotating the key in the Anthropic console.
          </div>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); onConnect(); }} className="space-y-4">
          <div>
            <label htmlFor="anthropic-adminApiKey" className="mb-1.5 block text-sm font-medium">
              Admin API Key
            </label>
            <input
              id="anthropic-adminApiKey"
              type="password"
              name="adminApiKey"
              placeholder="sk-ant-admin-..."
              required
              onChange={(e) => onCredentialChange('adminApiKey', e.target.value)}
              className="w-full rounded-xl border border-foreground/15 bg-foreground/[0.03] px-4 py-2.5 text-sm placeholder:text-foreground/30 focus:border-foreground/30 focus:outline-none"
            />
            <p className="mt-1.5 text-xs text-foreground/40">
              Admin key required for usage data. Starts with <code className="rounded bg-foreground/8 px-1 py-0.5 font-mono">sk-ant-admin-...</code>
            </p>
          </div>

          <ActionBar
            connectStatus={connectStatus}
            connectError={connectError}
            displayName={displayName}
            onConnect={onConnect}
          />
        </form>
      </div>
    );
  }

  // ----------------------------------------------------------------
  // Google Vertex AI
  // ----------------------------------------------------------------
  if (slug === 'google_vertex') {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-xl font-semibold">Connect Google Vertex AI</h3>
          <p className="mt-1 text-sm text-foreground/60">
            Reads usage metrics from Google Cloud Monitoring.
          </p>
        </div>

        <ol className="space-y-3 text-sm text-foreground/70">
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-xs font-bold">1</span>
            <span>
              Open{' '}
              <a href="https://console.cloud.google.com/cloud-resource-manager" target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline underline-offset-2 hover:text-foreground/80">
                Google Cloud Console
              </a>
              {' '}→ click your project → copy the <strong>Project ID</strong> shown on the dashboard
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-xs font-bold">2</span>
            <span>
              Enable the{' '}
              <a href="https://console.cloud.google.com/apis/library/monitoring.googleapis.com" target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline underline-offset-2 hover:text-foreground/80">
                Cloud Monitoring API
              </a>
              {' '}for your project
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-xs font-bold">3</span>
            <span>
              Grant your account the <strong>Monitoring Viewer</strong> role:{' '}
              <code className="rounded bg-foreground/8 px-1.5 py-0.5 font-mono text-xs">gcloud projects add-iam-policy-binding YOUR_PROJECT_ID --member=&quot;user:YOUR_EMAIL&quot; --role=&quot;roles/monitoring.viewer&quot;</code>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-xs font-bold">4</span>
            <span>
              Authenticate:{' '}
              <code className="rounded bg-foreground/8 px-1.5 py-0.5 font-mono text-xs">gcloud auth application-default login</code>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-xs font-bold">5</span>
            <span>Paste your Project ID below</span>
          </li>
        </ol>

        <div className="rounded-lg bg-foreground/[0.03] px-4 py-3 text-xs text-foreground/50">
          <strong className="text-foreground/70">Least privilege:</strong> <code className="rounded bg-foreground/8 px-1 py-0.5 font-mono">roles/monitoring.viewer</code> is read-only and is the smallest predefined role that covers what Aimdall needs. Note that personal ADC credentials carry your full account permissions — for tighter isolation, create a dedicated service account with only this role.
        </div>

        <form onSubmit={(e) => { e.preventDefault(); onConnect(); }} className="space-y-4">
          <div>
            <label htmlFor="vertex-projectId" className="mb-1.5 block text-sm font-medium">
              Project ID
            </label>
            <input
              id="vertex-projectId"
              type="text"
              name="projectId"
              placeholder="my-gcp-project-id"
              required
              onChange={(e) => onCredentialChange('projectId', e.target.value)}
              className="w-full rounded-xl border border-foreground/15 bg-foreground/[0.03] px-4 py-2.5 text-sm placeholder:text-foreground/30 focus:border-foreground/30 focus:outline-none"
            />
            <p className="mt-1.5 text-xs text-foreground/40">
              Found at the top of your Google Cloud Console. Looks like <code className="rounded bg-foreground/8 px-1 py-0.5 font-mono">my-project-123</code>
            </p>
          </div>

          <ActionBar
            connectStatus={connectStatus}
            connectError={connectError}
            displayName={displayName}
            onConnect={onConnect}
          />
        </form>
      </div>
    );
  }

  // ----------------------------------------------------------------
  // Google Gemini (default)
  // ----------------------------------------------------------------
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold">Connect Google Gemini</h3>
        <p className="mt-1 text-sm text-foreground/60">
          Reads Gemini API usage from Google Cloud Monitoring.
        </p>
      </div>

      <ol className="space-y-3 text-sm text-foreground/70">
        <li className="flex gap-3">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-xs font-bold">1</span>
          <span>
            Open{' '}
            <a href="https://console.cloud.google.com/cloud-resource-manager" target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline underline-offset-2 hover:text-foreground/80">
              Google Cloud Console
            </a>
            {' '}→ click your project → copy the <strong>Project ID</strong> shown on the dashboard
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-xs font-bold">2</span>
          <span>
            Enable the{' '}
            <a href="https://console.cloud.google.com/apis/library/monitoring.googleapis.com" target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline underline-offset-2 hover:text-foreground/80">
              Cloud Monitoring API
            </a>
            {' '}for your project
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-xs font-bold">3</span>
          <span>
            Grant your account the <strong>Monitoring Viewer</strong> role:{' '}
            <code className="rounded bg-foreground/8 px-1.5 py-0.5 font-mono text-xs">gcloud projects add-iam-policy-binding YOUR_PROJECT_ID --member=&quot;user:YOUR_EMAIL&quot; --role=&quot;roles/monitoring.viewer&quot;</code>
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-xs font-bold">4</span>
          <span>
            Authenticate:{' '}
            <code className="rounded bg-foreground/8 px-1.5 py-0.5 font-mono text-xs">gcloud auth application-default login</code>
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-xs font-bold">5</span>
          <span>Paste your Project ID below</span>
        </li>
      </ol>

      <div className="rounded-lg bg-foreground/[0.03] px-4 py-3 text-xs text-foreground/50">
        <strong className="text-foreground/70">Least privilege:</strong> <code className="rounded bg-foreground/8 px-1 py-0.5 font-mono">roles/monitoring.viewer</code> is read-only and is the smallest predefined role that covers what Aimdall needs. Note that personal ADC credentials carry your full account permissions — for tighter isolation, create a dedicated service account with only this role.
      </div>

      <form onSubmit={(e) => { e.preventDefault(); onConnect(); }} className="space-y-4">
        <div>
          <label htmlFor="gemini-projectId" className="mb-1.5 block text-sm font-medium">
            Project ID
          </label>
          <input
            id="gemini-projectId"
            type="text"
            name="projectId"
            placeholder="my-gcp-project-id"
            required
            onChange={(e) => onCredentialChange('projectId', e.target.value)}
            className="w-full rounded-xl border border-foreground/15 bg-foreground/[0.03] px-4 py-2.5 text-sm placeholder:text-foreground/30 focus:border-foreground/30 focus:outline-none"
          />
          <p className="mt-1.5 text-xs text-foreground/40">
            Found at the top of your Google Cloud Console. Looks like <code className="rounded bg-foreground/8 px-1 py-0.5 font-mono">my-project-123</code>
          </p>
        </div>

        <ActionBar
          connectStatus={connectStatus}
          connectError={connectError}
          displayName={displayName}
          onConnect={onConnect}
        />
      </form>
    </div>
  );
}

// =============================================================================
// MAIN VIEW
// =============================================================================

export function ProviderWizardView({
  open,
  step,
  selectedSlug,
  connectStatus,
  connectError,
  onClose,
  onSelectProvider,
  onConnect,
  onReset,
  onCredentialChange,
}: ProviderWizardViewProps) {
  if (!open) return null;

  const selectedProvider = PROVIDER_OPTIONS.find((p) => p.slug === selectedSlug) ?? null;

  return (
    <>
      <style>{`
        @keyframes wizard-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm">
        <div
          className="relative w-full max-w-2xl rounded-2xl border border-foreground/10 bg-background shadow-lg"
          style={{ animation: 'wizard-fade 150ms ease-out' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-foreground/10 px-8 py-5">
            <div>
              <p className="text-xs font-medium text-foreground/50">
                Step {step} of 2
              </p>
              <h2 className="text-lg font-semibold">Connect a Provider</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1.5 text-foreground/50 hover:bg-foreground/5 hover:text-foreground"
              aria-label="Close wizard"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Progress bar — 2 segments */}
          <div className="flex h-1 w-full">
            {[1, 2].map((seg) => (
              <div
                key={seg}
                className={`flex-1 transition-colors duration-200 ${
                  seg <= step ? 'bg-foreground' : 'bg-foreground/10'
                } ${seg > 1 ? 'ml-0.5' : ''}`}
              />
            ))}
          </div>

          {/* Content */}
          <div className="max-h-[70vh] overflow-y-auto p-8">

            {/* ---------------------------------------------------------------- */}
            {/* STEP 1 — Choose Provider                                          */}
            {/* ---------------------------------------------------------------- */}
            {step === 1 && (
              <div style={{ animation: 'wizard-fade 200ms ease-in-out' }}>
                <h3 className="mb-2 text-xl font-semibold">Choose a provider</h3>
                <p className="mb-6 text-sm text-foreground/60">
                  Select the AI provider you want to connect.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  {PROVIDER_OPTIONS.map((provider) => (
                    <button
                      key={provider.slug}
                      type="button"
                      onClick={() => onSelectProvider(provider.slug)}
                      className={`flex items-start gap-3 rounded-xl border p-5 text-left transition-all duration-150 hover:border-foreground/30 ${
                        selectedSlug === provider.slug
                          ? 'border-foreground ring-2 ring-foreground'
                          : 'border-foreground/15'
                      }`}
                    >
                      <span className="mt-0.5 text-foreground/60">
                        <ProviderIcon slug={provider.slug} className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="font-semibold">{provider.displayName}</p>
                        <p className="mt-0.5 text-xs text-foreground/50">{provider.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ---------------------------------------------------------------- */}
            {/* STEP 2 — Credentials + Test                                       */}
            {/* ---------------------------------------------------------------- */}
            {step === 2 && selectedProvider && (
              <div style={{ animation: 'wizard-fade 200ms ease-in-out' }}>
                <CredentialForm
                  slug={selectedProvider.slug}
                  displayName={selectedProvider.displayName}
                  connectStatus={connectStatus}
                  connectError={connectError}
                  onConnect={onConnect}
                  onCredentialChange={onCredentialChange}
                />
              </div>
            )}

          </div>

          {/* Footer — Back / Continue navigation */}
          <div className="flex items-center justify-between border-t border-foreground/10 px-8 py-5">
            <button
              type="button"
              onClick={step === 1 ? onClose : onReset}
              className="rounded border border-foreground/15 px-4 py-2 text-sm font-medium text-foreground/70 hover:bg-foreground/5"
            >
              {step === 1 ? 'Cancel' : 'Back'}
            </button>

            {step === 1 && (
              <button
                type="button"
                onClick={() => selectedSlug && onSelectProvider(selectedSlug)}
                disabled={selectedSlug === null}
                className="rounded-xl bg-foreground px-5 py-2 text-sm font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Continue
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
