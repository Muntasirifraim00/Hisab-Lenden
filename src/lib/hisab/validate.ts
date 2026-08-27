/**
 * সেভ করার আগে সাতটা পরীক্ষা।
 *
 * "block" = আটকে দেয়, "warn" = সতর্ক করে কিন্তু এগোনো যায়।
 * (মেমো নম্বরের ডুপ্লিকেট ডেটাবেস নিজেই আটকায় — সেটা এখানে নেই।)
 */
import { money, num, todayISO } from "./format";
import type { Invoice, NewInvoiceInput, Product } from "./types";

export type Check = { level: "block" | "warn"; message: string };

export function runChecks(
  input: NewInvoiceInput,
  context: { recent: Invoice[]; products: Product[] },
): Check[] {
  const out: Check[] = [];
  const total = num(input.total_amount);

  // ১. ভবিষ্যতের তারিখ
  if (input.invoice_date > todayISO()) {
    out.push({ level: "block", message: "ভবিষ্যতের তারিখে হিসাব লেখা যায় না।" });
  }

  // ২. ছবি নেই, কারণও লেখেননি
  if (!input.image_url && (input.no_image_reason ?? "").trim().length < 3) {
    out.push({
      level: "block",
      message: "ছবি নেই — কেন নেই সেটা অন্তত তিন অক্ষরে লিখুন।",
    });
  }

  if (total <= 0) {
    out.push({ level: "block", message: "মোট টাকার অঙ্ক শূন্যের বেশি হতে হবে।" });
  }

  if (input.type !== "expense" && !(input.party_name ?? "").trim()) {
    out.push({ level: "warn", message: "পার্টির নাম লেখা নেই — পরে খুঁজে পেতে অসুবিধা হবে।" });
  }

  // ৩. বিক্রয় কিন্তু পণ্যের ক্রয়মূল্য নেই
  if (input.type === "sale") {
    const missing = (input.items ?? [])
      .filter((it) => it.product_id)
      .filter((it) => {
        const p = context.products.find((x) => x.id === it.product_id);
        return !p || p.cost_price == null || num(p.cost_price) <= 0;
      })
      .map((it) => it.product_name);

    if (missing.length) {
      out.push({
        level: "warn",
        message: `ক্রয়মূল্য নির্ধারণ করা নেই: ${missing.join(", ")} — লাভের হিসাব ভুল হতে পারে।`,
      });
    }
  }

  // ৪. একই তারিখ + টাকা + পার্টি আগে আছে?
  const party = (input.party_name ?? "").trim().toLowerCase();
  const dup = context.recent.find(
    (r) =>
      r.invoice_date === input.invoice_date &&
      Math.abs(num(r.total_amount) - total) < 0.01 &&
      (r.party_name ?? "").trim().toLowerCase() === party &&
      r.type === input.type,
  );
  if (dup) {
    out.push({
      level: "warn",
      message: "ডুপ্লিকেট হতে পারে — একই তারিখ, একই অঙ্ক ও একই পার্টির হিসাব আগেই আছে।",
    });
  }

  // ৫. অঙ্কটা গড়ের ৫ গুণের বেশি?
  const sameType = context.recent.filter((r) => r.type === input.type && !r.is_reversal);
  if (sameType.length >= 5) {
    const avg = sameType.reduce((s, r) => s + num(r.total_amount), 0) / sameType.length;
    if (avg > 0 && total > avg * 5) {
      out.push({
        level: "warn",
        message: `অস্বাভাবিক বড় অঙ্ক — সাধারণত গড়ে ${money(avg)}। ঠিক আছে?`,
      });
    }
  }

  // ৬. পণ্যের সারির যোগফল মোট অঙ্কের সাথে মেলে?
  const itemSum = (input.items ?? []).reduce((s, it) => s + num(it.line_total), 0);
  if (itemSum > 0 && Math.abs(itemSum - total) > 0.5) {
    out.push({
      level: "warn",
      message: `পণ্যের সারির যোগফল ${money(itemSum)}, কিন্তু মোট লিখেছেন ${money(total)}।`,
    });
  }

  // ৭. পরিশোধ > মোট বিল (সেভ করার সময় নিজে থেকেই সীমাবদ্ধ হবে)
  if (!input.nothing_paid && num(input.paid_amount) > total) {
    out.push({
      level: "warn",
      message: "পরিশোধ মোট বিলের চেয়ে বেশি — সেভ করার সময় মোট বিলে সীমাবদ্ধ হবে।",
    });
  }

  return out;
}

/** পরিশোধের নিয়ম — ফর্মে দেখানোর জন্য (ডেটাবেসেও একই হিসাব হয়) */
export function effectivePaid(
  total: number,
  paid: number | null | undefined,
  nothingPaid: boolean,
) {
  if (nothingPaid) return 0;
  const p = num(paid);
  if (p === 0) return num(total); // কিছু না লিখলে "সব দেওয়া হয়ে গেছে"
  return Math.min(p, num(total));
}
