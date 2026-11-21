#!/usr/bin/env python3
"""Additional recovery rehearsal only. Creates a fresh local Unix-socket cluster; no remote URL accepted.
Do not point --work-parent at an existing DB. Output contains synthetic records only.
Requires PostgreSQL 17 clients/server and a local OS account allowed to run initdb.
"""
import argparse,ast,pathlib,subprocess,os,uuid,json
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--pg-bin',required=True);p.add_argument('--pg-share',required=True);p.add_argument('--work-parent',required=True)
args=p.parse_args();repo=Path(__file__).resolve().parents[2];bin=Path(args.pg_bin).resolve();root=Path(args.work_parent).resolve()
out=root/('step2-app-recovery-'+uuid.uuid4().hex[:8]);out.mkdir(mode=0o700);data=out/'data';sock=out/'socket';sock.mkdir(mode=0o700);env=dict(os.environ)
def run(name,*args,text=None,ok=True):
 r=subprocess.run([str(bin/name),*args],input=text,capture_output=True,text=True,env=env)
 if ok and r.returncode:raise RuntimeError(name+': '+r.stderr[-1600:])
 return r
run('initdb','-D',str(data),'-L',str(pathlib.Path(args.pg_share).resolve()),'-U','cluster_admin','--locale=C','--encoding=UTF8','--auth=trust')
run('pg_ctl','-D',str(data),'-l',str(out/'postgres.log'),'-o',"-k "+str(sock)+" -h '' -c listen_addresses='' -c unix_socket_permissions=0700 -c shared_buffers=16MB",'-w','start')
def sql(q,role='postgres',ok=True):return run('psql','-X','-qAt','-h',str(sock),'-U',role,'-d','postgres','-v','ON_ERROR_STOP=1',text=q,ok=ok)
# Load definitions only; never execute the old 84-test entry point.
source=(repo/'supabase/tests/run-isolated.py').read_text();scope={}; tree=ast.parse(source); selected=[n for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in ('ACTOR','OTHER','ROLES','AUTH','USERS') for t in n.targets)]; exec(compile(ast.Module(body=selected,type_ignores=[]),'<fixture constants>','exec'),scope)
# Definitions of constants are available without calling Docker or previous tests.
sql(scope['ROLES']+scope['AUTH'],role='cluster_admin');sql(scope['USERS'],role='cluster_admin')
sql("CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger LANGUAGE plpgsql AS $$ BEGIN NULL; END $$; CREATE SEQUENCE public.integration_counter; GRANT USAGE ON SEQUENCE public.integration_counter TO anon,authenticated;")
sql("CREATE EVENT TRIGGER synthetic_management ON ddl_command_end WHEN TAG IN ('CREATE TABLE') EXECUTE FUNCTION public.rls_auto_enable();",role='cluster_admin')
sql((repo/'supabase/tests/fixtures/step2-recovery.sql').read_text())
sql((repo/'supabase/audit/step2-preapply-readonly.sql').read_text())
sql((repo/'supabase/audit/step2-backup-delta-readonly.sql').read_text())
sql((repo/'supabase/recovery/freeze-writes.sql').read_text())
for role in ['anon','authenticated','service_role']:
 assert sql("SELECT has_table_privilege('"+role+"','snownow_private.snow_posts','INSERT,UPDATE,DELETE,TRUNCATE') OR has_any_column_privilege('"+role+"','snownow_private.snow_posts','INSERT,UPDATE');").stdout.strip()=='f'
run('pg_dump','-h',str(sock),'-U','postgres','-d','postgres','-Fc','-f',str(out/'synthetic.dump'))
toc=run('pg_restore','--list',str(out/'synthetic.dump')).stdout;(out/'synthetic.toc').write_text(toc)
def snapshot():
 return sql("SELECT md5(jsonb_agg(x ORDER BY x::text)::text) FROM (SELECT to_jsonb(t) x FROM public.regions t UNION ALL SELECT to_jsonb(t) FROM public.resorts t UNION ALL SELECT to_jsonb(t) FROM snownow_private.snow_posts t)s;").stdout.strip()
