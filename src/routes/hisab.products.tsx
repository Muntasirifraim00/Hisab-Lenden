import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Package, Plus, Tags, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  listCategories,
  listProducts,
  listStock,
  saveCategory,
  saveProduct,
} from "@/lib/hisab/api";
import { UNITS, unitLabel } from "@/lib/hisab/constants";
import { money, num, qtyText } from "@/lib/hisab/format";
import {
  Button,
  Card,
  Chip,
  Empty,
  ErrorNote,
  Field,
  Input,
  Loading,
  SectionTitle,
  Select,
} from "@/components/hisab/ui";
import type { Product } from "@/lib/hisab/types";

export const Route = createFileRoute("/hisab/products")({
  component: ProductsPage,
});

function ProductsPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState<Product | "new" | null>(null);
  const [catOpen, setCatOpen] = React.useState(false);

  const products = useQuery({ queryKey: ["hisab", "products"], queryFn: listProducts });
  const categories = useQuery({ queryKey: ["hisab", "categories"], queryFn: listCategories });
  const stock = useQuery({ queryKey: ["hisab", "stock"], queryFn: listStock });

  const stockOf = (id: string) => (stock.data ?? []).find((s) => s.product_id === id);

  if (products.isLoading) return <Loading />;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" />
          নতুন পণ্য
        </Button>
        <Button variant="outline" onClick={() => setCatOpen((v) => !v)}>
          <Tags className="h-4 w-4" />
          ক্যাটাগরি
        </Button>
      </div>

      {catOpen ? (
        <CategoryPanel
          categories={categories.data ?? []}
          onDone={() => queryClient.invalidateQueries({ queryKey: ["hisab", "categories"] })}
        />
      ) : null}

      {editing ? (
        <ProductForm
          product={editing === "new" ? null : editing}
          categories={categories.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["hisab"] });
            setEditing(null);
          }}
        />
      ) : null}

      {(products.data ?? []).length === 0 ? (
        <Empty
          icon={<Package className="h-8 w-8" />}
          title="কোনো পণ্য নেই"
          hint="পণ্য যোগ করলে বিক্রয়ে স্টক আপনাআপনি কমবে, ক্রয়ে বাড়বে, আর লাভ হিসাব হবে।"
        />
      ) : (
        <div className="space-y-2">
          {(products.data ?? []).map((p) => {
            const s = stockOf(p.id);
            return (
              <button
                key={p.id}
                onClick={() => setEditing(p)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm",
                  "dark:border-slate-800 dark:bg-slate-900",
                  !p.is_active && "opacity-55",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-bold text-slate-800 dark:text-slate-200">
                    {p.name}
                    {!p.is_active ? <Chip className="ml-1.5">নিষ্ক্রিয়</Chip> : null}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {(categories.data ?? []).find((c) => c.id === p.category_id)?.name ??
                      "ক্যাটাগরি নেই"}{" "}
                    · {unitLabel(p.unit)}
                    {p.cost_price != null ? ` · ক্রয়মূল্য ${money(p.cost_price)}` : ""}
                  </p>
                  {p.cost_price == null ? (
                    <p className="mt-0.5 text-[10px] font-semibold text-amber-600">
                      ⚠️ ক্রয়মূল্য নেই — লাভের হিসাব ভুল হতে পারে
                    </p>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[14px] font-bold text-slate-800 dark:text-slate-200">
                    {qtyText(s?.qty_on_hand ?? 0)}
                  </p>
                  <p className="text-[10px] text-slate-500">{money(s?.stock_value ?? 0)}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ পণ্যের ফর্ম ------------------------------ */

function ProductForm({
  product,
  categories,
  onClose,
  onSaved,
}: {
  product: Product | null;
  categories: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = React.useState({
    name: product?.name ?? "",
    category_id: product?.category_id ?? "",
    unit: product?.unit ?? "pcs",
    cost_price: product?.cost_price != null ? String(product.cost_price) : "",
    sale_price: product?.sale_price != null ? String(product.sale_price) : "",
    low_stock_threshold: String(product?.low_stock_threshold ?? 0),
    is_active: product?.is_active ?? true,
    opening_qty: "",
    opening_cost: "",
  });
  const [error, setError] = React.useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      saveProduct({
        id: product?.id ?? null,
        name: form.name.trim(),
        category_id: form.category_id || null,
        unit: form.unit,
        cost_price: form.cost_price === "" ? null : num(form.cost_price),
        sale_price: form.sale_price === "" ? null : num(form.sale_price),
        low_stock_threshold: num(form.low_stock_threshold),
        is_active: form.is_active,
        opening_qty: product ? 0 : num(form.opening_qty),
        opening_cost: product ? 0 : num(form.opening_cost || form.cost_price),
      }),
    onSuccess: () => {
      toast.success(product ? "পণ্য হালনাগাদ হয়েছে।" : "পণ্য যোগ হয়েছে।");
      onSaved();
    },
    onError: (e) => setError((e as Error).message),
  });

  return (
    <Card className="space-y-3.5 border-blue-300 dark:border-blue-900">
      <SectionTitle
        title={product ? "পণ্য সম্পাদনা" : "নতুন পণ্য"}
        right={
          <button onClick={onClose} className="text-slate-400" aria-label="বন্ধ">
            <X className="h-4 w-4" />
          </button>
        }
      />

      <Field label="নাম" required>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="ক্যাটাগরি">
          <Select
            value={form.category_id}
            onChange={(e) => setForm({ ...form, category_id: e.target.value })}
          >
            <option value="">— নেই —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="একক">
          <Select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
            {UNITS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="ক্রয়মূল্য" hint="লাভের হিসাবের ভিত্তি">
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={form.cost_price}
            onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
          />
        </Field>
        <Field label="বিক্রয়মূল্য" hint="ফর্মে আপনাআপনি বসবে">
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={form.sale_price}
            onChange={(e) => setForm({ ...form, sale_price: e.target.value })}
          />
        </Field>
      </div>

      <Field label="লো-স্টক সীমা" hint="এর নিচে নামলে স্টক পাতায় হলুদ হয়ে যাবে">
        <Input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.001"
          value={form.low_stock_threshold}
          onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })}
        />
      </Field>

      {!product ? (
        <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
          <Field label="ওপেনিং স্টক" hint="এখন হাতে কত আছে">
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.001"
              value={form.opening_qty}
              onChange={(e) => setForm({ ...form, opening_qty: e.target.value })}
            />
          </Field>
          <Field label="ওপেনিং দর" hint="প্রতিটার কত পড়েছিল">
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={form.opening_cost}
              onChange={(e) => setForm({ ...form, opening_cost: e.target.value })}
              placeholder={form.cost_price || "০"}
            />
          </Field>
        </div>
      ) : (
        <label className="flex items-center gap-2.5 text-[13px] font-semibold text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            className="h-4 w-4 accent-blue-600"
          />
          সক্রিয় (নতুন হিসাবে বাছাই করা যাবে)
        </label>
      )}

      <ErrorNote>{error}</ErrorNote>

      <Button
        onClick={() => mutation.mutate()}
        className="w-full"
        disabled={mutation.isPending || form.name.trim().length < 1}
      >
        {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        সংরক্ষণ
      </Button>

      {!product ? (
        <p className="text-[11px] text-slate-500">
          ওপেনিং স্টক দিলে একটা লট তৈরি হবে — FIFO হিসাবে সেটাই সবচেয়ে পুরনো মাল ধরা হবে।
        </p>
      ) : (
        <p className="text-[11px] text-slate-500">
          পণ্য মোছা যায় না — ব্যবহার বন্ধ করতে নিষ্ক্রিয় করুন। পুরনো হিসাব অক্ষত থাকবে।
        </p>
      )}
    </Card>
  );
}

/* ------------------------------ ক্যাটাগরি ------------------------------ */

function CategoryPanel({
  categories,
  onDone,
}: {
  categories: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => saveCategory(name.trim()),
    onSuccess: () => {
      setName("");
      setError(null);
      toast.success("ক্যাটাগরি যোগ হয়েছে।");
      onDone();
    },
    onError: (e) => setError((e as Error).message),
  });

  return (
    <Card className="space-y-3">
      <SectionTitle title="ক্যাটাগরি" />
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="নতুন ক্যাটাগরির নাম"
        />
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || name.trim().length < 1}
        >
          {mutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
        </Button>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <div className="flex flex-wrap gap-1.5">
        {categories.length === 0 ? (
          <p className="text-[12px] text-slate-500">এখনো কোনো ক্যাটাগরি নেই।</p>
        ) : (
          categories.map((c) => <Chip key={c.id}>{c.name}</Chip>)
        )}
      </div>
    </Card>
  );
}
