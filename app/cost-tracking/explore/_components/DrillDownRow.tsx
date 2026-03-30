type DrillDownRowProps = {
  groupKey: string;
  isClickable: boolean;
  onClick: () => void;
  children: React.ReactNode;
};

export function DrillDownRow({ isClickable, onClick, children }: DrillDownRowProps) {
  if (!isClickable) {
    return <tr>{children}</tr>;
  }

  return (
    <tr
      onClick={onClick}
      className="cursor-pointer transition-colors hover:bg-foreground/5"
    >
      {children}
    </tr>
  );
}