old_post_hash=sql("SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM snownow_private.snow_posts t;").stdout
catalog_query="SELECT md5(jsonb_agg(x ORDER BY x::text)::text) FROM (SELECT jsonb_build_array(n.nspname,c.relname,a.attname,a.atttypid::regtype::text,a.attnotnull,a.attidentity) x FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE a.attnum>0 AND NOT a.attisdropped AND ((n.nspname='public' AND c.relname IN('regions','resorts','snow_posts')) OR (n.nspname='snownow_private' AND c.relname='snow_posts')))s;"
old_catalog=sql(catalog_query).stdout
old_function=sql("SELECT md5(pg_get_functiondef('snownow_private.email_verified()'::regprocedure));").stdout
old_sequences=sql("SELECT last_value,is_called FROM public.resorts_id_seq UNION ALL SELECT last_value,is_called FROM snownow_private.snow_posts_id_seq;").stdout
before=snapshot();outside=sql("SELECT md5(pg_get_functiondef('public.rls_auto_enable()'::regprocedure)),md5(pg_get_functiondef('auth.uid()'::regprocedure)),(SELECT count(*) FROM auth.users),(SELECT count(*) FROM pg_event_trigger),has_sequence_privilege('anon','public.integration_counter','USAGE');").stdout
import re
builder=repo/'scripts/Build-Step2AppRecovery.py'
# Apply exactly the source-reviewed allowlist to synthetic TOC. Real TOC requires separate human review.
patterns=__import__('ast').literal_eval(re.search(r'patterns=(\[[\s\S]*?\])\ndef entries',builder.read_text())[1])
lines=[l for l in (out/'synthetic.toc').read_text().splitlines() if re.match(r'^\d+;',l) and any(re.fullmatch(p,re.sub(r'^\d+;\s+\d+\s+\d+\s+','',l)) for p in patterns)]
approved=out/'approved.list';approved.write_text('\n'.join(lines)+'\n')
r=subprocess.run(['python',str(builder),'--pg-restore',str(bin/'pg_restore'),'--dump',str(out/'synthetic.dump'),'--approved-list',str(approved),'--output',str(out/'private-recovery')],capture_output=True,text=True,env=env);assert r.returncode==0,r.stderr
sql('BEGIN;\n'+(repo/'supabase/migrations/20261115000100_beta_foundation.sql').read_text()+'\nCOMMIT;')
limits_hash=sql("SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY user_id)::text) FROM snownow_private.post_limits t;").stdout
# A new post and cooldown prove post-apply data survive quarantine.
sql("INSERT INTO snownow_private.snow_posts(user_id,resort,area,snow_type,snowfall,roughness,crowd,comment) VALUES('11111111-1111-4111-8111-111111111111','オーンズ','全体','圧雪','ほぼ無し','きれい','普通','synthetic new');")
newhash=sql("SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM snownow_private.snow_posts t;").stdout
restore=(out/'private-recovery/dev-app-recovery.sql').read_text();pre=(repo/'supabase/recovery/before-quarantine.sql').read_text();post=(repo/'supabase/recovery/after-lockdown.sql').read_text()
# Inject failure after rebuilding tables; the enclosing transaction must preserve post-apply state.
failed=sql('BEGIN;\n'+pre+'\n'+restore+"\nSELECT 1/0;\n"+post+'\nCOMMIT;',ok=False);assert failed.returncode!=0 and 'division by zero' in failed.stderr,failed.stderr
assert sql("SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM snownow_private.snow_posts t;").stdout==newhash
assert sql("SELECT to_regnamespace('snownow_step2_quarantine') IS NULL;").stdout.strip()=='t'
sql('BEGIN;\n'+pre+'\n'+restore+'\n'+post+'\nCOMMIT;')
assert snapshot()==before
assert sql(catalog_query).stdout==old_catalog
assert sql("SELECT md5(pg_get_functiondef('snownow_private.email_verified()'::regprocedure));").stdout==old_function
assert sql("SELECT last_value,is_called FROM public.resorts_id_seq UNION ALL SELECT last_value,is_called FROM snownow_private.snow_posts_id_seq;").stdout==old_sequences
assert sql("SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM snownow_step2_quarantine.legacy_authenticated_snow_posts t;").stdout==old_post_hash
assert sql("SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY user_id)::text) FROM snownow_step2_quarantine.post_limits t;").stdout==limits_hash
assert sql("SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM snownow_step2_quarantine.snow_posts t;").stdout==newhash
assert outside==sql("SELECT md5(pg_get_functiondef('public.rls_auto_enable()'::regprocedure)),md5(pg_get_functiondef('auth.uid()'::regprocedure)),(SELECT count(*) FROM auth.users),(SELECT count(*) FROM pg_event_trigger),has_sequence_privilege('anon','public.integration_counter','USAGE');").stdout
for role in ['anon','authenticated','service_role','snownow_post_writer']:
 for obj in ['public.regions','public.resorts','public.snow_posts','snownow_private.snow_posts','snownow_step2_quarantine.snow_posts']:
  assert sql("SELECT has_table_privilege('"+role+"','"+obj+"','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') OR has_any_column_privilege('"+role+"','"+obj+"','SELECT,INSERT,UPDATE');").stdout.strip()=='f',(role,obj)
result={'status':'SYNTHETIC_APP_RECOVERY_PASSED','postgres_version':'17.11','execution_role':'postgres (NOSUPERUSER)','old_app_rows_restored':True,'old_columns_function_sequences_restored':True,'legacy_archive_and_cooldowns_preserved':True,'post_apply_rows_quarantined':True,'failed_recovery_atomic':True,'public_and_column_acl_locked':True,'auth_management_unrelated_sequence_unchanged':True,'real_backup_rehearsal':False,'hosted_verified':False}
(out/'result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
run('pg_ctl','-D',str(data),'-m','fast','-w','stop')
