-- =====================================================================
-- কোটেশন ও ফেরতের কাজের ফাংশন
-- (এনামের নতুন মান আগের মাইগ্রেশনে যোগ হয়েছে — একই ট্রানজেকশনে সেটা
--  ব্যবহার করা যায় না, তাই এটা আলাদা ফাইল।)
-- =====================================================================

-- =====================================================================
-- সেলস রিটার্ন — ক্রেতা মাল ফেরত দিল
-- =====================================================================
CREATE OR REPLACE FUNCTION public.hb_create_return(p JSONB)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_src      public.invoices;
  v_ret      public.invoices;
  v_actor    TEXT := public.hb_actor_name();
  v_date     DATE := coalesce((p ->> 'invoice_date')::DATE, current_date);
  v_line     JSONB;
  v_item     public.invoice_items;
  v_qty      NUMERIC;
  v_unit_c   NUMERIC;   -- প্রতি এককে যে ক্রয়মূল্যে মাল বেরিয়েছিল
  v_value    NUMERIC := 0;
  v_cogs     NUMERIC := 0;
  v_refund   NUMERIC;
  v_any      BOOLEAN := false;
BEGIN
  SELECT * INTO v_src FROM public.invoices
   WHERE id = (p ->> 'invoice_id')::UUID FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'বিক্রয়টি পাওয়া যায়নি।' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_src.type <> 'sale' THEN
    RAISE EXCEPTION 'শুধু বিক্রয়ের মাল ফেরত নেওয়া যায়।' USING ERRCODE = 'check_violation';
  END IF;
  IF v_src.is_reversal OR v_src.reversed_at IS NOT NULL THEN
    RAISE EXCEPTION 'বাতিল হওয়া বিক্রয়ে ফেরত নেওয়া যায় না।' USING ERRCODE = 'check_violation';
  END IF;
  IF v_date > current_date THEN
    RAISE EXCEPTION 'ভবিষ্যতের তারিখে ফেরত লেখা যায় না।' USING ERRCODE = 'check_violation';
  END IF;
  IF v_date < v_src.invoice_date THEN
    RAISE EXCEPTION 'বিক্রয়ের আগের তারিখে ফেরত হতে পারে না।' USING ERRCODE = 'check_violation';
  END IF;
  IF nullif(p ->> 'image_url', '') IS NULL
     AND coalesce(length(btrim(p ->> 'no_image_reason')), 0) < 3 THEN
    RAISE EXCEPTION 'ছবি না থাকলে কারণ লিখতে হবে।' USING ERRCODE = 'check_violation';
  END IF;

  -- ---- কত টাকার মাল ফিরছে, আর তার ক্রয়মূল্য কত ----
  FOR v_line IN SELECT * FROM jsonb_array_elements(coalesce(p -> 'lines', '[]'::jsonb)) LOOP
    SELECT * INTO v_item FROM public.invoice_items
     WHERE id = (v_line ->> 'item_id')::UUID AND invoice_id = v_src.id;
    CONTINUE WHEN NOT FOUND;

    -- যা বিক্রি হয়েছিল তার বেশি ফেরত নেওয়া যাবে না
    v_qty := LEAST(
      round(coalesce((v_line ->> 'qty')::NUMERIC, 0), 3),
      v_item.qty - v_item.returned_qty
    );
    CONTINUE WHEN v_qty <= 0;

    v_any   := true;
    v_value := v_value + (v_qty * v_item.unit_price);
    v_cogs  := v_cogs + (v_qty * CASE WHEN v_item.qty > 0
                                      THEN v_item.line_cogs / v_item.qty ELSE 0 END);
  END LOOP;

  IF NOT v_any THEN
    RAISE EXCEPTION 'ফেরত নেওয়ার মতো কিছু বাছাই করা হয়নি।' USING ERRCODE = 'check_violation';
  END IF;

  v_value := round(v_value, 2);
  v_cogs  := round(v_cogs, 2);

  -- নগদে কত ফেরত দেওয়া হলো — মালের দামের বেশি নয়
  v_refund := LEAST(round(coalesce((p ->> 'refunded_amount')::NUMERIC, 0), 2), v_value);

  -- ---- ফেরতের এন্ট্রি ----
  -- লাভ ও ক্রয়মূল্য ঋণাত্মক করে রাখা হয়, যাতে যোগ করলেই নিট হিসাব মেলে
  INSERT INTO public.invoices (
    type, invoice_date, memo_no, party_name, details, total_amount, paid_amount,
    payment_method, image_url, no_image_reason, cogs, profit, goods_status,
    returns_invoice_id, created_by, created_by_name
  ) VALUES (
    'return', v_date,
    nullif(btrim(p ->> 'memo_no'), ''),
    v_src.party_name,
    coalesce(nullif(btrim(p ->> 'reason'), ''), 'মাল ফেরত'),
    v_value, v_refund,
    coalesce(nullif(p ->> 'payment_method', ''), 'cash')::public.hb_payment_method,
    nullif(p ->> 'image_url', ''),
    nullif(btrim(p ->> 'no_image_reason'), ''),
    -v_cogs, -(v_value - v_cogs), 'n_a',
    v_src.id, auth.uid(), v_actor
  ) RETURNING * INTO v_ret;

  PERFORM set_config('hb.sys', 'on', true);

  -- ---- সারি + স্টকে ফেরত ----
  FOR v_line IN SELECT * FROM jsonb_array_elements(coalesce(p -> 'lines', '[]'::jsonb)) LOOP
    SELECT * INTO v_item FROM public.invoice_items
     WHERE id = (v_line ->> 'item_id')::UUID AND invoice_id = v_src.id;
    CONTINUE WHEN NOT FOUND;

    v_qty := LEAST(
      round(coalesce((v_line ->> 'qty')::NUMERIC, 0), 3),
      v_item.qty - v_item.returned_qty
    );
    CONTINUE WHEN v_qty <= 0;

    v_unit_c := CASE WHEN v_item.qty > 0 THEN round(v_item.line_cogs / v_item.qty, 4) ELSE 0 END;

    INSERT INTO public.invoice_items (
      invoice_id, product_id, product_name, qty, unit, unit_price,
      cost_price, line_total, line_cogs, source_item_id
    ) VALUES (
      v_ret.id, v_item.product_id, v_item.product_name, v_qty, v_item.unit,
      v_item.unit_price, v_item.cost_price,
      round(v_qty * v_item.unit_price, 2),
      -round(v_qty * v_unit_c, 2), v_item.id
    );

    UPDATE public.invoice_items
       SET returned_qty = returned_qty + v_qty
     WHERE id = v_item.id;

    -- মাল যে দামে বেরিয়েছিল সেই দামেই স্টকে ফেরে
    CONTINUE WHEN v_item.product_id IS NULL;

    INSERT INTO public.stock_lots (product_id, invoice_id, lot_date, qty_in, qty_remaining, unit_cost, reason)
    VALUES (v_item.product_id, v_ret.id, v_date, v_qty, v_qty, v_unit_c, 'return');

    INSERT INTO public.stock_moves (product_id, invoice_id, moved_on, qty, unit_cost, reason, note, created_by_name)
    VALUES (v_item.product_id, v_ret.id, v_date, v_qty, v_unit_c, 'return', 'ক্রেতা ফেরত দিয়েছে', v_actor);
  END LOOP;

  PERFORM set_config('hb.sys', 'off', true);
  RETURN v_ret;
