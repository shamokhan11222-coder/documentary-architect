import type { ReactNode } from "react";
import { Sparkles, Check } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import authIllustration from "@/assets/auth-illustration.jpg";

/** Luxury two-panel auth layout: floating illustration + glass modal. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  success,
  successText = "Success",
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
  success?: boolean;
  successText?: string;
}) {
  return (
    <div className="brand-gradient relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {/* Ambient glow blobs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-[float_7s_ease-in-out_infinite] absolute -top-24 -left-16 h-96 w-96 rounded-full bg-brand/20 blur-[120px]" />
        <div className="breathe absolute bottom-0 right-0 h-80 w-80 rounded-full bg-brand/15 blur-[120px]" />
      </div>

      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-border/50 shadow-[var(--shadow-float)] md:grid-cols-2">
        {/* Floating illustration panel */}
        <div className="relative hidden items-end overflow-hidden bg-[#0a1130] md:flex">
          <img
            src={authIllustration}
            alt="AI documentary studio"
            width={1024}
            height={1280}
            loading="lazy"
            className="animate-[float_8s_ease-in-out_infinite] absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a1130] via-transparent to-transparent" />
          <div className="relative z-10 p-10">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              Cinematic AI documentaries
            </span>
            <h2 className="mt-4 font-display text-3xl font-bold leading-tight text-white">
              Tell stories that move the world
            </h2>
            <p className="mt-2 max-w-sm text-sm text-white/70">
              Research, script, storyboard, voice, and export — an entire studio,
              powered by AI.
            </p>
          </div>
        </div>

        {/* Glass form panel */}
        <div className="glass-card relative flex flex-col justify-center rounded-none p-8 sm:p-10">
          {/* Animated success overlay */}
          {success && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 rounded-none bg-card/80 backdrop-blur-xl animate-[fade-in_0.25s_ease-out]">
              <div className="grid h-20 w-20 place-items-center rounded-full bg-brand/15 animate-[success-pop_0.5s_var(--ease-spring)_both]">
                <div className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-brand to-brand/70 shadow-[var(--shadow-glow)]">
                  <Check className="h-7 w-7 text-brand-foreground" strokeWidth={3} />
                </div>
              </div>
              <p className="font-display text-lg font-semibold">{successText}</p>
            </div>
          )}

          <div className="animate-[fade-up_0.5s_var(--ease-out-quint,ease-out)_both]">
            <LogoMark className="h-11 w-11" />
            <h1 className="mt-5 font-display text-2xl font-bold tracking-tight">
              {title}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>

            <div className="mt-7">{children}</div>

            {footer && <div className="mt-6">{footer}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
