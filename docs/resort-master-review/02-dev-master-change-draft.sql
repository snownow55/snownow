-- REVIEW DRAFT ONLY. NOT EXECUTED.
-- Target: snownow-dev only. Verify the project in the dashboard before approval.
-- Requires the SQL Editor's administrative role. Never run with an app user.
-- Sections A and C are read-only. Section B changes development DB masters.
-- PostgreSQL UTF8 is required for normalize(..., NFKC).

-- B. APPLY: execute the ENTIRE transaction only after separate approval.
-- Pause development posting during application. Do not run individual statements.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

-- No concurrent resort writer may change the seed preconditions.
LOCK TABLE public.resorts IN SHARE ROW EXCLUSIVE MODE;

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.resorts WHERE id = 1 AND name = 'オーンズ')
     OR NOT EXISTS (SELECT 1 FROM public.resorts WHERE id = 2 AND name = 'キロロ') THEN
    RAISE EXCEPTION 'Protected resort IDs/names do not match; stop and review';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.resorts'::regclass AND attname = 'id'
      AND atttypid = 'integer'::regtype AND attidentity = 'a'
  ) THEN
    RAISE EXCEPTION 'Expected integer GENERATED ALWAYS identity for resorts.id';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.resorts'::regclass AND NOT tgisinternal
  ) OR EXISTS (
    SELECT 1 FROM pg_rewrite
    WHERE ev_class = 'public.resorts'::regclass AND ev_type IN ('2', '3', '4')
  ) THEN
    RAISE EXCEPTION 'Custom resort trigger/write rule found; review before writing';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class
          WHERE oid = 'public.resorts'::regclass) THEN
    RAISE EXCEPTION 'resorts RLS must already be enabled';
  END IF;
END
$guard$;

CREATE TEMP TABLE _expected_regions (
  code text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  sort_order smallint NOT NULL UNIQUE,
  expected_count integer NOT NULL
) ON COMMIT DROP;

INSERT INTO pg_temp._expected_regions VALUES
  ('sapporo', '札幌近郊', 1, 13),
  ('sorachi', '空知', 2, 6),
  ('asahikawa-furano', '旭川・富良野', 3, 10),
  ('dohoku', '道北', 4, 4),
  ('doo', '道央', 5, 3),
  ('niseko-rusutsu', 'ニセコ・ルスツ', 6, 6),
  ('iburi', '胆振', 7, 2),
  ('donan', '道南', 8, 3),
  ('doto', '道東', 9, 12);

CREATE TEMP TABLE _expected_resorts (
  name text PRIMARY KEY,
  display_name text NOT NULL UNIQUE,
  region_code text NOT NULL REFERENCES pg_temp._expected_regions(code),
  sort_order integer NOT NULL CHECK (sort_order > 0),
  UNIQUE (region_code, sort_order)
) ON COMMIT DROP;

