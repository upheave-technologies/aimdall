import { Suspense } from 'react';
import { NavigationContainer } from './_containers/NavigationContainer';
import { ToastProvider } from './_containers/ToastProvider';
import { PeriodSelector, PeriodSelectorSkeleton } from './_components/PeriodSelector';

export default function CostTrackingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <div className="flex h-screen">
        {/* NavigationContainer reads useSearchParams — requires Suspense boundary */}
        <Suspense>
          <NavigationContainer />
        </Suspense>
        <div className="flex flex-col flex-1 overflow-hidden">
          <div data-period-selector-bar>
            {/* PeriodSelector embeds a client island that reads useSearchParams */}
            <Suspense fallback={<PeriodSelectorSkeleton />}>
              <PeriodSelector />
            </Suspense>
          </div>
          <div className="flex-1 overflow-auto">
            <main className="mx-auto w-full max-w-7xl px-6 py-6 sm:px-8 sm:py-8">
              {children}
            </main>
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
