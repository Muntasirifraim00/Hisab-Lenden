import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Boxes, ChevronDown, Search, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { listStock, listStockMoves } from "@/lib/hisab/api";
import { STOCK_REASONS, unitLabel } from "@/lib/hisab/constants";
import { bnDate, money, num, qtyText, toBn } from "@/lib/hisab/format";
import { Button, Card, Chip, Empty, Input, Loading, SectionTitle } from "@/components/hisab/ui";

export const Route = createFileRoute("/hisab/stock")({
  component: StockPage,
});

type Lens = "all" | "low" | "negative";

function StockPage() {
  const [text, setText] = React.useState("");
  const [lens, setLens] = React.useState<Lens>("all");
  const [openId, setOpenId] = React.useState<string | null>(null);

  const stock = useQuery({ queryKey: ["hisab", "stock"], queryFn: listStock, staleTime: 20_000 });
  const rows = (stock.data ?? []).filter((r) => {
    if (text && !r.product_name.toLowerCase().includes(text.toLowerCase())) return false;
    if (lens === "low") return r.stock_state === "low";
    if (lens === "negative") return r.stock_state === "negative";
    return true;
  });

  const totals = (stock.data ?? []).reduce(
    (acc, r) => {
      acc.value += num(r.stock_value);
      if (r.stock_state === "low") acc.low += 1;
      if (r.stock_state === "negative") acc.negative += 1;
      return acc;
    },
    { value: 0, low: 0, negative: 0 },
  );

  if (stock.isLoading) return <Loading />;

  return (
    <div className="space-y-3">
      <Card>
        <SectionTitle title="গুদামের অবস্থা" />
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-card-2 p-3">
            <p className="text-[10px] font-semibold text-dim">মোট মূল্য</p>
            <p className="mt-0.5 text-[15px] font-bold">{money(totals.value)}</p>
          </div>
          <button
            onClick={() => setLens(lens === "low" ? "all" : "low")}
            className={cn(
              "rounded-xl p-3 transition",
              lens === "low" ? "bg-amber/25" : "bg-amber/10",
            )}
          >
            <p className="text-[10px] font-semibold text-amber">লো-স্টক</p>
            <p className="mt-0.5 text-[15px] font-bold text-amber">{toBn(totals.low)}</p>
          </button>
          <button
            onClick={() => setLens(lens === "negative" ? "all" : "negative")}
            className={cn(
              "rounded-xl p-3 transition",
              lens === "negative" ? "bg-rose/25" : "bg-rose/10",
            )}
          >
            <p className="text-[10px] font-semibold text-rose">ঋণাত্মক</p>
            <p className="mt-0.5 text-[15px] font-bold text-rose">{toBn(totals.negative)}</p>
          </button>
        </div>
      </Card>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="পণ্য খুঁজুন"
          className="pl-9"
        />
      </div>

      {rows.length === 0 ? (
        <Empty
          icon={<Boxes className="h-8 w-8" />}
          title="কিছু নেই"
          hint="পণ্য পাতা থেকে পণ্য যোগ করুন, তারপর ক্রয় লিখলে স্টক আপনাআপনি বাড়বে।"
          action={
            <Link to="/hisab/products">
              <Button size="sm" variant="outline">
                পণ্য যোগ করুন
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Card key={r.product_id} className="p-0">
              <button
                onClick={() => setOpenId(openId === r.product_id ? null : r.product_id)}
                className="flex w-full items-center gap-3 p-3 text-left"
              >
                <span
                  className="h-10 w-1 shrink-0 rounded-full"
                  style={{
                    backgroundColor:
                      r.stock_state === "negative"
                        ? "#dc2626"
                        : r.stock_state === "low"
                          ? "#d97706"
                          : "#16a34a",
                  }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-bold text-ink">{r.product_name}</p>
                  <p className="text-[11px] text-dim">
                    {r.category_name ?? "ক্যাটাগরি নেই"}
                    {num(r.low_stock_threshold) > 0
                      ? ` · সীমা ${qtyText(r.low_stock_threshold)}`
                      : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className={cn(
                      "text-[15px] font-bold",
                      r.stock_state === "negative"
                        ? "text-rose"
                        : r.stock_state === "low"
                          ? "text-amber"
                          : "text-ink",
                    )}
                  >
                    {qtyText(r.qty_on_hand)}{" "}
                    <span className="text-[11px] font-medium">{unitLabel(r.unit)}</span>
                  </p>
                  <p className="text-[11px] text-dim">{money(r.stock_value)}</p>
                </div>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-faint transition",
                    openId === r.product_id && "rotate-180",
                  )}
                />
              </button>

              {r.stock_state === "negative" ? (
                <p className="mx-3 mb-3 flex items-start gap-1.5 rounded-lg bg-rose/10 px-2.5 py-2 text-[11px] text-rose">
                  <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                  স্টকে যা ছিল তার বেশি বিক্রি হয়েছে। ক্রয় বা ওপেনিং স্টক লিখতে ভুলে গেছেন কি না
                  দেখুন।
                </p>
              ) : null}

              {openId === r.product_id ? <Ledger productId={r.product_id} /> : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/** পণ্যের খতিয়ান — প্রতিটা নড়াচড়ার ইতিহাস */
function Ledger({ productId }: { productId: string }) {
  const moves = useQuery({
    queryKey: ["hisab", "stock-moves", productId],
    queryFn: () => listStockMoves(productId),
  });

  if (moves.isLoading) return <Loading label="খতিয়ান আনছি…" />;

  const rows = moves.data ?? [];
  if (!rows.length) {
    return <p className="px-3 pb-3 text-[12px] text-dim">কোনো নড়াচড়া নেই।</p>;
  }

  // চলমান জেরে — সবচেয়ে পুরনো থেকে যোগ করে
  let running = 0;
  const withBalance = [...rows]
    .reverse()
    .map((m) => {
      running += num(m.qty);
      return { ...m, balance: running };
    })
    .reverse();

  return (
    <div className="border-t border-line px-3 py-2">
      <p className="mb-1.5 text-[11px] font-bold text-dim">খতিয়ান</p>
      <div className="divide-y divide-line">
        {withBalance.map((m) => (
          <div key={m.id} className="flex items-center gap-2.5 py-2">
            <Chip color={num(m.qty) >= 0 ? "#16a34a" : "#dc2626"}>
              {num(m.qty) >= 0 ? "+" : "−"}
              {qtyText(Math.abs(num(m.qty)))}
            </Chip>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-ink">
                {STOCK_REASONS[m.reason] ?? m.reason}
                {m.note ? <span className="ml-1 font-normal text-faint">· {m.note}</span> : null}
              </p>
              <p className="text-[10px] text-dim">
                {bnDate(m.moved_on)} · {m.created_by_name} · দর {money(m.unit_cost)}
              </p>
            </div>
            {m.invoice_id ? (
              <Link
                to="/hisab/invoice/$id"
                params={{ id: m.invoice_id }}
                className="shrink-0 text-[11px] font-semibold text-brand"
              >
                দেখুন
              </Link>
            ) : null}
            <span className="w-12 shrink-0 text-right text-[11px] font-bold tabular-nums text-dim">
              {qtyText(m.balance)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
