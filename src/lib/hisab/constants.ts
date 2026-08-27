/**
 * হিসাব — স্থির তথ্য: ব্যবহারকারী, ধরন, একক, খরচের খাত।
 */

export const HISAB_USERS = [
  { name: "ISMAIL", color: "#2563eb", ring: "ring-blue-500" },
  { name: "KHOKA", color: "#16a34a", ring: "ring-green-500" },
  { name: "MUNTSIR", color: "#9333ea", ring: "ring-purple-500" },
  { name: "RUBEL", color: "#ea580c", ring: "ring-orange-500" },
  { name: "SHOWKOT", color: "#0891b2", ring: "ring-cyan-500" },
  { name: "TASLIM", color: "#db2777", ring: "ring-pink-500" },
] as const;

export type HisabUserName = (typeof HISAB_USERS)[number]["name"];

/** ব্যবহারকারীর নাম → লগইন ইমেইল। সাইনআপ নেই, নাম বাছাই। */
export const AUTH_DOMAIN = "hisab.local";
export const emailForUser = (name: string) => `${name.toLowerCase()}@${AUTH_DOMAIN}`;

export const userColor = (name?: string | null) =>
  HISAB_USERS.find((u) => u.name === (name ?? "").toUpperCase())?.color ?? "#64748b";

export type InvoiceType = "expense" | "purchase" | "sale";

export const INVOICE_TYPES: {
  value: InvoiceType;
  label: string;
  hint: string;
  color: string;
  bg: string;
}[] = [
  {
    value: "expense",
    label: "খরচ",
    hint: "দোকান ভাড়া, বিল, যাতায়াত",
    color: "#ea580c",
    bg: "bg-orange-50 dark:bg-orange-950/30",
  },
  {
    value: "purchase",
    label: "ক্রয়",
    hint: "মালামাল কেনা — স্টক বাড়ে",
    color: "#16a34a",
    bg: "bg-green-50 dark:bg-green-950/30",
  },
  {
    value: "sale",
    label: "বিক্রয়",
    hint: "মালামাল বিক্রি — স্টক কমে, লাভ হিসাব হয়",
    color: "#2563eb",
    bg: "bg-blue-50 dark:bg-blue-950/30",
  },
];

export const typeLabel = (t: string) => INVOICE_TYPES.find((x) => x.value === t)?.label ?? t;

export const typeColor = (t: string) =>
  INVOICE_TYPES.find((x) => x.value === t)?.color ?? "#64748b";

export type PaymentMethod = "cash" | "mobile" | "bank" | "cheque" | "other";

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "নগদ" },
  { value: "mobile", label: "বিকাশ / নগদ অ্যাপ" },
  { value: "bank", label: "ব্যাংক" },
  { value: "cheque", label: "চেক" },
  { value: "other", label: "অন্যান্য" },
];

export const methodLabel = (m: string) => PAYMENT_METHODS.find((x) => x.value === m)?.label ?? m;

export const UNITS = [
  { value: "pcs", label: "পিস" },
  { value: "carton", label: "কার্টন" },
  { value: "litre", label: "লিটার" },
  { value: "kg", label: "কেজি" },
  { value: "sack", label: "বস্তা" },
];

export const unitLabel = (u: string) => UNITS.find((x) => x.value === u)?.label ?? u;

/** খরচের চেনা খাত — ফর্মে দ্রুত বাছাইয়ের জন্য */
export const EXPENSE_HEADS = [
  "দোকান ভাড়া",
  "বিদ্যুৎ বিল",
  "যাতায়াত",
  "ব্যাংক চার্জ",
  "কর্মচারীর বেতন",
  "খাওয়া-দাওয়া",
  "মেরামত",
  "মোবাইল / ইন্টারনেট",
  "অন্যান্য",
];

export const GOODS_STATUS: Record<string, { label: string; color: string }> = {
  n_a: { label: "—", color: "#94a3b8" },
  pending: { label: "মাল অপেক্ষমাণ", color: "#ea580c" },
  partial: { label: "আংশিক পেয়েছি", color: "#ca8a04" },
  received: { label: "পুরো পেয়েছি", color: "#16a34a" },
};

export const STOCK_REASONS: Record<string, string> = {
  purchase: "ক্রয়",
  sale: "বিক্রয়",
  opening: "ওপেনিং স্টক",
  receipt: "মাল বুঝে পাওয়া",
  reversal: "বাতিল / সংশোধনী",
};
