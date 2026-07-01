export function Score({ label, value }: { label: string; value: number }) {
  const tone =
    value >= 8
      ? "text-green-600"
      : value >= 5
        ? "text-amber-600"
        : "text-red-600";
  return (
    <span className="inline-flex items-baseline gap-1 rounded bg-muted px-2 py-0.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold ${tone}`}>{value}/10</span>
    </span>
  );
}

export function Meta({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 rounded bg-muted px-2 py-0.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </span>
  );
}