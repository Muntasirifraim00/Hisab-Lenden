-- =====================================================================
-- কোটেশন ও সেলস রিটার্ন
-- ---------------------------------------------------------------------
-- দুটো জিনিস আলাদা স্বভাবের, তাই আলাদাভাবে বানানো হয়েছে:
--
--   কোটেশন  — এটা প্রস্তাব, লেনদেন নয়। টাকা নড়ে না, স্টক নড়ে না।
--             তাই এটা বদলানো ও মোছা যায়। বিক্রয়ে রূপান্তর হলে তালাবদ্ধ।
--
--   ফেরত    — এটা আসল লেনদেন। মাল স্টকে ফেরে, লাভ উল্টে যায়।
--             তাই বাকি সব হিসাবের মতোই অপরিবর্তনীয়, ইনভয়েসের চতুর্থ ধরন।
-- =====================================================================

-- ---------- এনামে নতুন মান ----------
-- (নতুন মান একই ট্রানজেকশনে ব্যবহার করা যায় না, তাই আলাদা ব্লকে)
ALTER TYPE public.hb_invoice_type ADD VALUE IF NOT EXISTS 'return';
ALTER TYPE public.hb_stock_reason ADD VALUE IF NOT EXISTS 'return';

DO $$ BEGIN
  CREATE TYPE public.hb_quote_status AS ENUM (
    'draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =====================================================================
-- ফেরতের জন্য বাড়তি কলাম
-- =====================================================================

-- কোন বিক্রয়ের ফেরত
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS returns_invoice_id UUID REFERENCES public.invoices(id);

CREATE INDEX IF NOT EXISTS invoices_returns_idx
  ON public.invoices (returns_invoice_id) WHERE returns_invoice_id IS NOT NULL;

-- কোন সারির কতটা ইতিমধ্যে ফেরত এসেছে — একই মাল দুবার ফেরত ঠেকাতে
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS returned_qty NUMERIC(14, 3) NOT NULL DEFAULT 0;

-- ফেরতের সারি কোন মূল সারির বিপরীতে
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS source_item_id UUID REFERENCES public.invoice_items(id);

-- =====================================================================
-- কোটেশন
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.quotations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_no             TEXT,
  quote_date           DATE NOT NULL DEFAULT current_date,
  valid_until          DATE,
  party_name           TEXT,
  notes                TEXT,
  total_amount         NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  status               public.hb_quote_status NOT NULL DEFAULT 'draft',
  converted_invoice_id UUID REFERENCES public.invoices(id),
  created_by           UUID,
  created_by_name      TEXT NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS quotations_no_key
  ON public.quotations (lower(btrim(quote_no)))
  WHERE quote_no IS NOT NULL AND btrim(quote_no) <> '';

CREATE INDEX IF NOT EXISTS quotations_date_idx ON public.quotations (quote_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS quotations_status_idx ON public.quotations (status);

CREATE TABLE IF NOT EXISTS public.quotation_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  product_id   UUID REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  qty          NUMERIC(14, 3) NOT NULL CHECK (qty > 0),
  unit         TEXT NOT NULL DEFAULT 'pcs',
  unit_price   NUMERIC(14, 2) NOT NULL DEFAULT 0,
  line_total   NUMERIC(14, 2) NOT NULL DEFAULT 0,
  sort_order   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS quotation_items_quote_idx ON public.quotation_items (quotation_id);

-- রূপান্তরিত কোটেশন আর বদলানো যাবে না
CREATE OR REPLACE FUNCTION public.hb_quote_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_status public.hb_quote_status;
BEGIN
  IF coalesce(current_setting('hb.sys', true), '') = 'on' THEN
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  v_status := CASE TG_OP WHEN 'DELETE' THEN OLD.status ELSE OLD.status END;
  IF v_status = 'converted' THEN
    RAISE EXCEPTION 'বিক্রয়ে রূপান্তরিত কোটেশন বদলানো বা মোছা যায় না।'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS hb_quote_guard ON public.quotations;
CREATE TRIGGER hb_quote_guard BEFORE UPDATE OR DELETE ON public.quotations
  FOR EACH ROW EXECUTE FUNCTION public.hb_quote_guard();

-- RLS — পড়া যাবে, লেখা RPC দিয়ে
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['quotations', 'quotation_items'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "hb read" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "hb read" ON public.%I FOR SELECT USING (auth.role() = ''authenticated'')', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END $$;
