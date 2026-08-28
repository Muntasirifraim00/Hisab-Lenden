/**
 * চার্টের রঙ — CSS টোকেন থেকে পড়া হয়, যাতে থিম বদলালে চার্টও বদলায়।
 * সারিগুলোর রঙ dataviz-এর যাচাই করা প্যালেট (দুই মোডেই পাস)।
 */
export type ChartColors = {
  s1: string;
  s2: string;
  s3: string;
  grid: string;
  dim: string;
  card: string;
  line: string;
  ink: string;
};

const FALLBACK: ChartColors = {
  s1: "#3987e5",
  s2: "#d95926",
  s3: "#199e70",
  grid: "rgba(255,255,255,0.07)",
  dim: "#949ab6",
  card: "#121729",
  line: "rgba(255,255,255,0.07)",
  ink: "#e7e9f5",
};

export function readChartColors(): ChartColors {
  if (typeof window === "undefined") return FALLBACK;
  const s = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;

  return {
    s1: get("--s1", FALLBACK.s1),
    s2: get("--s2", FALLBACK.s2),
    s3: get("--s3", FALLBACK.s3),
    grid: get("--grid", FALLBACK.grid),
    dim: get("--dim", FALLBACK.dim),
    card: get("--card", FALLBACK.card),
    line: get("--line", FALLBACK.line),
    ink: get("--ink", FALLBACK.ink),
  };
}
