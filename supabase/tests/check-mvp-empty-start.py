#!/usr/bin/env python3
"""Narrow MVP migration delta checks; fresh synthetic PostgreSQL via Unix sockets only.
Never imports/runs the old suite, takes a DB URL, contacts Hosted, or uses real data.
PG_BIN and PG_SHARE can point to an existing native PostgreSQL 17 installation.
"""
from pathlib import Path
import ast,hashlib,json,os,shutil,subprocess,tempfile
ROOT=Path(__file__).resolve().parents[2]
PG_BIN=Path(os.environ.get('PG_BIN',Path(shutil.which('psql') or '/missing/psql').parent))
PG_SHARE=os.environ.get('PG_SHARE')
result={'status':'MVP_EMPTY_START_DELTA_STARTED','tests':{},'prior_84_tests_rerun':False,'prior_recovery_rehearsals_rerun':False,'hosted_connected':False,'real_data_used':False}
work=Path(tempfile.mkdtemp(prefix='step2-mvp-empty-',dir=os.environ.get('MVP_TEST_TMP')));data=work/'data';sock=work/'s';sock.mkdir();started=False

def run(name,args,body=None):
 x=subprocess.run([str(PG_BIN/name),*map(str,args)],input=body,capture_output=True)
 if x.returncode:raise RuntimeError(name+': '+x.stderr.decode('utf8','replace')[-1800:])
 return x.stdout

def sql(q,role='postgres'):
 body=q if isinstance(q,bytes) else q.encode()
 login=role
 if role in ('anon','authenticated'):
  login='cluster_admin';body=('SET ROLE '+role+';\n').encode()+body
 return run('psql',['-h',sock,'-U',login,'-d','postgres','-XqAt','-v','ON_ERROR_STOP=1'],body).decode('utf8').strip()

def record(name,ok):
 if not ok:raise AssertionError(name)
 result['tests'][name]='PASS'

def outside():
 return sql("SELECT jsonb_build_object('rows',(SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM auth.users t),'uid',pg_get_functiondef('auth.uid()'::regprocedure),'owner',(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='auth.users'::regclass),'rls',(SELECT jsonb_build_array(relrowsecurity,relforcerowsecurity) FROM pg_class WHERE oid='auth.users'::regclass),'events',(SELECT jsonb_agg(jsonb_build_array(evtname,evtevent,evtenabled,pg_get_userbyid(evtowner),pg_get_functiondef(evtfoid)) ORDER BY evtname) FROM pg_event_trigger));",'cluster_admin')
