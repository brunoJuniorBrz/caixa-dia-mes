-- Ensure Pesquisa service type exists
INSERT INTO public.service_types (code, name, default_price_cents, counts_in_gross)
VALUES ('PESQUISA', 'Pesquisa', 0, true)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  default_price_cents = EXCLUDED.default_price_cents,
  counts_in_gross = EXCLUDED.counts_in_gross;

-- Guard against duplicated Revistoria Retorno entries (should not occur due to unique constraint)
WITH duplicated_rev_retorno AS (
  SELECT id
  FROM public.service_types
  WHERE code = 'REV_RETORNO'
  ORDER BY created_at, id
  OFFSET 1
)
DELETE FROM public.service_types
WHERE id IN (SELECT id FROM duplicated_rev_retorno);

-- Allow admins to delete any cash box
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'cash_boxes'
      AND policyname = 'Admin pode deletar caixas'
  ) THEN
    EXECUTE 'CREATE POLICY "Admin pode deletar caixas" ON public.cash_boxes FOR DELETE USING (public.is_admin())';
  END IF;
END
$$;

-- Allow vistoriadores to delete cash boxes belonging to their store
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'cash_boxes'
      AND policyname = 'Vistoriador pode deletar caixas da sua loja'
  ) THEN
    EXECUTE 'CREATE POLICY "Vistoriador pode deletar caixas da sua loja" ON public.cash_boxes FOR DELETE USING (store_id = public.get_user_store_id())';
  END IF;
END
$$;
