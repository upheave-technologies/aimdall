import type { TemplateType } from '@/modules/cost-tracking/domain/types';
import type { CredentialWithProvider } from '@/modules/cost-tracking/domain/types';

// =============================================================================
// TEMPLATE DEFINITIONS
// =============================================================================

export const TEMPLATE_CARDS = [
  {
    type: 'team' as TemplateType,
    title: 'By Team',
    description: 'Assign API keys to teams for team-level cost attribution.',
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
      </svg>
    ),
  },
  {
    type: 'project' as TemplateType,
    title: 'By Project',
    description: 'Organize costs by project for project-level tracking.',
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v8.25A2.25 2.25 0 0 0 4.5 16.5h15a2.25 2.25 0 0 0 2.25-2.25V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
      </svg>
    ),
  },
  {
    type: 'environment' as TemplateType,
    title: 'By Environment',
    description: 'Separate dev, staging, and production costs.',
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 6 0m-6 0h6m6.75-3a3 3 0 0 1-3 3m3-3h-6m-12 0V6.75m0 0a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3v3.75" />
      </svg>
    ),
  },
  {
    type: 'individual' as TemplateType,
    title: 'By Individual',
    description: 'Track per-person API usage and costs.',
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
      </svg>
    ),
  },
] as const;

// =============================================================================
// PROPS
// =============================================================================

type TemplateWizardViewProps = {
  step: number;
  totalSteps: number;
  templateType: TemplateType | null;
  groupNames: string[];
  assignments: Record<string, string[]>;
  credentials: CredentialWithProvider[];
  applying: boolean;
  onClose: () => void;
  onBack: () => void;
  onContinue: () => void;
  onSelectType: (type: TemplateType) => void;
  // Slots — containers for interactive sub-components
  pillInputSlot: React.ReactNode;
  credentialAssignerSlot: React.ReactNode;
};

// =============================================================================
// COMPONENT
// =============================================================================

