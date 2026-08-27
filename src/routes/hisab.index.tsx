import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ComposedChart,
} from "recharts";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  Camera,
  Clock,
  FileBarChart,
  HandCoins,
  Package,
  Receipt,
  ShoppingCart,
  Tags,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { listLiveInvoices } from "@/lib/hisab/api";
import { addDaysISO, bnDate, daysBetween, money, num, toBn, todayISO } from "@/lib/hisab/format";
import { methodLabel, PAYMENT_METHODS, typeColor } from "@/lib/hisab/constants";
import { Card, Chip, Count, Loading, Money, SectionTitle, StatTile } from "@/components/hisab/ui";
import type { Invoice } from "@/lib/hisab/types";

export const Route = createFileRoute("/hisab/")({
  component: Dashboard,
});

type Period = "today" | "7d" | "month" | "all";

const PERIODS: { value: Period; label: string }[] = [
  { value: "today", label: "আজ" },
  { value: "7d", label: "৭ দিন" },
  { value: "month", label: "এই মাস" },
  { value: "all", label: "সব সময়" },
];

function periodStart(p: Period) {
  const now = new Date();
  switch (p) {
    case "today":
      return todayISO();
    case "7d":
      return addDaysISO(-6);
    case "month":
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    default:
      return undefined;
  }
}

const QUICK = [
  {
    to: "/hisab/new",
    search: { type: "sale" },
    label: "বিক্রয়",
    icon: ShoppingCart,
    tone: "#2563eb",
  },
  {
    to: "/hisab/new",
    search: { type: "purchase" },
    label: "ক্রয়",
    icon: Package,
    tone: "#16a34a",
  },
  { to: "/hisab/new", search: { type: "expense" }, label: "খরচ", icon: Receipt, tone: "#ea580c" },
  { to: "/hisab/products", search: undefined, label: "পণ্য", icon: Tags, tone: "#9333ea" },
  { to: "/hisab/stock", search: undefined, label: "স্টক", icon: Boxes, tone: "#0891b2" },
  { to: "/hisab/parties", search: undefined, label: "পার্টি", icon: Users, tone: "#db2777" },
  {
    to: "/hisab/reports",
    search: undefined,
    label: "রিপোর্ট",
    icon: FileBarChart,
    tone: "#0f766e",
  },
  { to: "/hisab/activity", search: undefined, label: "কার্যক্রম", icon: Clock, tone: "#64748b" },
];