INSERT INTO pg_temp._expected_resorts VALUES
  ('さっぽろばんけい', 'さっぽろばんけい', 'sapporo', 1),
  ('サッポロテイネ', 'サッポロテイネ', 'sapporo', 2),
  ('Fu''sスノーエリア', 'Fu''sスノーエリア', 'sapporo', 3),
  ('札幌国際スキー場', '札幌国際スキー場', 'sapporo', 4),
  ('キロロ', 'キロロ', 'sapporo', 5),
  ('オーンズ', 'スノークルーズオーンズ', 'sapporo', 6),
  ('朝里川温泉スキー場', '朝里川温泉スキー場', 'sapporo', 7),
  ('小樽天狗山スキー場', '小樽天狗山スキー場', 'sapporo', 8),
  ('コンサドーレ仁木スキーパーク', 'コンサドーレ仁木スキーパーク', 'sapporo', 9),
  ('北長沼スキー場', '北長沼スキー場', 'sapporo', 10),
  ('マウントレースイ', 'マウントレースイ', 'sapporo', 11),
  ('中山峠スキー場', '中山峠スキー場', 'sapporo', 12),
  ('札幌藻岩山スキー場', '札幌藻岩山スキー場', 'sapporo', 13),
  ('北海道グリーンランド', '北海道グリーンランド', 'sorachi', 1),
  ('萩の山スキー場', '萩の山スキー場', 'sorachi', 2),
  ('桂沢国設スキー場', '桂沢国設スキー場', 'sorachi', 3),
  ('美唄国設スキー場', '美唄国設スキー場', 'sorachi', 4),
  ('かもい岳スキー場', 'かもい岳スキー場', 'sorachi', 5),
  ('ASHIMOI KANKO 高穂スキー場', 'ASHIMOI KANKO 高穂スキー場', 'sorachi', 6),
  ('サンタプレゼントパーク', 'サンタプレゼントパーク', 'asahikawa-furano', 1),
  ('カムイスキーリンクス', 'カムイスキーリンクス', 'asahikawa-furano', 2),
  ('キャンモアスキービレッジ', 'キャンモアスキービレッジ', 'asahikawa-furano', 3),
  ('ぴっぷスキー場', 'ぴっぷスキー場', 'asahikawa-furano', 4),
  ('旭岳ロープウェイ', '旭岳ロープウェイ', 'asahikawa-furano', 5),
  ('大雪山黒岳スキー場', '大雪山黒岳スキー場', 'asahikawa-furano', 6),
  ('富良野スキー場', '富良野スキー場', 'asahikawa-furano', 7),
  ('国設南ふらのスキー場', '国設南ふらのスキー場', 'asahikawa-furano', 8),
  ('和寒東山スキー場', '和寒東山スキー場', 'asahikawa-furano', 9),
  ('ほろたちスキー場', 'ほろたちスキー場', 'asahikawa-furano', 10),
  ('士別日向スキー場', '士別日向スキー場', 'dohoku', 1),
  ('士別あさひスキー場', '士別あさひスキー場', 'dohoku', 2),
  ('名寄ピヤシリスキー場', '名寄ピヤシリスキー場', 'dohoku', 3),
  ('稚内市こまどりスキー場', '稚内市こまどりスキー場', 'dohoku', 4),
  ('星野リゾート トマム', '星野リゾート トマム', 'doo', 1),
  ('サホロリゾートスキー場', 'サホロリゾートスキー場', 'doo', 2),
  ('日高国際スキー場', '日高国際スキー場', 'doo', 3),
  ('ルスツリゾート', 'ルスツリゾート', 'niseko-rusutsu', 1),
  ('ニセコHANAZONOリゾート', 'ニセコHANAZONOリゾート', 'niseko-rusutsu', 2),
  ('ニセコグラン・ヒラフ', 'ニセコグラン・ヒラフ', 'niseko-rusutsu', 3),
  ('ニセコアンヌプリ国際スキー場', 'ニセコアンヌプリ国際スキー場', 'niseko-rusutsu', 4),
  ('ニセコビレッジスキーリゾート', 'ニセコビレッジスキーリゾート', 'niseko-rusutsu', 5),
  ('ニセコモイワスキーリゾート', 'ニセコモイワスキーリゾート', 'niseko-rusutsu', 6),
  ('サンライバスキー場', 'サンライバスキー場', 'iburi', 1),
  ('オロフレスキー場', 'オロフレスキー場', 'iburi', 2),
  ('今金町ピリカスキー場', '今金町ピリカスキー場', 'donan', 1),
  ('グリーンピア大沼スキー場', 'グリーンピア大沼スキー場', 'donan', 2),
  ('函館七飯スノーパーク', '函館七飯スノーパーク', 'donan', 3),
  ('えんがるロックバレー', 'えんがるロックバレー', 'doto', 1),
  ('ノーザンアークリゾート', 'ノーザンアークリゾート', 'doto', 2),
  ('網走レークビュースキー場', '網走レークビュースキー場', 'doto', 3),
  ('北見若松市民スキー場', '北見若松市民スキー場', 'doto', 4),
  ('国設阿寒湖畔スキー場 ウタラ', '国設阿寒湖畔スキー場 ウタラ', 'doto', 5),
  ('ぬかびら源泉郷スキー場', 'ぬかびら源泉郷スキー場', 'doto', 6),
  ('斜里町ウナベツスキー場', '斜里町ウナベツスキー場', 'doto', 7),
  ('紋別市営大山スキー場', '紋別市営大山スキー場', 'doto', 8),
  ('湧別町五鹿山スキー場', '湧別町五鹿山スキー場', 'doto', 9),
  ('北見市留辺蘂町八方台スキー場', '北見市留辺蘂町八方台スキー場', 'doto', 10),
  ('メムロスキー場', 'メムロスキー場', 'doto', 11),
  ('美幌町リリー山スキー場', '美幌町リリー山スキー場', 'doto', 12);

-- Snapshots never leave this session; do not display user IDs or post contents.
CREATE TEMP TABLE _resorts_before ON COMMIT DROP AS
SELECT id, name, region, is_active FROM public.resorts;

CREATE TEMP TABLE _posts_before ON COMMIT DROP AS
SELECT id, to_jsonb(p) AS row_data FROM snownow_private.snow_posts p;