END;
$$;

-- =====================================================================
-- কোটেশন — নতুন বা সম্পাদনা
-- =====================================================================
CREATE OR REPLACE FUNCTION public.hb_save_quotation(p JSONB)
RETURNS public.quotations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row   public.quotations;
  v_id    UUID := nullif(p ->> 'id', '')::UUID;
  v_actor TEXT := public.hb_actor_name();
  v_item  JSONB;
  v_total NUMERIC := 0;
  v_qty   NUMERIC;
  v_price NUMERIC;
  v_i     INTEGER := 0;
BEGIN
  -- মোট অঙ্ক সারি থেকেই আসে, অ্যাপ থেকে পাঠানো যায় না
  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(p -> 'items', '[]'::jsonb)) LOOP
    v_qty := round(coalesce((v_item ->> 'qty')::NUMERIC, 0), 3);
    v_price := round(coalesce((v_item ->> 'unit_price')::NUMERIC, 0), 2);
    CONTINUE WHEN v_qty <= 0;
    v_total := v_total + (v_qty * v_price);
  END LOOP;
  v_total := round(v_total, 2);

  PERFORM set_config('hb.sys', 'on', true);

  IF v_id IS NULL THEN
    INSERT INTO public.quotations (
      quote_no, quote_date, valid_until, party_name, notes, total_amount,
      status, created_by, created_by_name
    ) VALUES (
      nullif(btrim(p ->> 'quote_no'), ''),
      coalesce((p ->> 'quote_date')::DATE, current_date),
      nullif(p ->> 'valid_until', '')::DATE,
      nullif(btrim(p ->> 'party_name'), ''),
      nullif(btrim(p ->> 'notes'), ''),
      v_total,
      coalesce(nullif(p ->> 'status', ''), 'draft')::public.hb_quote_status,
      auth.uid(), v_actor
    ) RETURNING * INTO v_row;
  ELSE
    SELECT * INTO v_row FROM public.quotations WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'কোটেশনটি পাওয়া যায়নি।' USING ERRCODE = 'no_data_found';
    END IF;
    IF v_row.status = 'converted' THEN
      RAISE EXCEPTION 'বিক্রয়ে রূপান্তরিত কোটেশন বদলানো যায় না।' USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.quotations SET
      quote_no     = nullif(btrim(p ->> 'quote_no'), ''),
      quote_date   = coalesce((p ->> 'quote_date')::DATE, quote_date),
      valid_until  = nullif(p ->> 'valid_until', '')::DATE,
      party_name   = nullif(btrim(p ->> 'party_name'), ''),
      notes        = nullif(btrim(p ->> 'notes'), ''),
      total_amount = v_total,
      status       = coalesce(nullif(p ->> 'status', ''), status::text)::public.hb_quote_status,
      updated_at   = now()
    WHERE id = v_id RETURNING * INTO v_row;

    DELETE FROM public.quotation_items WHERE quotation_id = v_id;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(p -> 'items', '[]'::jsonb)) LOOP
    v_qty := round(coalesce((v_item ->> 'qty')::NUMERIC, 0), 3);
    v_price := round(coalesce((v_item ->> 'unit_price')::NUMERIC, 0), 2);
    CONTINUE WHEN v_qty <= 0;

    INSERT INTO public.quotation_items (
      quotation_id, product_id, product_name, qty, unit, unit_price, line_total, sort_order
    ) VALUES (
      v_row.id,
      nullif(v_item ->> 'product_id', '')::UUID,
      coalesce(nullif(btrim(v_item ->> 'product_name'), ''), 'পণ্য'),
      v_qty,
      coalesce(nullif(v_item ->> 'unit', ''), 'pcs'),
      v_price,
      round(v_qty * v_price, 2),
      v_i
    );
    v_i := v_i + 1;
  END LOOP;

  PERFORM set_config('hb.sys', 'off', true);
  RETURN v_row;
