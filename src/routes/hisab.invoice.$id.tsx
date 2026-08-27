import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ClipboardCheck,
  History,
  Loader2,
  Lock,
  PackageCheck,
  Pencil,
  Plus,
  RotateCcw,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  addPayment,
  editDetails,
  getDetailEdits,
  getInvoice,
  getInvoiceExpenses,
  getInvoiceItems,
  getInvoicePayments,
  getInvoiceReceipts,
  getReversalOf,
  receiveGoods,
  reverseInvoice,
} from "@/lib/hisab/api";
import {
  GOODS_STATUS,
  methodLabel,
  PAYMENT_METHODS,
  typeColor,
  typeLabel,
  unitLabel,
} from "@/lib/hisab/constants";
import {
  bnDate,
  bnDateTime,
  daysBetween,
  money,
  num,
  qtyText,
  toBn,
  todayISO,
} from "@/lib/hisab/format";
import {
  Avatar,
  Button,
  Card,
  Chip,
  ErrorNote,
  Field,
  Input,
  Loading,
  Money,
  SectionTitle,
  Select,
  Textarea,
} from "@/components/hisab/ui";

export const Route = createFileRoute("/hisab/invoice/$id")({
  component: InvoiceDetail,
});

function InvoiceDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [panel, setPanel] = React.useState<null | "payment" | "receive" | "details" | "reverse">(
    null,
  );
  const [error, setError] = React.useState<string | null>(null);

  const invoice = useQuery({ queryKey: ["hisab", "invoice", id], queryFn: () => getInvoice(id) });
  const items = useQuery({
    queryKey: ["hisab", "invoice", id, "items"],
    queryFn: () => getInvoiceItems(id),
  });
  const payments = useQuery({
    queryKey: ["hisab", "invoice", id, "payments"],
    queryFn: () => getInvoicePayments(id),
  });
  const receipts = useQuery({
    queryKey: ["hisab", "invoice", id, "receipts"],
    queryFn: () => getInvoiceReceipts(id),
  });
  const expenses = useQuery({
    queryKey: ["hisab", "invoice", id, "expenses"],
    queryFn: () => getInvoiceExpenses(id),
  });
  const edits = useQuery({
    queryKey: ["hisab", "invoice", id, "edits"],
    queryFn: () => getDetailEdits(id),
  });
  const reversal = useQuery({
    queryKey: ["hisab", "invoice", id, "reversal"],
    queryFn: () => getReversalOf(id),
  });

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["hisab"] });
    setPanel(null);
    setError(null);
  };

  const inv = invoice.data;

  if (invoice.isLoading) return <Loading />;
  if (invoice.error || !inv) {
    return <ErrorNote>হিসাবটি পাওয়া গেল না।</ErrorNote>;
  }

  const color = typeColor(inv.type);
  const cancelled = !!inv.reversed_at;
  const goodsPending = inv.goods_status === "pending" || inv.goods_status === "partial";

  return (
    <div className="space-y-4">
      <button
        onClick={() => navigate({ to: "/hisab/list" })}
        className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-600 dark:text-slate-300"
      >
        <ArrowLeft className="h-4 w-4" />
        তালিকায় ফিরুন
      </button>

      {/* মাথা */}
      <Card style={{ borderTopColor: color, borderTopWidth: 4 }}>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip color={color}>{typeLabel(inv.type)}</Chip>
          {inv.is_reversal ? <Chip color="#dc2626">সংশোধনী এন্ট্রি</Chip> : null}
          {cancelled ? <Chip color="#dc2626">বাতিল হয়েছে</Chip> : null}
          {inv.goods_status !== "n_a" ? (
            <Chip color={GOODS_STATUS[inv.goods_status].color}>
              {GOODS_STATUS[inv.goods_status].label}
            </Chip>
          ) : null}
          {inv.stock_shortfall ? <Chip color="#dc2626">স্টকে পর্যাপ্ত মাল ছিল না</Chip> : null}
        </div>

        <h1 className="mt-2 text-xl font-black tracking-tight text-slate-900 dark:text-slate-100">
          {money(inv.total_amount)}
        </h1>
        <p className="mt-0.5 text-[13px] text-slate-600 dark:text-slate-400">
          {inv.party_name || "পার্টির নাম নেই"} · {bnDate(inv.invoice_date)}
          {inv.memo_no ? ` · মেমো ${inv.memo_no}` : ""}
        </p>

        <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-800/60">
          <div>
            <p className="text-[10px] font-semibold text-slate-500">পরিশোধ</p>
            <p className="text-[14px] font-bold text-emerald-600">{money(inv.paid_amount)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-500">বাকি</p>
            <p
              className={cn(
                "text-[14px] font-bold",
                num(inv.due_amount) > 0 ? "text-rose-600" : "text-slate-500",
              )}
            >
              {money(inv.due_amount)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-500">
              {inv.type === "sale" ? "লাভ" : "মাধ্যম"}
            </p>
            <p className="text-[14px] font-bold text-violet-600">
              {inv.type === "sale" ? money(inv.profit) : methodLabel(inv.payment_method)}
            </p>
          </div>
        </div>

        {inv.type === "sale" && !inv.is_reversal ? (
          <p className="mt-2 text-center text-[11px] text-slate-500">
            বিক্রয় {money(inv.total_amount)} − FIFO ক্রয়মূল্য {money(inv.cogs)} = লাভ{" "}
            {money(inv.profit)}
          </p>
        ) : null}

        <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
          <Avatar name={inv.created_by_name} size={22} />
          <span>
            {inv.created_by_name} যোগ করেছেন · {bnDateTime(inv.created_at)}
          </span>
        </div>

        {goodsPending ? (
          <p className="mt-2 rounded-lg bg-orange-50 px-3 py-2 text-[12px] text-orange-800 dark:bg-orange-950/40 dark:text-orange-300">
            টাকা দেওয়া হয়েছে, মাল এখনো পুরো আসেনি — {toBn(daysBetween(inv.invoice_date))} দিন হলো।
          </p>
        ) : null}

        {inv.is_reversal && inv.reverses_invoice_id ? (
          <Link
            to="/hisab/invoice/$id"
            params={{ id: inv.reverses_invoice_id }}
            className="mt-2 block text-[12px] font-semibold text-blue-700 dark:text-blue-400"
          >
            → যে এন্ট্রিটা সংশোধন করা হয়েছে সেটা দেখুন
          </Link>
        ) : null}

        {reversal.data ? (
          <Link
            to="/hisab/invoice/$id"
            params={{ id: reversal.data.id }}
            className="mt-2 block text-[12px] font-semibold text-rose-700 dark:text-rose-400"
          >
            → এই এন্ট্রির সংশোধনীটা দেখুন
          </Link>
        ) : null}
      </Card>

      {/* কাজ */}
      <div className="grid grid-cols-2 gap-2">
        {num(inv.due_amount) > 0 ? (
          <Button
            variant="success"
            onClick={() => setPanel(panel === "payment" ? null : "payment")}
          >
            <Plus className="h-4 w-4" />
            কিস্তি যোগ করুন
          </Button>
        ) : null}
        {goodsPending ? (
          <Button onClick={() => setPanel(panel === "receive" ? null : "receive")}>
            <PackageCheck className="h-4 w-4" />
            মাল বুঝে পেয়েছি
          </Button>
        ) : null}
        <Button variant="outline" onClick={() => setPanel(panel === "details" ? null : "details")}>
          <Pencil className="h-4 w-4" />
          বিবরণ বদলান
        </Button>
        {!inv.is_reversal && !cancelled ? (
          <Button variant="danger" onClick={() => setPanel(panel === "reverse" ? null : "reverse")}>
            <Undo2 className="h-4 w-4" />
            বাতিল / সংশোধনী
          </Button>
        ) : null}
      </div>

      <ErrorNote>{error}</ErrorNote>

      {panel === "payment" ? (
        <PaymentPanel
          invoiceId={inv.id}
          due={num(inv.due_amount)}
          onDone={refreshAll}
          onError={setError}
        />
      ) : null}
      {panel === "receive" ? (
        <ReceivePanel
          invoiceId={inv.id}
          items={items.data ?? []}
          onDone={refreshAll}
          onError={setError}
        />
      ) : null}
      {panel === "details" ? (
        <DetailsPanel
          invoiceId={inv.id}
          current={inv.details ?? ""}
          onDone={refreshAll}
          onError={setError}
        />
      ) : null}
      {panel === "reverse" ? (
        <ReversePanel invoiceId={inv.id} onDone={refreshAll} onError={setError} />
      ) : null}

      {/* বিবরণ */}
      {inv.details ? (
        <Card>
          <SectionTitle
            title="বিবরণ"
            right={
              inv.detail_revision > 0 ? (
                <Chip color="#0891b2">{toBn(inv.detail_revision)} বার সম্পাদিত</Chip>
              ) : null
            }
          />
          <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-slate-700 dark:text-slate-300">
            {inv.details}
          </p>
        </Card>
      ) : null}

      {/* ছবি */}
      <Card>
        <SectionTitle title="মেমোর ছবি" />
        {inv.image_url ? (
          <a href={inv.image_url} target="_blank" rel="noreferrer">
            <img
              src={inv.image_url}
              alt="মেমো"
              className="max-h-96 w-full rounded-xl border border-slate-200 bg-slate-50 object-contain dark:border-slate-800 dark:bg-slate-950"
            />
          </a>
        ) : (
          <p className="rounded-xl bg-amber-50 px-3 py-3 text-[13px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            ছবি নেই — কারণ: {inv.no_image_reason}
          </p>
        )}
      </Card>

      {/* পণ্যের সারি */}
      {(items.data ?? []).length ? (
        <Card>
          <SectionTitle title="পণ্যের সারি" />
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {(items.data ?? []).map((it) => (
              <div key={it.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-slate-800 dark:text-slate-200">
                    {it.product_name}
                    {!it.product_id ? (
                      <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                        (স্টকে নেই)
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {qtyText(it.qty)} {unitLabel(it.unit)} × {money(it.unit_price)}
                    {inv.type === "purchase" && it.product_id ? (
                      <span
                        className={cn(
                          "ml-1.5",
                          num(it.received_qty) >= num(it.qty)
                            ? "text-emerald-600"
                            : "text-orange-600",
                        )}
                      >
                        · বুঝে পেয়েছি {qtyText(it.received_qty)}
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-bold">{money(it.line_total)}</p>
                  {inv.type === "sale" ? (
                    <p className="text-[10px] text-slate-500">ক্রয়মূল্য {money(it.line_cogs)}</p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* খরচের খাত */}
      {(expenses.data ?? []).length ? (
        <Card>
          <SectionTitle title="খরচের খাত" />
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {(expenses.data ?? []).map((ex) => (
              <div key={ex.id} className="flex items-center justify-between py-2 text-[13px]">
                <span className="text-slate-700 dark:text-slate-300">
                  {ex.head}
                  {ex.note ? (
                    <span className="ml-1.5 text-[11px] text-slate-400">{ex.note}</span>
                  ) : null}
                </span>
                <span className="font-bold">{money(ex.amount)}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* কিস্তি */}
      {(payments.data ?? []).length ? (
        <Card>
          <SectionTitle
            title="কিস্তির ইতিহাস"
            right={
              <Chip>
                <Lock className="h-3 w-3" /> অপরিবর্তনীয়
              </Chip>
            }
          />
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {(payments.data ?? []).map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-2.5">
                <Avatar name={p.created_by_name} size={26} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-200">
                    {money(p.amount)} · {methodLabel(p.method)}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {bnDate(p.paid_on)} · {p.created_by_name}
                    {p.note ? ` · ${p.note}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* মাল বুঝে পাওয়ার রসিদ */}
      {(receipts.data ?? []).length ? (
        <Card>
          <SectionTitle title="মাল বুঝে পাওয়ার রসিদ" />
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {(receipts.data ?? []).map((r) => (
              <div key={r.id} className="flex items-center gap-3 py-2.5">
                <ClipboardCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-200">
                    {bnDate(r.received_on)}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {r.created_by_name}
                    {r.note ? ` · ${r.note}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* সম্পাদনার লগ */}
      {(edits.data ?? []).length ? (
        <Card>
          <SectionTitle
            title={
              <span className="flex items-center gap-1.5">
                <History className="h-4 w-4" />
                সম্পাদনার লগ
              </span>
            }
          />
          <div className="space-y-2.5">
            {(edits.data ?? []).map((e) => (
              <div
                key={e.id}
                className="rounded-xl bg-slate-50 p-3 text-[12px] dark:bg-slate-800/60"
              >
                <p className="font-bold text-slate-700 dark:text-slate-300">
                  {toBn(e.revision_no)} নং সংশোধন · {e.edited_by_name} · {bnDateTime(e.created_at)}
                </p>
                <p className="mt-1.5 text-rose-700 line-through dark:text-rose-400">
                  {e.old_details || "(খালি ছিল)"}
                </p>
                <p className="mt-0.5 text-emerald-700 dark:text-emerald-400">
                  {e.new_details || "(খালি করা হয়েছে)"}
                </p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <p className="pb-2 text-center text-[11px] leading-relaxed text-slate-500">
        <Lock className="mr-1 inline h-3 w-3" />
        এই এন্ট্রি মোছা যায় না, টাকা-তারিখ বদলানো যায় না। ভুল হলে সংশোধনী দিন — মূল এন্ট্রি খাতায়
        থেকে যাবে, প্রমাণ হিসেবে।
      </p>
    </div>
  );
}

/* ------------------------------ কিস্তি ------------------------------ */

function PaymentPanel({
  invoiceId,
  due,
  onDone,
  onError,
}: {
  invoiceId: string;
  due: number;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const [amount, setAmount] = React.useState(String(due));
  const [method, setMethod] = React.useState("cash");
  const [paidOn, setPaidOn] = React.useState(todayISO());
  const [note, setNote] = React.useState("");

  const mutation = useMutation({
    mutationFn: () =>
      addPayment({
        invoice_id: invoiceId,
        amount: num(amount),
        method,
        paid_on: paidOn,
        note: note || null,
      }),
    onSuccess: () => {
      toast.success("কিস্তি যোগ হয়েছে।");
      onDone();
    },
    onError: (e) => onError((e as Error).message),
  });

  return (
    <Card className="space-y-3 border-emerald-300 dark:border-emerald-900">
      <SectionTitle
        title="কিস্তি যোগ করুন"
        right={<span className="text-[11px] text-slate-500">বাকি {money(due)}</span>}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="অঙ্ক" required>
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="তারিখ" required>
          <Input
            type="date"
            max={todayISO()}
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
          />
        </Field>
      </div>
      <Field label="মাধ্যম">
        <Select value={method} onChange={(e) => setMethod(e.target.value)}>
          {PAYMENT_METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="নোট">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ঐচ্ছিক" />
      </Field>
      <p className="text-[11px] text-slate-500">
        কিস্তি একবার লিখলে মোছা বা বদলানো যায় না। কে নিল, কবে নিল — সব লেখা থাকবে।
      </p>
      <Button
        onClick={() => mutation.mutate()}
        variant="success"
        className="w-full"
        disabled={mutation.isPending || num(amount) <= 0}
      >
        {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        যোগ করুন
      </Button>
    </Card>
  );
}

/* ------------------------------ মাল বুঝে পাওয়া ------------------------------ */

function ReceivePanel({
  invoiceId,
  items,
  onDone,
  onError,
}: {
  invoiceId: string;
  items: { id: string; product_name: string; qty: number; received_qty: number; unit: string }[];
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const pending = items.filter((it) => num(it.qty) - num(it.received_qty) > 0);
  const [qtys, setQtys] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(pending.map((it) => [it.id, String(num(it.qty) - num(it.received_qty))])),
  );
  const [receivedOn, setReceivedOn] = React.useState(todayISO());
  const [note, setNote] = React.useState("");

  const mutation = useMutation({
    mutationFn: () =>
      receiveGoods({
        invoice_id: invoiceId,
        received_on: receivedOn,
        lines: pending
          .map((it) => ({ item_id: it.id, qty: num(qtys[it.id]) }))
          .filter((l) => l.qty > 0),
        note: note || null,
      }),
    onSuccess: () => {
      toast.success("মাল স্টকে ঢুকেছে।");
      onDone();
    },
    onError: (e) => onError((e as Error).message),
  });

  return (
    <Card className="space-y-3 border-blue-300 dark:border-blue-900">
      <SectionTitle title="মাল বুঝে পেয়েছি" />
      {pending.length === 0 ? (
        <p className="text-[13px] text-slate-500">সব মাল আগেই বুঝে পাওয়া হয়েছে।</p>
      ) : (
        <>
          <div className="space-y-2.5">
            {pending.map((it) => (
              <div key={it.id} className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-slate-800 dark:text-slate-200">
                    {it.product_name}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    বাকি {qtyText(num(it.qty) - num(it.received_qty))} {unitLabel(it.unit)}
                  </p>
                </div>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.001"
                  max={num(it.qty) - num(it.received_qty)}
                  value={qtys[it.id] ?? ""}
                  onChange={(e) => setQtys((q) => ({ ...q, [it.id]: e.target.value }))}
                  className="w-24"
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="তারিখ" required>
              <Input
                type="date"
                max={todayISO()}
                value={receivedOn}
                onChange={(e) => setReceivedOn(e.target.value)}
              />
            </Field>
            <Field label="নোট">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ঐচ্ছিক" />
            </Field>
          </div>

          <p className="text-[11px] text-slate-500">
            একই রসিদ ভুলে দুবার দিলেও স্টক দুবার বাড়বে না — বাকি পরিমাণের বেশি ঢুকবে না।
          </p>

          <Button
            onClick={() => mutation.mutate()}
            className="w-full"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PackageCheck className="h-4 w-4" />
            )}
            স্টকে ঢোকান
          </Button>
        </>
      )}
    </Card>
  );
}

/* ------------------------------ বিবরণ ------------------------------ */

function DetailsPanel({
  invoiceId,
  current,
  onDone,
  onError,
}: {
  invoiceId: string;
  current: string;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const [text, setText] = React.useState(current);

  const mutation = useMutation({
    mutationFn: () => editDetails({ invoice_id: invoiceId, details: text }),
    onSuccess: () => {
      toast.success("বিবরণ বদলানো হয়েছে — লগে জমা হলো।");
      onDone();
    },
    onError: (e) => onError((e as Error).message),
  });

  return (
    <Card className="space-y-3">
      <SectionTitle title="বিবরণ বদলান" />
      <Textarea value={text} onChange={(e) => setText(e.target.value)} />
      <p className="text-[11px] text-slate-500">
        একমাত্র এই ঘরটাই বদলানো যায়। কে বদলাল, কখন, আগে কী ছিল, পরে কী হলো — সব লগে জমা হবে।
      </p>
      <Button
        onClick={() => mutation.mutate()}
        className="w-full"
        disabled={mutation.isPending || text === current}
      >
        {mutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Pencil className="h-4 w-4" />
        )}
        সংরক্ষণ
      </Button>
    </Card>
  );
}

/* ------------------------------ সংশোধনী ------------------------------ */

function ReversePanel({
  invoiceId,
  onDone,
  onError,
}: {
  invoiceId: string;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const navigate = useNavigate();
  const [reason, setReason] = React.useState("");
  const [date, setDate] = React.useState(todayISO());
  const [confirmed, setConfirmed] = React.useState(false);

  const mutation = useMutation({
    mutationFn: () => reverseInvoice({ invoice_id: invoiceId, invoice_date: date, reason }),
    onSuccess: (created) => {
      toast.success("সংশোধনী এন্ট্রি তৈরি হয়েছে।");
      onDone();
      navigate({ to: "/hisab/invoice/$id", params: { id: created.id } });
    },
    onError: (e) => onError((e as Error).message),
  });

  return (
    <Card className="space-y-3 border-rose-300 dark:border-rose-900">
      <SectionTitle
        title={
          <span className="flex items-center gap-1.5 text-rose-700 dark:text-rose-400">
            <RotateCcw className="h-4 w-4" />
            বাতিল / সংশোধনী
          </span>
        }
      />

      <div className="rounded-xl bg-rose-50 p-3 text-[12px] leading-relaxed text-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
        মোছার বদলে একটা উল্টো এন্ট্রি তৈরি হবে। মূল এন্ট্রিটা খাতায় থেকেই যাবে (প্রমাণ হিসেবে),
        পণ্যের সারিগুলো আপনাআপনি অনুলিপি হবে, স্টকে উল্টো প্রভাব পড়বে, আর দুটোই টাকার হিসাব থেকে
        বাদ পড়ে যাবে। এটা আর ফেরানো যাবে না।
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="তারিখ" required>
          <Input
            type="date"
            max={todayISO()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="কারণ" required>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="কেন বাতিল?"
          />
        </Field>
      </div>

      <label className="flex items-start gap-2.5 text-[12px] text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-rose-600"
        />
        আমি বুঝেছি — এটা ফেরানো যাবে না।
      </label>

      <Button
        variant="danger"
        onClick={() => mutation.mutate()}
        className="w-full"
        disabled={mutation.isPending || !confirmed || reason.trim().length < 3}
      >
        {mutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Undo2 className="h-4 w-4" />
        )}
        সংশোধনী দিন
      </Button>
    </Card>
  );
}
