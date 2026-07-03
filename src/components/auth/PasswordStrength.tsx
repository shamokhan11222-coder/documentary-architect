export function scorePassword(pw: string): number {
  let s = 0;
  if (!pw) return 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}

const LABELS = ["Too weak", "Weak", "Fair", "Good", "Strong"];
const COLORS = ["bg-destructive", "bg-destructive", "bg-amber-500", "bg-brand/70", "bg-brand"];

export function PasswordStrength({ password }: { password: string }) {
  const score = scorePassword(password);
  if (!password) return null;
  return (
    <div className="animate-[fade-in_0.2s_ease-out]">
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
              i < score ? COLORS[score] : "bg-muted"
            }`}
          />
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Password strength: <span className="font-medium text-foreground">{LABELS[score]}</span>
      </p>
    </div>
  );
}