DO $manifest$
BEGIN
  IF (SELECT count(*) FROM pg_temp._expected_resorts) <> 59
     OR (SELECT count(*) FROM pg_temp._expected_regions) <> 9
     OR EXISTS (
       SELECT 1 FROM pg_temp._expected_regions g
       LEFT JOIN pg_temp._expected_resorts r ON r.region_code = g.code
       GROUP BY g.code, g.expected_count
       HAVING count(r.name) <> g.expected_count
          OR min(r.sort_order) <> 1 OR max(r.sort_order) <> g.expected_count
     ) THEN
    RAISE EXCEPTION 'Manifest total, per-region count, or order mismatch';
  END IF;

  -- Unknown existing spellings/aliases are never automatically renamed/merged.
  IF EXISTS (
    SELECT 1 FROM public.resorts r
    WHERE NOT EXISTS (SELECT 1 FROM pg_temp._expected_resorts m WHERE m.name = r.name)
  ) THEN
    RAISE EXCEPTION 'Existing name outside manifest; inspect aliases and duplicates first';
  END IF;

  -- Detect likely formatting duplicates across internal and display names.
  -- This does not prove that every possible semantic alias has been found.
  IF EXISTS (
    SELECT normalized_name FROM (
      SELECT name, lower(regexp_replace(normalize(label, NFKC),
        '[[:space:]　・･''’‘‐‑‒–—―-]+', '', 'g')) AS normalized_name
      FROM (
        SELECT name, name AS label FROM pg_temp._expected_resorts
        UNION ALL
        SELECT name, display_name AS label FROM pg_temp._expected_resorts
        UNION ALL
        SELECT name, name AS label FROM public.resorts
      ) labels
    ) keys
    GROUP BY normalized_name HAVING count(DISTINCT name) > 1
  ) THEN
    RAISE EXCEPTION 'Likely normalized name duplicate; inspect before applying';
  END IF;
END
$manifest$;

CREATE TABLE IF NOT EXISTS public.regions (
  code text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  sort_order smallint NOT NULL UNIQUE CHECK (sort_order > 0)
);

DO $region_guard$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger
             WHERE tgrelid = 'public.regions'::regclass AND NOT tgisinternal)
     OR EXISTS (SELECT 1 FROM pg_rewrite
                WHERE ev_class = 'public.regions'::regclass AND ev_type IN ('2', '3', '4')) THEN
    RAISE EXCEPTION 'Custom region trigger/write rule found; review before writing';
  END IF;
END
$region_guard$;

INSERT INTO public.regions (code, name, sort_order)
SELECT code, name, sort_order FROM pg_temp._expected_regions
ON CONFLICT (code) DO NOTHING;

DO $regions$
BEGIN
  IF (SELECT count(*) FROM public.regions) <> 9 OR EXISTS (
    SELECT 1 FROM pg_temp._expected_regions m
    LEFT JOIN public.regions g ON g.code = m.code
    WHERE g.code IS NULL OR g.name IS DISTINCT FROM m.name
       OR g.sort_order IS DISTINCT FROM m.sort_order
  ) THEN
    RAISE EXCEPTION 'Existing regions differ from approved manifest; do not overwrite';
  END IF;
END
$regions$;

ALTER TABLE public.resorts
  ADD COLUMN IF NOT EXISTS region_code text,
  ADD COLUMN IF NOT EXISTS sort_order integer,
  ADD COLUMN IF NOT EXISTS display_name text;

DO $types$
BEGIN
  IF (SELECT count(*) FROM pg_attribute
      WHERE attrelid = 'public.resorts'::regclass AND attnum > 0
        AND NOT attisdropped AND attidentity = '' AND attgenerated = ''
        AND ((attname IN ('region_code', 'display_name') AND atttypid = 'text'::regtype)
          OR (attname = 'sort_order' AND atttypid = 'integer'::regtype))) <> 3 THEN
    RAISE EXCEPTION 'Existing classification columns have unexpected definitions';
  END IF;
END
$types$;

-- OMIT id: identity assigns IDs. WHERE NOT EXISTS avoids nextval on reruns.
-- New legacy region uses the supplied area label; region_code is authoritative.
-- is_active=true enables listing/posting, and is NOT a verified operating status.
INSERT INTO public.resorts
  (name, region, is_active, region_code, sort_order, display_name)
