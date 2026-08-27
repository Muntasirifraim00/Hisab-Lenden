-- =====================================================================
-- হিসাব (Hisab Book) — দোকানের খাতা + গুদাম
-- ---------------------------------------------------------------------
-- মূল নীতি:
--   1. কোনো এন্ট্রি মোছা যায় না  (ডেটাবেস স্তরে জোর করে মানানো)
--   2. টাকা/তারিখ/ধরন বদলানো যায় না — শুধু "বিবরণ", তা-ও লগসহ
--   3. একটা এন্ট্রি সেভ হলে ইনভয়েস + আইটেম + স্টক সব একসাথে লেখা হয়
--   4. স্টক FIFO — যে মাল আগে কেনা, সেটা আগে বিক্রি হয়েছে ধরা হয়
--   5. লাভ ডেটাবেসেই হিসাব হয়, অ্যাপ থেকে পাঠানো যায় না
--
-- প্রয়োগ কৌশল: টেবিলগুলোয় কোনো INSERT/UPDATE/DELETE পলিসি নেই।
-- সব লেখালেখি হয় SECURITY DEFINER ফাংশনের মধ্য দিয়ে, যেগুলো এক
-- ট্রানজেকশনে সবটা করে। ফলে "অর্ধেক লেখা" বা "মুছে ফেলা" সম্ভব নয়।
-- =====================================================================

