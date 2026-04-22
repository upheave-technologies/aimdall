type AttributionsErrorViewProps = {
  message: string;
};

export function AttributionsErrorView({ message }: AttributionsErrorViewProps) {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-bold">Attributions</h1>
      <p className="mt-4 text-destructive">{message}</p>
    </main>
  );
}
