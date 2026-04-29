type AttributionsErrorViewProps = {
  message: string;
};

export function AttributionsErrorView({ message }: AttributionsErrorViewProps) {
  return (
    <div>
      <h1 className="text-2xl font-bold">Attributions</h1>
      <p className="mt-4 text-destructive">{message}</p>
    </div>
  );
}
