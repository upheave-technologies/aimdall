import { NavigationContainer } from './_containers/NavigationContainer';

export default function CostTrackingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <NavigationContainer />
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </div>
  );
}
