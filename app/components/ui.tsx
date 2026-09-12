import type { ReactNode } from "react";

export type TierName = "Bronze" | "Silver" | "Gold" | "Platinum";

const TIER_DOT: Record<TierName, string> = {
  Bronze: "bg-bronze",
  Silver: "bg-silver",
  Gold: "bg-gold",
  Platinum: "bg-platinum",
};

export function Card({
  children,
  className = "",
  dark = false,
}: {
  children: ReactNode;
  className?: string;
  dark?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border ${
        dark
          ? "border-line-dark bg-ink-soft text-paper"
          : "border-line bg-card text-ink"
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionHeading({
  kicker,
  title,
  lede,
  dark = false,
}: {
  kicker: string;
  title: string;
  lede?: string;
  dark?: boolean;
}) {
  return (
    <div className="max-w-2xl">
      <p
        className={`font-mono text-[12px] uppercase tracking-[0.18em] ${
          dark ? "text-gold" : "text-gold-deep"
        }`}
      >
        {kicker}
      </p>
      <h2
        className={`mt-2 font-display text-4xl font-semibold tracking-tight sm:text-[2.75rem] sm:leading-[1.1] ${
          dark ? "text-paper" : "text-ink"
        }`}
      >
        {title}
      </h2>
      {lede ? (
        <p className={`mt-3 text-base leading-relaxed ${dark ? "text-paper/70" : "text-muted"}`}>
          {lede}
        </p>
      ) : null}
    </div>
  );
}

// Pulsing stand-in for loading content. Takes sizing via className.
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block animate-pulse rounded-md bg-line motion-reduce:animate-none ${className}`}
    />
  );
}

export function Stat({
  label,
  value,
  sub,
  dark = false,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  dark?: boolean;
}) {
  return (
    <div>
      <p className={`font-mono text-[12px] uppercase tracking-[0.14em] ${dark ? "text-paper/50" : "text-faint"}`}>
        {label}
      </p>
      <p className={`tabular mt-1 font-mono text-[1.7rem] font-semibold ${dark ? "text-paper" : "text-ink"}`}>
        {value}
      </p>
      {sub ? (
        <p className={`mt-1 text-[14px] ${dark ? "text-paper/60" : "text-muted"}`}>{sub}</p>
      ) : null}
    </div>
  );
}

export function TierBadge({ tier, size = "md" }: { tier: TierName; size?: "sm" | "md" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-line bg-paper font-medium text-ink ${
        size === "sm" ? "px-2.5 py-0.5 text-[12px]" : "px-3 py-1 text-[13px]"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${TIER_DOT[tier]}`} aria-hidden />
      {tier}
    </span>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-faint bg-paper px-5 py-8">
      <p className="font-mono text-[12px] uppercase tracking-[0.18em] text-faint">
        Awaiting data
      </p>
      <p className="text-lg font-semibold tracking-tight">{title}</p>
      <p className="max-w-md text-[14px] leading-relaxed text-muted">{body}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[12px] text-muted">{hint}</span> : null}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-line bg-paper px-3 py-2 font-mono text-[14px] text-ink placeholder:text-faint focus:border-gold focus:outline-none ${
        props.className ?? ""
      }`}
    />
  );
}

export function Btn({
  children,
  variant = "primary",
  ...props
}: {
  children: ReactNode;
  variant?: "primary" | "ink" | "ghost";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles =
    variant === "primary"
      ? "bg-gold text-ink hover:bg-gold-deep hover:text-paper"
      : variant === "ink"
        ? "bg-ink text-paper hover:bg-ink-soft"
        : "border border-line bg-transparent text-ink hover:bg-parchment";
  return (
    <button
      {...props}
      className={`rounded-lg px-4 py-2 text-[14px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${
        props.className ?? ""
      }`}
    >
      {children}
    </button>
  );
}

// Score dial. Takes score/max, returns the solid-ink dial with gold arc.
export function ScoreDial({ score, max = 900 }: { score: number; max?: number }) {
  const frac = Math.max(0, Math.min(1, score / max));
  const arc = (frac * 578).toFixed(0);
  return (
    <svg viewBox="0 0 400 400" className="h-auto w-full" role="img" aria-label={`Score ${score} of ${max}`}>
      <circle cx="200" cy="180" r="92" fill="none" stroke="#3a342b" strokeWidth="14" />
      <circle
        cx="200"
        cy="180"
        r="92"
        fill="none"
        stroke="#B3872A"
        strokeWidth="14"
        strokeLinecap="round"
        strokeDasharray={`${arc} 578`}
        transform="rotate(-90 200 180)"
      />
      <text x="200" y="176" textAnchor="middle" fontSize="54" fontWeight="700" fill="#F4EFE5" fontFamily="ui-monospace, monospace">
        {score}
      </text>
      <text x="200" y="206" textAnchor="middle" fontSize="13" fill="#a89c86" fontFamily="ui-monospace, monospace">
        / {max}
      </text>
    </svg>
  );
}
