import * as React from "react";
import { cn } from "@/lib/utils";
import { money, toBn } from "@/lib/hisab/format";

/* ------------------------------ কার্ড ------------------------------ */

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm",
        "dark:border-slate-800 dark:bg-slate-900",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

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
      <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h2>
      {right}
    </div>
  );
}

/* ------------------------------ পরিসংখ্যান ------------------------------ */

export function StatTile({
  label,
  value,
  sub,
  tone = "slate",
  icon,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: "blue" | "green" | "orange" | "purple" | "red" | "slate";
  icon?: React.ReactNode;
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
    green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    orange: "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
    purple: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
    red: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
    slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  }[tone];

  return (
    <div className={cn("rounded-xl p-3", tones)}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-semibold opacity-90">{label}</span>
        {icon ? <span className="opacity-70">{icon}</span> : null}
      </div>
      <div className="mt-1.5 text-xl font-bold tracking-tight">{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] opacity-70">{sub}</div> : null}
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
    <span
      className={cn(
        signed && n < 0 && "text-rose-600 dark:text-rose-400",
        signed && n > 0 && "text-emerald-600 dark:text-emerald-400",
        className,
      )}
    >
      {money(n)}
    </span>
  );
}

/* ------------------------------ ব্যাজ ------------------------------ */

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
        !color && "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
        className,
      )}
      style={color ? { backgroundColor: `${color}1a`, color } : undefined}
    >
      {children}
    </span>
  );
}

/* ------------------------------ ফর্ম ------------------------------ */

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
      <span className="mb-1 flex items-center gap-1 text-[13px] font-semibold text-slate-700 dark:text-slate-300">
        {label}
        {required ? <span className="text-rose-500">*</span> : null}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">{hint}</span>
      ) : null}
      {error ? <span className="mt-1 block text-[11px] text-rose-600">{error}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[15px] text-slate-900 " +
  "outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 " +
  "dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600";

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
  variant?: "primary" | "outline" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "lg";
}) {
  const variants = {
    primary: "bg-blue-700 text-white hover:bg-blue-800 disabled:bg-blue-700/50",
    outline:
      "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800",
    ghost: "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
    danger: "bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-600/50",
    success: "bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-600/50",
  }[variant];

  const sizes = {
    sm: "px-2.5 py-1.5 text-[12px]",
    md: "px-4 py-2.5 text-[14px]",
    lg: "px-5 py-3 text-[15px]",
  }[size];

  return (
    <button
      {...rest}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition",
        "disabled:cursor-not-allowed disabled:opacity-60",
        variants,
        sizes,
        className,
      )}
    />
  );
}

/* ------------------------------ অবস্থা ------------------------------ */

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600",
        className,
      )}
    />
  );
}

export function Loading({ label = "লোড হচ্ছে…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
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
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 px-6 py-12 text-center dark:border-slate-700">
      {icon ? <div className="text-slate-400">{icon}</div> : null}
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</p>
      {hint ? <p className="max-w-xs text-xs text-slate-500">{hint}</p> : null}
      {action}
    </div>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
      {children}
    </div>
  );
}

/* ------------------------------ অন্যান্য ------------------------------ */

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initial = (name || "?").slice(0, 1);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        backgroundColor: userTint(name),
      }}
      title={name}
    >
      {initial}
    </span>
  );
}

function userTint(name: string) {
  // constants থেকে আলাদা রাখা হয়েছে যাতে অচেনা নামেও একটা স্থির রঙ পড়ে
  const palette = ["#2563eb", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#db2777"];
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 997;
  return palette[hash % palette.length];
}

export function ProgressBar({
  value,
  max,
  tone = "blue",
}: {
  value: number;
  max: number;
  tone?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, backgroundColor: tone }}
      />
    </div>
  );
}

export function Count({ value }: { value: number }) {
  return <span className="tabular-nums">{toBn(value)}</span>;
}
