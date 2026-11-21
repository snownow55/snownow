#!/usr/bin/env python3
"""Network-disabled synthetic PostgreSQL clusters only. No DB URL accepted."""
import concurrent.futures
import csv
import hashlib
import json
import pathlib
import subprocess
import tempfile
import time

ROOT = pathlib.Path(__file__).resolve().parents[2]
BASE = 'snownow-step2-hosted-test'
OWNED = []
MIGRATION = ROOT/'supabase/migrations/20261115000100_beta_foundation.sql'
ACTOR = '11111111-1111-4111-8111-111111111111'
OTHER = '22222222-2222-4222-8222-222222222222'
PAYLOAD = dict(resort='オーンズ',area='山頂・上部',snow_type='パウダー',snowfall='ほぼ無し',roughness='きれい',crowd='普通',comment='synthetic test')


def cmd(*args, text=None, ok=True):
    result = subprocess.run(args, input=text, text=True, capture_output=True)
    if ok and result.returncode:
        raise RuntimeError(result.stderr[-2200:] or result.stdout[-1000:])
    return result


def sql(c, query, ok=True, role='postgres'):
    return cmd('docker','exec','-i',c,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U',role,'-d','postgres',text=query,ok=ok)


def check(c, expression):
    assert sql(c,'SELECT ('+expression+')::text;').stdout.strip()=='true', expression


def start(c):
    if cmd('docker','inspect',c,ok=False).returncode==0:
        raise RuntimeError('Test container name already exists; refusing to reuse it')
    cmd('docker','run','--name',c,'--network','none','--tmpfs','/var/lib/postgresql/data:rw,size=256m',
        '-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_USER=cluster_admin','-e','POSTGRES_DB=postgres','-d','postgres:17-alpine')
    OWNED.append(c)
    for _ in range(100):
        if cmd('docker','exec',c,'pg_isready','-h','127.0.0.1','-U','cluster_admin',ok=False).returncode==0:
            break
        time.sleep(.2)
    else:
        raise RuntimeError('Isolated database did not become ready')


def stop(c):
    cmd('docker','rm','-f','-v',c)
    OWNED.remove(c)


ROLES = '''
CREATE ROLE postgres LOGIN NOSUPERUSER CREATEDB CREATEROLE BYPASSRLS;
CREATE ROLE supabase_admin NOLOGIN;
CREATE ROLE supabase_auth_admin NOLOGIN;
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
ALTER DATABASE postgres OWNER TO postgres;
'''
AUTH = '''
CREATE SCHEMA auth AUTHORIZATION supabase_admin;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,is_anonymous boolean);
ALTER TABLE auth.users OWNER TO supabase_auth_admin;
ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.users FORCE ROW LEVEL SECURITY;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
ALTER FUNCTION auth.uid() OWNER TO supabase_auth_admin;
GRANT USAGE ON SCHEMA auth TO postgres,anon,authenticated,supabase_auth_admin;
GRANT SELECT ON auth.users TO postgres;
GRANT REFERENCES(id) ON auth.users TO postgres;
'''
USERS = f'''INSERT INTO auth.users VALUES
('{ACTOR}','a@example.invalid',now(),false),
('{OTHER}','b@example.invalid',now(),false);'''
EXTRA_USERS = '''INSERT INTO auth.users VALUES
('33333333-3333-4333-8333-333333333333','c@example.invalid',NULL,false),
('44444444-4444-4444-8444-444444444444',NULL,now(),true);'''


def bootstrap(c, with_auth=True):
    sql(c,ROLES+(AUTH if with_auth else ''),role='cluster_admin')
    if with_auth:
        sql(c,'''CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY);
-- Reproduce SQL D's schema-specific owner entry, in addition to global defaults.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO postgres;
-- These are outside the migration's application scope and must stay intact.
-- Representative automatic-RLS behavior, NOT the unprovided live function body.
CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE command record; BEGIN
 FOR command IN SELECT * FROM pg_catalog.pg_event_trigger_ddl_commands() LOOP
  IF command.object_type='table' AND command.schema_name='public' THEN
   EXECUTE pg_catalog.format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY',command.object_identity);
  END IF;
 END LOOP;
END $$;
CREATE FUNCTION public.unrelated_read() RETURNS int LANGUAGE sql AS $$ SELECT 7 $$;
CREATE SEQUENCE public.integration_counter;
GRANT USAGE ON SEQUENCE public.integration_counter TO anon,authenticated;
''')
        # Only the synthetic cluster provisioner creates the event trigger.
        # The application migration still runs as non-superuser postgres.
        sql(c,"CREATE EVENT TRIGGER synthetic_auto_rls ON ddl_command_end WHEN TAG IN ('CREATE TABLE') EXECUTE FUNCTION public.rls_auto_enable();",role='cluster_admin')
    check(c,"NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user)")
    if with_auth:
        check(c,"(SELECT pg_get_userbyid(nspowner)='supabase_admin' FROM pg_namespace WHERE nspname='auth')")
        check(c,"NOT pg_has_role('postgres','supabase_admin','MEMBER') AND NOT pg_has_role('postgres','supabase_auth_admin','MEMBER')")


def setup(c, profile):
    if profile=='development':
        sql(c,USERS,role='cluster_admin')
        sql(c,'''CREATE SCHEMA snownow_private;
CREATE TABLE public.regions(code text PRIMARY KEY,name text NOT NULL UNIQUE,sort_order smallint NOT NULL UNIQUE CHECK(sort_order>0));
CREATE TABLE public.resorts(id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,name text NOT NULL UNIQUE,display_name text NOT NULL,
region_code text NOT NULL REFERENCES public.regions(code),sort_order integer NOT NULL CHECK(sort_order>0),region text NOT NULL,is_active bool NOT NULL DEFAULT true);
CREATE UNIQUE INDEX resorts_region_sort_order_uidx ON public.resorts(region_code,sort_order);
CREATE TABLE snownow_private.snow_posts(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id uuid DEFAULT auth.uid(),resort text,area text,snow_type text,snowfall text,roughness text,crowd text,comment text,created_at timestamptz,condition text);
CREATE INDEX legacy_posts_latest ON snownow_private.snow_posts(resort,created_at DESC,id DESC);
CREATE FUNCTION snownow_private.email_verified() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL AND NOT is_anonymous) $$;
REVOKE ALL ON FUNCTION snownow_private.email_verified() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION snownow_private.email_verified() TO authenticated;
CREATE VIEW public.snow_posts WITH(security_invoker=true) AS SELECT * FROM snownow_private.snow_posts;
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE snownow_private.snow_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY old_regions ON public.regions FOR SELECT TO anon,authenticated USING(true);
CREATE POLICY old_resorts ON public.resorts FOR SELECT TO anon,authenticated USING(true);
CREATE POLICY old_read ON snownow_private.snow_posts FOR SELECT TO anon,authenticated USING(true);
CREATE POLICY old_insert ON snownow_private.snow_posts FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND snownow_private.email_verified());
GRANT USAGE ON SCHEMA snownow_private TO anon,authenticated;
GRANT SELECT ON public.regions,public.resorts TO anon,authenticated;
GRANT ALL ON public.snow_posts,snownow_private.snow_posts TO anon,authenticated;
GRANT INSERT(user_id),UPDATE(comment) ON snownow_private.snow_posts TO authenticated;
''')
        manifest=json.loads((ROOT/'data/resort-master.json').read_text())
        for g in manifest['regions']:
            sql(c,f"INSERT INTO public.regions VALUES('{g['code']}','{g['name']}',{g['sort_order']});")
        rows=list(csv.DictReader((ROOT/'docs/resort-master-review/59-resorts-review.csv').open()))
        rows.sort(key=lambda r:int(r['preserved_id']) if r['preserved_id']!='AUTO' else 100)
        for r in rows:
            name=r['name'].replace("'","''")
            display=r['display_name'].replace("'","''")
            sql(c,f"INSERT INTO public.resorts(name,display_name,region_code,sort_order,region) VALUES('{name}','{display}','{r['region_code']}',{r['sort_order']},'legacy');")
        sql(c,f'''INSERT INTO snownow_private.snow_posts(user_id,resort,area,snow_type,snowfall,roughness,crowd,comment,created_at,condition)
SELECT '{ACTOR}','オーンズ','全体',CASE WHEN i=1 THEN '湿雪' ELSE '圧雪' END,'ほぼ無し','きれい','普通','synthetic legacy',now()-interval '2 hours','★★★★★' FROM generate_series(1,16)i;''')
    elif profile=='production':
        sql(c,'''CREATE TABLE public.snow_posts(id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,resort text,condition text,snow_type text,comment text);
ALTER TABLE public.snow_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY old_select ON public.snow_posts FOR SELECT USING(true);
GRANT SELECT ON public.snow_posts TO anon,authenticated;
INSERT INTO public.snow_posts(resort,condition,snow_type,comment) SELECT 'legacy','★★★★★','湿雪','synthetic preservation' FROM generate_series(1,4);''')


def snapshot(c):
    schema=cmd('docker','exec',c,'pg_dump','-U','postgres','-s','postgres').stdout
    # pg_dump randomizes its \restrict token. Schema and ACL content must match.
    schema='\n'.join(line for line in schema.splitlines() if not line.startswith(('\\restrict','\\unrestrict')))
    queries=[]
    rels=sql(c,"SELECT format('%I.%I',n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname IN ('public','snownow_private','auth','supabase_migrations') ORDER BY 1;").stdout.splitlines()
    for rel in rels:
        queries.append(sql(c,f"SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM {rel} t;").stdout)
    # Sequence counters can advance on a rollback; existing row IDs must not change.
    return hashlib.sha256((schema+'\n'+''.join(queries)).encode()).hexdigest()



def sequence_state(c):
    sequences=sql(c,"SELECT format('%I.%I',n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='S' AND n.nspname IN ('public','snownow_private') ORDER BY 1;").stdout.splitlines()
    return {name:sql(c,f"SELECT last_value,is_called FROM {name};").stdout for name in sequences}


def management_state(c):
    # Definitions are hashed, never emitted. ACLs include effective PUBLIC EXECUTE.
    query="""SELECT jsonb_build_object(
      'defaults',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.oid),'[]') FROM pg_default_acl d),
      'manager',(SELECT jsonb_build_object('definition',md5(pg_get_functiondef(p.oid)),
          'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'settings',p.proconfig,
          'acl',coalesce(p.proacl,acldefault('f',p.proowner)))
          FROM pg_proc p WHERE p.oid='public.rls_auto_enable()'::regprocedure),
      'triggers',(SELECT jsonb_agg(jsonb_build_object('name',evtname,'event',evtevent,
          'enabled',evtenabled,'tags',evttags,'owner',pg_get_userbyid(evtowner)) ORDER BY evtname)
          FROM pg_event_trigger));"""
    return sql(c,query).stdout


def verify_function_acl(c):
    functions=['snownow_private.current_user_id()','snownow_private.posting_user_verified()',
               'snownow_private.utf16_length(text)','public.posting_status()',
               'public.submit_snow_post(jsonb)']
    for function in functions:
        check(c,f"NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='{function}'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE')")
    for function in functions[:2]:
        check(c,f"(SELECT pg_get_userbyid(proowner)='postgres' AND prosecdef AND proconfig=ARRAY['search_path=\"\"'] FROM pg_proc WHERE oid='{function}'::regprocedure)")
    for function in functions[3:]:
        check(c,f"(SELECT pg_get_userbyid(proowner)='snownow_post_writer' AND prosecdef AND proconfig=ARRAY['search_path=\"\"'] FROM pg_proc WHERE oid='{function}'::regprocedure)")
        check(c,f"has_function_privilege('authenticated','{function}','EXECUTE') AND NOT has_function_privilege('anon','{function}','EXECUTE')")
    # Future unrelated functions retain SQL D's global PUBLIC default in both
    # schemas. This does not grant access to the explicitly closed app helpers.
    sql(c,"""BEGIN;
      CREATE FUNCTION public.default_acl_probe() RETURNS int LANGUAGE sql AS 'SELECT 1';
      CREATE FUNCTION snownow_private.default_acl_probe() RETURNS int LANGUAGE sql AS 'SELECT 1';
      DO $$ BEGIN
       IF (SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
           WHERE p.oid IN ('public.default_acl_probe()'::regprocedure,'snownow_private.default_acl_probe()'::regprocedure)
           AND a.grantee=0 AND a.privilege_type='EXECUTE')<>2 THEN
        RAISE EXCEPTION 'Unrelated global function defaults were changed';
       END IF;
      END $$;
      ROLLBACK;""")


def apply(c, text=None, ok=True):
    migration=MIGRATION.read_text() if text is None else text
    return sql(c,"BEGIN;\n"+migration+"\nINSERT INTO supabase_migrations.schema_migrations VALUES('20261115000100');\nCOMMIT;",ok=ok)


def rpc(c, payload=None, actor=ACTOR, role='authenticated', rollback=False, ok=True):
    name='posting_status' if payload is None else 'submit_snow_post'
    arg='' if payload is None else "'"+json.dumps(payload,ensure_ascii=False).replace("'","''")+"'::jsonb"
    return sql(c,f"BEGIN; SELECT set_config('request.jwt.claim.sub','{actor}',true); SET LOCAL ROLE {role}; SELECT public.{name}({arg}); "+('ROLLBACK;' if rollback else 'COMMIT;'),ok=ok,role='cluster_admin')


def verify(c, profile, original_ids):
    verify_function_acl(c)
    check(c,"(SELECT count(*) FROM public.resorts WHERE is_active)=63")
    check(c,"(SELECT count(*) FROM public.regions)=9")
    actual=json.loads(sql(c,"SELECT jsonb_agg(jsonb_build_object('name',name,'display_name',display_name,'region_code',region_code,'sort_order',sort_order) ORDER BY name) FROM public.resorts WHERE is_active;").stdout)
    expected=json.loads((ROOT/'data/resort-master.json').read_text())['resorts']
    assert sorted(actual,key=lambda r:r['name'])==sorted(expected,key=lambda r:r['name'])
    if profile=='development':
        check(c,"(SELECT count(*) FROM public.snow_posts)=16")
        check(c,"(SELECT count(*) FROM public.snow_posts WHERE snow_type='湿雪')=1")
        check(c,"(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM snownow_private.snow_posts p)=(SELECT jsonb_agg(to_jsonb(p)-'condition' ORDER BY id) FROM snownow_private.legacy_authenticated_snow_posts p)")
        for name, ident in original_ids.items():
            check(c,f"(SELECT id FROM public.resorts WHERE name='{name.replace(chr(39),chr(39)*2)}')={ident}")
    else:
        check(c,"(SELECT count(*) FROM public.snow_posts)=0")
        check(c,"(SELECT count(*) FROM auth.users)=0")
        sql(c,USERS,role='cluster_admin')
    sql(c,EXTRA_USERS,role='cluster_admin')
    # Reproduce the reviewed failure: EXECUTE alone does not permit auth access.
    check(c,"NOT has_schema_privilege('snownow_post_writer','auth','USAGE')")
    check(c,"NOT has_schema_privilege('postgres','auth','USAGE WITH GRANT OPTION')")
    direct=sql(c,"SET ROLE snownow_post_writer; SELECT auth.uid();",ok=False)
    assert direct.returncode!=0 and 'permission denied for schema auth' in direct.stderr
    for role in ['anon','authenticated']:
        check(c,f"NOT has_table_privilege('{role}','snownow_private.snow_posts','INSERT,UPDATE,DELETE,TRUNCATE')")
        check(c,f"NOT has_any_column_privilege('{role}','snownow_private.snow_posts','INSERT,UPDATE')")
        for query in ["SELECT user_id FROM snownow_private.snow_posts","SELECT * FROM snownow_private.post_limits","TRUNCATE snownow_private.snow_posts","UPDATE snownow_private.snow_posts SET comment='tamper'","DELETE FROM snownow_private.snow_posts","INSERT INTO public.snow_posts(resort) VALUES('オーンズ')"]:
            assert sql(c,f'SET ROLE {role}; '+query,ok=False,role='cluster_admin').returncode!=0
        assert sql(c,f'SET ROLE {role}; SELECT * FROM public.snow_posts;',role='cluster_admin').returncode==0
        for f in ['snownow_private.current_user_id()','snownow_private.posting_user_verified()','snownow_private.utf16_length(text)']:
            check(c,f"NOT has_function_privilege('{role}','{f}','EXECUTE')")
    check(c,"(SELECT proacl IS NULL FROM pg_proc WHERE oid='public.rls_auto_enable()'::regprocedure)")
    check(c,"has_function_privilege('authenticated','public.unrelated_read()','EXECUTE')")
    check(c,"has_sequence_privilege('authenticated','public.integration_counter','USAGE')")
    check(c,"NOT (SELECT rolcanlogin OR rolbypassrls OR rolsuper FROM pg_roles WHERE rolname='snownow_post_writer')")
    check(c,"NOT pg_has_role('authenticated','snownow_post_writer','MEMBER')")
    check(c,"(SELECT pg_get_userbyid(proowner)='postgres' AND prosecdef AND proconfig=ARRAY['search_path=\"\"'] FROM pg_proc WHERE oid='snownow_private.current_user_id()'::regprocedure)")
    for actor in ['', '33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444']:
        assert rpc(c,PAYLOAD,actor=actor,ok=False).returncode!=0
    assert rpc(c,PAYLOAD,role='anon',ok=False).returncode!=0
    for bad in [dict(PAYLOAD,user_id=OTHER),dict(PAYLOAD,condition=None),dict(PAYLOAD,snow_type='湿雪'),dict(PAYLOAD,resort='unknown'),dict(PAYLOAD,resort='士別あさひスキー場'),dict(PAYLOAD,comment='😀'*501),dict(PAYLOAD,area=None)]:
        assert rpc(c,bad,ok=False).returncode!=0
    before=sql(c,'SELECT count(*) FROM public.snow_posts;').stdout
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        results=list(ex.map(lambda i:rpc(c,dict(PAYLOAD,resort='オーンズ' if i%2 else 'キロロ')).stdout,range(8)))
    assert sum('"allowed": true' in r for r in results)==1
    check(c,f'(SELECT count(*) FROM public.snow_posts)={int(before)+1}')
    assert '"allowed": false' in rpc(c,PAYLOAD).stdout
    assert '"allowed": true' in rpc(c,PAYLOAD,actor=OTHER).stdout
    sql(c,f"UPDATE snownow_private.post_limits SET last_success_at=clock_timestamp()-interval '59 minutes' WHERE user_id='{ACTOR}';")
    assert '"allowed": false' in rpc(c,PAYLOAD).stdout
    sql(c,f"UPDATE snownow_private.post_limits SET last_success_at=clock_timestamp()-interval '60 minutes' WHERE user_id='{ACTOR}';")
    assert '"allowed": true' in rpc(c,PAYLOAD).stdout
    sql(c,f"DELETE FROM snownow_private.post_limits WHERE user_id='{OTHER}';")
    assert rpc(c,dict(PAYLOAD,comment='x'*1001),actor=OTHER,ok=False).returncode!=0
    before=sql(c,'SELECT count(*) FROM public.snow_posts;').stdout
    assert '"allowed": true' in rpc(c,PAYLOAD,actor=OTHER,rollback=True).stdout
    assert sql(c,'SELECT count(*) FROM public.snow_posts;').stdout==before
    assert '"allowed": true' in rpc(c,PAYLOAD,actor=OTHER).stdout


try:
 for profile in ['fresh','production','development']:
    source=BASE+'-'+profile
    start(source)
    bootstrap(source)
    setup(source,profile)
    old=snapshot(source)
    management=management_state(source)
    if profile=='development':
        # Two app-owned identity sequences, plus the unrelated ACL canary.
        check(source,"(SELECT count(*) FROM pg_class c JOIN pg_depend d ON d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype IN ('a','i') WHERE c.relkind='S' AND d.refobjid IN ('public.resorts'::regclass,'snownow_private.snow_posts'::regclass))=2")
    original_ids=json.loads(sql(source,"SELECT coalesce(json_object_agg(name,id),'{}'::json) FROM public.resorts;").stdout) if profile=='development' else {}
    legacy=sql(source,"SELECT md5(jsonb_agg(to_jsonb(p) ORDER BY id)::text) FROM public.snow_posts p;").stdout if profile=='production' else None
    # Both early structural failure and failure after all ACL changes must roll back.
    text=MIGRATION.read_text()
    marker='CREATE FUNCTION snownow_private.utf16_length'
    for broken in [text.replace(marker,'SELECT 1/0;\n'+marker,1),text+'\nSELECT 1/0;']:
        failed=apply(source,broken,ok=False)
        assert failed.returncode!=0 and 'division by zero' in failed.stderr, failed.stderr
        assert snapshot(source)==old, 'Failed migration changed existing schema/data/ACL'
        assert management_state(source)==management, 'Failed migration changed management/default ACLs'
        check(source,"NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='snownow_post_writer')")
    if profile=='development':
        # Unknown inherited permissions must abort, not pass after direct REVOKE.
        # All synthetic role/default-ACL changes live inside the failed transaction.
        inherited_cases=[
            ("GRANT INSERT ON public.regions TO synthetic_inherited_access;",'Inherited public write'),
            ("ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA snownow_private GRANT EXECUTE ON FUNCTIONS TO synthetic_inherited_access;",'Private helper access'),
        ]
        for permission, error in inherited_cases:
            prefix="CREATE ROLE synthetic_inherited_access NOLOGIN; GRANT synthetic_inherited_access TO authenticated; "+permission
            failed=apply(source,prefix+'\n'+text,ok=False)
            assert failed.returncode!=0 and error in failed.stderr, failed.stderr
            assert snapshot(source)==old, 'Rejected inherited ACL changed original schema/data'
            assert management_state(source)==management, 'Rejected inherited ACL changed defaults/manager'
            check(source,"NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('synthetic_inherited_access','snownow_post_writer'))")
    apply(source)
    assert management_state(source)==management, 'Migration changed manager/default ACLs or event trigger'
    # The representative event trigger actually ran, rather than existing only
    # as inert metadata. Roll back the probe table immediately.
    sql(source,"""BEGIN; CREATE TABLE public.auto_rls_probe(id int);
      DO $$ BEGIN IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.auto_rls_probe'::regclass)
      THEN RAISE EXCEPTION 'Automatic RLS event trigger stopped working'; END IF; END $$; ROLLBACK;""")
    if legacy is not None:
        assert sql(source,"SELECT md5(jsonb_agg(to_jsonb(p) ORDER BY id)::text) FROM snownow_private.legacy_public_snow_posts p;").stdout==legacy
        check(source,"NOT has_any_column_privilege('authenticated','snownow_private.legacy_public_snow_posts','SELECT')")
    verify(source,profile,original_ids)
    print(profile+': PASS non-superuser migration, rollback preservation, RPC/ACL, 8 concurrent requests, hourly limit',flush=True)
    # A distinct cluster with separately provisioned roles, not CREATE DATABASE.
    destination=BASE+'-'+profile+'-restore'
    start(destination)
    bootstrap(destination,with_auth=False)
    sql(destination,"CREATE ROLE snownow_post_writer NOLOGIN NOINHERIT NOBYPASSRLS; GRANT snownow_post_writer TO postgres WITH SET TRUE, INHERIT FALSE;",role='cluster_admin')
    with tempfile.TemporaryDirectory(prefix='snownow-step2-backup-') as folder:
        archive=str(pathlib.Path(folder)/'synthetic.dump')
        cmd('docker','exec',source,'pg_dump','-U','postgres','-Fc','-f','/tmp/synthetic.dump','postgres')
        cmd('docker','cp',source+':/tmp/synthetic.dump',archive)
        cmd('docker','cp',archive,destination+':/tmp/synthetic.dump')
        # Only synthetic cluster provisioning admin restores managed Auth ownership.
        cmd('docker','exec',destination,'pg_restore','-U','cluster_admin','-d','postgres','--exit-on-error','/tmp/synthetic.dump')
    assert snapshot(source)==snapshot(destination), 'Cross-cluster restore differs in schema/data/ACL'
    assert sequence_state(source)==sequence_state(destination), 'Restored sequence counters differ'
    check(destination,"NOT has_schema_privilege('snownow_post_writer','auth','USAGE')")
    assert '"allowed": false' in rpc(destination).stdout
    sql(destination,f"UPDATE snownow_private.post_limits SET last_success_at=clock_timestamp()-interval '60 minutes' WHERE user_id='{OTHER}';")
    assert '"allowed": true' in rpc(destination,PAYLOAD,actor=OTHER).stdout
    print(profile+': PASS separate-cluster pg_dump/pg_restore, owners/ACL/data, restored RPC',flush=True)
    if profile=='development':
        for migration in sorted(MIGRATION.parent.glob('*.sql')):
            if migration.name > MIGRATION.name:
                apply(source,migration.read_text(encoding='utf-8'))
        sql(source,(ROOT/'supabase/tests/official-collection.sql').read_text(encoding='utf-8'),role='cluster_admin')
        print(profile+': PASS official collection RPC, deduplication, failure safety and publication revocation',flush=True)
    stop(destination)
    stop(source)
 print('PASS: synthetic managed Auth schema; no real Supabase Auth/PostgREST/mail or existing DB access',flush=True)
finally:
 for container in list(OWNED):
    cmd('docker','rm','-f','-v',container,ok=False)