export function TemplateWizardView({
  step,
  totalSteps,
  templateType,
  groupNames,
  assignments,
  credentials,
  applying,
  onClose,
  onBack,
  onContinue,
  onSelectType,
  pillInputSlot,
  credentialAssignerSlot,
}: TemplateWizardViewProps) {
  const canContinue = (() => {
    if (step === 1) return templateType !== null;
    if (step === 2) return groupNames.length > 0;
    return true;
  })();

  const totalGroupCount = groupNames.length;
  const assignedCount = Object.values(assignments).reduce((sum, ids) => sum + ids.length, 0);

  return (
    <>
      <style>{`
        @keyframes content-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
      <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-foreground/10 px-8 py-5">
        <div>
          <p className="text-xs font-medium text-foreground/50">
            Step {step} of {totalSteps}
          </p>
          <h2 className="text-lg font-semibold">Set Up Cost Attribution</h2>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1.5 text-foreground/50 hover:bg-foreground/5 hover:text-foreground"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Progress bar */}
      <div className="flex h-1 w-full">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={`flex-1 transition-colors duration-200 ${
              i < step ? 'bg-foreground' : 'bg-foreground/10'
            } ${i > 0 ? 'ml-0.5' : ''}`}
          />
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[720px] px-8 py-8">
          {/* ---------------------------------------------------------------- */}
          {/* STEP 1 — Choose Type                                              */}
          {/* ---------------------------------------------------------------- */}
          {step === 1 && (
            <div style={{ animation: 'content-fade 200ms ease-in-out' }}>
              <h3 className="mb-2 text-xl font-semibold">How do you want to track costs?</h3>
              <p className="mb-6 text-sm text-foreground/60">
                Choose the dimension that best fits your organization.
              </p>
              <div className="grid grid-cols-2 gap-4">
                {TEMPLATE_CARDS.map((card) => (
                  <button
                    key={card.type}
                    type="button"
                    onClick={() => onSelectType(card.type)}
                    className={`flex flex-col items-start gap-3 rounded-xl border p-6 text-left transition-all duration-150 hover:border-foreground/30 ${
                      templateType === card.type
                        ? 'border-foreground ring-2 ring-foreground'
                        : 'border-foreground/15'
                    }`}
                  >
                    <span className="text-foreground/60">{card.icon}</span>
                    <div>
                      <p className="font-semibold">{card.title}</p>
                      <p className="mt-0.5 text-sm text-foreground/60">{card.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* STEP 2 — Name Groups                                              */}
          {/* ---------------------------------------------------------------- */}
          {step === 2 && (
            <div style={{ animation: 'content-fade 200ms ease-in-out' }}>
              <h3 className="mb-2 text-xl font-semibold">Name your groups</h3>
              <p className="mb-6 text-sm text-foreground/60">
                Type a name and press Enter, comma, or Tab to add each group.
              </p>
              {pillInputSlot}
              <p className="mt-3 text-sm text-foreground/50">
                {totalGroupCount} group{totalGroupCount !== 1 ? 's' : ''} will be created
              </p>
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* STEP 3 — Assign Credentials                                       */}
          {/* ---------------------------------------------------------------- */}
          {step === 3 && (
            <div style={{ animation: 'content-fade 200ms ease-in-out' }}>
              <h3 className="mb-2 text-xl font-semibold">Assign credentials</h3>
              <p className="mb-6 text-sm text-foreground/60">
                Assign your API credentials to each group. Credentials drive cost attribution.
              </p>
              {credentialAssignerSlot}
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* STEP 4 — Preview                                                  */}
          {/* ---------------------------------------------------------------- */}
          {step === 4 && (
            <div style={{ animation: 'content-fade 200ms ease-in-out' }}>
              <h3 className="mb-2 text-xl font-semibold">Review your setup</h3>
              <p className="mb-6 text-sm text-foreground/60">
                These groups and rules will be created when you click Apply.
              </p>
              <div className="space-y-3">
                {groupNames.map((name) => {
                  const assignedCredIds = assignments[name] ?? [];
                  const assignedCreds = assignedCredIds
                    .map((id) => credentials.find((c) => c.id === id))
                    .filter(Boolean) as CredentialWithProvider[];

                  return (
                    <div
                      key={name}
                      className="rounded-lg border border-foreground/10 px-4 py-3"
                    >
                      <p className="font-medium">{name}</p>
                      {assignedCreds.length > 0 ? (
                        <p className="mt-1 text-sm text-foreground/60">
                          {assignedCreds.length} credential{assignedCreds.length !== 1 ? 's' : ''}:{' '}
                          {assignedCreds.map((c) => c.label).join(', ')}
                        </p>
                      ) : (
                        <p className="mt-1 text-sm text-foreground/40">No credentials assigned</p>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-sm text-foreground/50">
                {totalGroupCount} group{totalGroupCount !== 1 ? 's' : ''} · {assignedCount} credential rule
                {assignedCount !== 1 ? 's' : ''}
              </p>
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* STEP 5 — Apply                                                    */}
          {/* ---------------------------------------------------------------- */}
          {step === 5 && (
            <div
              className="flex flex-col items-center py-12 text-center"
              style={{ animation: 'content-fade 200ms ease-in-out' }}
            >
              <div className="mb-6 rounded-full bg-foreground/5 p-6">
                <svg className="h-10 w-10 text-foreground/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
              <h3 className="mb-2 text-xl font-semibold">Ready to apply</h3>
              <p className="mb-8 text-sm text-foreground/60">
                This will create {totalGroupCount} group{totalGroupCount !== 1 ? 's' : ''} with{' '}
                {assignedCount} credential rule{assignedCount !== 1 ? 's' : ''}.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-foreground/10 px-8 py-5">
        <button
          type="button"
          onClick={onBack}
          disabled={step === 1}
          className="rounded border border-foreground/15 px-4 py-2 text-sm font-medium text-foreground/70 hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Back
        </button>

        {step < totalSteps ? (
          <button
            type="button"
            onClick={onContinue}
            disabled={!canContinue}
            className="rounded bg-foreground px-5 py-2 text-sm font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            onClick={onContinue}
            disabled={applying}
            className="rounded bg-foreground px-5 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60"
          >
            {applying ? 'Creating…' : `Create ${totalGroupCount} group${totalGroupCount !== 1 ? 's' : ''}`}
          </button>
        )}
      </div>
    </div>
    </>
  );
}
