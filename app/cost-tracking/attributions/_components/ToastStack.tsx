import type { Toast } from './_types';

// =============================================================================
// PROPS
// =============================================================================

type ToastStackProps = {
  toasts: Toast[];
  onRemove: (id: string) => void;
};

// =============================================================================
// COMPONENT
// =============================================================================

export function ToastStack({ toasts, onRemove }: ToastStackProps) {
  if (toasts.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(1rem); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            style={{ animation: 'slide-up 250ms ease-out' }}
            className={`rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
              toast.type === 'success'
                ? 'bg-emerald-600 text-white'
                : toast.type === 'error'
                  ? 'bg-red-600 text-white'
                  : 'bg-foreground text-background'
            }`}
          >
            <div className="flex items-center gap-2">
              <span>{toast.message}</span>
              <button
                onClick={() => onRemove(toast.id)}
                className="ml-2 opacity-70 hover:opacity-100"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
