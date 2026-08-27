import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Camera,
  Check,
  ImageOff,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createInvoice, listInvoices, listProducts, uploadInvoiceImage } from "@/lib/hisab/api";
import {
  EXPENSE_HEADS,
  INVOICE_TYPES,
  PAYMENT_METHODS,
  type InvoiceType,
  type PaymentMethod,
} from "@/lib/hisab/constants";
import { money, num, todayISO } from "@/lib/hisab/format";
import { effectivePaid, runChecks, type Check as RuleCheck } from "@/lib/hisab/validate";
import { clearDraft, loadDraft, saveDraft } from "@/lib/hisab/draft";
import { shrinkImage } from "@/lib/hisab/image";
import {
  Button,
  Card,
  ErrorNote,
  Field,
  Input,
  SectionTitle,
  Select,
  Textarea,
} from "@/components/hisab/ui";

export const Route = createFileRoute("/hisab/new")({
  validateSearch: (search: Record<string, unknown>): { type?: InvoiceType } =>
    (["expense", "purchase", "sale"] as const).includes(search.type as InvoiceType)
      ? { type: search.type as InvoiceType }
      : {},
  component: NewEntry,
});

type ItemRow = {
  key: string;
  product_id: string;
  product_name: string;
  qty: string;
  unit_price: string;
};
type ExpenseRow = { key: string; head: string; amount: string; note: string };

type FormState = {
  type: InvoiceType;
  invoice_date: string;
  memo_no: string;
  party_name: string;
  details: string;
  total_amount: string;
  paid_amount: string;
  nothing_paid: boolean;
  payment_method: PaymentMethod;
  no_image_reason: string;
  goods_pending: boolean;
  items: ItemRow[];
  expenses: ExpenseRow[];
};

const newKey = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random());

const blankItem = (): ItemRow => ({
  key: newKey(),
  product_id: "",
  product_name: "",
  qty: "1",
  unit_price: "",
});
const blankExpense = (): ExpenseRow => ({
  key: newKey(),
  head: EXPENSE_HEADS[0],
  amount: "",
  note: "",
});

function initialState(type: InvoiceType): FormState {
  return {
    type,
    invoice_date: todayISO(),
    memo_no: "",
    party_name: "",
    details: "",
    total_amount: "",
    paid_amount: "",
    nothing_paid: false,
    payment_method: "cash",
    no_image_reason: "",
    goods_pending: false,
    items: [],
    expenses: [],
  };
}