SELECT m.name, g.name, true, m.region_code, m.sort_order, m.display_name
FROM pg_temp._expected_resorts m
JOIN public.regions g ON g.code = m.region_code
WHERE NOT EXISTS (SELECT 1 FROM public.resorts r WHERE r.name = m.name)
ORDER BY g.sort_order, m.sort_order
ON CONFLICT (name) DO NOTHING;

-- Only the THREE NEW metadata columns may change on existing rows.
UPDATE public.resorts r
SET region_code = m.region_code,
    sort_order = m.sort_order,
    display_name = m.display_name
FROM pg_temp._expected_resorts m
WHERE r.name = m.name
  AND ROW(r.region_code, r.sort_order, r.display_name)
      IS DISTINCT FROM ROW(m.region_code, m.sort_order, m.display_name);

DO $verify_data$
BEGIN
  IF (SELECT count(*) FROM public.resorts) <> 59 OR EXISTS (
    SELECT 1 FROM pg_temp._expected_resorts m
    LEFT JOIN public.resorts r ON r.name = m.name
    WHERE r.id IS NULL
       OR ROW(r.region_code, r.sort_order, r.display_name)
          IS DISTINCT FROM ROW(m.region_code, m.sort_order, m.display_name)
  ) THEN
    RAISE EXCEPTION 'Seed mismatch';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_temp._resorts_before b
    LEFT JOIN public.resorts r ON r.id = b.id
    WHERE r.id IS NULL OR ROW(r.name, r.region, r.is_active)
      IS DISTINCT FROM ROW(b.name, b.region, b.is_active)
  ) THEN
    RAISE EXCEPTION 'Protected existing resort fields changed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_temp._posts_before b
    LEFT JOIN snownow_private.snow_posts p ON p.id = b.id
    WHERE p.id IS NULL OR to_jsonb(p) IS DISTINCT FROM b.row_data
  ) THEN
    RAISE EXCEPTION 'Existing post changed or disappeared';
  END IF;
END
$verify_data$;

ALTER TABLE public.resorts
  ALTER COLUMN region_code SET NOT NULL,
  ALTER COLUMN sort_order SET NOT NULL,
  ALTER COLUMN sort_order DROP DEFAULT,
  ALTER COLUMN display_name SET NOT NULL;

DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.resorts'::regclass
                   AND conname = 'resorts_region_code_fkey') THEN
    ALTER TABLE public.resorts ADD CONSTRAINT resorts_region_code_fkey
      FOREIGN KEY (region_code) REFERENCES public.regions(code)
      ON UPDATE RESTRICT ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.resorts'::regclass
                   AND conname = 'resorts_sort_order_positive') THEN
    ALTER TABLE public.resorts ADD CONSTRAINT resorts_sort_order_positive
      CHECK (sort_order > 0);
  END IF;
END
$constraints$;

CREATE UNIQUE INDEX IF NOT EXISTS resorts_region_sort_order_uidx
ON public.resorts (region_code, sort_order);

DO $index$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indexrelid = 'public.resorts_region_sort_order_uidx'::regclass
      AND i.indrelid = 'public.resorts'::regclass
      AND i.indisunique AND i.indisvalid AND i.indisready
      AND i.indpred IS NULL AND i.indexprs IS NULL
      AND i.indnatts = 2
      AND i.indkey[0] = (SELECT attnum FROM pg_attribute
                        WHERE attrelid = 'public.resorts'::regclass AND attname = 'region_code')
      AND i.indkey[1] = (SELECT attnum FROM pg_attribute
                        WHERE attrelid = 'public.resorts'::regclass AND attname = 'sort_order')
  ) THEN
    RAISE EXCEPTION 'Region/order unique index definition mismatch';
  END IF;
END
$index$;

-- Verify that an existing same-named FK is actually the intended FK.
DO $fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.resorts'::regclass
      AND c.conname = 'resorts_region_code_fkey' AND c.contype = 'f'
      AND c.confrelid = 'public.regions'::regclass AND c.convalidated
      AND c.confupdtype = 'r' AND c.confdeltype = 'r'
      AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute
                           WHERE attrelid = 'public.resorts'::regclass
                             AND attname = 'region_code')]
      AND c.confkey = ARRAY[(SELECT attnum FROM pg_attribute
                            WHERE attrelid = 'public.regions'::regclass
                              AND attname = 'code')]
  ) THEN
    RAISE EXCEPTION 'Region FK definition mismatch';
  END IF;
END
$fk$;

ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;

DO $policy$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policy
             WHERE polrelid IN ('public.regions'::regclass, 'public.resorts'::regclass)
               AND polcmd <> 'r') THEN
    RAISE EXCEPTION 'Unexpected master write/ALL RLS policy; review instead of overwriting';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy
                 WHERE polrelid = 'public.regions'::regclass
                   AND polname = 'regions_public_select') THEN
    CREATE POLICY regions_public_select ON public.regions
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END
$policy$;

