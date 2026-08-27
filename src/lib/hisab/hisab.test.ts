import { describe, expect, it } from "vitest";
import { bnDate, money, qtyText, toBn, fromBn, num } from "./format";
import { effectivePaid, runChecks } from "./validate";
import type { Invoice, NewInvoiceInput, Product } from "./types";

describe("বাংলা ফরম্যাট", () => {
  it("সংখ্যা বাংলায় বদলায়", () => {
    expect(toBn(2026)).toBe("২০২৬");
    expect(fromBn("২০২৬")).toBe("2026");
  });

  it("টাকা ভারতীয় রীতিতে কমা বসায়", () => {
    expect(money(6145)).toBe("৳৬,১৪৫.০০");
    expect(money(1234567.5)).toBe("৳১২,৩৪,৫৬৭.৫০");
    expect(money(44)).toBe("৳৪৪.০০");
  });

  it("ঋণাত্মক অঙ্কে চিহ্ন আগে বসে", () => {
    expect(money(-2101)).toBe("-৳২,১০১.০০");
  });

  it("পরিমাণে অপ্রয়োজনীয় শূন্য থাকে না", () => {
    expect(qtyText(12)).toBe("১২");
    expect(qtyText(12.5)).toBe("১২.৫");
  });

  it("তারিখ বাংলায় দেখায়", () => {
    expect(bnDate("2026-08-16")).toBe("১৬ আগস্ট ২০২৬");
  });

  it("অসংখ্যা মানকে শূন্য ধরে", () => {
    expect(num("abc")).toBe(0);
    expect(num(null)).toBe(0);
    expect(num("120.5")).toBe(120.5);
  });
});

describe("পরিশোধের নিয়ম", () => {
  it("খালি রাখলে সব দেওয়া হয়ে গেছে ধরা হয়", () => {
    expect(effectivePaid(1000, null, false)).toBe(1000);
    expect(effectivePaid(1000, 0, false)).toBe(1000);
  });

  it("আংশিক দিলে সেটাই পরিশোধ", () => {
    expect(effectivePaid(1000, 500, false)).toBe(500);
  });

  it("“কিছুই দেইনি” দিলে পুরোটাই বাকি", () => {
    expect(effectivePaid(1000, 0, true)).toBe(0);
  });

  it("পরিশোধ মোট বিলের বেশি হতে পারে না", () => {
    expect(effectivePaid(1000, 1500, false)).toBe(1000);
  });
});

/* ------------------------------ পরীক্ষা ------------------------------ */

const baseInput = (over: Partial<NewInvoiceInput> = {}): NewInvoiceInput => ({
  type: "sale",
  invoice_date: "2026-08-16",
  total_amount: 1000,
  payment_method: "cash",
  image_url: "https://example.test/memo.jpg",
  ...over,
});

const invoice = (over: Partial<Invoice> = {}): Invoice =>
  ({
    id: "x",
    type: "sale",
    invoice_date: "2026-08-16",
    memo_no: null,
    party_name: "করিম স্টোর",
    details: null,
    total_amount: 1000,
    paid_amount: 1000,
    due_amount: 0,
    payment_method: "cash",
    image_url: null,
    no_image_reason: "মেমো দেয়নি",
    cogs: 0,
    profit: 0,
    stock_shortfall: false,
    goods_status: "n_a",
    is_reversal: false,
    reverses_invoice_id: null,
    reversed_at: null,
    detail_revision: 0,
    created_by: null,
    created_by_name: "ISMAIL",
    created_at: "2026-08-16T10:00:00Z",
    ...over,
  }) as Invoice;

const emptyContext = { recent: [] as Invoice[], products: [] as Product[] };

describe("সেভ করার আগের পরীক্ষা", () => {
  it("ভবিষ্যতের তারিখ আটকায়", () => {
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    const checks = runChecks(baseInput({ invoice_date: future }), emptyContext);
    expect(checks.some((c) => c.level === "block" && /ভবিষ্যতের/.test(c.message))).toBe(true);
  });

  it("ছবি নেই আর কারণও নেই — আটকায়", () => {
    const checks = runChecks(baseInput({ image_url: null }), emptyContext);
    expect(checks.some((c) => c.level === "block" && /ছবি/.test(c.message))).toBe(true);
  });

  it("ছবি নেই কিন্তু কারণ লেখা আছে — আটকায় না", () => {
    const checks = runChecks(
      baseInput({ image_url: null, no_image_reason: "মেমো দেয়নি" }),
      emptyContext,
    );
    expect(checks.filter((c) => c.level === "block")).toHaveLength(0);
  });

  it("শূন্য অঙ্ক আটকায়", () => {
    const checks = runChecks(baseInput({ total_amount: 0 }), emptyContext);
    expect(checks.some((c) => c.level === "block")).toBe(true);
  });

  it("একই তারিখ + টাকা + পার্টি আগে থাকলে সতর্ক করে", () => {
    const checks = runChecks(baseInput({ party_name: "করিম স্টোর" }), {
      ...emptyContext,
      recent: [invoice()],
    });
    expect(checks.some((c) => c.level === "warn" && /ডুপ্লিকেট/.test(c.message))).toBe(true);
  });

  it("গড়ের ৫ গুণের বেশি অঙ্কে সতর্ক করে", () => {
    const recent = Array.from({ length: 6 }, () => invoice({ total_amount: 100 }));
    const checks = runChecks(baseInput({ total_amount: 5000, party_name: "নতুন" }), {
      ...emptyContext,
      recent,
    });
    expect(checks.some((c) => c.level === "warn" && /অস্বাভাবিক/.test(c.message))).toBe(true);
  });

  it("ক্রয়মূল্য ছাড়া পণ্য বিক্রিতে সতর্ক করে", () => {
    const product = { id: "p1", name: "তেল", cost_price: null } as Product;
    const checks = runChecks(
      baseInput({
        items: [
          { product_id: "p1", product_name: "তেল", qty: 2, unit_price: 500, line_total: 1000 },
        ],
      }),
      { recent: [], products: [product] },
    );
    expect(checks.some((c) => c.level === "warn" && /ক্রয়মূল্য/.test(c.message))).toBe(true);
  });

  it("সারির যোগফল মোট অঙ্কের সাথে না মিললে সতর্ক করে", () => {
    const checks = runChecks(
      baseInput({
        total_amount: 900,
        items: [
          { product_id: null, product_name: "তেল", qty: 2, unit_price: 500, line_total: 1000 },
        ],
      }),
      emptyContext,
    );
    expect(checks.some((c) => c.level === "warn" && /যোগফল/.test(c.message))).toBe(true);
  });

  it("সব ঠিক থাকলে কোনো ব্লকার নেই", () => {
    expect(
      runChecks(baseInput({ party_name: "করিম স্টোর" }), emptyContext).filter(
        (c) => c.level === "block",
      ),
    ).toHaveLength(0);
  });
});
