/**
 * হিসাব — ডেটা স্তর।
 *
 * সব লেখালেখি ডেটাবেসের RPC দিয়ে হয়, সরাসরি টেবিলে নয়। কারণ RPC-গুলো
 * এক ট্রানজেকশনে ইনভয়েস + আইটেম + স্টক সব একসাথে লেখে — অর্ধেক লেখা হয় না।
 */
import { supabase } from "@/integrations/supabase/client";
import type {
  DetailEdit,
  Invoice,
  InvoiceExpense,
  InvoiceFilters,
  InvoiceItem,
  InvoicePayment,
  InvoiceReceipt,
  NewInvoiceInput,
  PartyRow,
  Product,
  ProductCategory,
  Quotation,
  QuotationItem,
  ReturnableItem,
  StockMove,
  StockRow,
} from "./types";

// হিসাবের টেবিলগুলো generated Supabase types-এ নেই (আলাদা মাইগ্রেশন),
// তাই এই এক জায়গায় আলগা টাইপে ক্লায়েন্ট ধরা হয়েছে।
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

function unwrap<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(translateError(res.error.message));
  return res.data;
}

/** ডেটাবেসের ইংরেজি ত্রুটিগুলো বাংলায় */
function translateError(message: string) {
  if (/invoices_memo_no_key/.test(message)) return "এই মেমো নম্বরে আগেই একটা হিসাব আছে।";
  if (/invoices_reverses_once_key/.test(message)) return "এই হিসাবটি আগেই সংশোধন করা হয়েছে।";
  if (/products_name_key/.test(message)) return "এই নামে পণ্য আগেই আছে।";
  if (/quotations_no_key/.test(message)) return "এই নম্বরে একটা কোটেশন আগেই আছে।";
  if (/product_categories_name_key/.test(message)) return "এই নামে ক্যাটাগরি আগেই আছে।";
  if (/invoices_image_or_reason/.test(message)) return "ছবি না থাকলে কারণ লিখতে হবে।";
  if (/violates row-level security|permission denied/i.test(message))
    return "অনুমতি নেই — আবার লগইন করুন।";
  return message;
}

/* ------------------------------ ইনভয়েস ------------------------------ */

