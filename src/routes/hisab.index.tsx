import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ComposedChart,
} from "recharts";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Camera,
  CheckCircle2,
  Clock,
  FileBarChart,
  HandCoins,
  Package,
  Receipt,
  ShoppingCart,
  Tags,
  Trophy,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { listLiveInvoices, listStock, listTopProducts } from "@/lib/hisab/api";
import {
  addDaysISO,
  bnDate,
  daysBetween,
  money,
  moneyAxis,
  num,
  qtyText,
  toBn,
  todayISO,
} from "@/lib/hisab/format";
import { methodLabel, PAYMENT_METHODS, typeColor } from "@/lib/hisab/constants";
import { readChartColors, type ChartColors } from "@/lib/hisab/chart";
import {
  Card,
  ChartTooltip,
  Chip,
  Count,
  IconTile,
  Loading,
  MiniStat,
  Money,
  Pill,
  SectionTitle,
  StatCard,
  type Tone,
} from "@/components/hisab/ui";
import type { Invoice, StockRow } from "@/lib/hisab/types";

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
  if (p === "today") return todayISO();
  if (p === "7d") return addDaysISO(-6);
  if (p === "month")
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  return undefined;
}

const QUICK: {
  to: string;
  search?: { type: string };
  label: string;
  icon: typeof ShoppingCart;
  tone: Tone;
}[] = [
  {
    to: "/hisab/new",
    search: { type: "sale" },
    label: "বিক্রয় লিখুন",
    icon: ShoppingCart,
    tone: "sky",
  },
  {
    to: "/hisab/new",
    search: { type: "purchase" },
    label: "ক্রয় লিখুন",
    icon: Package,
    tone: "mint",
  },
  {
    to: "/hisab/new",
    search: { type: "expense" },
    label: "খরচ লিখুন",
    icon: Receipt,
    tone: "amber",
  },
  { to: "/hisab/parties", label: "বাকির খাতা", icon: Wallet, tone: "rose" },
];

