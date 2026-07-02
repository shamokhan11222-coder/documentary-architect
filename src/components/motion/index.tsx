import {
  useEffect,
  useRef,
  useState,
  type ElementType,
  type ReactNode,
} from "react";
import { cn } from "../../lib/utils";

/* --------------------------------------------------------------------------
 * Motion design system — buttery-smooth, GPU-accelerated primitives.
 * All animations use transform/opacity only and respect reduced-motion via CSS.
 * ------------------------------------------------------------------------ */

/** Page transition wrapper — remounts on route key for a soft fade+rise. */
export function PageTransition({
  routeKey,
  children,
  className,
}: {
  routeKey: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      key={routeKey}
      className={cn("motion-page will-change-[transform,opacity]", className)}
      style={{ animation: "var(--animate-page-in)" }}
    >
      {children}
    </div>
  );
}

/** Reveal on scroll — fades child up when it enters the viewport (lazy). */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: ElementType;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      className={cn(
        "transition-all duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)] will-change-[transform,opacity]",
        shown ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
        className,
      )}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}

/** Fade/blur-in image once loaded. */
export function FadeImage({
  src,
  alt,
  className,
  ...rest
}: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img
      {...rest}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onLoad={() => setLoaded(true)}
      className={cn(
        "transition-[opacity,filter,transform] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]",
        loaded
          ? "opacity-100 blur-0 scale-100"
          : "opacity-0 blur-md scale-[1.02]",
        className,
      )}
    />
  );
}

/** Animated number counter with easing. */
export function AnimatedNumber({
  value,
  duration = 900,
  decimals = 0,
  className,
  format,
}: {
  value: number;
  duration?: number;
  decimals?: number;
  className?: string;
  format?: (n: number) => string;
}) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(from + (value - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  const rounded = Number(display.toFixed(decimals));
  return (
    <span className={cn("tabular-nums", className)}>
      {format ? format(rounded) : rounded.toLocaleString()}
    </span>
  );
}

/** Typewriter text. */
export function Typewriter({
  text,
  speed = 26,
  className,
  caret = true,
}: {
  text: string;
  speed?: number;
  className?: string;
  caret?: boolean;
}) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setN(i);
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);
  return (
    <span className={className}>
      {text.slice(0, n)}
      {caret && (
        <span
          className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] bg-current align-middle"
          style={{ animation: "var(--animate-caret)" }}
        />
      )}
    </span>
  );
}

/** AI thinking dots. */
export function AIThinking({
  label = "Thinking",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-muted-foreground", className)}>
      <span className="text-sm">{label}</span>
      <span className="flex items-end gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-brand"
            style={{
              animation: "var(--animate-thinking)",
              animationDelay: `${i * 0.16}s`,
            }}
          />
        ))}
      </span>
    </span>
  );
}

/** Audio-style wave bars (e.g. voice / processing). */
export function WaveBars({
  bars = 5,
  className,
}: {
  bars?: number;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-[3px]", className)}>
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className="w-[3px] origin-bottom rounded-full bg-brand"
          style={{
            height: "18px",
            animation: "var(--animate-wave)",
            animationDelay: `${(i % bars) * 0.12}s`,
          }}
        />
      ))}
    </span>
  );
}

/** Indeterminate progress bar. */
export function IndeterminateBar({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative block h-1 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
    >
      <span
        className="absolute inset-y-0 left-0 w-full rounded-full bg-brand"
        style={{ animation: "var(--animate-progress-indeterminate)" }}
      />
    </span>
  );
}

/** Animated success check mark. */
export function SuccessCheck({
  size = 44,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex", className)}
      style={{ animation: "var(--animate-success-pop)" }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
      >
        <circle cx="12" cy="12" r="11" className="fill-brand/12 stroke-brand" strokeWidth="1.5" />
        <path
          d="M7 12.5l3.2 3.2L17 8.5"
          className="stroke-brand"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            strokeDasharray: 26,
            animation: "draw-check 0.5s 0.15s cubic-bezier(0.16,1,0.3,1) both",
          }}
        />
      </svg>
    </span>
  );
}

/** Error shake wrapper — bumps `trigger` to replay. */
export function ErrorShake({
  trigger,
  children,
  className,
}: {
  trigger: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      key={trigger}
      className={className}
      style={trigger ? { animation: "var(--animate-error-shake)" } : undefined}
    >
      {children}
    </div>
  );
}

/** Floating element wrapper. */
export function Floating({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("float will-change-transform", className)}>{children}</div>
  );
}

/** Shimmer skeleton block. */
export function ShimmerBlock({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-xl", className)} />;
}