END;
$$;

-- ---------- অবস্থা বদল ----------
CREATE OR REPLACE FUNCTION public.hb_set_quote_status(p JSONB)
RETURNS public.quotations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row    public.quotations;
  v_status public.hb_quote_status := (p ->> 'status')::public.hb_quote_status;
BEGIN
  IF v_status = 'converted' THEN
    RAISE EXCEPTION 'রূপান্তর আলাদা কাজ — “বিক্রয়ে নিন” ব্যবহার করুন।'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_row FROM public.quotations WHERE id = (p ->> 'id')::UUID FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'কোটেশনটি পাওয়া যায়নি।' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_row.status = 'converted' THEN
    RAISE EXCEPTION 'বিক্রয়ে রূপান্তরিত কোটেশন বদলানো যায় না।' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('hb.sys', 'on', true);
  UPDATE public.quotations SET status = v_status, updated_at = now()
   WHERE id = v_row.id RETURNING * INTO v_row;
  PERFORM set_config('hb.sys', 'off', true);

  RETURN v_row;
END;
$$;

-- ---------- মোছা ----------
CREATE OR REPLACE FUNCTION public.hb_delete_quotation(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_status public.hb_quote_status;
BEGIN
  SELECT status INTO v_status FROM public.quotations WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF v_status = 'converted' THEN
    RAISE EXCEPTION 'বিক্রয়ে রূপান্তরিত কোটেশন মোছা যায় না।' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('hb.sys', 'on', true);
  DELETE FROM public.quotations WHERE id = p_id;
  PERFORM set_config('hb.sys', 'off', true);
  RETURN true;
END;
$$;

-- =====================================================================
-- কোটেশন → বিক্রয়
-- =====================================================================
CREATE OR REPLACE FUNCTION public.hb_convert_quotation(p JSONB)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote public.quotations;
  v_inv   public.invoices;
  v_items JSONB;
  v_p     JSONB;
BEGIN
  SELECT * INTO v_quote FROM public.quotations WHERE id = (p ->> 'id')::UUID FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'কোটেশনটি পাওয়া যায়নি।' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_quote.status = 'converted' THEN
    RAISE EXCEPTION 'এই কোটেশন আগেই বিক্রয়ে নেওয়া হয়েছে।' USING ERRCODE = 'check_violation';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'product_id',   qi.product_id,
           'product_name', qi.product_name,
           'qty',          qi.qty,
           'unit_price',   qi.unit_price,
           'line_total',   qi.line_total
         ) ORDER BY qi.sort_order), '[]'::jsonb)
    INTO v_items
    FROM public.quotation_items qi
   WHERE qi.quotation_id = v_quote.id;

  IF v_items = '[]'::jsonb THEN
    RAISE EXCEPTION 'কোটেশনে কোনো পণ্য নেই।' USING ERRCODE = 'check_violation';
  END IF;

  -- বিক্রয়ের এন্ট্রি বানানোর কাজটা মূল ফাংশনই করে — সব পরীক্ষা ও
  -- FIFO হিসাব এক জায়গাতেই থাকে
  v_p := jsonb_build_object(
    'type', 'sale',
    'invoice_date', coalesce(p ->> 'invoice_date', current_date::text),
    'party_name', v_quote.party_name,
    'details', coalesce(nullif(btrim(p ->> 'details'), ''),
                        'কোটেশন থেকে' ||
                        coalesce(' — ' || v_quote.quote_no, '')),
    'memo_no', nullif(btrim(p ->> 'memo_no'), ''),
    'total_amount', v_quote.total_amount,
    'paid_amount', nullif(p ->> 'paid_amount', '')::NUMERIC,
    'nothing_paid', coalesce((p ->> 'nothing_paid')::BOOLEAN, false),
    'payment_method', coalesce(nullif(p ->> 'payment_method', ''), 'cash'),
    'image_url', nullif(p ->> 'image_url', ''),
    'no_image_reason', coalesce(nullif(btrim(p ->> 'no_image_reason'), ''), 'কোটেশন থেকে তৈরি'),
    'items', v_items
  );

  v_inv := public.hb_create_invoice(v_p);

  PERFORM set_config('hb.sys', 'on', true);
  UPDATE public.quotations
     SET status = 'converted', converted_invoice_id = v_inv.id, updated_at = now()
   WHERE id = v_quote.id;
  PERFORM set_config('hb.sys', 'off', true);

  RETURN v_inv;
