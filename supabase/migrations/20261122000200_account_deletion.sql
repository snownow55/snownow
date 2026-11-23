-- Preparation only: apply to the reviewed development project first.
-- Run inside the migration runner's transaction. Dashboard execution requires
-- a BEGIN/COMMIT wrapper and migration-history registration in that same transaction.
-- Reviewed legacy table, when present, is included only for its user_id -> auth.users FK.
-- The legacy resort FK is checked and left untouched. No archive rows are deleted now.
-- Changing these FKs does NOT delete users or posts. Future Auth hard deletion
-- (including Dashboard/Admin API deletion) will cascade to the user's data.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $migration$
DECLARE target regclass; relation regclass; constraints integer; fk record;
  legacy regclass; resort_fk_before text; resort_fk_after text;
  reviewed regclass[] := ARRAY['snownow_private.snow_posts'::regclass,
    'snownow_private.post_limits'::regclass,'public.user_region_preferences'::regclass];
BEGIN
  target := to_regclass('auth.users');
  IF target IS NULL THEN RAISE EXCEPTION 'ACCOUNT_DELETION_AUTH_TABLE_MISSING'; END IF;
  legacy := to_regclass('snownow_private.legacy_authenticated_snow_posts');
  IF legacy IS NOT NULL THEN
    reviewed := array_append(reviewed,legacy);
    SELECT count(*) INTO constraints FROM pg_constraint
      WHERE contype='f' AND conrelid=legacy AND confrelid<>target;
    IF constraints<>1 THEN RAISE EXCEPTION 'ACCOUNT_DELETION_UNREVIEWED_LEGACY_FK'; END IF;
    SELECT pg_get_constraintdef(c.oid) INTO resort_fk_before
    FROM pg_constraint c WHERE c.contype='f' AND c.conrelid=legacy
      AND c.conname='snow_posts_resort_fkey' AND c.confrelid='public.resorts'::regclass
      AND c.confupdtype='c' AND c.confdeltype='r' AND c.convalidated
      AND c.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=legacy AND attname='resort' AND NOT attisdropped)]::smallint[]
      AND c.confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.resorts'::regclass AND attname='name' AND NOT attisdropped)]::smallint[];
    IF resort_fk_before IS NULL THEN RAISE EXCEPTION 'ACCOUNT_DELETION_LEGACY_RESORT_FK_MISMATCH'; END IF;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgenabled<>'D'
      AND (tgrelid=target OR tgrelid=ANY(reviewed))
  ) THEN RAISE EXCEPTION 'ACCOUNT_DELETION_UNREVIEWED_TRIGGER'; END IF;
  -- Stop on unknown dependencies.
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE c.contype='f' AND c.confrelid=target AND n.nspname NOT IN ('auth','storage')
      AND NOT (c.conrelid=ANY(reviewed))
  ) THEN RAISE EXCEPTION 'ACCOUNT_DELETION_UNREVIEWED_REFERENCE'; END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE contype='f' AND confrelid=ANY(reviewed)) THEN
    RAISE EXCEPTION 'ACCOUNT_DELETION_UNREVIEWED_CHILD_REFERENCE'; END IF;
  FOREACH relation IN ARRAY reviewed LOOP
    SELECT count(*) INTO constraints FROM pg_constraint c
    WHERE c.conrelid=relation AND c.confrelid=target AND c.contype='f';
    IF constraints<>1 THEN RAISE EXCEPTION 'ACCOUNT_DELETION_UNEXPECTED_FK_COUNT'; END IF;
    SELECT c.* INTO fk FROM pg_constraint c
    WHERE c.conrelid=relation AND c.confrelid=target AND c.contype='f';
    IF fk.conkey IS DISTINCT FROM ARRAY[(SELECT attnum FROM pg_attribute
        WHERE attrelid=relation AND attname='user_id' AND NOT attisdropped)]::smallint[]
      OR fk.confkey IS DISTINCT FROM ARRAY[(SELECT attnum FROM pg_attribute
        WHERE attrelid=target AND attname='id' AND NOT attisdropped)]::smallint[]
      OR NOT fk.convalidated OR fk.condeferrable OR fk.confupdtype<>'a'
      OR fk.confmatchtype<>'s' OR fk.confdeltype NOT IN ('a','r','c') THEN
      RAISE EXCEPTION 'ACCOUNT_DELETION_UNEXPECTED_FK_SHAPE';
    END IF;
    IF fk.confdeltype<>'c' THEN
      EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',relation,fk.conname);
      EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE',relation,fk.conname);
    END IF;
  END LOOP;
  IF legacy IS NOT NULL THEN
    SELECT pg_get_constraintdef(oid) INTO resort_fk_after FROM pg_constraint
      WHERE conrelid=legacy AND conname='snow_posts_resort_fkey' AND contype='f';
    IF resort_fk_after IS DISTINCT FROM resort_fk_before THEN
      RAISE EXCEPTION 'ACCOUNT_DELETION_RESORT_FK_CHANGED'; END IF;
  END IF;
END;
$migration$;
