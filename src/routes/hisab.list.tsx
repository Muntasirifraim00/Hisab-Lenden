import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Filter, Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { listInvoices } from "@/lib/hisab/api";
import { INVOICE_TYPES, typeColor, typeLabel, GOODS_STATUS } from "@/lib/hisab/constants";
import { bnDate, money, num, toBn } from "@/lib/hisab/format";
import { Button, Card, Chip, Empty, Field, Input, Loading } from "@/components/hisab/ui";
import type { InvoiceFilters, Invoice } from "@/lib/hisab/types";

type ListSearch = { pending?: boolean; due?: boolean; party?: string };

export const Route = createFileRoute("/hisab/list")({
  validateSearch: (search: Record<string, unknown>): ListSearch => {
    const out: ListSearch = {};
    if (search.pending === true || search.pending === "true") out.pending = true;
    if (search.due === true || search.due === "true") out.due = true;
    if (typeof search.party === "string" && search.party) out.party = search.party;
    return out;
  },
  component: ListPage,
});

function ListPage() {
  const initial = Route.useSearch();
  const [open, setOpen] = React.useState(false);
  const [filters, setFilters] = React.useState<InvoiceFilters>({
    text: initial.party ?? "",
    type: "all",
    dueOnly: initial.due ?? false,
    pendingGoodsOnly: initial.pending ?? false,
  });
  const [text, setText] = React.useState(initial.party ?? "");

  // টাইপ করার সাথে সাথে নয় — একটু থেমে খোঁজা হয়
  React.useEffect(() => {
    const id = setTimeout(() => setFilters((f) => ({ ...f, text })), 350);
    return () => clearTimeout(id);
  }, [text]);

  const query = useQuery({
    queryKey: ["hisab", "invoices", filters],
    queryFn: () => listInvoices(filters, 300),
    staleTime: 20_000,
  });

  const rows = query.data ?? [];
  const activeCount =
    (filters.type && filters.type !== "all" ? 1 : 0) +
    (filters.from ? 1 : 0) +
    (filters.to ? 1 : 0) +
    (filters.minAmount != null ? 1 : 0) +
    (filters.maxAmount != null ? 1 : 0) +
    (filters.dueOnly ? 1 : 0) +
    (filters.pendingGoodsOnly ? 1 : 0);

  const totals = rows.reduce(
    (acc, r) => {
      if (r.is_reversal || r.reversed_at) return acc;
      acc.amount += num(r.total_amount);
      acc.due += num(r.due_amount);
      return acc;
    },
    { amount: 0, due: 0 },
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="পার্টি, বিবরণ, মেমো বা নাম"
            className="pl-9"
          />
        </div>
        <Button
          type="button"
          variant={activeCount ? "primary" : "outline"}
          onClick={() => setOpen((v) => !v)}
          aria-label="ছাঁকনি"
        >
          <SlidersHorizontal className="h-4 w-4" />
          {activeCount ? toBn(activeCount) : null}
        </Button>
      </div>

      {open ? (
        <Card className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            <TypeChip
              label="সব"
              active={filters.type === "all"}
              onClick={() => setFilters((f) => ({ ...f, type: "all" }))}
            />
            {INVOICE_TYPES.map((t) => (
              <TypeChip
                key={t.value}
                label={t.label}
                color={t.color}
                active={filters.type === t.value}
                onClick={() => setFilters((f) => ({ ...f, type: t.value }))}
              />
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="তারিখ থেকে">
              <Input
                type="date"
                value={filters.from ?? ""}
                onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value || undefined }))}
              />
            </Field>
            <Field label="পর্যন্ত">
              <Input
                type="date"
                value={filters.to ?? ""}
                onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value || undefined }))}
              />
            </Field>
            <Field label="সর্বনিম্ন টাকা">
              <Input
                type="number"
                inputMode="decimal"
                value={filters.minAmount ?? ""}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    minAmount: e.target.value ? Number(e.target.value) : null,
                  }))
                }
              />
            </Field>
            <Field label="সর্বোচ্চ টাকা">
              <Input
                type="number"
                inputMode="decimal"
                value={filters.maxAmount ?? ""}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    maxAmount: e.target.value ? Number(e.target.value) : null,
                  }))
                }
              />
            </Field>
          </div>

          <div className="flex flex-wrap gap-2">
            <ToggleChip
              label="শুধু বাকি"
              active={!!filters.dueOnly}
              onClick={() => setFilters((f) => ({ ...f, dueOnly: !f.dueOnly }))}
            />
            <ToggleChip
              label="শুধু অপেক্ষমাণ মাল"
              active={!!filters.pendingGoodsOnly}
              onClick={() => setFilters((f) => ({ ...f, pendingGoodsOnly: !f.pendingGoodsOnly }))}
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="ml-auto"
              onClick={() => {
                setText("");
                setFilters({ text: "", type: "all" });
              }}
            >
              <X className="h-3.5 w-3.5" />
              সব ছাঁকনি মুছুন
            </Button>
          </div>
        </Card>
      ) : null}

      {rows.length ? (
        <div className="flex items-center justify-between rounded-xl bg-slate-100 px-3 py-2 text-[12px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <span>{toBn(rows.length)} টি হিসাব</span>
          <span>
            মোট {money(totals.amount)}
            {totals.due > 0 ? (
              <span className="ml-2 text-rose-600">বাকি {money(totals.due)}</span>
            ) : null}
          </span>
        </div>
      ) : null}

      {query.isLoading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty
          icon={<Filter className="h-8 w-8" />}
          title="কিছু পাওয়া যায়নি"
          hint="ছাঁকনি বদলে দেখুন, অথবা নিচের ➕ দিয়ে নতুন হিসাব লিখুন।"
        />
      ) : (
        <div className="space-y-2">
          {rows.map((inv) => (
            <InvoiceRow key={inv.id} invoice={inv} />
          ))}
        </div>
      )}
    </div>
  );
}