DO $select_policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid = 'public.regions'::regclass
      AND p.polname = 'regions_public_select' AND p.polcmd = 'r' AND p.polpermissive
      AND pg_get_expr(p.polqual, p.polrelid) = 'true'
      AND p.polroles @> ARRAY[(SELECT oid FROM pg_roles WHERE rolname = 'anon'),
                             (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')]
  ) THEN
    RAISE EXCEPTION 'Region read policy differs from approved public read policy';
  END IF;
END
$select_policy$;

-- Table REVOKE alone does NOT remove column grants. Clean up BOTH scopes.
-- Do not touch snow_posts, its sequence, auth, or snownow_private grants.
DO $acl$
DECLARE
  target_table regclass;
  column_list text;
  identity_sequence text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'public.regions'::regclass, 'public.resorts'::regclass
  ] LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %s FROM PUBLIC, anon, authenticated',
                   target_table);
    SELECT string_agg(format('%I', attname), ', ' ORDER BY attnum)
    INTO column_list FROM pg_attribute
    WHERE attrelid = target_table AND attnum > 0 AND NOT attisdropped;
    EXECUTE format(
      'REVOKE INSERT (%1$s), UPDATE (%1$s), REFERENCES (%1$s) ON TABLE %2$s FROM PUBLIC, anon, authenticated',
      column_list, target_table);
    EXECUTE format('GRANT SELECT ON TABLE %s TO anon, authenticated', target_table);
  END LOOP;
  identity_sequence := pg_get_serial_sequence('public.resorts', 'id');
  IF identity_sequence IS NULL THEN
    RAISE EXCEPTION 'resorts identity sequence missing';
  END IF;
  EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM PUBLIC, anon, authenticated',
                 identity_sequence::regclass);
END
$acl$;

-- Check EFFECTIVE permissions too, including grants inherited from other roles.
DO $effective_acl$
DECLARE
  target_table regclass;
  app_role text;
  identity_sequence regclass := pg_get_serial_sequence('public.resorts', 'id')::regclass;
BEGIN
  FOREACH app_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role
               AND (rolsuper OR rolbypassrls)) THEN
      RAISE EXCEPTION 'Application role unexpectedly bypasses RLS';
    END IF;
    IF NOT has_schema_privilege(app_role, 'public', 'USAGE') THEN
      RAISE EXCEPTION 'Application role lacks public schema USAGE';
    END IF;
    FOREACH target_table IN ARRAY ARRAY[
      'public.regions'::regclass, 'public.resorts'::regclass
    ] LOOP
      IF NOT has_table_privilege(app_role, target_table, 'SELECT')
         OR has_table_privilege(app_role, target_table, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
         OR has_any_column_privilege(app_role, target_table, 'INSERT,UPDATE,REFERENCES')
         OR pg_has_role(app_role, (SELECT relowner FROM pg_class WHERE oid = target_table), 'USAGE') THEN
        RAISE EXCEPTION 'Effective master privileges are not read-only; inspect inherited grants';
      END IF;
    END LOOP;
    IF has_sequence_privilege(app_role, identity_sequence, 'USAGE,SELECT,UPDATE') THEN
      RAISE EXCEPTION 'Effective resorts sequence privilege remains';
    END IF;
  END LOOP;
END
$effective_acl$;

-- SQL Editor may display only the final result: return one JSON summary.
SELECT jsonb_build_object(
  'regions', (SELECT count(*) FROM public.regions),
  'resorts', (SELECT count(*) FROM public.resorts),
  'new_resorts', (SELECT count(*) FROM public.resorts r
                 WHERE NOT EXISTS (SELECT 1 FROM pg_temp._resorts_before b WHERE b.id = r.id)),
  'protected_existing_resorts', (SELECT count(*) FROM pg_temp._resorts_before),
  'protected_existing_posts', (SELECT count(*) FROM pg_temp._posts_before),
  'region_counts', (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.sort_order) FROM (
    SELECT g.code, g.name, g.sort_order, count(r.id) AS resort_count
    FROM public.regions g LEFT JOIN public.resorts r ON r.region_code = g.code
    GROUP BY g.code, g.name, g.sort_order
  ) x)
) AS verified_summary;

COMMIT;
-- On any error, STOP; ROLLBACK the failed transaction before retrying.
-- Identity sequence increments from attempted inserts are NOT rolled back.

