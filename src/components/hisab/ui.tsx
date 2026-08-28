import * as React from "react";
import { cn } from "@/lib/utils";
import { money, toBn } from "@/lib/hisab/format";

/* ============================ পৃষ্ঠ ============================ */

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.18)]",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/** বাঁ পাশে রঙিন দাগসহ শিরোনাম — রেফারেন্সের "Today's Figures" ধাঁচ */
export function SectionTitle({
  title,
  right,
  className,
}: {
  title: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 className="flex items-center gap-2.5 text-[15px] font-bold text-ink">
        <span className="hb-grad h-4 w-[3px] shrink-0 rounded-full" />
        {title}
      </h2>
      {right}
    </div>
  );
}

/* ============================ পরিসংখ্যান ============================ */

export type Tone = "sky" | "mint" | "amber" | "rose" | "violet" | "teal" | "slate";

const TONE_VAR: Record<Tone, string> = {
  sky: "var(--a-sky)",
  mint: "var(--a-mint)",
  amber: "var(--a-amber)",
  rose: "var(--a-rose)",
  violet: "var(--a-violet)",
  teal: "var(--a-teal)",
  slate: "var(--dim)",
};

export const toneColor = (tone: Tone) => TONE_VAR[tone];

/** রঙিন গোল-চৌকো আইকন — সাইডবার, দ্রুত কাজ আর স্ট্যাট কার্ড সবখানে */
export function IconTile({
  tone = "slate",
  size = 38,
  children,
  className,
}: {
  tone?: Tone;
  size?: number;
  children: React.ReactNode;
  className?: string;
}) {
  const c = TONE_VAR[tone];
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-xl", className)}
      style={{
        width: size,
        height: size,
        color: c,
        backgroundColor: `color-mix(in oklab, ${c} 15%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  sub,
  tone = "slate",
  icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: Tone;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("hb-card-glow rounded-2xl border border-line bg-card p-3.5", className)}
      style={{ "--tint": TONE_VAR[tone] } as React.CSSProperties}
    >
      <div className="relative flex items-center gap-2.5">
        {icon ? (
          <IconTile tone={tone} size={32}>
            {icon}
          </IconTile>
        ) : null}
        <span className="text-[12.5px] font-semibold text-dim">{label}</span>
      </div>
      <div className="relative mt-2 text-[22px] font-bold leading-tight tracking-tight text-ink">
        {value}
      </div>
      {sub ? <div className="relative mt-0.5 text-[11px] text-faint">{sub}</div> : null}
    </div>
  );
}

/** ছোট সারিবদ্ধ কার্ড — "This Month's Figures" ধাঁচ */
export function MiniStat({
  label,
  value,
  tone = "slate",
  icon,
}: {
  label: string;
  value: React.ReactNode;
  tone?: Tone;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className="hb-card-glow rounded-2xl border border-line bg-card p-3"
      style={{ "--tint": TONE_VAR[tone] } as React.CSSProperties}
    >
      <div className="relative flex items-center gap-2">
        {icon ? (
          <IconTile tone={tone} size={26}>
            {icon}
          </IconTile>
        ) : null}
        <span className="truncate text-[11.5px] font-semibold text-dim">{label}</span>
      </div>
      <div className="relative mt-1.5 text-[18px] font-bold tracking-tight text-ink">{value}</div>
    </div>
  );
}

export function Money({
  amount,
  className,
  signed,
}: {
  amount: number | string | null | undefined;
  className?: string;
  signed?: boolean;
}) {
  const n = Number(amount ?? 0);
  return (
    <span className={cn(signed && n < 0 && "text-rose", signed && n > 0 && "text-mint", className)}>
      {money(n)}
    </span>
  );
}

/* ============================ ব্যাজ ============================ */

export function Chip({
  children,
  color,
  className,
}: {
  children: React.ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        !color && "bg-card-2 text-dim",
        className,
      )}
      style={
        color
          ? { backgroundColor: `color-mix(in oklab, ${color} 16%, transparent)`, color }
          : undefined
      }
    >
      {children}
    </span>
  );
}

/* ============================ ফর্ম ============================ */

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 flex items-center gap-1 text-[12.5px] font-semibold text-dim">
        {label}
        {required ? <span className="text-rose">*</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-faint">{hint}</span> : null}
      {error ? <span className="mt-1 block text-[11px] text-rose">{error}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-line bg-card-2 px-3 py-2.5 text-[15px] text-ink outline-none " +
  "transition placeholder:text-faint focus:border-brand focus:ring-2 focus:ring-brand/25";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputClass, "min-h-20 resize-y", props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(inputClass, "appearance-none pr-8", props.className)} />;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost" | "danger" | "success" | "soft";
  size?: "sm" | "md" | "lg";
}) {
  const variants: Record<string, string> = {
    primary: "hb-grad text-white shadow-lg shadow-brand/20 hover:opacity-90",
    soft: "bg-card-2 text-ink hover:brightness-125",
    outline: "border border-line bg-card text-ink hover:bg-card-2",
    ghost: "text-dim hover:bg-card-2 hover:text-ink",
    danger: "bg-rose text-white hover:opacity-90",
    success: "bg-mint text-white hover:opacity-90",
  };
  const sizes = {
    sm: "px-2.5 py-1.5 text-[12px]",
    md: "px-4 py-2.5 text-[13.5px]",
    lg: "px-5 py-3 text-[15px]",
  }[size];

  return (
    <button
      {...rest}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes,
        className,
      )}
    />
  );
}

/** গোল টগল বোতাম — ৭ দিন / ৩০ দিন ধাঁচ */
export function Pill({
  active,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      {...rest}
      className={cn(
        "shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-bold transition",
        active ? "hb-grad text-white" : "bg-card-2 text-dim hover:text-ink",
        className,
      )}
    />
  );
}

/* ============================ অবস্থা ============================ */

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "h-5 w-5 animate-spin rounded-full border-2 border-line border-t-brand",
        className,
      )}
    />
  );
}

export function Loading({ label = "লোড হচ্ছে…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2.5 py-12 text-sm text-dim">
      <Spinner />
      {label}
    </div>
  );
}

export function Empty({
  icon,
  title,
  hint,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed border-line px-6 py-14 text-center">
      {icon ? <div className="text-faint">{icon}</div> : null}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {hint ? <p className="max-w-xs text-xs text-dim">{hint}</p> : null}
      {action}
    </div>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="rounded-xl border border-rose/30 bg-rose/10 px-3 py-2.5 text-[13px] text-rose">
      {children}
    </div>
  );
}

export function WarnNote({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="rounded-xl border border-amber/30 bg-amber/10 px-3 py-2.5 text-[13px] text-amber">
      {children}
    </div>
  );
}

/* ============================ অন্যান্য ============================ */

const AVATAR_TONES = [
  "var(--a-sky)",
  "var(--a-mint)",
  "var(--a-violet)",
  "var(--a-amber)",
  "var(--a-teal)",
  "var(--a-rose)",
];

export function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 997;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const c = avatarColor(name);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-xl font-bold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        color: c,
        backgroundColor: `color-mix(in oklab, ${c} 18%, transparent)`,
      }}
      title={name}
    >
      {(name || "?").slice(0, 1)}
    </span>
  );
}

export function Count({ value }: { value: number }) {
  return <span className="tabular-nums">{toBn(value)}</span>;
}

/** চার্টের টুলটিপ — সব চার্টে এক চেহারা */
export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; dataKey?: string }[];
  label?: string | number;
  formatter?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const fmt = formatter ?? ((v: number) => money(v));

  return (
    <div className="rounded-xl border border-line bg-card px-3 py-2 shadow-xl">
      {label != null ? <p className="mb-1 text-[11px] font-semibold text-dim">{label}</p> : null}
      {payload.map((row) => (
        <p key={row.dataKey ?? row.name} className="flex items-center gap-2 text-[12px]">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
          <span className="text-dim">{row.name}</span>
          <span className="ml-auto font-bold text-ink">{fmt(Number(row.value ?? 0))}</span>
        </p>
      ))}
    </div>
  );
}
