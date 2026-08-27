import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Users } from "lucide-react";
import { listParties } from "@/lib/hisab/api";
import { bnDate, money, num } from "@/lib/hisab/format";
import { Card, Empty, Input, Loading, SectionTitle, StatTile } from "@/components/hisab/ui";

export const Route = createFileRoute("/hisab/parties")({
  component: PartiesPage,
});

type Sort = "recent" | "receivable" | "payable";

function PartiesPage() {
  const [text, setText] = React.useState("");
  const [sort, setSort] = React.useState<Sort>("recent");

  const parties = useQuery({
    queryKey: ["hisab", "parties"],
    queryFn: listParties,
    staleTime: 30_000,
  });

  const rows = React.useMemo(() => {
    const filtered = (parties.data ?? []).filter((p) =>
      p.party_name.toLowerCase().includes(text.toLowerCase()),
    );
    return [...filtered].sort((a, b) => {
      if (sort === "receivable") return num(b.receivable) - num(a.receivable);
      if (sort === "payable") return num(b.payable) - num(a.payable);
      return (b.last_entry_date ?? "").localeCompare(a.last_entry_date ?? "");
    });
  }, [parties.data, text, sort]);

  const totals = (parties.data ?? []).reduce(
    (acc, p) => {
      acc.receivable += num(p.receivable);
      acc.payable += num(p.payable);
      return acc;
    },
    { receivable: 0, payable: 0 },
  );

  if (parties.isLoading) return <Loading />;

  return (
    <div className="space-y-3">
      <Card>
        <SectionTitle title="পার্টির খাতা" />
        <div className="grid grid-cols-2 gap-2.5">
          <StatTile
            label="মোট পাওনা"
            value={money(totals.receivable)}
            tone="blue"
            sub="ক্রেতাদের কাছে"
          />
          <StatTile label="মোট দেনা" value={money(totals.payable)} tone="red" sub="সরবরাহকারীদের" />
        </div>
      </Card>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="পার্টির নাম খুঁজুন"
          className="pl-9"
        />
      </div>

      <div className="flex gap-1.5">
        {(
          [
            { value: "recent", label: "সাম্প্রতিক" },
            { value: "receivable", label: "সবচেয়ে বেশি পাওনা" },
            { value: "payable", label: "সবচেয়ে বেশি দেনা" },
          ] as { value: Sort; label: string }[]
        ).map((s) => (
          <button
            key={s.value}
            onClick={() => setSort(s.value)}
            className={
              sort === s.value
                ? "rounded-full bg-blue-700 px-3 py-1.5 text-[12px] font-bold text-white"
                : "rounded-full border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300"
            }
          >
            {s.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <Empty
          icon={<Users className="h-8 w-8" />}
          title="কোনো পার্টি নেই"
          hint="হিসাব লেখার সময় পার্টির নাম দিলে এখানে সারাংশ জমা হতে থাকবে।"
        />
      ) : (
        <div className="space-y-2">
          {rows.map((p) => (
            <Link
              key={p.party_name}
              to="/hisab/list"
              search={{ party: p.party_name }}
              className="block rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-bold text-slate-800 dark:text-slate-200">
                    {p.party_name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    শেষ লেনদেন {bnDate(p.last_entry_date)}
                  </p>
                </div>
                <div className="shrink-0 text-right text-[11px]">
                  {num(p.receivable) > 0 ? (
                    <p className="font-bold text-blue-700 dark:text-blue-400">
                      পাওনা {money(p.receivable)}
                    </p>
                  ) : null}
                  {num(p.payable) > 0 ? (
                    <p className="font-bold text-rose-600">দেনা {money(p.payable)}</p>
                  ) : null}
                  {num(p.receivable) === 0 && num(p.payable) === 0 ? (
                    <p className="text-emerald-600">সব চুকে গেছে</p>
                  ) : null}
                </div>
              </div>

              <div className="mt-2 flex gap-3 text-[11px] text-slate-500">
                <span>বিক্রয় {money(p.total_sales)}</span>
                <span>ক্রয় {money(p.total_purchases)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