export async function listInvoices(filters: InvoiceFilters = {}, limit = 200) {
  let q = db
    .from("invoices")
    .select("*")
    .order("invoice_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.type && filters.type !== "all") q = q.eq("type", filters.type);
  if (filters.from) q = q.gte("invoice_date", filters.from);
  if (filters.to) q = q.lte("invoice_date", filters.to);
  if (filters.minAmount != null) q = q.gte("total_amount", filters.minAmount);
  if (filters.maxAmount != null) q = q.lte("total_amount", filters.maxAmount);
  if (filters.dueOnly) q = q.gt("due_amount", 0);
  if (filters.pendingGoodsOnly) q = q.in("goods_status", ["pending", "partial"]);
  if (filters.text?.trim()) {
    const t = filters.text.trim().replace(/[%,]/g, " ");
    q = q.or(
      `party_name.ilike.%${t}%,details.ilike.%${t}%,memo_no.ilike.%${t}%,created_by_name.ilike.%${t}%`,
    );
  }

  return unwrap<Invoice[]>(await q) ?? [];
}

/** ড্যাশবোর্ডের হিসাব — বাতিল হওয়া ও সংশোধনী এন্ট্রি বাদ দিয়ে */
export async function listLiveInvoices(from?: string, to?: string) {
  let q = db.from("hb_live_invoices").select("*").order("invoice_date", { ascending: false });
  if (from) q = q.gte("invoice_date", from);
  if (to) q = q.lte("invoice_date", to);
  return unwrap<Invoice[]>(await q) ?? [];
}

export async function getInvoice(id: string) {
  return unwrap<Invoice>(await db.from("invoices").select("*").eq("id", id).single());
}

export async function getInvoiceItems(invoiceId: string) {
  return (
    unwrap<InvoiceItem[]>(
      await db.from("invoice_items").select("*").eq("invoice_id", invoiceId).order("created_at"),
    ) ?? []
  );
}

export async function getInvoicePayments(invoiceId: string) {
  return (
    unwrap<InvoicePayment[]>(
      await db.from("invoice_payments").select("*").eq("invoice_id", invoiceId).order("created_at"),
    ) ?? []
  );
}

export async function getInvoiceReceipts(invoiceId: string) {
  return (
    unwrap<InvoiceReceipt[]>(
      await db.from("invoice_receipts").select("*").eq("invoice_id", invoiceId).order("created_at"),
    ) ?? []
  );
}

export async function getInvoiceExpenses(invoiceId: string) {
  return (
    unwrap<InvoiceExpense[]>(
      await db.from("invoice_expenses").select("*").eq("invoice_id", invoiceId).order("created_at"),
    ) ?? []
  );
}

export async function getDetailEdits(invoiceId: string) {
  return (
    unwrap<DetailEdit[]>(
      await db
        .from("invoice_detail_edits")
        .select("*")
        .eq("invoice_id", invoiceId)
        .order("revision_no"),
    ) ?? []
  );
}

/** এই এন্ট্রির সংশোধনী (থাকলে) */
export async function getReversalOf(invoiceId: string) {
  const rows =
    unwrap<Invoice[]>(
      await db.from("invoices").select("*").eq("reverses_invoice_id", invoiceId).limit(1),
    ) ?? [];
  return rows[0] ?? null;
}

export async function createInvoice(input: NewInvoiceInput) {
  return unwrap<Invoice>(await db.rpc("hb_create_invoice", { p: input }));
}

export async function addPayment(payload: {
  invoice_id: string;
  amount: number;
  method: string;
  paid_on: string;
  note?: string | null;
}) {
  return unwrap<Invoice>(await db.rpc("hb_add_payment", { p: payload }));
}

export async function receiveGoods(payload: {
  invoice_id: string;
  received_on: string;
  lines: { item_id: string; qty: number }[];
  note?: string | null;
}) {
  return unwrap<Invoice>(await db.rpc("hb_receive_goods", { p: payload }));
}

export async function editDetails(payload: { invoice_id: string; details: string }) {
  return unwrap<Invoice>(await db.rpc("hb_edit_details", { p: payload }));
}

export async function reverseInvoice(payload: {
  invoice_id: string;
  invoice_date: string;
  reason: string;
}) {
  return unwrap<Invoice>(await db.rpc("hb_reverse_invoice", { p: payload }));
}

/** সবচেয়ে বেশি বিক্রি হওয়া পণ্য — ইনভয়েসের সারি ধরে, বাতিল হওয়াগুলো বাদে */
export async function listTopProducts(from?: string, limit = 4) {
  let q = db
    .from("invoice_items")
    .select("product_name,qty,line_total,invoices!inner(type,invoice_date,is_reversal,reversed_at)")
    .eq("invoices.type", "sale")
    .eq("invoices.is_reversal", false)
    .is("invoices.reversed_at", null)
    .limit(2000);
  if (from) q = q.gte("invoices.invoice_date", from);

  const rows = unwrap<{ product_name: string; qty: number; line_total: number }[]>(await q) ?? [];

  const map = new Map<string, { name: string; qty: number; amount: number }>();
  for (const r of rows) {
    const name = (r.product_name ?? "").trim() || "পণ্য";
    const prev = map.get(name) ?? { name, qty: 0, amount: 0 };
    prev.qty += Number(r.qty ?? 0);
    prev.amount += Number(r.line_total ?? 0);
    map.set(name, prev);
  }

  return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, limit);
}

/* ------------------------------ ফেরত ------------------------------ */

/** এই বিক্রয়ের কোন সারি থেকে আর কতটা ফেরত নেওয়া যাবে */
export async function getReturnableItems(invoiceId: string) {
  return (
    unwrap<ReturnableItem[]>(
      await db.from("hb_returnable_items").select("*").eq("invoice_id", invoiceId),
    ) ?? []
  );
}

/** এই বিক্রয়ের বিপরীতে যত ফেরত হয়েছে */
export async function getReturnsOf(invoiceId: string) {
  return (
    unwrap<Invoice[]>(
      await db
        .from("invoices")
        .select("*")
        .eq("returns_invoice_id", invoiceId)
        .order("invoice_date", { ascending: false }),
    ) ?? []
  );
}

