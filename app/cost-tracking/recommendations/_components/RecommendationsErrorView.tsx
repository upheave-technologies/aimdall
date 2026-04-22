type RecommendationsErrorViewProps = {
  message: string;
};

export function RecommendationsErrorView({ message }: RecommendationsErrorViewProps) {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-bold">Recommendations</h1>
      <p className="mt-4 text-red-500">Failed to load recommendations: {message}</p>
    </main>
  );
}