function Dashboard() {
  const [period, setPeriod] = React.useState<Period>("today");
  const [trendDays, setTrendDays] = React.useState<7 | 30>(7);
  const [colors, setColors] = React.useState<ChartColors>(() => readChartColors());

  // থিম বদলালে চার্টের রঙও বদলাবে
  React.useEffect(() => {
    const update = () => setColors(readChartColors());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  const start = periodStart(period);

  const all = useQuery({
    queryKey: ["hisab", "live-invoices"],
    queryFn: () => listLiveInvoices(),
    staleTime: 30_000,
  });
  const stock = useQuery({ queryKey: ["hisab", "stock"], queryFn: listStock, staleTime: 60_000 });
  const top = useQuery({
    queryKey: ["hisab", "top-products", start ?? "all"],
    queryFn: () => listTopProducts(start),
    staleTime: 60_000,
  });

  const invoices = React.useMemo(() => all.data ?? [], [all.data]);
  const scoped = React.useMemo(
    () => (start ? invoices.filter((i) => i.invoice_date >= start) : invoices),
    [invoices, start],
  );

  const today = React.useMemo(
    () => sumUp(invoices.filter((i) => i.invoice_date === todayISO())),
    [invoices],
  );
  const totals = React.useMemo(() => sumUp(scoped), [scoped]);
  const dues = React.useMemo(() => sumUp(invoices), [invoices]);
  const trend = React.useMemo(() => buildSeries(invoices, trendDays), [invoices, trendDays]);
  const pie = React.useMemo(() => buildPie(scoped, colors), [scoped, colors]);
  const cashbook = React.useMemo(() => buildCashbook(scoped), [scoped]);
  const alerts = React.useMemo(
    () => buildAlerts(invoices, stock.data ?? []),
    [invoices, stock.data],
  );
  const topProducts = top.data ?? [];

  const trendTotal = trend.reduce((s, d) => s + d.sales, 0);
  const trendAvg = trend.length ? trendTotal / trend.length : 0;

  if (all.isLoading) return <Loading />;
  if (all.error) {
    return (
      <Card className="border-rose/30 bg-rose/10 text-[13px] text-rose">
        হিসাব আনা গেল না: {(all.error as Error).message}
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* ---------- দ্রুত কাজ ---------- */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {QUICK.map((q) => (
          <Link
            key={q.label}
            to={q.to}
            search={q.search as never}
            className="hb-card-glow flex items-center gap-2.5 rounded-2xl border border-line bg-card p-3 transition hover:border-brand/40 active:scale-[0.98]"
            style={{ "--tint": `var(--a-${q.tone})` } as React.CSSProperties}
          >
            <IconTile tone={q.tone} size={36}>
              <q.icon className="h-4.5 w-4.5" />
            </IconTile>
            <span className="relative text-[12.5px] font-bold text-ink">{q.label}</span>
          </Link>
        ))}
      </div>

      {/* ---------- আজকের হিসাব ---------- */}
      <section>
        <SectionTitle
          title="আজকের হিসাব"
          right={
            <Chip color="var(--a-sky)">
              <Clock className="h-3 w-3" />
              {bnDate(todayISO())}
            </Chip>
          }
        />
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <StatCard
            label="আজকের বিক্রয়"
            value={money(today.sales)}
            sub={`${toBn(today.saleCount)} টি বিক্রয়`}
            tone="sky"
            icon={<ShoppingCart className="h-4 w-4" />}
          />
          <StatCard
            label="আজকের লাভ"
            value={money(today.profit)}
            sub={
              today.sales > 0
                ? `${toBn(Math.round((today.profit / today.sales) * 100))}% মার্জিন`
                : "বিক্রয় নেই"
            }
            tone="mint"
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <StatCard
            label="আজকের খরচ"
            value={money(today.expenses)}
            sub={`${toBn(today.expenseCount)} টি খরচ`}
            tone="rose"
            icon={<Receipt className="h-4 w-4" />}
          />
          <StatCard
            label="মোট বাকি"
            value={money(dues.receivable)}
            sub="ক্রেতাদের কাছে পাওনা"
            tone="amber"
            icon={<HandCoins className="h-4 w-4" />}
          />
        </div>
      </section>

      {/* ---------- সময় ধরে হিসাব ---------- */}
      <section>
        <SectionTitle
          title="সময় ধরে হিসাব"
          right={
            <Link
              to="/hisab/reports"
              className="flex items-center gap-1 rounded-lg bg-card-2 px-2.5 py-1.5 text-[11.5px] font-bold text-dim transition hover:text-ink"
            >
              বিস্তারিত
              <ArrowRight className="h-3 w-3" />
            </Link>
          }
        />

        <div className="mb-2.5 flex gap-1.5 overflow-x-auto pb-0.5">
          {PERIODS.map((p) => (
            <Pill key={p.value} active={period === p.value} onClick={() => setPeriod(p.value)}>
              {p.label}
            </Pill>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <MiniStat
            label="মোট বিক্রয়"
            value={money(totals.sales)}
            tone="sky"
            icon={<ShoppingCart className="h-3.5 w-3.5" />}
          />
          <MiniStat
            label="ক্রয়মূল্য"
            value={money(totals.cogs)}
            tone="violet"
            icon={<Package className="h-3.5 w-3.5" />}
          />
          <MiniStat
            label="দোকান খরচ"
            value={money(totals.expenses)}
            tone="rose"
            icon={<Receipt className="h-3.5 w-3.5" />}
          />
          <MiniStat
            label="নিট লাভ"
            value={money(totals.profit - totals.expenses)}
            tone="mint"
            icon={<TrendingUp className="h-3.5 w-3.5" />}
          />
        </div>
      </section>

      {/* ---------- সতর্কতা ---------- */}
      {alerts.length ? (
        <Card className="border-amber/25 bg-amber/[0.06]">
          <SectionTitle
            title={
              <span className="flex items-center gap-1.5 text-amber">
                <AlertTriangle className="h-4 w-4" />
                নজর দিন
              </span>
            }
          />
          <div className="space-y-1.5">
            {alerts.map((a) => (
              <Link
                key={a.key}
                to={a.to}
                search={a.search as never}
                className="flex items-center gap-2.5 rounded-xl bg-card/70 px-3 py-2.5 text-[13px] transition hover:bg-card"
              >
                <IconTile tone={a.tone} size={28}>
                  <a.icon className="h-3.5 w-3.5" />
                </IconTile>
                <span className="min-w-0 flex-1 truncate text-dim">{a.label}</span>
                <Chip color="var(--a-amber)">
                  <Count value={a.count} /> টি
                </Chip>
              </Link>
            ))}
          </div>
        </Card>
      ) : null}

      {/* ---------- বিক্রয়ের গতিধারা ---------- */}
      <Card>
        <SectionTitle
          title="বিক্রয়ের গতিধারা"
          right={
            <div className="flex gap-1.5">
              <Pill active={trendDays === 7} onClick={() => setTrendDays(7)}>
                ৭ দিন
              </Pill>
              <Pill active={trendDays === 30} onClick={() => setTrendDays(30)}>
                ৩০ দিন
              </Pill>
            </div>
          }
        />

        <div className="mb-3 grid grid-cols-2 gap-2.5">
          <div className="rounded-xl bg-card-2 px-3 py-2.5">
            <p className="text-[11px] font-semibold text-faint">
              {toBn(trendDays)} দিনে মোট বিক্রয়
            </p>
            <p className="mt-0.5 text-[17px] font-bold text-ink">{money(trendTotal)}</p>
          </div>
          <div className="rounded-xl bg-card-2 px-3 py-2.5">
            <p className="text-[11px] font-semibold text-faint">দৈনিক গড়</p>
            <p className="mt-0.5 text-[17px] font-bold text-ink">{money(trendAvg)}</p>
          </div>
        </div>

        <div className="h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trend} margin={{ top: 8, right: 10, left: -6, bottom: 0 }}>
              <defs>
                <linearGradient id="hb-sales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors.s1} stopOpacity={0.32} />
                  <stop offset="100%" stopColor={colors.s1} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={colors.grid} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: colors.dim }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={18}
              />
              <YAxis
                tick={{ fontSize: 10, fill: colors.dim }}
                tickLine={false}
                axisLine={false}
                width={52}
                tickFormatter={(v) => moneyAxis(v)}
              />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ stroke: colors.line, strokeWidth: 1 }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, color: colors.dim }}
                iconType="circle"
                iconSize={8}
              />
              <ReferenceLine
                y={trendAvg}
                stroke={colors.dim}
                strokeDasharray="4 4"
                label={{ value: "গড়", position: "right", fontSize: 10, fill: colors.dim }}
              />
              <Area
                type="monotone"
                dataKey="sales"
                name="বিক্রয়"
                stroke={colors.s1}
                strokeWidth={2}
                fill="url(#hb-sales)"
                dot={trendDays === 7 ? { r: 3, fill: colors.s1, strokeWidth: 0 } : false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: colors.card }}
              />
              <Line
                type="monotone"
                dataKey="expenses"
                name="খরচ"
                stroke={colors.s2}
                strokeWidth={2}
                dot={trendDays === 7 ? { r: 3, fill: colors.s2, strokeWidth: 0 } : false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: colors.card }}
              />
              <Line
                type="monotone"
                dataKey="profit"
                name="লাভ"
                stroke={colors.s3}
                strokeWidth={2}
                dot={trendDays === 7 ? { r: 3, fill: colors.s3, strokeWidth: 0 } : false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: colors.card }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* ---------- পাই + ক্যাশবুক ---------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle title="টাকা কোথায় গেল" />
          {pie.every((p) => p.value === 0) ? (
            <p className="py-12 text-center text-[13px] text-dim">এই সময়ে কোনো হিসাব নেই।</p>
          ) : (
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pie}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={44}
                    outerRadius={74}
                    paddingAngle={2}
                    stroke={colors.card}
                    strokeWidth={2}
                  >
                    {pie.map((p) => (
                      <Cell key={p.name} fill={p.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: 11, color: colors.dim }}
                    iconType="circle"
                    iconSize={8}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle
            title="টাকার চলাচল"
            right={<span className="text-[11px] text-faint">মাধ্যম অনুযায়ী</span>}
          />
          <div className="space-y-2">
            {cashbook.rows.map((r) => (
              <div key={r.method} className="rounded-xl bg-card-2 px-3 py-2.5">
                <div className="flex items-center justify-between text-[13px] font-bold text-ink">
                  <span>{methodLabel(r.method)}</span>
                  <Money amount={r.net} signed />
                </div>
                <div className="mt-1 flex items-center gap-3 text-[11px] text-faint">
                  <span className="flex items-center gap-1">
                    <ArrowDownLeft className="h-3 w-3 text-mint" />
                    {money(r.in)}
                  </span>
                  <span className="flex items-center gap-1">
                    <ArrowUpRight className="h-3 w-3 text-rose" />
                    {money(r.out)}
                  </span>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-line pt-2.5 text-[13px] font-bold text-ink">
              <span>নিট</span>
              <Money amount={cashbook.net} signed />
            </div>
          </div>
        </Card>
      </div>

      {/* ---------- সেরা পণ্য ---------- */}
      <Card>
        <SectionTitle
          title="এই সময়ের সেরা পণ্য"
          right={
            <Link
              to="/hisab/stock"
              className="flex items-center gap-1 rounded-lg bg-card-2 px-2.5 py-1.5 text-[11.5px] font-bold text-dim transition hover:text-ink"
            >
              স্টক
              <ArrowRight className="h-3 w-3" />
            </Link>
          }
        />
        {topProducts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <CheckCircle2 className="h-7 w-7 text-mint" />
            <p className="text-[13px] font-semibold text-ink">এই সময়ে কোনো পণ্য বিক্রি হয়নি</p>
            <p className="text-[11.5px] text-dim">বিক্রয় লিখলে এখানে সেরা পণ্যগুলো দেখা যাবে।</p>
          </div>
        ) : (
          <div className="space-y-2">
            {topProducts.map((p, i) => (
              <div
                key={p.name}
                className={
                  i === 0
                    ? "hb-card-glow flex items-center gap-3 rounded-xl border border-amber/25 bg-amber/[0.07] p-3"
                    : "flex items-center gap-3 rounded-xl bg-card-2 p-3"
                }
                style={
                  i === 0 ? ({ "--tint": "var(--a-amber)" } as React.CSSProperties) : undefined
                }
              >
                <IconTile tone={i === 0 ? "amber" : "slate"} size={32}>
                  {i === 0 ? (
                    <Trophy className="h-4 w-4" />
                  ) : (
                    <span className="text-[12px] font-bold">{toBn(i + 1)}</span>
                  )}
                </IconTile>
                <div className="min-w-0 flex-1">
                  {i === 0 ? (
                    <p className="text-[9.5px] font-bold uppercase tracking-wider text-amber">
                      সেরা বিক্রেতা
                    </p>
                  ) : null}
                  <p className="truncate text-[13.5px] font-bold text-ink">{p.name}</p>
                  <p className="text-[11px] text-faint">{qtyText(p.qty)} একক বিক্রি</p>
                </div>
                <span className="shrink-0 text-[14px] font-bold text-ink">{money(p.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ---------- সাম্প্রতিক ---------- */}
      <Card>
        <SectionTitle
          title="সাম্প্রতিক হিসাব"
          right={
            <Link
              to="/hisab/list"
              className="flex items-center gap-1 rounded-lg bg-card-2 px-2.5 py-1.5 text-[11.5px] font-bold text-dim transition hover:text-ink"
            >
              সব দেখুন
              <ArrowRight className="h-3 w-3" />
            </Link>
          }
        />
        {invoices.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-dim">
            এখনো কোনো হিসাব লেখা হয়নি। উপরের “দ্রুত যোগ” দিয়ে শুরু করুন।
          </p>
        ) : (
          <div className="divide-y divide-line">
            {invoices.slice(0, 6).map((inv) => (
              <Link
                key={inv.id}
                to="/hisab/invoice/$id"
                params={{ id: inv.id }}
                className="flex items-center gap-3 py-2.5 transition hover:opacity-80"
              >
                <span
                  className="h-9 w-1 shrink-0 rounded-full"
                  style={{ backgroundColor: typeColor(inv.type) }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-ink">
                    {inv.party_name || inv.details || "বিবরণ নেই"}
                  </p>
                  <p className="text-[11px] text-faint">
                    {bnDate(inv.invoice_date)} · {inv.created_by_name}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[13.5px] font-bold" style={{ color: typeColor(inv.type) }}>
                    {money(inv.total_amount)}
                  </p>
                  {num(inv.due_amount) > 0 ? (
                    <p className="text-[10px] font-bold text-rose">বাকি {money(inv.due_amount)}</p>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ============================ হিসাব ============================ */

function sumUp(rows: Invoice[]) {
  const t = {
    sales: 0,
    purchases: 0,
    expenses: 0,
    profit: 0,
    cogs: 0,
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
      t.cogs += num(r.cogs);
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

function buildSeries(rows: Invoice[], days: number) {
  const out: { label: string; sales: number; expenses: number; profit: number }[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const iso = addDaysISO(-i);
    const t = sumUp(rows.filter((r) => r.invoice_date === iso));
    out.push({
      label: `${toBn(Number(iso.slice(8, 10)))}/${toBn(Number(iso.slice(5, 7)))}`,
      sales: Math.round(t.sales),
      expenses: Math.round(t.expenses),
      profit: Math.round(t.profit),
    });
  }
  return out;
}

function buildPie(rows: Invoice[], c: ChartColors) {
  const t = sumUp(rows);
  return [
    { name: "ক্রয়", value: Math.round(t.purchases), color: c.s1 },
    { name: "খরচ", value: Math.round(t.expenses), color: c.s2 },
    { name: "লাভ", value: Math.max(0, Math.round(t.profit)), color: c.s3 },
  ];
}

/** টাকা ঢুকল / বেরোল — মাধ্যম অনুযায়ী */
function buildCashbook(rows: Invoice[]) {
  const map = new Map<string, { method: string; in: number; out: number; net: number }>();
  for (const m of PAYMENT_METHODS) map.set(m.value, { method: m.value, in: 0, out: 0, net: 0 });

  for (const r of rows) {
    const entry = map.get(r.payment_method) ?? { method: r.payment_method, in: 0, out: 0, net: 0 };
    const cash = num(r.paid_amount);
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

function buildAlerts(rows: Invoice[], stock: StockRow[]) {
  const noImage = rows.filter((r) => !r.image_url);
  const pendingGoods = rows.filter(
    (r) => r.goods_status === "pending" || r.goods_status === "partial",
  );
  const shortfall = rows.filter((r) => r.stock_shortfall);
  const lowStock = stock.filter((s) => s.stock_state === "low");
  const negative = stock.filter((s) => s.stock_state === "negative");

  const oldest = pendingGoods.reduce((max, r) => Math.max(max, daysBetween(r.invoice_date)), 0);

  const out: {
    key: string;
    label: string;
    count: number;
    icon: typeof Camera;
    tone: Tone;
    to: string;
    search?: Record<string, unknown>;
  }[] = [];

  if (pendingGoods.length)
    out.push({
      key: "goods",
      label: `অপেক্ষমাণ মাল${oldest > 0 ? ` — সবচেয়ে পুরনোটি ${toBn(oldest)} দিন` : ""}`,
      count: pendingGoods.length,
      icon: Clock,
      tone: "amber",
      to: "/hisab/list",
      search: { pending: true },
    });
  if (negative.length)
    out.push({
      key: "neg",
      label: "ঋণাত্মক স্টক",
      count: negative.length,
      icon: Boxes,
      tone: "rose",
      to: "/hisab/stock",
    });
  if (lowStock.length)
    out.push({
      key: "low",
      label: "স্টক কমে এসেছে",
      count: lowStock.length,
      icon: Package,
      tone: "amber",
      to: "/hisab/stock",
    });
  if (shortfall.length)
    out.push({
      key: "short",
      label: "স্টকে মাল ছিল না",
      count: shortfall.length,
      icon: AlertTriangle,
      tone: "rose",
      to: "/hisab/stock",
    });
  if (noImage.length)
    out.push({
      key: "img",
      label: "ছবি ছাড়া এন্ট্রি",
      count: noImage.length,
      icon: Camera,
      tone: "violet",
      to: "/hisab/list",
    });

  return out;
}