-- ---------- এনাম ----------
DO $$ BEGIN
  CREATE TYPE public.hb_invoice_type AS ENUM ('expense', 'purchase', 'sale');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.hb_payment_method AS ENUM ('cash', 'mobile', 'bank', 'cheque', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.hb_stock_reason AS ENUM ('purchase', 'sale', 'opening', 'receipt', 'reversal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.hb_goods_status AS ENUM ('n_a', 'pending', 'partial', 'received');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =====================================================================
-- টেবিল
-- =====================================================================

-- ১. পণ্যের ক্যাটাগরি
CREATE TABLE IF NOT EXISTS public.product_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  created_by      UUID,
  created_by_name TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS product_categories_name_key
  ON public.product_categories (lower(name));

-- ২. পণ্য
CREATE TABLE IF NOT EXISTS public.products (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  category_id         UUID REFERENCES public.product_categories(id) ON DELETE SET NULL,
  unit                TEXT NOT NULL DEFAULT 'pcs',
  cost_price          NUMERIC(14, 2),           -- নির্ধারিত ক্রয়মূল্য (লাভ হিসাবের ভিত্তি)
  sale_price          NUMERIC(14, 2),
  low_stock_threshold NUMERIC(14, 3) NOT NULL DEFAULT 0,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_by          UUID,
  created_by_name     TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS products_name_key ON public.products (lower(name));
CREATE INDEX IF NOT EXISTS products_category_idx ON public.products (category_id);

-- ৩. ইনভয়েস (মূল এন্ট্রি)
CREATE TABLE IF NOT EXISTS public.invoices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type                public.hb_invoice_type NOT NULL,
  invoice_date        DATE NOT NULL,
  memo_no             TEXT,
  party_name          TEXT,
  details             TEXT,
  total_amount        NUMERIC(14, 2) NOT NULL CHECK (total_amount >= 0),
  paid_amount         NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  due_amount          NUMERIC(14, 2) GENERATED ALWAYS AS
                        (GREATEST(total_amount - paid_amount, 0)) STORED,
  payment_method      public.hb_payment_method NOT NULL DEFAULT 'cash',
  image_url           TEXT,
  no_image_reason     TEXT,
  cogs                NUMERIC(14, 2) NOT NULL DEFAULT 0,   -- FIFO ক্রয়মূল্য
  profit              NUMERIC(14, 2) NOT NULL DEFAULT 0,   -- শুধু বিক্রয়ে
  stock_shortfall     BOOLEAN NOT NULL DEFAULT false,      -- স্টকে মাল ছিল না
  goods_status        public.hb_goods_status NOT NULL DEFAULT 'n_a',
  is_reversal         BOOLEAN NOT NULL DEFAULT false,
  reverses_invoice_id UUID REFERENCES public.invoices(id),
  reversed_at         TIMESTAMPTZ,
  detail_revision     INTEGER NOT NULL DEFAULT 0,
  created_by          UUID,
  created_by_name     TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ছবি নেই তো কারণ লিখতেই হবে
  CONSTRAINT invoices_image_or_reason CHECK (
    image_url IS NOT NULL OR (no_image_reason IS NOT NULL AND length(btrim(no_image_reason)) >= 3)
  )
);

-- একই মেমো নম্বর দুবার দেওয়া যাবে না
CREATE UNIQUE INDEX IF NOT EXISTS invoices_memo_no_key
  ON public.invoices (lower(btrim(memo_no)))
  WHERE memo_no IS NOT NULL AND btrim(memo_no) <> '';

-- একটা এন্ট্রি একবারই সংশোধন করা যাবে
CREATE UNIQUE INDEX IF NOT EXISTS invoices_reverses_once_key
  ON public.invoices (reverses_invoice_id)
  WHERE reverses_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS invoices_date_idx  ON public.invoices (invoice_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS invoices_type_idx  ON public.invoices (type);
CREATE INDEX IF NOT EXISTS invoices_party_idx ON public.invoices (lower(party_name));
CREATE INDEX IF NOT EXISTS invoices_due_idx   ON public.invoices (due_amount) WHERE due_amount > 0;

-- ৪. ইনভয়েসের পণ্যের সারি
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  product_id    UUID REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name  TEXT NOT NULL,
  qty           NUMERIC(14, 3) NOT NULL CHECK (qty > 0),
  unit          TEXT NOT NULL DEFAULT 'pcs',
  unit_price    NUMERIC(14, 2) NOT NULL DEFAULT 0,
  cost_price    NUMERIC(14, 2),          -- পণ্য পাতায় নির্ধারিত দর (স্ন্যাপশট)
  line_total    NUMERIC(14, 2) NOT NULL DEFAULT 0,
  line_cogs     NUMERIC(14, 2) NOT NULL DEFAULT 0,
  received_qty  NUMERIC(14, 3) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoice_items_invoice_idx ON public.invoice_items (invoice_id);
CREATE INDEX IF NOT EXISTS invoice_items_product_idx ON public.invoice_items (product_id);

-- ৫. কিস্তি
CREATE TABLE IF NOT EXISTS public.invoice_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  amount          NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  method          public.hb_payment_method NOT NULL DEFAULT 'cash',
  paid_on         DATE NOT NULL,
  note            TEXT,
  created_by      UUID,
  created_by_name TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoice_payments_invoice_idx ON public.invoice_payments (invoice_id);

-- ৬. মাল বুঝে পাওয়ার রসিদ
CREATE TABLE IF NOT EXISTS public.invoice_receipts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  received_on     DATE NOT NULL,
  lines           JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{item_id, qty}]
  note            TEXT,
  created_by      UUID,
  created_by_name TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoice_receipts_invoice_idx ON public.invoice_receipts (invoice_id);

-- ৭. খাতওয়ারি খরচ
CREATE TABLE IF NOT EXISTS public.invoice_expenses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  head        TEXT NOT NULL,
  amount      NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoice_expenses_invoice_idx ON public.invoice_expenses (invoice_id);

-- ৮. বিবরণ বদলের লগ
CREATE TABLE IF NOT EXISTS public.invoice_detail_edits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  revision_no     INTEGER NOT NULL,
  old_details     TEXT,
  new_details     TEXT,
  edited_by       UUID,
  edited_by_name  TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoice_detail_edits_invoice_idx ON public.invoice_detail_edits (invoice_id);

-- ৯. স্টক লট (কোন চালান কত দামে)
CREATE TABLE IF NOT EXISTS public.stock_lots (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  invoice_id     UUID REFERENCES public.invoices(id) ON DELETE RESTRICT,
  lot_date       DATE NOT NULL,
  qty_in         NUMERIC(14, 3) NOT NULL CHECK (qty_in > 0),
  qty_remaining  NUMERIC(14, 3) NOT NULL CHECK (qty_remaining >= 0),
  unit_cost      NUMERIC(14, 4) NOT NULL DEFAULT 0,
  reason         public.hb_stock_reason NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_lots_fifo_idx
  ON public.stock_lots (product_id, lot_date, created_at)
  WHERE qty_remaining > 0;

-- ১০. স্টকের প্রতিটা নড়াচড়া
CREATE TABLE IF NOT EXISTS public.stock_moves (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  invoice_id      UUID REFERENCES public.invoices(id) ON DELETE RESTRICT,
  moved_on        DATE NOT NULL,
  qty             NUMERIC(14, 3) NOT NULL,   -- ধনাত্মক = ঢুকল, ঋণাত্মক = বেরোল
  unit_cost       NUMERIC(14, 4) NOT NULL DEFAULT 0,
  reason          public.hb_stock_reason NOT NULL,
  note            TEXT,
  created_by_name TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_moves_product_idx ON public.stock_moves (product_id, moved_on DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS stock_moves_invoice_idx ON public.stock_moves (invoice_id);

-- =====================================================================
-- অপরিবর্তনীয়তা — ডেটাবেস স্তরে
-- অ্যাপ হ্যাক করলেও এখানে আটকাবে।
-- =====================================================================
CREATE OR REPLACE FUNCTION public.hb_immutable_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- SECURITY DEFINER ফাংশনগুলো hb.sys = 'on' সেট করে কাজ করে
  IF coalesce(current_setting('hb.sys', true), '') = 'on' THEN
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'হিসাব মোছা যায় না। ভুল হলে "বাতিল / সংশোধনী" এন্ট্রি দিন।'
      USING ERRCODE = 'check_violation';
  END IF;

  RAISE EXCEPTION 'সংরক্ষিত হিসাব বদলানো যায় না। শুধু বিবরণ বদলানো যায় (লগসহ)।'
    USING ERRCODE = 'check_violation';
END;
$$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'invoices', 'invoice_items', 'invoice_payments', 'invoice_receipts',
    'invoice_expenses', 'invoice_detail_edits', 'stock_lots', 'stock_moves'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS hb_guard ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER hb_guard BEFORE UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.hb_immutable_guard()', t);
  END LOOP;
END $$;

-- পণ্য/ক্যাটাগরি মোছা যাবে না (নিষ্ক্রিয় করা যাবে), কারণ ইতিহাস এদের ধরে রাখে
CREATE OR REPLACE FUNCTION public.hb_no_delete_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'মোছা যায় না — চাইলে নিষ্ক্রিয় করুন।' USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS hb_no_delete ON public.products;
CREATE TRIGGER hb_no_delete BEFORE DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.hb_no_delete_guard();

DROP TRIGGER IF EXISTS hb_no_delete ON public.product_categories;
CREATE TRIGGER hb_no_delete BEFORE DELETE ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION public.hb_no_delete_guard();

-- =====================================================================
-- RLS — পড়া যাবে, সরাসরি লেখা যাবে না। সব লেখা RPC দিয়ে।
-- =====================================================================

-- নতুন Supabase প্রকল্পে public স্কিমার অনুমতি আপনাআপনি দেওয়া থাকে না,
-- তাই স্পষ্ট করে দেওয়া হলো।
GRANT USAGE ON SCHEMA public TO authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'invoices', 'invoice_items', 'invoice_payments', 'invoice_receipts',
    'invoice_expenses', 'invoice_detail_edits', 'products', 'product_categories',
    'stock_lots', 'stock_moves'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "hb read" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "hb read" ON public.%I FOR SELECT
         USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END $$;

-- =====================================================================
-- সহায়ক ফাংশন
-- =====================================================================

-- বর্তমান ব্যবহারকারীর নাম (ইমেইলের আগের অংশ, বড় হাতে)
CREATE OR REPLACE FUNCTION public.hb_actor_name()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_email TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'লগইন করুন।' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  RETURN upper(split_part(coalesce(v_email, 'unknown@hisab'), '@', 1));
END;
$$;

-- FIFO — পুরনো লট আগে কেটে ক্রয়মূল্য বের করে
-- ফেরত দেয়: [মোট ক্রয়মূল্য, যতটুকু স্টকে ছিল না]
CREATE OR REPLACE FUNCTION public.hb_consume_fifo(
  p_product_id  UUID,
  p_qty         NUMERIC,
  p_fallback    NUMERIC
)
RETURNS NUMERIC[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_left      NUMERIC := p_qty;
  v_cost      NUMERIC := 0;
  v_take      NUMERIC;
  v_lot       RECORD;
BEGIN
  FOR v_lot IN
    SELECT id, qty_remaining, unit_cost
      FROM public.stock_lots
     WHERE product_id = p_product_id AND qty_remaining > 0
     ORDER BY lot_date, created_at
     FOR UPDATE
  LOOP
    EXIT WHEN v_left <= 0;
    v_take := LEAST(v_left, v_lot.qty_remaining);
    UPDATE public.stock_lots
       SET qty_remaining = qty_remaining - v_take
     WHERE id = v_lot.id;
    v_cost := v_cost + (v_take * v_lot.unit_cost);
    v_left := v_left - v_take;
  END LOOP;

  -- স্টকে যা ছিল না, তার দাম পণ্যের নির্ধারিত দর ধরে হিসাব হয়
  IF v_left > 0 THEN
    v_cost := v_cost + (v_left * coalesce(p_fallback, 0));
  END IF;

  RETURN ARRAY[round(v_cost, 2), v_left];
END;
$$;

-- ক্রয় বাতিলে মাল ফেরত — যে চালানে ঢুকেছিল সেই লট থেকেই আগে কাটা হয়।
-- ঐ লটের মাল ইতিমধ্যে বিক্রি হয়ে গিয়ে থাকলে বাকিটুকু FIFO ধরে কাটে।
CREATE OR REPLACE FUNCTION public.hb_return_purchase(
  p_product_id  UUID,
  p_qty         NUMERIC,
  p_invoice_id  UUID,
  p_fallback    NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_left NUMERIC := p_qty;
  v_take NUMERIC;
  v_lot  RECORD;
BEGIN
  FOR v_lot IN
    SELECT id, qty_remaining
      FROM public.stock_lots
     WHERE product_id = p_product_id
       AND invoice_id = p_invoice_id
       AND qty_remaining > 0
     ORDER BY created_at
     FOR UPDATE
  LOOP
    EXIT WHEN v_left <= 0;
    v_take := LEAST(v_left, v_lot.qty_remaining);
    UPDATE public.stock_lots SET qty_remaining = qty_remaining - v_take WHERE id = v_lot.id;
    v_left := v_left - v_take;
  END LOOP;

  IF v_left > 0 THEN
    v_left := (public.hb_consume_fifo(p_product_id, v_left, p_fallback))[2];
  END IF;

  RETURN v_left;   -- যতটুকু কোথাও থেকেই কাটা গেল না
END;
$$;

-- =====================================================================
-- পণ্য ও ক্যাটাগরি
-- =====================================================================
CREATE OR REPLACE FUNCTION public.hb_save_category(p_name TEXT)
RETURNS public.product_categories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row public.product_categories;
BEGIN
  INSERT INTO public.product_categories (name, created_by, created_by_name)
  VALUES (btrim(p_name), auth.uid(), public.hb_actor_name())
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.hb_save_product(p JSONB)
RETURNS public.products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row     public.products;
  v_id      UUID := nullif(p ->> 'id', '')::UUID;
  v_actor   TEXT := public.hb_actor_name();
  v_open_q  NUMERIC := coalesce((p ->> 'opening_qty')::NUMERIC, 0);
  v_open_c  NUMERIC := coalesce((p ->> 'opening_cost')::NUMERIC, 0);
BEGIN
  PERFORM set_config('hb.sys', 'on', true);

  IF v_id IS NULL THEN
    INSERT INTO public.products (
      name, category_id, unit, cost_price, sale_price,
      low_stock_threshold, created_by, created_by_name
    ) VALUES (
      btrim(p ->> 'name'),
      nullif(p ->> 'category_id', '')::UUID,
      coalesce(nullif(p ->> 'unit', ''), 'pcs'),
      nullif(p ->> 'cost_price', '')::NUMERIC,
      nullif(p ->> 'sale_price', '')::NUMERIC,
      coalesce((p ->> 'low_stock_threshold')::NUMERIC, 0),
      auth.uid(), v_actor
    ) RETURNING * INTO v_row;

    -- ওপেনিং স্টক দিলে একটা লট + একটা মুভমেন্ট তৈরি হয়
    IF v_open_q > 0 THEN
      INSERT INTO public.stock_lots (product_id, lot_date, qty_in, qty_remaining, unit_cost, reason)
      VALUES (v_row.id, current_date, v_open_q, v_open_q, v_open_c, 'opening');

      INSERT INTO public.stock_moves (product_id, moved_on, qty, unit_cost, reason, note, created_by_name)
      VALUES (v_row.id, current_date, v_open_q, v_open_c, 'opening', 'ওপেনিং স্টক', v_actor);
    END IF;
  ELSE
    UPDATE public.products SET
      name                = btrim(p ->> 'name'),
      category_id         = nullif(p ->> 'category_id', '')::UUID,
      unit                = coalesce(nullif(p ->> 'unit', ''), 'pcs'),
      cost_price          = nullif(p ->> 'cost_price', '')::NUMERIC,
      sale_price          = nullif(p ->> 'sale_price', '')::NUMERIC,
      low_stock_threshold = coalesce((p ->> 'low_stock_threshold')::NUMERIC, 0),
      is_active           = coalesce((p ->> 'is_active')::BOOLEAN, true),
      updated_at          = now()
    WHERE id = v_id
    RETURNING * INTO v_row;
  END IF;

  PERFORM set_config('hb.sys', 'off', true);
  RETURN v_row;
END;
$$;

-- =====================================================================
-- মূল কাজ: একটা এন্ট্রি সেভ করা (সব একসাথে — অর্ধেক লেখা হয় না)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.hb_create_invoice(p JSONB)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv       public.invoices;
  v_actor     TEXT := public.hb_actor_name();
  v_type      public.hb_invoice_type := (p ->> 'type')::public.hb_invoice_type;
  v_date      DATE := (p ->> 'invoice_date')::DATE;
  v_total     NUMERIC := round(coalesce((p ->> 'total_amount')::NUMERIC, 0), 2);
  v_nothing   BOOLEAN := coalesce((p ->> 'nothing_paid')::BOOLEAN, false);
  v_paid_raw  NUMERIC := nullif(p ->> 'paid_amount', '')::NUMERIC;
  v_paid      NUMERIC;
  v_advance   BOOLEAN := coalesce((p ->> 'goods_pending')::BOOLEAN, false);
  v_goods     public.hb_goods_status := 'n_a';
  v_item      JSONB;
  v_exp       JSONB;
  v_pid       UUID;
  v_qty       NUMERIC;
  v_cost_ref  NUMERIC;
  v_fifo      NUMERIC[];
  v_cogs      NUMERIC := 0;
  v_short     BOOLEAN := false;
  v_item_id   UUID;
  v_unit      TEXT;
  v_line      NUMERIC;
BEGIN
  -- ---- সেভ করার আগে পরীক্ষা ----
  IF v_date > current_date THEN
    RAISE EXCEPTION 'ভবিষ্যতের তারিখে হিসাব লেখা যায় না।' USING ERRCODE = 'check_violation';
  END IF;

  IF nullif(p ->> 'image_url', '') IS NULL
     AND coalesce(length(btrim(p ->> 'no_image_reason')), 0) < 3 THEN
    RAISE EXCEPTION 'ছবি না থাকলে কারণ লিখতে হবে।' USING ERRCODE = 'check_violation';
  END IF;

  -- ---- পরিশোধের নিয়ম ----
  -- কিছু না লিখলে "সব দেওয়া হয়ে গেছে" ধরা হয়।
  IF v_nothing THEN
    v_paid := 0;
  ELSIF v_paid_raw IS NULL OR v_paid_raw = 0 THEN
    v_paid := v_total;
  ELSE
    v_paid := LEAST(round(v_paid_raw, 2), v_total);   -- পরিশোধ > মোট বিল হতে পারে না
  END IF;

  -- ---- অগ্রিম ক্রয়: টাকা গেল, মাল আসেনি ----
  IF v_type = 'purchase' THEN
    v_goods := CASE WHEN v_advance THEN 'pending' ELSE 'received' END;
  END IF;

  INSERT INTO public.invoices (
    type, invoice_date, memo_no, party_name, details, total_amount, paid_amount,
    payment_method, image_url, no_image_reason, goods_status, created_by, created_by_name
  ) VALUES (
    v_type, v_date,
    nullif(btrim(p ->> 'memo_no'), ''),
    nullif(btrim(p ->> 'party_name'), ''),
    nullif(btrim(p ->> 'details'), ''),
    v_total, v_paid,
    coalesce(nullif(p ->> 'payment_method', ''), 'cash')::public.hb_payment_method,
    nullif(p ->> 'image_url', ''),
    nullif(btrim(p ->> 'no_image_reason'), ''),
    v_goods, auth.uid(), v_actor
  ) RETURNING * INTO v_inv;

  -- ---- খাতওয়ারি খরচ ----
  FOR v_exp IN SELECT * FROM jsonb_array_elements(coalesce(p -> 'expenses', '[]'::jsonb)) LOOP
    INSERT INTO public.invoice_expenses (invoice_id, head, amount, note)
    VALUES (
      v_inv.id,
      btrim(v_exp ->> 'head'),
      round(coalesce((v_exp ->> 'amount')::NUMERIC, 0), 2),
      nullif(btrim(v_exp ->> 'note'), '')
    );
  END LOOP;

  -- ---- পণ্যের সারি + স্টকের প্রভাব ----
  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(p -> 'items', '[]'::jsonb)) LOOP
    v_pid := nullif(v_item ->> 'product_id', '')::UUID;
    v_qty := round(coalesce((v_item ->> 'qty')::NUMERIC, 0), 3);
    CONTINUE WHEN v_qty <= 0;

    v_line := round(coalesce((v_item ->> 'line_total')::NUMERIC,
                             v_qty * coalesce((v_item ->> 'unit_price')::NUMERIC, 0)), 2);

    SELECT coalesce(pr.cost_price, 0), coalesce(pr.unit, 'pcs')
      INTO v_cost_ref, v_unit
      FROM public.products pr WHERE pr.id = v_pid;
    v_cost_ref := coalesce(v_cost_ref, 0);
    v_unit := coalesce(v_unit, 'pcs');

    INSERT INTO public.invoice_items (
      invoice_id, product_id, product_name, qty, unit, unit_price, cost_price, line_total
    ) VALUES (
      v_inv.id, v_pid,
      coalesce(nullif(btrim(v_item ->> 'product_name'), ''), 'পণ্য'),
      v_qty, v_unit,
      round(coalesce((v_item ->> 'unit_price')::NUMERIC, 0), 2),
      v_cost_ref, v_line
    ) RETURNING id INTO v_item_id;

    IF v_pid IS NULL THEN CONTINUE; END IF;

    PERFORM set_config('hb.sys', 'on', true);

    IF v_type = 'purchase' AND NOT v_advance THEN
      -- মাল হাতে এসেছে → নতুন লট, স্টক বাড়ল
      INSERT INTO public.stock_lots (product_id, invoice_id, lot_date, qty_in, qty_remaining, unit_cost, reason)
      VALUES (v_pid, v_inv.id, v_date, v_qty, v_qty,
              CASE WHEN v_qty > 0 THEN round(v_line / v_qty, 4) ELSE 0 END, 'purchase');

      INSERT INTO public.stock_moves (product_id, invoice_id, moved_on, qty, unit_cost, reason, created_by_name)
      VALUES (v_pid, v_inv.id, v_date, v_qty,
              CASE WHEN v_qty > 0 THEN round(v_line / v_qty, 4) ELSE 0 END, 'purchase', v_actor);

      UPDATE public.invoice_items SET received_qty = v_qty WHERE id = v_item_id;

    ELSIF v_type = 'sale' THEN
      -- FIFO: পুরনো মাল আগে কাটা হয়
      v_fifo := public.hb_consume_fifo(v_pid, v_qty, v_cost_ref);
      v_cogs := v_cogs + v_fifo[1];

      IF v_fifo[2] > 0 THEN
        v_short := true;
      END IF;

      UPDATE public.invoice_items SET line_cogs = v_fifo[1] WHERE id = v_item_id;

      INSERT INTO public.stock_moves (product_id, invoice_id, moved_on, qty, unit_cost, reason, note, created_by_name)
      VALUES (v_pid, v_inv.id, v_date, -v_qty,
              CASE WHEN v_qty > 0 THEN round(v_fifo[1] / v_qty, 4) ELSE 0 END, 'sale',
              CASE WHEN v_fifo[2] > 0 THEN 'স্টকে পর্যাপ্ত মাল ছিল না' ELSE NULL END,
              v_actor);
    END IF;

    PERFORM set_config('hb.sys', 'off', true);
  END LOOP;

  -- ---- লাভ (শুধু বিক্রয়ে), ডেটাবেসেই হিসাব ----
  PERFORM set_config('hb.sys', 'on', true);
  UPDATE public.invoices
     SET cogs            = CASE WHEN v_type = 'sale' THEN round(v_cogs, 2) ELSE 0 END,
         profit          = CASE WHEN v_type = 'sale' THEN round(v_total - v_cogs, 2) ELSE 0 END,
         stock_shortfall = v_short
   WHERE id = v_inv.id
   RETURNING * INTO v_inv;
  PERFORM set_config('hb.sys', 'off', true);

  RETURN v_inv;
END;
$$;

-- =====================================================================
-- কিস্তি যোগ
-- =====================================================================
CREATE OR REPLACE FUNCTION public.hb_add_payment(p JSONB)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv    public.invoices;
  v_amount NUMERIC := round(coalesce((p ->> 'amount')::NUMERIC, 0), 2);
  v_on     DATE := coalesce((p ->> 'paid_on')::DATE, current_date);
BEGIN
  SELECT * INTO v_inv FROM public.invoices WHERE id = (p ->> 'invoice_id')::UUID FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'হিসাবটি পাওয়া যায়নি।' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'কিস্তির অঙ্ক শূন্যের বেশি হতে হবে।' USING ERRCODE = 'check_violation';
  END IF;
  IF v_on > current_date THEN
    RAISE EXCEPTION 'ভবিষ্যতের তারিখে কিস্তি লেখা যায় না।' USING ERRCODE = 'check_violation';
  END IF;
  IF v_inv.due_amount <= 0 THEN
    RAISE EXCEPTION 'এই হিসাবে কোনো বাকি নেই।' USING ERRCODE = 'check_violation';
  END IF;

  -- পরিশোধ কখনো মোট বিলের বেশি হতে পারে না
  v_amount := LEAST(v_amount, v_inv.due_amount);

  INSERT INTO public.invoice_payments (invoice_id, amount, method, paid_on, note, created_by, created_by_name)
  VALUES (
    v_inv.id, v_amount,
    coalesce(nullif(p ->> 'method', ''), 'cash')::public.hb_payment_method,
    v_on, nullif(btrim(p ->> 'note'), ''), auth.uid(), public.hb_actor_name()
  );

  PERFORM set_config('hb.sys', 'on', true);
  UPDATE public.invoices SET paid_amount = paid_amount + v_amount
   WHERE id = v_inv.id RETURNING * INTO v_inv;
  PERFORM set_config('hb.sys', 'off', true);

  RETURN v_inv;
END;
$$;

-- =====================================================================
-- মাল বুঝে পাওয়া (অগ্রিম ক্রয়ের পর)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.hb_receive_goods(p JSONB)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv     public.invoices;
  v_actor   TEXT := public.hb_actor_name();
  v_on      DATE := coalesce((p ->> 'received_on')::DATE, current_date);
  v_line    JSONB;
  v_lines   JSONB := coalesce(p -> 'lines', '[]'::jsonb);
  v_item    public.invoice_items;
  v_qty     NUMERIC;
  v_unit_c  NUMERIC;
  v_pending NUMERIC;
BEGIN
  SELECT * INTO v_inv FROM public.invoices WHERE id = (p ->> 'invoice_id')::UUID FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'হিসাবটি পাওয়া যায়নি।' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_inv.type <> 'purchase' THEN
    RAISE EXCEPTION 'শুধু ক্রয়ের ক্ষেত্রে মাল বুঝে পাওয়ার হিসাব হয়।' USING ERRCODE = 'check_violation';
  END IF;
  IF v_inv.goods_status = 'received' THEN
    RAISE EXCEPTION 'এই চালানের সব মাল আগেই বুঝে পাওয়া হয়েছে।' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('hb.sys', 'on', true);

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    SELECT * INTO v_item FROM public.invoice_items
     WHERE id = (v_line ->> 'item_id')::UUID AND invoice_id = v_inv.id;
    CONTINUE WHEN NOT FOUND OR v_item.product_id IS NULL;

    -- একই রসিদ দুবার দিলেও স্টক দুবার বাড়বে না
    v_qty := LEAST(
      round(coalesce((v_line ->> 'qty')::NUMERIC, 0), 3),
      v_item.qty - v_item.received_qty
    );
    CONTINUE WHEN v_qty <= 0;

    v_unit_c := CASE WHEN v_item.qty > 0 THEN round(v_item.line_total / v_item.qty, 4) ELSE 0 END;

    INSERT INTO public.stock_lots (product_id, invoice_id, lot_date, qty_in, qty_remaining, unit_cost, reason)
    VALUES (v_item.product_id, v_inv.id, v_on, v_qty, v_qty, v_unit_c, 'receipt');

    INSERT INTO public.stock_moves (product_id, invoice_id, moved_on, qty, unit_cost, reason, note, created_by_name)
    VALUES (v_item.product_id, v_inv.id, v_on, v_qty, v_unit_c, 'receipt', 'মাল বুঝে পাওয়া', v_actor);

    UPDATE public.invoice_items SET received_qty = received_qty + v_qty WHERE id = v_item.id;
  END LOOP;

  INSERT INTO public.invoice_receipts (invoice_id, received_on, lines, note, created_by, created_by_name)
  VALUES (v_inv.id, v_on, v_lines, nullif(btrim(p ->> 'note'), ''), auth.uid(), v_actor);

  SELECT coalesce(sum(qty - received_qty), 0) INTO v_pending
    FROM public.invoice_items WHERE invoice_id = v_inv.id;

  UPDATE public.invoices
     SET goods_status = CASE
           WHEN v_pending <= 0 THEN 'received'::public.hb_goods_status
           WHEN EXISTS (SELECT 1 FROM public.invoice_items
                         WHERE invoice_id = v_inv.id AND received_qty > 0)
             THEN 'partial'::public.hb_goods_status
           ELSE 'pending'::public.hb_goods_status END
   WHERE id = v_inv.id
   RETURNING * INTO v_inv;

  PERFORM set_config('hb.sys', 'off', true);
  RETURN v_inv;
END;
$$;

-- =====================================================================
-- বিবরণ সম্পাদনা (একমাত্র যেটা বদলানো যায় — এবং প্রতিবার লগ হয়)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.hb_edit_details(p JSONB)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.invoices;
  v_new TEXT := nullif(btrim(p ->> 'details'), '');
BEGIN
  SELECT * INTO v_inv FROM public.invoices WHERE id = (p ->> 'invoice_id')::UUID FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'হিসাবটি পাওয়া যায়নি।' USING ERRCODE = 'no_data_found';
  END IF;
  IF coalesce(v_inv.details, '') = coalesce(v_new, '') THEN
    RETURN v_inv;
  END IF;

  INSERT INTO public.invoice_detail_edits (
    invoice_id, revision_no, old_details, new_details, edited_by, edited_by_name
  ) VALUES (
    v_inv.id, v_inv.detail_revision + 1, v_inv.details, v_new,
    auth.uid(), public.hb_actor_name()
  );

  PERFORM set_config('hb.sys', 'on', true);
  UPDATE public.invoices
     SET details = v_new, detail_revision = detail_revision + 1
   WHERE id = v_inv.id RETURNING * INTO v_inv;
  PERFORM set_config('hb.sys', 'off', true);

  RETURN v_inv;
END;
$$;

-- =====================================================================
-- বাতিল / সংশোধনী — মোছার বদলে উল্টো এন্ট্রি
-- =====================================================================
CREATE OR REPLACE FUNCTION public.hb_reverse_invoice(p JSONB)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_src     public.invoices;
  v_new     public.invoices;
  v_actor   TEXT := public.hb_actor_name();
  v_item    public.invoice_items;
  v_exp     public.invoice_expenses;
  v_date    DATE := coalesce((p ->> 'invoice_date')::DATE, current_date);
  v_unit_c  NUMERIC;
  v_back    NUMERIC;
  v_new_item UUID;
BEGIN
  SELECT * INTO v_src FROM public.invoices WHERE id = (p ->> 'invoice_id')::UUID FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'হিসাবটি পাওয়া যায়নি।' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_src.is_reversal THEN
    RAISE EXCEPTION 'সংশোধনীকে আবার সংশোধন করা যায় না।' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.invoices WHERE reverses_invoice_id = v_src.id) THEN
    RAISE EXCEPTION 'এই হিসাবটি আগেই সংশোধন করা হয়েছে।' USING ERRCODE = 'check_violation';
  END IF;
  IF v_date > current_date THEN
    RAISE EXCEPTION 'ভবিষ্যতের তারিখে সংশোধনী দেওয়া যায় না।' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.invoices (
    type, invoice_date, party_name, details, total_amount, paid_amount, payment_method,
    image_url, no_image_reason, goods_status, is_reversal, reverses_invoice_id,
    created_by, created_by_name
  ) VALUES (
    v_src.type, v_date, v_src.party_name,
    coalesce(nullif(btrim(p ->> 'reason'), ''), 'সংশোধনী'),
    v_src.total_amount, v_src.paid_amount, v_src.payment_method,
    v_src.image_url,
    CASE WHEN v_src.image_url IS NULL THEN 'মূল এন্ট্রির সংশোধনী' ELSE NULL END,
    'n_a', true, v_src.id, auth.uid(), v_actor
  ) RETURNING * INTO v_new;

  PERFORM set_config('hb.sys', 'on', true);

  -- মূল এন্ট্রির খরচের খাত অনুলিপি হয়
  FOR v_exp IN SELECT * FROM public.invoice_expenses WHERE invoice_id = v_src.id LOOP
    INSERT INTO public.invoice_expenses (invoice_id, head, amount, note)
    VALUES (v_new.id, v_exp.head, v_exp.amount, 'সংশোধনী');
  END LOOP;

  -- মূল এন্ট্রির পণ্যের সারি অনুলিপি হয়, স্টকে উল্টো প্রভাব পড়ে
  FOR v_item IN SELECT * FROM public.invoice_items WHERE invoice_id = v_src.id LOOP
    INSERT INTO public.invoice_items (
      invoice_id, product_id, product_name, qty, unit, unit_price, cost_price, line_total
    ) VALUES (
      v_new.id, v_item.product_id, v_item.product_name, v_item.qty, v_item.unit,
      v_item.unit_price, v_item.cost_price, v_item.line_total
    ) RETURNING id INTO v_new_item;

    CONTINUE WHEN v_item.product_id IS NULL;

    IF v_src.type = 'sale' THEN
      -- বিক্রয় বাতিল → মাল স্টকে ফিরে আসে, যে দামে বেরিয়েছিল সেই দামেই
      v_unit_c := CASE WHEN v_item.qty > 0 THEN round(v_item.line_cogs / v_item.qty, 4) ELSE 0 END;

      INSERT INTO public.stock_lots (product_id, invoice_id, lot_date, qty_in, qty_remaining, unit_cost, reason)
      VALUES (v_item.product_id, v_new.id, v_date, v_item.qty, v_item.qty, v_unit_c, 'reversal');

      INSERT INTO public.stock_moves (product_id, invoice_id, moved_on, qty, unit_cost, reason, note, created_by_name)
      VALUES (v_item.product_id, v_new.id, v_date, v_item.qty, v_unit_c, 'reversal',
              'বিক্রয় বাতিল', v_actor);

      UPDATE public.invoice_items SET line_cogs = -v_item.line_cogs WHERE id = v_new_item;

    ELSIF v_src.type = 'purchase' THEN
      -- অগ্রিম ক্রয় বাতিল: মাল যদি কখনো স্টকে না ঢুকে থাকে, উল্টো প্রভাবও পড়বে না
      v_back := v_item.received_qty;
      CONTINUE WHEN v_back <= 0;

      -- ঐ চালানের লট থেকেই ফেরত কাটা হয়
      PERFORM public.hb_return_purchase(
        v_item.product_id, v_back, v_src.id, coalesce(v_item.cost_price, 0));

      INSERT INTO public.stock_moves (product_id, invoice_id, moved_on, qty, unit_cost, reason, note, created_by_name)
      VALUES (v_item.product_id, v_new.id, v_date, -v_back,
              CASE WHEN v_item.qty > 0 THEN round(v_item.line_total / v_item.qty, 4) ELSE 0 END,
              'reversal', 'ক্রয় বাতিল', v_actor);
    END IF;
  END LOOP;

  UPDATE public.invoices
     SET cogs   = CASE WHEN v_src.type = 'sale' THEN -v_src.cogs ELSE 0 END,
         profit = CASE WHEN v_src.type = 'sale' THEN -v_src.profit ELSE 0 END
   WHERE id = v_new.id RETURNING * INTO v_new;

  UPDATE public.invoices SET reversed_at = now() WHERE id = v_src.id;

  PERFORM set_config('hb.sys', 'off', true);
  RETURN v_new;
END;
$$;

-- =====================================================================
-- ভিউ
-- =====================================================================

-- সক্রিয় (বাতিল হয়নি এমন) হিসাব — টাকার সব হিসাব এখান থেকে
CREATE OR REPLACE VIEW public.hb_live_invoices
WITH (security_invoker = true) AS
SELECT i.*
  FROM public.invoices i
 WHERE i.is_reversal = false
   AND i.reversed_at IS NULL;

-- স্টকের বর্তমান অবস্থা
CREATE OR REPLACE VIEW public.hb_stock_summary
WITH (security_invoker = true) AS
SELECT
  p.id                                   AS product_id,
  p.name                                 AS product_name,
  p.unit,
  p.cost_price,
  p.low_stock_threshold,
  p.is_active,
  c.name                                 AS category_name,
  coalesce(m.qty, 0)                     AS qty_on_hand,
  coalesce(l.value, 0)                   AS stock_value,
  CASE
    WHEN coalesce(m.qty, 0) < 0 THEN 'negative'
    WHEN coalesce(m.qty, 0) <= p.low_stock_threshold THEN 'low'
    ELSE 'ok'
  END                                    AS stock_state
FROM public.products p
LEFT JOIN public.product_categories c ON c.id = p.category_id
LEFT JOIN LATERAL (
  SELECT sum(sm.qty) AS qty FROM public.stock_moves sm WHERE sm.product_id = p.id
) m ON true
LEFT JOIN LATERAL (
  SELECT sum(sl.qty_remaining * sl.unit_cost) AS value
    FROM public.stock_lots sl WHERE sl.product_id = p.id
) l ON true;

-- পার্টিভিত্তিক সারাংশ — কার কাছে কত পাওনা, কাকে কত দেনা
CREATE OR REPLACE VIEW public.hb_party_summary
WITH (security_invoker = true) AS
SELECT
  party_name,
  count(*)                                                                   AS entry_count,
  sum(CASE WHEN type = 'sale'     THEN total_amount ELSE 0 END)              AS total_sales,
  sum(CASE WHEN type = 'purchase' THEN total_amount ELSE 0 END)              AS total_purchases,
  sum(CASE WHEN type = 'sale'     THEN due_amount   ELSE 0 END)              AS receivable,
  sum(CASE WHEN type IN ('purchase', 'expense') THEN due_amount ELSE 0 END)  AS payable,
  max(invoice_date)                                                          AS last_entry_date
FROM public.hb_live_invoices
WHERE party_name IS NOT NULL AND btrim(party_name) <> ''
GROUP BY party_name;

GRANT SELECT ON public.hb_live_invoices, public.hb_stock_summary, public.hb_party_summary TO authenticated;

-- =====================================================================
-- অনুমতি — শুধু লগইন করা ব্যবহারকারী RPC চালাতে পারবে
-- =====================================================================
DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'hb_create_invoice(jsonb)', 'hb_add_payment(jsonb)', 'hb_receive_goods(jsonb)',
    'hb_edit_details(jsonb)', 'hb_reverse_invoice(jsonb)', 'hb_save_product(jsonb)',
    'hb_save_category(text)', 'hb_actor_name()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.hb_consume_fifo(uuid, numeric, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hb_return_purchase(uuid, numeric, uuid, numeric) FROM PUBLIC, anon, authenticated;

-- =====================================================================
-- ইনভয়েসের ছবির স্টোরেজ
-- =====================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('hisab', 'hisab', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "hisab read" ON storage.objects FOR SELECT
    USING (bucket_id = 'hisab');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  -- নিজের ফোল্ডারেই আপলোড করা যায়: <user-id>/<random>.jpg
  CREATE POLICY "hisab upload" ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'hisab'
      AND auth.role() = 'authenticated'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
