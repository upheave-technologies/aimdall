import { NavigationContainer } from './_containers/NavigationContainer';
import { ToastProvider } from './_containers/ToastProvider';

export default function CostTrackingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <div className="flex min-h-screen">
        <NavigationContainer />
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </div>
    </ToastProvider>
  );
}
