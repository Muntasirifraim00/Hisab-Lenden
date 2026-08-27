import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { listInvoices } from "@/lib/hisab/api";
import { typeColor, typeLabel } from "@/lib/hisab/constants";
import { bnDateLong, bnDateTime, money, num, toBn, todayISO, addDaysISO } from "@/lib/hisab/format";
import { Avatar, Card, Chip, Empty, Loading } from "@/components/hisab/ui";
import type { Invoice } from "@/lib/hisab/types";

export const Route = createFileRoute("/hisab/activity")({
  component: ActivityPage,
});

function ActivityPage() {
  const query = useQuery({
    queryKey: ["hisab", "activity"],
    queryFn: () => listInvoices({}, 250),
    staleTime: 20_000,
  });

  const days = React.useMemo(() => groupByDay(query.data ?? []), [query.data]);

  if (query.isLoading) return <Loading />;

  if (!days.length) {
    return (
      <Empty
        icon={<Clock className="h-8 w-8" />}
        title="এখনো কিছু হয়নি"
        hint="হিসাব লেখা শুরু করলে দিন ধরে ধরে সব এখানে জমা হবে।"
      />
    );
  }

  return (
    <div className="space-y-4">
      {days.map((day) => (
        <div key={day.date}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[13px] font-bold text-slate-800 dark:text-slate-200">
              {dayLabel(day.date)}
            </h2>
            <span className="text-[11px] text-slate-500">
              {toBn(day.rows.length)} টি · {money(day.total)}
            </span>
          </div>

          <Card className="p-0">
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {day.rows.map((r) => (
                <Link
                  key={r.id}
                  to="/hisab/invoice/$id"
                  params={{ id: r.id }}
                  className="flex items-center gap-3 p-3"
                >
                  <Avatar name={r.created_by_name} size={30} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-slate-700 dark:text-slate-300">
                      <span className="font-bold">{r.created_by_name}</span>{" "}
                      <span className="text-slate-500">
                        {typeLabel(r.type)} লিখেছেন — {r.party_name || r.details || "বিবরণ নেই"}
                      </span>
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500">
                      {bnDateTime(r.created_at)}
                      {r.is_reversal ? <Chip color="#dc2626">সংশোধনী</Chip> : null}
                      {r.reversed_at ? <Chip color="#dc2626">বাতিল হয়েছে</Chip> : null}
                    </p>
                  </div>
                  <span
                    className="shrink-0 text-[13px] font-bold"
                    style={{ color: typeColor(r.type) }}
                  >
                    {money(r.total_amount)}
                  </span>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      ))}
    </div>
  );
}

function groupByDay(rows: Invoice[]) {
  const map = new Map<string, Invoice[]>();
  for (const r of rows) {
    const key = r.created_at.slice(0, 10);
    map.set(key, [...(map.get(key) ?? []), r]);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, list]) => ({
      date,
      rows: list,
      total: list.reduce((s, r) => s + num(r.total_amount), 0),
    }));
}

function dayLabel(date: string) {
  if (date === todayISO()) return "আজ";
  if (date === addDaysISO(-1)) return "গতকাল";
  return bnDateLong(date);
}