export async function createReturn(payload: {
  invoice_id: string;
  invoice_date: string;
  reason?: string | null;
  memo_no?: string | null;
  refunded_amount: number;
  payment_method: string;
  image_url?: string | null;
  no_image_reason?: string | null;
  lines: { item_id: string; qty: number }[];
}) {
  return unwrap<Invoice>(await db.rpc("hb_create_return", { p: payload }));
}

/* ------------------------------ কোটেশন ------------------------------ */

export async function listQuotations(status?: string) {
  let q = db
    .from("quotations")
    .select("*")
    .order("quote_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(300);
  if (status && status !== "all") q = q.eq("status", status);
  return unwrap<Quotation[]>(await q) ?? [];
}

export async function getQuotation(id: string) {
  return unwrap<Quotation>(await db.from("quotations").select("*").eq("id", id).single());
}

export async function getQuotationItems(quotationId: string) {
  return (
    unwrap<QuotationItem[]>(
      await db
        .from("quotation_items")
        .select("*")
        .eq("quotation_id", quotationId)
        .order("sort_order"),
    ) ?? []
  );
}

export async function saveQuotation(payload: Record<string, unknown>) {
  return unwrap<Quotation>(await db.rpc("hb_save_quotation", { p: payload }));
}

export async function setQuoteStatus(id: string, status: string) {
  return unwrap<Quotation>(await db.rpc("hb_set_quote_status", { p: { id, status } }));
}

export async function deleteQuotation(id: string) {
  return unwrap<boolean>(await db.rpc("hb_delete_quotation", { p_id: id }));
}

export async function convertQuotation(payload: {
  id: string;
  invoice_date: string;
  paid_amount?: number | null;
  nothing_paid?: boolean;
  payment_method?: string;
  memo_no?: string | null;
  no_image_reason?: string | null;
}) {
  return unwrap<Invoice>(await db.rpc("hb_convert_quotation", { p: payload }));
}

/* ------------------------------ পণ্য ------------------------------ */

export async function listProducts() {
  return unwrap<Product[]>(await db.from("products").select("*").order("name")) ?? [];
}

export async function listCategories() {
  return (
    unwrap<ProductCategory[]>(await db.from("product_categories").select("*").order("name")) ?? []
  );
}

export async function saveProduct(payload: Record<string, unknown>) {
  return unwrap<Product>(await db.rpc("hb_save_product", { p: payload }));
}

export async function saveCategory(name: string) {
  return unwrap<ProductCategory>(await db.rpc("hb_save_category", { p_name: name }));
}

/* ------------------------------ স্টক ------------------------------ */

export async function listStock() {
  return (
    unwrap<StockRow[]>(await db.from("hb_stock_summary").select("*").order("product_name")) ?? []
  );
}

export async function listStockMoves(productId: string) {
  return (
    unwrap<StockMove[]>(
      await db
        .from("stock_moves")
        .select("*")
        .eq("product_id", productId)
        .order("moved_on", { ascending: false })
        .order("created_at", { ascending: false }),
    ) ?? []
  );
}

/* ------------------------------ পার্টি ------------------------------ */

export async function listParties() {
  return (
    unwrap<PartyRow[]>(
      await db.from("hb_party_summary").select("*").order("last_entry_date", { ascending: false }),
    ) ?? []
  );
}

/* ------------------------------ ছবি ------------------------------ */

export async function uploadInvoiceImage(file: File) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("লগইন করুন।");

  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().slice(0, 5);
  const path = `${uid}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from("hisab")
    .upload(path, file, { cacheControl: "31536000", upsert: false });
  if (error) throw new Error(translateError(error.message));

  return supabase.storage.from("hisab").getPublicUrl(path).data.publicUrl;
}

/** ফাইল পাতা — সব ইনভয়েসের ছবি */
export async function listInvoiceImages(limit = 300) {
  return (
    unwrap<Invoice[]>(
      await db
        .from("invoices")
        .select("id,type,invoice_date,party_name,total_amount,image_url,created_by_name")
        .not("image_url", "is", null)
        .order("invoice_date", { ascending: false })
        .limit(limit),
    ) ?? []
  );
}
