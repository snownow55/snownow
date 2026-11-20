-- STEP3: account-scoped display preferences only. Does not touch posts/master/Auth data.
CREATE TABLE public.user_region_preferences (
  user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  region_codes text[] NOT NULL DEFAULT '{}',
  CONSTRAINT region_codes_shape CHECK (
    cardinality(region_codes) <= 9
    AND (cardinality(region_codes) = 0 OR array_ndims(region_codes) = 1)
    AND array_position(region_codes, NULL) IS NULL
  )
);
ALTER TABLE public.user_region_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_region_preferences FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_region_preferences TO authenticated;
CREATE POLICY own_region_preferences_select ON public.user_region_preferences
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY own_region_preferences_insert ON public.user_region_preferences
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY own_region_preferences_update ON public.user_region_preferences
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