try:
 init=['-D',data,'-U','cluster_admin','--locale=C','--encoding=UTF8','--auth-local=trust','--auth-host=reject']
 if PG_SHARE:init+=['-L',PG_SHARE]
 run('initdb',init);run('pg_ctl',['-D',data,'-l',work/'postgres.log','-o',f"-k {sock} -h '' -c shared_buffers=16MB",'-w','start']);started=True
 # Reuse only fixture constants. The old test module is never imported or run.
 tree=ast.parse((ROOT/'supabase/tests/run-isolated.py').read_text());nodes=[n for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in ('ACTOR','OTHER','ROLES','AUTH','USERS') for t in n.targets)];scope={};exec(compile(ast.Module(body=nodes,type_ignores=[]),'<fixture-constants>','exec'),scope)
 sql(scope['ROLES']+scope['AUTH']+scope['USERS'],'cluster_admin')
 sql("CREATE FUNCTION public.mvp_fixture_event() RETURNS event_trigger LANGUAGE plpgsql AS $$BEGIN NULL; END$$; CREATE EVENT TRIGGER mvp_fixture_event ON ddl_command_end EXECUTE FUNCTION public.mvp_fixture_event();",'cluster_admin')
 sql((ROOT/'supabase/tests/fixtures/step2-recovery.sql').read_bytes())
 # Old posts are deliberately recent: they must not seed a cooldown in the new app.
 sql("UPDATE snownow_private.snow_posts SET created_at=clock_timestamp();")
 boundary=outside();migration=(ROOT/'supabase/migrations/20261115000100_beta_foundation.sql').read_bytes()
 result['migration_sha256']=hashlib.sha256(migration).hexdigest().upper();result['migration_bytes']=len(migration)
 record('migration_role_is_non_superuser',sql("SELECT current_user='postgres' AND NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user);")=='t')
 sql(b'BEGIN;\n'+migration+b'\nCOMMIT;')
 record('new_posts_view_and_limits_start_empty',sql("SELECT (SELECT count(*)=0 FROM snownow_private.snow_posts) AND (SELECT count(*)=0 FROM public.snow_posts) AND (SELECT count(*)=0 FROM snownow_private.post_limits);")=='t')
 sequence=sql("SELECT pg_get_serial_sequence('snownow_private.snow_posts','id');")
 record('empty_sequence_starts_at_one',sql("SELECT last_value=1 AND NOT is_called FROM "+sequence+";")=='t')
 record('legacy_archive_exists_and_is_private',sql("SELECT to_regclass('snownow_private.legacy_authenticated_snow_posts') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated']) r WHERE has_schema_privilege(r,'snownow_private','USAGE') OR has_table_privilege(r,'snownow_private.legacy_authenticated_snow_posts','SELECT,INSERT,UPDATE,DELETE') OR has_any_column_privilege(r,'snownow_private.legacy_authenticated_snow_posts','SELECT,INSERT,UPDATE'));")=='t')
 master=json.loads((ROOT/'data/resort-master.json').read_text())
 actual=json.loads(sql("SELECT jsonb_build_object('regions',(SELECT jsonb_agg(jsonb_build_object('code',code,'name',name,'sort_order',sort_order) ORDER BY sort_order) FROM public.regions),'resorts',(SELECT jsonb_agg(jsonb_build_object('name',name,'display_name',display_name,'region_code',region_code,'sort_order',sort_order) ORDER BY name) FROM public.resorts WHERE is_active));"))
 expected=[{k:r[k] for k in ('name','display_name','region_code','sort_order')} for r in master['resorts']]
 record('approved_63_resorts_and_9_regions_match_master',len(actual['resorts'])==63 and actual['resorts']==sorted(expected,key=lambda r:r['name']) and actual['regions']==master['regions'])
 record('auth_and_management_metadata_unchanged',outside()==boundary)
 record('rls_rpc_and_private_write_boundary_maintained',sql("SELECT (SELECT bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class WHERE oid IN('snownow_private.snow_posts'::regclass,'snownow_private.post_limits'::regclass)) AND NOT EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated']) r WHERE has_table_privilege(r,'snownow_private.snow_posts','INSERT,UPDATE,DELETE') OR has_any_column_privilege(r,'snownow_private.snow_posts','INSERT,UPDATE')) AND NOT has_function_privilege('anon','public.submit_snow_post(jsonb)','EXECUTE') AND has_function_privilege('authenticated','public.submit_snow_post(jsonb)','EXECUTE') AND NOT (SELECT rolsuper OR rolbypassrls OR rolcanlogin FROM pg_roles WHERE rolname='snownow_post_writer');")=='t')
 actor=scope['ACTOR'];prefix="BEGIN; SET LOCAL request.jwt.claim.sub='"+actor+"'; "
 status=json.loads(sql(prefix+'SELECT public.posting_status(); COMMIT;','authenticated'))
 record('recent_legacy_post_does_not_block_first_new_post',status['allowed'] is True and status['nextAllowedAt'] is None)
 payload=dict(resort='オーンズ',area='山頂・上部',snow_type='パウダー',snowfall='ほぼ無し',roughness='きれい',crowd='普通',comment='synthetic MVP empty-start smoke')
 submitted=json.loads(sql(prefix+"SELECT public.submit_snow_post('"+json.dumps(payload,ensure_ascii=False).replace("'","''")+"'::jsonb); COMMIT;",'authenticated'))
 record('first_rpc_post_gets_id_one_and_creates_only_its_limit',submitted['allowed'] is True and sql("SELECT (SELECT count(*)=1 AND min(id)=1 FROM snownow_private.snow_posts) AND (SELECT count(*)=1 FROM snownow_private.post_limits) AND (SELECT count(*)=1 FROM public.snow_posts);")=='t')
 record('cooldown_activates_after_first_new_post',json.loads(sql(prefix+'SELECT public.posting_status(); COMMIT;','authenticated'))['allowed'] is False)
 result['status']='MVP_EMPTY_START_DELTA_PASSED'
except Exception as e:
 result['status']='MVP_EMPTY_START_DELTA_FAILED';result['error']=str(e);raise
finally:
 if started:run('pg_ctl',['-D',data,'-m','fast','-w','stop'])
 out=Path(os.environ.get('MVP_TEST_RESULT',work/'result.json'));out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False,indent=2))