END;
$$;

-- =====================================================================
-- ভিউ হালনাগাদ — ফেরত হিসাবে ধরা
-- =====================================================================

-- ফেরত পাওনা কমায়; ফেরতের বাকি মানে ক্রেতাকে টাকা ফেরত দিতে হবে।
-- নতুন কলাম মাঝে ঢুকছে বলে REPLACE চলে না — আগে ফেলে দিতে হয়।
DROP VIEW IF EXISTS public.hb_party_summary;
CREATE VIEW public.hb_party_summary
WITH (security_invoker = true) AS
SELECT
  party_name,
  count(*)                                                                  AS entry_count,
  sum(CASE WHEN type = 'sale'     THEN total_amount ELSE 0 END)             AS total_sales,
  sum(CASE WHEN type = 'purchase' THEN total_amount ELSE 0 END)             AS total_purchases,
  sum(CASE WHEN type = 'return'   THEN total_amount ELSE 0 END)             AS total_returns,
  sum(CASE WHEN type = 'sale'     THEN due_amount   ELSE 0 END)             AS receivable,
  sum(CASE WHEN type IN ('purchase', 'expense', 'return')
           THEN due_amount ELSE 0 END)                                      AS payable,
  max(invoice_date)                                                         AS last_entry_date
FROM public.hb_live_invoices
WHERE party_name IS NOT NULL AND btrim(party_name) <> ''
GROUP BY party_name;

GRANT SELECT ON public.hb_party_summary TO authenticated;

-- একটা বিক্রয়ের কোন সারি থেকে আর কতটা ফেরত নেওয়া যাবে
CREATE OR REPLACE VIEW public.hb_returnable_items
WITH (security_invoker = true) AS
SELECT
  ii.id            AS item_id,
  ii.invoice_id,
  ii.product_id,
  ii.product_name,
  ii.unit,
  ii.qty           AS sold_qty,
  ii.returned_qty,
  ii.qty - ii.returned_qty AS returnable_qty,
  ii.unit_price,
  CASE WHEN ii.qty > 0 THEN round(ii.line_cogs / ii.qty, 4) ELSE 0 END AS unit_cost
FROM public.invoice_items ii
JOIN public.invoices i ON i.id = ii.invoice_id
WHERE i.type = 'sale'
  AND i.is_reversal = false
  AND i.reversed_at IS NULL;

GRANT SELECT ON public.hb_returnable_items TO authenticated;

-- =====================================================================
-- অনুমতি
-- =====================================================================
DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'hb_create_return(jsonb)', 'hb_save_quotation(jsonb)',
    'hb_set_quote_status(jsonb)', 'hb_delete_quotation(uuid)',
    'hb_convert_quotation(jsonb)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;