function NewEntry() {
  const initialType = Route.useSearch().type ?? "sale";
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [form, setForm] = React.useState<FormState>(() => initialState(initialType));
  const [imageFile, setImageFile] = React.useState<File | null>(null);
  const [imagePreview, setImagePreview] = React.useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = React.useState<string | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [acceptedWarnings, setAcceptedWarnings] = React.useState(false);
  const [restored, setRestored] = React.useState(false);

  const products = useQuery({
    queryKey: ["hisab", "products"],
    queryFn: listProducts,
    staleTime: 60_000,
  });
  const recent = useQuery({
    queryKey: ["hisab", "recent-for-checks"],
    queryFn: () => listInvoices({}, 120),
    staleTime: 60_000,
  });

  const patch = React.useCallback((next: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...next }));
    setAcceptedWarnings(false);
  }, []);

  /* ---------- ড্রাফট ---------- */
  React.useEffect(() => {
    const draft = loadDraft<FormState>();
    if (draft?.value?.type) {
      setForm({ ...initialState(draft.value.type), ...draft.value });
      setRestored(true);
    }
  }, []);

  React.useEffect(() => {
    const id = setTimeout(() => {
      const dirty =
        form.total_amount ||
        form.party_name ||
        form.details ||
        form.items.length ||
        form.expenses.length;
      if (dirty) saveDraft(form);
    }, 600);
    return () => clearTimeout(id);
  }, [form]);

  /* ---------- ছবি ---------- */
  async function pickImage(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const { file: small, dataUrl } = await shrinkImage(file);
      setImageFile(small);
      setImageDataUrl(dataUrl);
      setImagePreview(dataUrl);
      patch({ no_image_reason: "" });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function dropImage() {
    setImageFile(null);
    setImagePreview(null);
    setImageDataUrl(null);
  }

  /* ---------- AI স্ক্যান ---------- */
  async function scan() {
    if (!imageDataUrl) return;
    setScanning(true);
    setError(null);
    try {
      const res = await fetch("/api/hisab/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imageDataUrl, type: form.type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "স্ক্যান ব্যর্থ।");

      const r = data.result;
      const scanned: Partial<FormState> = {};
      if (r.invoice_date) scanned.invoice_date = r.invoice_date;
      if (r.memo_no) scanned.memo_no = r.memo_no;
      if (r.party_name) scanned.party_name = r.party_name;
      if (r.total_amount) scanned.total_amount = String(r.total_amount);
      if (r.paid_amount) scanned.paid_amount = String(r.paid_amount);
      if (r.details) scanned.details = r.details;

      if (Array.isArray(r.items) && r.items.length && form.type !== "expense") {
        scanned.items = r.items.map(
          (it: { product_name: string; qty: number; unit_price: number }) => {
            const match = (products.data ?? []).find(
              (p) => p.name.toLowerCase() === String(it.product_name).toLowerCase(),
            );
            return {
              key: newKey(),
              product_id: match?.id ?? "",
              product_name: it.product_name,
              qty: String(it.qty ?? 1),
              unit_price: String(it.unit_price ?? 0),
            };
          },
        );
      }

      patch(scanned);
      toast.success(
        `স্ক্যান হয়েছে (নিশ্চয়তা ${Math.round((r.confidence ?? 0.5) * 100)}%) — মিলিয়ে নিন।`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setScanning(false);
    }
  }

  /* ---------- সারি ---------- */
  function setItem(key: string, next: Partial<ItemRow>) {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.key === key ? { ...it, ...next } : it)),
    }));
    setAcceptedWarnings(false);
  }

  function onPickProduct(key: string, productId: string) {
    const product = (products.data ?? []).find((p) => p.id === productId);
    const next: Partial<ItemRow> = { product_id: productId, product_name: product?.name ?? "" };

    // পণ্যে দর নির্ধারণ করা থাকলে সেটাই বসে যায় — চাইলে বদলানো যাবে
    const suggested =
      form.type === "purchase"
        ? product?.cost_price
        : form.type === "sale"
          ? product?.sale_price
          : null;
    if (suggested != null) next.unit_price = String(suggested);

    setItem(key, next);
  }

  const itemsTotal = form.items.reduce((s, it) => s + num(it.qty) * num(it.unit_price), 0);
  const expensesTotal = form.expenses.reduce((s, e) => s + num(e.amount), 0);

  /** পণ্য/খরচের সারি থাকলে মোট অঙ্ক সেখান থেকেই আসে */
  const autoTotal = form.items.length ? itemsTotal : form.expenses.length ? expensesTotal : 0;
  const total = form.total_amount ? num(form.total_amount) : autoTotal;
  const paid = effectivePaid(total, num(form.paid_amount), form.nothing_paid);
  const due = Math.max(0, total - paid);

  /* ---------- পরীক্ষা ---------- */
  const payload = React.useMemo(
    () => ({
      type: form.type,
      invoice_date: form.invoice_date,
      memo_no: form.memo_no.trim() || null,
      party_name: form.party_name.trim() || null,
      details: form.details.trim() || null,
      total_amount: total,
      paid_amount: form.nothing_paid ? 0 : num(form.paid_amount),
      nothing_paid: form.nothing_paid,
      payment_method: form.payment_method,
      image_url: imageFile ? "pending" : null,
      no_image_reason: form.no_image_reason.trim() || null,
      goods_pending: form.type === "purchase" ? form.goods_pending : false,
      items:
        form.type === "expense"
          ? []
          : form.items
              .filter((it) => num(it.qty) > 0)
              .map((it) => ({
                product_id: it.product_id || null,
                product_name: it.product_name || "পণ্য",
                qty: num(it.qty),
                unit_price: num(it.unit_price),
                line_total: Math.round(num(it.qty) * num(it.unit_price) * 100) / 100,
              })),
      expenses:
        form.type === "expense"
          ? form.expenses
              .filter((e) => num(e.amount) > 0)
              .map((e) => ({ head: e.head, amount: num(e.amount), note: e.note.trim() || null }))
          : [],
    }),
    [form, total, imageFile],
  );

  const checks: RuleCheck[] = React.useMemo(
    () => runChecks(payload, { recent: recent.data ?? [], products: products.data ?? [] }),
    [payload, recent.data, products.data],
  );

  const blockers = checks.filter((c) => c.level === "block");
  const warns = checks.filter((c) => c.level === "warn");

  /* ---------- সেভ ---------- */
  const save = useMutation({
    mutationFn: async () => {
      let imageUrl: string | null = null;
      if (imageFile) imageUrl = await uploadInvoiceImage(imageFile);
      return createInvoice({ ...payload, image_url: imageUrl });
    },
    onSuccess: (invoice) => {
      clearDraft();
      queryClient.invalidateQueries({ queryKey: ["hisab"] });
      toast.success("হিসাব সংরক্ষিত হয়েছে।");
      navigate({ to: "/hisab/invoice/$id", params: { id: invoice.id } });
    },
    onError: (e) => setError((e as Error).message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (blockers.length) return;
    if (warns.length && !acceptedWarnings) {
      setAcceptedWarnings(true);
      toast.warning("সতর্কতাগুলো দেখুন, তারপর আবার সংরক্ষণ চাপুন।");
      return;
    }
    save.mutate();
  }

  const typeMeta = INVOICE_TYPES.find((t) => t.value === form.type)!;

  return (
    <form onSubmit={submit} className="space-y-4">
      {restored ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
          <span>আগের অসমাপ্ত ড্রাফট ফিরিয়ে আনা হয়েছে।</span>
          <button
            type="button"
            onClick={() => {
              clearDraft();
              setForm(initialState(initialType));
              setRestored(false);
            }}
            className="font-bold underline"
          >
            মুছে নতুন করে শুরু
          </button>
        </div>
      ) : null}

      {/* ধরন */}
      <Card>
        <SectionTitle title="ধরন" />
        <div className="grid grid-cols-3 gap-2">
          {INVOICE_TYPES.map((t) => {
            const active = t.value === form.type;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => patch({ type: t.value })}
                className={cn(
                  "rounded-xl border-2 px-2 py-2.5 text-center transition",
                  active
                    ? "text-white"
                    : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300",
                )}
                style={active ? { backgroundColor: t.color, borderColor: t.color } : undefined}
              >
                <span className="block text-[14px] font-bold">{t.label}</span>
                <span
                  className={cn(
                    "mt-0.5 block text-[9.5px] leading-tight",
                    active ? "opacity-85" : "opacity-60",
                  )}
                >
                  {t.hint}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* ছবি + AI */}
      <Card>
        <SectionTitle
          title="মেমোর ছবি"
          right={
            imageDataUrl ? (
              <Button type="button" size="sm" variant="outline" onClick={scan} disabled={scanning}>
                {scanning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                AI স্ক্যান
              </Button>
            ) : null
          }
        />

        {imagePreview ? (
          <div className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
            <img
              src={imagePreview}
              alt="মেমো"
              className="max-h-72 w-full object-contain bg-slate-50 dark:bg-slate-950"
            />
            <button
              type="button"
              onClick={dropImage}
              className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white"
              aria-label="ছবি সরান"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 py-5 text-[12px] font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                <Camera className="h-5 w-5" />
                ছবি তুলুন
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => pickImage(e.target.files?.[0])}
                />
              </label>
              <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 py-5 text-[12px] font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                <Plus className="h-5 w-5" />
                ফাইল বাছুন
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => pickImage(e.target.files?.[0])}
                />
              </label>
            </div>

            <Field
              label={
                <span className="flex items-center gap-1.5">
                  <ImageOff className="h-3.5 w-3.5" />
                  ছবি নেই কেন?
                </span>
              }
              required
              hint="ছবি ছাড়া হিসাব সেভ করতে হলে কারণ লিখতেই হবে।"
            >
              <Input
                value={form.no_image_reason}
                onChange={(e) => patch({ no_image_reason: e.target.value })}
                placeholder="যেমন: মেমো দেয়নি / হারিয়ে গেছে"
              />
            </Field>
          </div>
        )}

        {imagePreview ? (
          <p className="mt-2 flex items-start gap-1.5 text-[11px] text-slate-500">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
            AI স্ক্যান ভুল করতে পারে, বিশেষ করে হাতে লেখা মেমোয় — সবসময় মিলিয়ে নেবেন।
          </p>
        ) : null}
      </Card>

      {/* মূল তথ্য */}
      <Card className="space-y-3.5">
        <SectionTitle title="মূল তথ্য" />

        <div className="grid grid-cols-2 gap-3">
          <Field label="তারিখ" required>
            <Input
              type="date"
              max={todayISO()}
              value={form.invoice_date}
              onChange={(e) => patch({ invoice_date: e.target.value })}
            />
          </Field>
          <Field label="মেমো নম্বর" hint="একই নম্বর দুবার দেওয়া যাবে না">
            <Input
              value={form.memo_no}
              onChange={(e) => patch({ memo_no: e.target.value })}
              placeholder="ঐচ্ছিক"
            />
          </Field>
        </div>

        <Field
          label={
            form.type === "sale"
              ? "ক্রেতার নাম"
              : form.type === "purchase"
                ? "সরবরাহকারীর নাম"
                : "কাকে দেওয়া হলো"
          }
        >
          <Input
            value={form.party_name}
            onChange={(e) => patch({ party_name: e.target.value })}
            placeholder="পার্টির নাম"
            list="hisab-parties"
          />
        </Field>
        <datalist id="hisab-parties">
          {[...new Set((recent.data ?? []).map((r) => r.party_name).filter(Boolean))].map((p) => (
            <option key={p as string} value={p as string} />
          ))}
        </datalist>

        <Field label="বিবরণ" hint="সেভ করার পর একমাত্র এই ঘরটাই বদলানো যাবে — তা-ও লগসহ।">
          <Textarea
            value={form.details}
            onChange={(e) => patch({ details: e.target.value })}
            placeholder="কী কেনা/বেচা হলো, কোথায় খরচ হলো"
          />
        </Field>
      </Card>

      {/* পণ্যের সারি */}
      {form.type !== "expense" ? (
        <Card>
          <SectionTitle
            title="পণ্যের সারি"
            right={
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setForm((p) => ({ ...p, items: [...p.items, blankItem()] }))}
              >
                <Plus className="h-3.5 w-3.5" />
                সারি
              </Button>
            }
          />

          {form.items.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-[12px] text-slate-500 dark:bg-slate-800/60">
              পণ্য যোগ না করলে স্টকে কোনো প্রভাব পড়বে না — শুধু টাকার হিসাব হবে।
            </p>
          ) : (
            <div className="space-y-3">
              {form.items.map((it, index) => (
                <div
                  key={it.key}
                  className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500">সারি {index + 1}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((p) => ({ ...p, items: p.items.filter((x) => x.key !== it.key) }))
                      }
                      className="text-slate-400 hover:text-rose-600"
                      aria-label="সারি মুছুন"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <Select
                    value={it.product_id}
                    onChange={(e) => onPickProduct(it.key, e.target.value)}
                    className="mb-2"
                  >
                    <option value="">— পণ্য বাছুন (স্টকে প্রভাব পড়বে) —</option>
                    {(products.data ?? [])
                      .filter((p) => p.is_active)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </Select>

                  {!it.product_id ? (
                    <Input
                      value={it.product_name}
                      onChange={(e) => setItem(it.key, { product_name: e.target.value })}
                      placeholder="অথবা হাতে নাম লিখুন (স্টকে যাবে না)"
                      className="mb-2"
                    />
                  ) : null}

                  <div className="grid grid-cols-3 items-end gap-2">
                    <Field label="পরিমাণ">
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.001"
                        min="0"
                        value={it.qty}
                        onChange={(e) => setItem(it.key, { qty: e.target.value })}
                      />
                    </Field>
                    <Field label="দর">
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        value={it.unit_price}
                        onChange={(e) => setItem(it.key, { unit_price: e.target.value })}
                      />
                    </Field>
                    <div className="pb-2.5 text-right text-[13px] font-bold text-slate-800 dark:text-slate-200">
                      {money(num(it.qty) * num(it.unit_price))}
                    </div>
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-[13px] font-bold dark:bg-slate-800/60">
                <span>সারির যোগফল</span>
                <span>{money(itemsTotal)}</span>
              </div>
            </div>
          )}
        </Card>
      ) : (
        <Card>
          <SectionTitle
            title="খরচের খাত"
            right={
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setForm((p) => ({ ...p, expenses: [...p.expenses, blankExpense()] }))
                }
              >
                <Plus className="h-3.5 w-3.5" />
                খাত
              </Button>
            }
          />
          {form.expenses.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-[12px] text-slate-500 dark:bg-slate-800/60">
              খাত ভাগ না করলেও চলবে — শুধু মোট অঙ্ক লিখলেই হবে।
            </p>
          ) : (
            <div className="space-y-2.5">
              {form.expenses.map((ex) => (
                <div key={ex.key} className="flex items-end gap-2">
                  <Select
                    value={ex.head}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        expenses: p.expenses.map((x) =>
                          x.key === ex.key ? { ...x, head: e.target.value } : x,
                        ),
                      }))
                    }
                    className="flex-1"
                  >
                    {EXPENSE_HEADS.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </Select>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={ex.amount}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        expenses: p.expenses.map((x) =>
                          x.key === ex.key ? { ...x, amount: e.target.value } : x,
                        ),
                      }))
                    }
                    placeholder="টাকা"
                    className="w-28"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setForm((p) => ({
                        ...p,
                        expenses: p.expenses.filter((x) => x.key !== ex.key),
                      }))
                    }
                    className="pb-2.5 text-slate-400 hover:text-rose-600"
                    aria-label="খাত মুছুন"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-[13px] font-bold dark:bg-slate-800/60">
                <span>খাতের যোগফল</span>
                <span>{money(expensesTotal)}</span>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* অগ্রিম ক্রয় */}
      {form.type === "purchase" ? (
        <Card
          className={cn(
            form.goods_pending &&
              "border-orange-300 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/30",
          )}
        >
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={form.goods_pending}
              onChange={(e) => patch({ goods_pending: e.target.checked })}
              className="mt-0.5 h-5 w-5 rounded border-slate-300 accent-orange-600"
            />
            <span>
              <span className="block text-[14px] font-bold text-slate-800 dark:text-slate-200">
                মাল এখনো পাইনি (অগ্রিম ক্রয়)
              </span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                টাকার হিসাবে ক্রয় ধরা হবে, কিন্তু স্টকে মাল ঢুকবে না। পরে মাল এলে ইনভয়েস খুলে “মাল
                বুঝে পেয়েছি” দিলে তখন স্টকে ঢুকবে।
              </span>
            </span>
          </label>
        </Card>
      ) : null}

      {/* টাকা */}
      <Card className="space-y-3.5">
        <SectionTitle title="টাকা" />

        <Field
          label="মোট অঙ্ক"
          required
          hint={autoTotal > 0 ? `সারি থেকে: ${money(autoTotal)}` : undefined}
        >
          <div className="flex gap-2">
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={form.total_amount}
              onChange={(e) => patch({ total_amount: e.target.value })}
              placeholder={autoTotal > 0 ? String(autoTotal) : "০.০০"}
            />
            {autoTotal > 0 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => patch({ total_amount: String(autoTotal) })}
              >
                সারি থেকে
              </Button>
            ) : null}
          </div>
        </Field>

        <Field
          label="পরিশোধিত"
          hint="খালি রাখলে বা ০ দিলে “সব দেওয়া হয়ে গেছে” ধরা হবে। বাকি রাখতে চাইলে আংশিক অঙ্ক লিখুন।"
        >
          <div className="flex gap-2">
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={form.nothing_paid ? "" : form.paid_amount}
              disabled={form.nothing_paid}
              onChange={(e) => patch({ paid_amount: e.target.value })}
              placeholder={total > 0 ? String(total) : "০.০০"}
            />
            <Button
              type="button"
              variant={form.nothing_paid ? "danger" : "outline"}
              onClick={() => patch({ nothing_paid: !form.nothing_paid, paid_amount: "" })}
            >
              কিছুই দেইনি
            </Button>
          </div>
        </Field>

        <Field label="মাধ্যম">
          <Select
            value={form.payment_method}
            onChange={(e) => patch({ payment_method: e.target.value as PaymentMethod })}
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-800/60">
          <div>
            <p className="text-[10px] font-semibold text-slate-500">মোট</p>
            <p className="text-[14px] font-bold">{money(total)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-500">পরিশোধ</p>
            <p className="text-[14px] font-bold text-emerald-600">{money(paid)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-500">বাকি</p>
            <p
              className={cn("text-[14px] font-bold", due > 0 ? "text-rose-600" : "text-slate-500")}
            >
              {money(due)}
            </p>
          </div>
        </div>
      </Card>

      {/* পরীক্ষা */}
      {blockers.length || (warns.length && acceptedWarnings) ? (
        <div className="space-y-2">
          {blockers.map((c) => (
            <ErrorNote key={c.message}>🚫 {c.message}</ErrorNote>
          ))}
          {acceptedWarnings
            ? warns.map((c) => (
                <div
                  key={c.message}
                  className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
                >
                  ⚠️ {c.message}
                </div>
              ))
            : null}
        </div>
      ) : null}

      <ErrorNote>{error}</ErrorNote>

      <div className="sticky bottom-20 z-20">
        <Button
          type="submit"
          size="lg"
          className="w-full shadow-lg"
          style={{ backgroundColor: typeMeta.color }}
          disabled={save.isPending || blockers.length > 0 || total <= 0}
        >
          {save.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          {warns.length && !acceptedWarnings ? "সংরক্ষণ (সতর্কতা আছে)" : "সংরক্ষণ"}
        </Button>
      </div>

      <p className="pb-2 text-center text-[11px] leading-relaxed text-slate-500">
        সেভ হলে ইনভয়েস, পণ্যের সারি ও স্টক — সব একসাথে লেখা হবে। মাঝপথে নেট কাটলে একটাও লেখা হবে
        না, তাই গড়মিল হতে পারে না।
      </p>
    </form>
  );
}
