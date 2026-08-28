import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Check, FileText, Loader2, Plus, Printer, Send, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  convertQuotation,
  deleteQuotation,
  getQuotationItems,
  listProducts,
  listQuotations,
  saveQuotation,
  setQuoteStatus,
} from "@/lib/hisab/api";
import {
  PAYMENT_METHODS,
  QUOTE_STATUSES,
  quoteStatusColor,
  quoteStatusLabel,
} from "@/lib/hisab/constants";
import { addDaysISO, bnDate, money, num, qtyText, toBn, todayISO } from "@/lib/hisab/format";
import {
  Button,
  Card,
  Chip,
  Empty,
  ErrorNote,
  Field,
  IconTile,
  Input,
  Loading,
  Pill,
  SectionTitle,
  Select,
  Textarea,
} from "@/components/hisab/ui";
import type { Quotation } from "@/lib/hisab/types";

export const Route = createFileRoute("/hisab/quotations")({
  component: QuotationsPage,
});

type Row = {
  key: string;
  product_id: string;
  product_name: string;
  qty: string;
  unit_price: string;
};

const newKey = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random());

const blankRow = (): Row => ({
  key: newKey(),
  product_id: "",
  product_name: "",
  qty: "1",
  unit_price: "",
});

function QuotationsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = React.useState<string>("all");
  const [editing, setEditing] = React.useState<Quotation | "new" | null>(null);
  const [converting, setConverting] = React.useState<Quotation | null>(null);

  const quotes = useQuery({
    queryKey: ["hisab", "quotations", filter],
    queryFn: () => listQuotations(filter),
    staleTime: 20_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["hisab"] });

  const rows = quotes.data ?? [];
  const openTotal = rows
    .filter((q) => q.status === "sent" || q.status === "accepted")
    .reduce((s, q) => s + num(q.total_amount), 0);

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle
          title="কোটেশন"
          right={
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus className="h-3.5 w-3.5" />
              নতুন
            </Button>
          }
        />
        <p className="text-[12px] leading-relaxed text-dim">
          কোটেশন হলো ক্রেতাকে দেওয়া দামের প্রস্তাব — এটা হিসাবের খাতায় ঢোকে না, টাকা বা স্টকে কোনো
          প্রভাব ফেলে না। তাই এটা বদলানো ও মোছা যায়। ক্রেতা রাজি হলে
          <b className="text-ink"> “বিক্রয়ে নিন”</b> চাপলে তখনই আসল বিক্রয়ের এন্ট্রি তৈরি হয়।
        </p>
        {openTotal > 0 ? (
          <div className="mt-3 flex items-center justify-between rounded-xl bg-card-2 px-3 py-2.5">
            <span className="text-[12px] font-semibold text-dim">অপেক্ষমাণ প্রস্তাবের মূল্য</span>
            <span className="text-[15px] font-bold text-ink">{money(openTotal)}</span>
          </div>
        ) : null}
      </Card>

      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        <Pill active={filter === "all"} onClick={() => setFilter("all")}>
          সব
        </Pill>
        {QUOTE_STATUSES.map((s) => (
          <Pill key={s.value} active={filter === s.value} onClick={() => setFilter(s.value)}>
            {s.label}
          </Pill>
        ))}
      </div>

      {editing ? (
        <QuoteForm
          quote={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            refresh();
            setEditing(null);
          }}
        />
      ) : null}

      {converting ? (
        <ConvertPanel
          quote={converting}
          onClose={() => setConverting(null)}
          onDone={() => {
            refresh();
            setConverting(null);
          }}
        />
      ) : null}

      {quotes.isLoading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty
          icon={<FileText className="h-8 w-8" />}
          title="কোনো কোটেশন নেই"
          hint="ক্রেতাকে দাম জানাতে একটা প্রস্তাব বানিয়ে রাখুন — রাজি হলে এক চাপে বিক্রয়ে নেওয়া যাবে।"
          action={
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus className="h-3.5 w-3.5" />
              নতুন কোটেশন
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {rows.map((q) => (
            <QuoteRow
              key={q.id}
              quote={q}
              onEdit={() => setEditing(q)}
              onConvert={() => setConverting(q)}
              onChanged={refresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------- একটা সারি ---------------------------- */

function QuoteRow({
  quote,
  onEdit,
  onConvert,
  onChanged,
}: {
  quote: Quotation;
  onEdit: () => void;
  onConvert: () => void;
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const locked = quote.status === "converted";

  const items = useQuery({
    queryKey: ["hisab", "quotation-items", quote.id],
    queryFn: () => getQuotationItems(quote.id),
    enabled: open,
  });

  const status = useMutation({
    mutationFn: (s: string) => setQuoteStatus(quote.id, s),
    onSuccess: () => {
      toast.success("অবস্থা বদলানো হয়েছে।");
      onChanged();
    },
    onError: (e) => setError((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: () => deleteQuotation(quote.id),
    onSuccess: () => {
      toast.success("কোটেশন মুছে ফেলা হয়েছে।");
      onChanged();
    },
    onError: (e) => setError((e as Error).message),
  });

  const expired =
    quote.valid_until && quote.valid_until < todayISO() && quote.status !== "converted";

  return (
    <Card className="p-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        <IconTile tone={locked ? "violet" : "sky"} size={36}>
          <FileText className="h-4 w-4" />
        </IconTile>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip color={quoteStatusColor(quote.status)}>{quoteStatusLabel(quote.status)}</Chip>
            {expired ? <Chip color="#f59e0b">মেয়াদ পেরিয়েছে</Chip> : null}
          </div>
          <p className="mt-1 truncate text-[13.5px] font-bold text-ink">
            {quote.party_name || "নাম নেই"}
            {quote.quote_no ? (
              <span className="ml-1.5 text-[11px] font-normal text-faint">#{quote.quote_no}</span>
            ) : null}
          </p>
          <p className="text-[11px] text-faint">
            {bnDate(quote.quote_date)}
            {quote.valid_until ? ` · মেয়াদ ${bnDate(quote.valid_until)}` : ""} ·{" "}
            {quote.created_by_name}
          </p>
        </div>
        <span className="shrink-0 text-[15px] font-bold text-ink">{money(quote.total_amount)}</span>
      </button>

      {open ? (
        <div className="border-t border-line p-3">
          {items.isLoading ? (
            <Loading label="সারি আনছি…" />
          ) : (
            <div className="divide-y divide-line">
              {(items.data ?? []).map((it) => (
                <div key={it.id} className="flex items-center gap-3 py-2 text-[12.5px]">
                  <span className="min-w-0 flex-1 truncate text-ink">{it.product_name}</span>
                  <span className="shrink-0 text-faint">
                    {qtyText(it.qty)} × {money(it.unit_price)}
                  </span>
                  <span className="w-24 shrink-0 text-right font-bold text-ink">
                    {money(it.line_total)}
                  </span>
                </div>
              ))}
              {(items.data ?? []).length === 0 ? (
                <p className="py-3 text-center text-[12px] text-dim">কোনো পণ্য নেই।</p>
              ) : null}
            </div>
          )}

          {quote.notes ? (
            <p className="mt-2 rounded-xl bg-card-2 px-3 py-2 text-[12px] text-dim">
              {quote.notes}
            </p>
          ) : null}

          <ErrorNote>{error}</ErrorNote>

          {locked ? (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-violet/10 px-3 py-2.5">
              <span className="text-[12px] text-violet">
                এটা বিক্রয়ে নেওয়া হয়ে গেছে — আর বদলানো যাবে না।
              </span>
              {quote.converted_invoice_id ? (
                <Button
                  size="sm"
                  variant="soft"
                  onClick={() =>
                    navigate({
                      to: "/hisab/invoice/$id",
                      params: { id: quote.converted_invoice_id! },
                    })
                  }
                >
                  বিক্রয় দেখুন
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={onConvert}>
                <Check className="h-3.5 w-3.5" />
                বিক্রয়ে নিন
              </Button>
              <Button size="sm" variant="outline" onClick={onEdit}>
                সম্পাদনা
              </Button>
              {quote.status === "draft" ? (
                <Button size="sm" variant="outline" onClick={() => status.mutate("sent")}>
                  <Send className="h-3.5 w-3.5" />
                  পাঠানো হয়েছে
                </Button>
              ) : null}
              {quote.status === "sent" ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => status.mutate("accepted")}>
                    গ্রহণ করেছে
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => status.mutate("rejected")}>
                    বাতিল করেছে
                  </Button>
                </>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5" />
                প্রিন্ট
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto text-rose"
                onClick={() => {
                  if (confirm("কোটেশনটা মুছে ফেলবেন? এটা ফেরানো যাবে না।")) remove.mutate();
                }}
                disabled={remove.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
                মুছুন
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </Card>
  );
}

/* ---------------------------- ফর্ম ---------------------------- */

function QuoteForm({
  quote,
  onClose,
  onSaved,
}: {
  quote: Quotation | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const products = useQuery({ queryKey: ["hisab", "products"], queryFn: listProducts });
  const existing = useQuery({
    queryKey: ["hisab", "quotation-items", quote?.id],
    queryFn: () => getQuotationItems(quote!.id),
    enabled: !!quote,
  });

  const [form, setForm] = React.useState({
    quote_no: quote?.quote_no ?? "",
    quote_date: quote?.quote_date ?? todayISO(),
    valid_until: quote?.valid_until ?? addDaysISO(7),
    party_name: quote?.party_name ?? "",
    notes: quote?.notes ?? "",
  });
  const [rows, setRows] = React.useState<Row[]>([blankRow()]);
  const [error, setError] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState(!quote);

  React.useEffect(() => {
    if (quote && existing.data && !loaded) {
      setRows(
        existing.data.length
          ? existing.data.map((it) => ({
              key: newKey(),
              product_id: it.product_id ?? "",
              product_name: it.product_name,
              qty: String(it.qty),
              unit_price: String(it.unit_price),
            }))
          : [blankRow()],
      );
      setLoaded(true);
    }
  }, [quote, existing.data, loaded]);

  const total = rows.reduce((s, r) => s + num(r.qty) * num(r.unit_price), 0);

  function setRow(key: string, next: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...next } : r)));
  }

  function pickProduct(key: string, productId: string) {
    const p = (products.data ?? []).find((x) => x.id === productId);
    const next: Partial<Row> = { product_id: productId, product_name: p?.name ?? "" };
    if (p?.sale_price != null) next.unit_price = String(p.sale_price);
    setRow(key, next);
  }

  const save = useMutation({
    mutationFn: () =>
      saveQuotation({
        id: quote?.id ?? null,
        quote_no: form.quote_no.trim() || null,
        quote_date: form.quote_date,
        valid_until: form.valid_until || null,
        party_name: form.party_name.trim() || null,
        notes: form.notes.trim() || null,
        items: rows
          .filter((r) => num(r.qty) > 0)
          .map((r) => ({
            product_id: r.product_id || null,
            product_name: r.product_name || "পণ্য",
            qty: num(r.qty),
            unit_price: num(r.unit_price),
          })),
      }),
    onSuccess: () => {
      toast.success(quote ? "কোটেশন হালনাগাদ হয়েছে।" : "কোটেশন তৈরি হয়েছে।");
      onSaved();
    },
    onError: (e) => setError((e as Error).message),
  });

  return (
    <Card className="space-y-3.5 border-brand/40">
      <SectionTitle
        title={quote ? "কোটেশন সম্পাদনা" : "নতুন কোটেশন"}
        right={
          <button onClick={onClose} className="text-faint hover:text-ink" aria-label="বন্ধ">
            <X className="h-4 w-4" />
          </button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="ক্রেতার নাম">
          <Input
            value={form.party_name}
            onChange={(e) => setForm({ ...form, party_name: e.target.value })}
            placeholder="কাকে দিচ্ছেন"
          />
        </Field>
        <Field label="কোটেশন নম্বর" hint="একই নম্বর দুবার দেওয়া যাবে না">
          <Input
            value={form.quote_no}
            onChange={(e) => setForm({ ...form, quote_no: e.target.value })}
            placeholder="ঐচ্ছিক"
          />
        </Field>
        <Field label="তারিখ">
          <Input
            type="date"
            value={form.quote_date}
            onChange={(e) => setForm({ ...form, quote_date: e.target.value })}
          />
        </Field>
        <Field label="মেয়াদ" hint="এই তারিখ পেরোলে তালিকায় চিহ্নিত হবে">
          <Input
            type="date"
            value={form.valid_until}
            onChange={(e) => setForm({ ...form, valid_until: e.target.value })}
          />
        </Field>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12.5px] font-semibold text-dim">পণ্যের সারি</span>
          <Button size="sm" variant="outline" onClick={() => setRows((p) => [...p, blankRow()])}>
            <Plus className="h-3.5 w-3.5" />
            সারি
          </Button>
        </div>

        <div className="space-y-2.5">
          {rows.map((r, i) => (
            <div key={r.key} className="rounded-xl border border-line p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-bold text-faint">সারি {toBn(i + 1)}</span>
                {rows.length > 1 ? (
                  <button
                    onClick={() => setRows((p) => p.filter((x) => x.key !== r.key))}
                    className="text-faint hover:text-rose"
                    aria-label="সারি মুছুন"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </div>

              <Select
                value={r.product_id}
                onChange={(e) => pickProduct(r.key, e.target.value)}
                className="mb-2"
              >
                <option value="">— পণ্য বাছুন —</option>
                {(products.data ?? [])
                  .filter((p) => p.is_active)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </Select>

              {!r.product_id ? (
                <Input
                  value={r.product_name}
                  onChange={(e) => setRow(r.key, { product_name: e.target.value })}
                  placeholder="অথবা হাতে নাম লিখুন"
                  className="mb-2"
                />
              ) : null}

              <div className="grid grid-cols-3 items-end gap-2">
                <Field label="পরিমাণ">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.001"
                    value={r.qty}
                    onChange={(e) => setRow(r.key, { qty: e.target.value })}
                  />
                </Field>
                <Field label="দর">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={r.unit_price}
                    onChange={(e) => setRow(r.key, { unit_price: e.target.value })}
                  />
                </Field>
                <div className="pb-2.5 text-right text-[13px] font-bold text-ink">
                  {money(num(r.qty) * num(r.unit_price))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-2.5 flex items-center justify-between rounded-xl bg-card-2 px-3 py-2.5 text-[14px] font-bold text-ink">
          <span>মোট</span>
          <span>{money(total)}</span>
        </div>
      </div>

      <Field label="নোট">
        <Textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="শর্ত, ডেলিভারির সময় — যা লিখতে চান"
        />
      </Field>

      <ErrorNote>{error}</ErrorNote>

      <Button
        onClick={() => save.mutate()}
        className="w-full"
        disabled={save.isPending || total <= 0}
      >
        {save.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Check className="h-4 w-4" />
        )}
        সংরক্ষণ
      </Button>
    </Card>
  );
}

/* ---------------------------- রূপান্তর ---------------------------- */

function ConvertPanel({
  quote,
  onClose,
  onDone,
}: {
  quote: Quotation;
  onClose: () => void;
  onDone: () => void;
}) {
  const navigate = useNavigate();
  const [date, setDate] = React.useState(todayISO());
  const [paid, setPaid] = React.useState("");
  const [nothingPaid, setNothingPaid] = React.useState(false);
  const [method, setMethod] = React.useState("cash");
  const [memo, setMemo] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const total = num(quote.total_amount);
  const effectivePaid = nothingPaid ? 0 : num(paid) === 0 ? total : Math.min(num(paid), total);

  const convert = useMutation({
    mutationFn: () =>
      convertQuotation({
        id: quote.id,
        invoice_date: date,
        paid_amount: nothingPaid ? 0 : num(paid) || null,
        nothing_paid: nothingPaid,
        payment_method: method,
        memo_no: memo.trim() || null,
        no_image_reason: "কোটেশন থেকে তৈরি",
      }),
    onSuccess: (invoice) => {
      toast.success("বিক্রয়ের এন্ট্রি তৈরি হয়েছে।");
      onDone();
      navigate({ to: "/hisab/invoice/$id", params: { id: invoice.id } });
    },
    onError: (e) => setError((e as Error).message),
  });

  return (
    <Card className="space-y-3.5 border-mint/40">
      <SectionTitle
        title="কোটেশন → বিক্রয়"
        right={
          <button onClick={onClose} className="text-faint hover:text-ink" aria-label="বন্ধ">
            <X className="h-4 w-4" />
          </button>
        }
      />

      <div className="rounded-xl bg-card-2 px-3 py-2.5 text-[12px] leading-relaxed text-dim">
        <b className="text-ink">{quote.party_name || "নাম নেই"}</b> — {money(total)}
        <br />
        সংরক্ষণ করলে আসল বিক্রয়ের এন্ট্রি তৈরি হবে: স্টক কমবে, FIFO ধরে লাভ হিসাব হবে, আর কোটেশনটা
        তালাবদ্ধ হয়ে যাবে।
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="বিক্রয়ের তারিখ" required>
          <Input
            type="date"
            max={todayISO()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="মেমো নম্বর">
          <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="ঐচ্ছিক" />
        </Field>
      </div>

      <Field
        label="পরিশোধিত"
        hint="খালি রাখলে “সব দেওয়া হয়ে গেছে” ধরা হবে। বাকি রাখতে আংশিক অঙ্ক লিখুন।"
      >
        <div className="flex gap-2">
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={nothingPaid ? "" : paid}
            disabled={nothingPaid}
            onChange={(e) => setPaid(e.target.value)}
            placeholder={String(total)}
          />
          <Button
            variant={nothingPaid ? "danger" : "outline"}
            onClick={() => {
              setNothingPaid((v) => !v);
              setPaid("");
            }}
          >
            কিছুই দেয়নি
          </Button>
        </div>
      </Field>

      <Field label="মাধ্যম">
        <Select value={method} onChange={(e) => setMethod(e.target.value)}>
          {PAYMENT_METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-3 gap-2 rounded-xl bg-card-2 p-3 text-center">
        <div>
          <p className="text-[10px] font-semibold text-faint">মোট</p>
          <p className="text-[14px] font-bold text-ink">{money(total)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-faint">পরিশোধ</p>
          <p className="text-[14px] font-bold text-mint">{money(effectivePaid)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-faint">বাকি</p>
          <p
            className={cn(
              "text-[14px] font-bold",
              total - effectivePaid > 0 ? "text-rose" : "text-dim",
            )}
          >
            {money(total - effectivePaid)}
          </p>
        </div>
      </div>

      <ErrorNote>{error}</ErrorNote>

      <Button
        variant="success"
        onClick={() => convert.mutate()}
        className="w-full"
        disabled={convert.isPending}
      >
        {convert.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Check className="h-4 w-4" />
        )}
        বিক্রয়ের এন্ট্রি তৈরি করুন
      </Button>
    </Card>
  );
}
