/**
 * বাংলা সংখ্যা, টাকা ও তারিখ ফরম্যাট।
 */

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

export const toBn = (input: string | number) =>
  String(input).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);

export const fromBn = (input: string) =>
  input.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));

/** ভারতীয় রীতিতে কমা: ১২,৩৪,৫৬৭ */
function groupIndian(value: string) {
  const [whole, frac] = value.split(".");
  const neg = whole.startsWith("-");
  const digits = neg ? whole.slice(1) : whole;
  let out: string;
  if (digits.length <= 3) {
    out = digits;
  } else {
    const last3 = digits.slice(-3);
    const rest = digits.slice(0, -3);
    out = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
  }
  return (neg ? "-" : "") + out + (frac ? "." + frac : "");
}

export function money(amount: number | string | null | undefined, opts?: { bn?: boolean }) {
  const n = Number(amount ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  const text = groupIndian(Math.abs(safe).toFixed(2));
  const sign = safe < 0 ? "-" : "";
  return `${sign}৳${opts?.bn === false ? text : toBn(text)}`;
}

/** পরিমাণ — অপ্রয়োজনীয় শূন্য বাদ দিয়ে */
export function qtyText(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  const text = String(Math.round(safe * 1000) / 1000);
  return toBn(groupIndian(text));
}

export const num = (value: number | string | null | undefined) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const BN_MONTHS = [
  "জানুয়ারি",
  "ফেব্রুয়ারি",
  "মার্চ",
  "এপ্রিল",
  "মে",
  "জুন",
  "জুলাই",
  "আগস্ট",
  "সেপ্টেম্বর",
  "অক্টোবর",
  "নভেম্বর",
  "ডিসেম্বর",
];

const BN_DAYS = ["রবি", "সোম", "মঙ্গল", "বুধ", "বৃহস্পতি", "শুক্র", "শনি"];

function parseDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** ১৬ আগস্ট ২০২৬ */
export function bnDate(value: string | Date | null | undefined) {
  const d = parseDate(value);
  if (!d) return "—";
  return `${toBn(d.getDate())} ${BN_MONTHS[d.getMonth()]} ${toBn(d.getFullYear())}`;
}

/** ১৬ আগস্ট, শনিবার */
export function bnDateLong(value: string | Date | null | undefined) {
  const d = parseDate(value);
  if (!d) return "—";
  return `${toBn(d.getDate())} ${BN_MONTHS[d.getMonth()]} ${toBn(d.getFullYear())}, ${BN_DAYS[d.getDay()]}বার`;
}

export function bnDateTime(value: string | Date | null | undefined) {
  const d = parseDate(value);
  if (!d) return "—";
  const h = d.getHours();
  const suffix = h < 6 ? "রাত" : h < 12 ? "সকাল" : h < 16 ? "দুপুর" : h < 19 ? "বিকাল" : "রাত";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${bnDate(d)}, ${suffix} ${toBn(h12)}:${toBn(mm)}`;
}

export const bnMonthName = (monthIndex: number) => BN_MONTHS[monthIndex] ?? "";

/** আজকের তারিখ YYYY-MM-DD (স্থানীয় সময় ধরে, UTC নয়) */
export function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
}

export function daysBetween(from: string | Date, to: string | Date = new Date()) {
  const a = parseDate(from);
  const b = parseDate(to);
  if (!a || !b) return 0;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

export function addDaysISO(days: number, base = new Date()) {
  const d = new Date(base.getTime() + days * 86_400_000);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
}