function InvoiceRow({ invoice: inv }: { invoice: Invoice }) {
  const color = typeColor(inv.type);
  const cancelled = !!inv.reversed_at;

  return (
    <Link
      to="/hisab/invoice/$id"
      params={{ id: inv.id }}
      className={cn(
        "flex items-stretch gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition active:scale-[0.99]",
        "dark:border-slate-800 dark:bg-slate-900",
        cancelled && "opacity-60",
      )}
    >
      <span className="w-1 shrink-0 rounded-full" style={{ backgroundColor: color }} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip color={color}>{typeLabel(inv.type)}</Chip>
          {inv.is_reversal ? <Chip color="#dc2626">সংশোধনী</Chip> : null}
          {cancelled ? <Chip color="#dc2626">বাতিল হয়েছে</Chip> : null}
          {inv.goods_status === "pending" || inv.goods_status === "partial" ? (
            <Chip color={GOODS_STATUS[inv.goods_status].color}>
              {GOODS_STATUS[inv.goods_status].label}
            </Chip>
          ) : null}
          {!inv.image_url ? <Chip color="#d97706">ছবি নেই</Chip> : null}
          {inv.stock_shortfall ? <Chip color="#dc2626">স্টক ঘাটতি</Chip> : null}
        </div>

        <p className="mt-1 truncate text-[14px] font-bold text-slate-800 dark:text-slate-200">
          {inv.party_name || inv.details || "বিবরণ নেই"}
        </p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          {bnDate(inv.invoice_date)} · {inv.created_by_name}
          {inv.memo_no ? ` · মেমো ${inv.memo_no}` : ""}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-[15px] font-bold" style={{ color }}>
          {money(inv.total_amount)}
        </p>
        {num(inv.due_amount) > 0 ? (
          <p className="text-[11px] font-semibold text-rose-600">বাকি {money(inv.due_amount)}</p>
        ) : (
          <p className="text-[11px] text-emerald-600">চুকে গেছে</p>
        )}
        {inv.type === "sale" && !inv.is_reversal ? (
          <p className="text-[10px] text-violet-600">লাভ {money(inv.profit)}</p>
        ) : null}
      </div>
    </Link>
  );
}

function TypeChip({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-[12px] font-bold transition",
        active ? "text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
      )}
      style={active ? { backgroundColor: color ?? "#132a6b" } : undefined}
    >
      {label}
    </button>
  );
}

function ToggleChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-[12px] font-semibold transition",
        active
          ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
          : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300",
      )}
    >
      {label}
    </button>
  );
}