function Dashboard() {
  const [period, setPeriod] = React.useState<Period>("today");

  const all = useQuery({
    queryKey: ["hisab", "live-invoices"],
    queryFn: () => listLiveInvoices(),
    staleTime: 30_000,
  });

  const invoices = React.useMemo(() => all.data ?? [], [all.data]);
  const start = periodStart(period);
  const scoped = React.useMemo(
    () => (start ? invoices.filter((i) => i.invoice_date >= start) : invoices),
    [invoices, start],
  );

  const totals = React.useMemo(() => sumUp(scoped), [scoped]);
  const dues = React.useMemo(() => sumUp(invoices), [invoices]);
  const chart = React.useMemo(() => buildDailySeries(invoices, 14), [invoices]);
  const pie = React.useMemo(() => buildPie(scoped), [scoped]);
  const cashbook = React.useMemo(() => buildCashbook(scoped), [scoped]);
  const warnings = React.useMemo(() => buildWarnings(invoices), [invoices]);

  if (all.isLoading) return <Loading />;
  if (all.error) {
    return (
      <Card className="border-rose-200 bg-rose-50 text-[13px] text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
        হিসাব আনা গেল না: {(all.error as Error).message}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* দ্রুত কাজ */}
      <Card>
        <SectionTitle title="দ্রুত কাজ" />
        <div className="grid grid-cols-4 gap-2">
          {QUICK.map((q) => (
            <Link
              key={q.label}
              to={q.to}
              search={q.search as never}
              className="flex flex-col items-center gap-1.5 rounded-xl py-2.5 transition active:scale-95"
            >
              <span
                className="grid h-11 w-11 place-items-center rounded-xl"
                style={{ backgroundColor: `${q.tone}1f`, color: q.tone }}
              >
                <q.icon className="h-5 w-5" />
              </span>
              <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                {q.label}
              </span>
            </Link>
          ))}
        </div>
      </Card>

      {/* সময় বাছাই */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-bold transition",
              period === p.value
                ? "bg-blue-700 text-white shadow-sm"
                : "border border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* এক নজরে */}
      <Card>
        <SectionTitle
          title="এক নজরে"
          right={
            <span className="text-[11px] font-medium text-slate-500">
              {start ? `${bnDate(start)} থেকে` : "শুরু থেকে"}
            </span>
          }
        />
        <div className="grid grid-cols-2 gap-2.5">
          <StatTile
            label="মোট বিক্রয়"
            value={money(totals.sales)}
            tone="blue"
            sub={`${toBn(totals.saleCount)} টি এন্ট্রি`}
            icon={<ShoppingCart className="h-4 w-4" />}
          />
          <StatTile
            label="মোট ক্রয়"
            value={money(totals.purchases)}
            tone="green"
            sub={`${toBn(totals.purchaseCount)} টি এন্ট্রি`}
            icon={<Package className="h-4 w-4" />}
          />
          <StatTile
            label="মোট খরচ"
            value={money(totals.expenses)}
            tone="orange"
            sub={`${toBn(totals.expenseCount)} টি এন্ট্রি`}
            icon={<Receipt className="h-4 w-4" />}
          />
          <StatTile
            label="লাভ"
            value={money(totals.profit)}
            tone={totals.profit >= 0 ? "purple" : "red"}
            sub="বিক্রয় − FIFO ক্রয়মূল্য"
            icon={<TrendingUp className="h-4 w-4" />}
          />
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <StatTile
            label="পাওনা"
            value={money(dues.receivable)}
            tone="blue"
            sub="বিক্রয়ে বাকি — সব সময়"
            icon={<HandCoins className="h-4 w-4" />}
          />
          <StatTile
            label="দেনা"
            value={money(dues.payable)}
            tone="red"
            sub="ক্রয়/খরচে বাকি — সব সময়"
            icon={<Wallet className="h-4 w-4" />}
          />
        </div>
      </Card>

      {/* সতর্কতা */}
      {warnings.length ? (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <SectionTitle
            title={
              <span className="flex items-center gap-1.5 text-amber-900 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4" />
                নজর দিন
              </span>
            }
          />
          <div className="space-y-1.5">
            {warnings.map((w) => (
              <Link
                key={w.key}
                to={w.to}
                search={w.search as never}
                className="flex items-center justify-between gap-3 rounded-lg bg-white/70 px-3 py-2 text-[13px] dark:bg-slate-900/60"
              >
                <span className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <w.icon className="h-4 w-4 text-amber-600" />
                  {w.label}
                </span>
                <Chip color="#d97706">
                  <Count value={w.count} /> টি
                </Chip>
              </Link>
            ))}
          </div>
        </Card>
      ) : null}

      {/* ১৪ দিনের চার্ট */}
      <Card>
        <SectionTitle
          title="১৪ দিনের গতিধারা"
          right={<span className="text-[11px] text-slate-500">বিক্রয় · খরচ · লাভ</span>}
        />
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chart} margin={{ top: 6, right: 4, left: -22, bottom: 0 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="currentColor"
                className="text-slate-200 dark:text-slate-800"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval={1}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={54}
                tickFormatter={(v) => money(v)}
              />
              <Tooltip
                formatter={(value: number, name: string) => [money(value), name]}
                labelStyle={{ fontSize: 12 }}
                contentStyle={{ fontSize: 12, borderRadius: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar
                dataKey="sales"
                name="বিক্রয়"
                fill="#2563eb"
                radius={[4, 4, 0, 0]}
                maxBarSize={16}
              />
              <Bar
                dataKey="expenses"
                name="খরচ"
                fill="#ea580c"
                radius={[4, 4, 0, 0]}
                maxBarSize={16}
              />
              <Line
                type="monotone"
                dataKey="profit"
                name="লাভ"
                stroke="#9333ea"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* পাই + ক্যাশবুক */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <SectionTitle title="টাকা কোথায় গেল" />
          {pie.every((p) => p.value === 0) ? (
            <p className="py-8 text-center text-[13px] text-slate-500">এই সময়ে কোনো হিসাব নেই।</p>
          ) : (
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pie}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={38}
                    outerRadius={68}
                    paddingAngle={2}
                  >
                    {pie.map((p) => (
                      <Cell key={p.name} fill={p.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => money(v)}
                    contentStyle={{ fontSize: 12, borderRadius: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle
            title="ক্যাশবুক"
            right={<span className="text-[11px] text-slate-500">মাধ্যম অনুযায়ী</span>}
          />
          <div className="space-y-2">
            {cashbook.rows.map((r) => (
              <div key={r.method} className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                <div className="flex items-center justify-between text-[13px] font-semibold text-slate-800 dark:text-slate-200">
                  <span>{methodLabel(r.method)}</span>
                  <Money amount={r.net} signed />
                </div>
                <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <ArrowDownLeft className="h-3 w-3 text-emerald-600" />
                    {money(r.in)}
                  </span>
                  <span className="flex items-center gap-1">
                    <ArrowUpRight className="h-3 w-3 text-rose-600" />
                    {money(r.out)}
                  </span>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-[13px] font-bold dark:border-slate-800">
              <span>নিট</span>
              <Money amount={cashbook.net} signed />
            </div>
          </div>
        </Card>
      </div>

      {/* সাম্প্রতিক */}
      <Card>
        <SectionTitle
          title="সাম্প্রতিক হিসাব"
          right={
            <Link
              to="/hisab/list"
              className="text-[12px] font-semibold text-blue-700 dark:text-blue-400"
            >
              সব দেখুন
            </Link>
          }
        />
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {invoices.slice(0, 6).map((inv) => (
            <Link
              key={inv.id}
              to="/hisab/invoice/$id"
              params={{ id: inv.id }}
              className="flex items-center gap-3 py-2.5"
            >
              <span
                className="h-8 w-1 shrink-0 rounded-full"
                style={{ backgroundColor: typeColor(inv.type) }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-slate-800 dark:text-slate-200">
                  {inv.party_name || inv.details || "বিবরণ নেই"}
                </p>
                <p className="text-[11px] text-slate-500">
                  {bnDate(inv.invoice_date)} · {inv.created_by_name}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[13px] font-bold" style={{ color: typeColor(inv.type) }}>
                  {money(inv.total_amount)}
                </p>
                {num(inv.due_amount) > 0 ? (
                  <p className="text-[10px] font-semibold text-rose-600">
                    বাকি {money(inv.due_amount)}
                  </p>
                ) : null}
              </div>
            </Link>
          ))}
          {invoices.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-slate-500">
              এখনো কোনো হিসাব লেখা হয়নি। নিচের ➕ বোতাম দিয়ে শুরু করুন।
            </p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------ হিসাব ------------------------------ */

function sumUp(rows: Invoice[]) {
  const t = {
    sales: 0,
    purchases: 0,
    expenses: 0,
    profit: 0,
    receivable: 0,
    payable: 0,
    saleCount: 0,
    purchaseCount: 0,
    expenseCount: 0,
  };
  for (const r of rows) {
    const amount = num(r.total_amount);
    if (r.type === "sale") {
      t.sales += amount;
      t.profit += num(r.profit);
      t.receivable += num(r.due_amount);
      t.saleCount += 1;
    } else if (r.type === "purchase") {
      t.purchases += amount;
      t.payable += num(r.due_amount);
      t.purchaseCount += 1;
    } else {
      t.expenses += amount;
      t.payable += num(r.due_amount);
      t.expenseCount += 1;
    }
  }
  return t;
}

function buildDailySeries(rows: Invoice[], days: number) {
  const out: { label: string; sales: number; expenses: number; profit: number }[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const iso = addDaysISO(-i);
    const dayRows = rows.filter((r) => r.invoice_date === iso);
    const t = sumUp(dayRows);
    out.push({
      label: toBn(Number(iso.slice(8, 10))),
      sales: Math.round(t.sales),
      expenses: Math.round(t.expenses),
      profit: Math.round(t.profit),
    });
  }
  return out;
}

function buildPie(rows: Invoice[]) {
  const t = sumUp(rows);
  return [
    { name: "ক্রয়", value: Math.round(t.purchases), color: "#16a34a" },
    { name: "খরচ", value: Math.round(t.expenses), color: "#ea580c" },
    { name: "লাভ", value: Math.max(0, Math.round(t.profit)), color: "#9333ea" },
  ];
}

/** টাকা ঢুকল / বেরোল — মাধ্যম অনুযায়ী */
function buildCashbook(rows: Invoice[]) {
  const map = new Map<string, { method: string; in: number; out: number; net: number }>();
  for (const m of PAYMENT_METHODS) map.set(m.value, { method: m.value, in: 0, out: 0, net: 0 });

  for (const r of rows) {
    const entry = map.get(r.payment_method) ?? { method: r.payment_method, in: 0, out: 0, net: 0 };
    const cash = num(r.paid_amount); // যতটুকু হাতবদল হয়েছে
    if (r.type === "sale") entry.in += cash;
    else entry.out += cash;
    entry.net = entry.in - entry.out;
    map.set(r.payment_method, entry);
  }

  const all = [...map.values()].filter((r) => r.in > 0 || r.out > 0);
  return {
    rows: all.length ? all : [{ method: "cash", in: 0, out: 0, net: 0 }],
    net: all.reduce((s, r) => s + r.net, 0),
  };
}

function buildWarnings(rows: Invoice[]) {
  const noImage = rows.filter((r) => !r.image_url);
  const noCost = rows.filter(
    (r) => r.type === "sale" && num(r.cogs) <= 0 && num(r.total_amount) > 0,
  );
  const pendingGoods = rows.filter(
    (r) => r.goods_status === "pending" || r.goods_status === "partial",
  );
  const shortfall = rows.filter((r) => r.stock_shortfall);

  const oldest = pendingGoods.reduce((max, r) => Math.max(max, daysBetween(r.invoice_date)), 0);

  const out: {
    key: string;
    label: string;
    count: number;
    icon: typeof Camera;
    to: string;
    search?: Record<string, unknown>;
  }[] = [];

  if (noImage.length)
    out.push({
      key: "img",
      label: "ছবি ছাড়া এন্ট্রি",
      count: noImage.length,
      icon: Camera,
      to: "/hisab/list",
    });
  if (noCost.length)
    out.push({
      key: "cost",
      label: "ক্রয়মূল্য ছাড়া বিক্রয়",
      count: noCost.length,
      icon: Tags,
      to: "/hisab/products",
    });
  if (pendingGoods.length)
    out.push({
      key: "goods",
      label: `অপেক্ষমাণ মাল${oldest > 0 ? ` — সবচেয়ে পুরনোটি ${toBn(oldest)} দিন` : ""}`,
      count: pendingGoods.length,
      icon: Clock,
      to: "/hisab/list",
      search: { pending: true },
    });
  if (shortfall.length)
    out.push({
      key: "short",
      label: "স্টকে মাল ছিল না",
      count: shortfall.length,
      icon: Boxes,
      to: "/hisab/stock",
    });

  return out;
}
