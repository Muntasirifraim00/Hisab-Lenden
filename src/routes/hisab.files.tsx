import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ImageIcon, X } from "lucide-react";
import { listInvoiceImages } from "@/lib/hisab/api";
import { typeColor, typeLabel } from "@/lib/hisab/constants";
import { bnDate, money, toBn } from "@/lib/hisab/format";
import { Card, Chip, Empty, Loading } from "@/components/hisab/ui";

export const Route = createFileRoute("/hisab/files")({
  component: FilesPage,
});

function FilesPage() {
  const [zoom, setZoom] = React.useState<string | null>(null);

  const query = useQuery({
    queryKey: ["hisab", "files"],
    queryFn: () => listInvoiceImages(300),
    staleTime: 60_000,
  });

  const rows = query.data ?? [];

  if (query.isLoading) return <Loading />;

  return (
    <div className="space-y-3">
      <Card className="flex items-center justify-between py-3">
        <span className="text-[13px] font-bold text-slate-800 dark:text-slate-200">
          সব মেমোর ছবি
        </span>
        <Chip>{toBn(rows.length)} টি</Chip>
      </Card>

      {rows.length === 0 ? (
        <Empty
          icon={<ImageIcon className="h-8 w-8" />}
          title="কোনো ছবি নেই"
          hint="হিসাব লেখার সময় মেমোর ছবি তুললে সব এখানে জমা হবে।"
        />
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {rows.map((r) => (
            <div
              key={r.id}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            >
              <button onClick={() => setZoom(r.image_url)} className="block w-full">
                <img
                  src={r.image_url ?? ""}
                  alt="মেমো"
                  loading="lazy"
                  className="aspect-square w-full bg-slate-50 object-cover dark:bg-slate-950"
                />
              </button>
              <Link to="/hisab/invoice/$id" params={{ id: r.id }} className="block p-2">
                <p
                  className="flex items-center gap-1 text-[10px] font-bold"
                  style={{ color: typeColor(r.type) }}
                >
                  {typeLabel(r.type)} · {money(r.total_amount)}
                </p>
                <p className="mt-0.5 truncate text-[10px] text-slate-500">
                  {bnDate(r.invoice_date)} · {r.party_name || "—"}
                </p>
              </Link>
            </div>
          ))}
        </div>
      )}

      {zoom ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setZoom(null)}
          role="presentation"
        >
          <button
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white"
            aria-label="বন্ধ"
          >
            <X className="h-5 w-5" />
          </button>
          <img src={zoom} alt="মেমো" className="max-h-full max-w-full object-contain" />
        </div>
      ) : null}
    </div>
  );
}
