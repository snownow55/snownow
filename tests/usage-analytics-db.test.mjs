import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

// Embedded PostgreSQL only. This file accepts no connection URL, token, or password.
test('PostgreSQL 17 isolated analytics correctness and retention', async t => {
 const db = new PGlite();
 try {
  const q = async (sql, args=[]) => (await db.query(sql,args)).rows;
  const scalar = async (sql,args=[]) => Object.values((await q(sql,args))[0])[0];
  await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA snownow_private;CREATE TABLE public.fixture_protected(id int PRIMARY KEY,value text);INSERT INTO public.fixture_protected VALUES(1,\'unchanged\');');
  assert.match(await scalar('SELECT version()'),/PostgreSQL 17\./);
  await db.exec(readFileSync(new URL('../supabase/migrations/20261124000100_usage_analytics.sql',import.meta.url),'utf8'));
  const today=await scalar("SELECT (clock_timestamp() AT TIME ZONE 'Asia/Tokyo')::date::text");
  const day=async offset=>scalar('SELECT ($1::date-$2::integer)::text',[today,offset]);
  const a=randomUUID(),b=randomUUID(),s1=randomUUID(),s2=randomUUID(),s3=randomUUID();
  const e=(visitor=a,session=s1,mode='browser',type='page_view',source='youtube',platform='android')=>({event_id:randomUUID(),day_jst:today,visitor_day_id:visitor,session_id:session,event_type:type,display_mode:mode,platform,entry_source:source,page_kind:'home'});
  const ingest=async events=>scalar('SELECT public.record_usage_events($1::jsonb)',[JSON.stringify(events)]);
  const count=()=>scalar('SELECT count(*)::int FROM snownow_private.usage_events');
  let samples=[];
  await t.test('idempotency and exact cross-mode, cross-source daily uniques',async()=>{
   for(const args of [[a,s1,'browser','youtube','android'],[a,s2,'standalone','tiktok','android'],[b,s3,'browser','x','iphone']]){
    const [v,s,m,source,platform]=args;const batch=['visit','session_start','page_view'].map(type=>e(v,s,m,type,source,platform));samples.push(...batch);
    assert.equal((await ingest(batch)).accepted,3);assert.equal((await ingest(batch)).duplicate,3);
   }
   assert.equal((await ingest([e(a,s1,'browser','visit')])).duplicate,1);
   assert.equal((await ingest([e(a,s1,'browser','session_start')])).duplicate,1);
   const r=(await q("SELECT * FROM snownow_private.usage_report WHERE dimension='all'"))[0];
   assert.equal(Number(r.unique_ids),2);assert.equal(Number(r.pwa_unique_ids),1);assert.equal(Number(r.pwa_launches),1);assert.equal(Number(r.page_views),3);
   const sources=await q("SELECT bucket,unique_ids FROM snownow_private.usage_report WHERE dimension='source'");
   assert.deepEqual(sources.map(x=>x.bucket).sort(),['tiktok','x','youtube']);assert.equal(sources.reduce((s,x)=>s+Number(x.unique_ids),0),3);
  });
  await t.test('invalid date/PII/oversized batch rolls back the entire RPC',async()=>{
   const before=await count();
   await assert.rejects(()=>ingest([e(),{...e(),email:'synthetic@example.test'}]),/USAGE_INVALID_EVENT/);
   await assert.rejects(()=>ingest([{...e(),day_jst:'2000-01-01'}]),/USAGE_DAY_MISMATCH/);
   await assert.rejects(()=>ingest([e(),e(),e(),e()]),/USAGE_INVALID_BATCH/);
   assert.equal(await count(),before);
  });
  await t.test('RLS/direct grants and RPC execute privileges protect raw and aggregated data',async()=>{
   for(const role of ['anon','authenticated','service_role']){
    await db.exec(`SET ROLE ${role}`);
    try{
     for(const sql of ['SELECT * FROM snownow_private.usage_events','SELECT * FROM snownow_private.usage_report','DELETE FROM snownow_private.usage_events']) await assert.rejects(()=>db.query(sql),/permission denied/);
     if(role!=='service_role')await assert.rejects(()=>ingest([e()]),/permission denied/);
     else assert.equal((await ingest([samples[0]])).duplicate,1);
    }finally{await db.exec('RESET ROLE');}
   }
  });
  await t.test('daily, raw-cap and per-ID budgets stop only new telemetry',async()=>{
   await db.exec('BEGIN');
   try{
    await db.query('UPDATE snownow_private.usage_days SET accepted_events=5000 WHERE day_jst=$1',[today]);assert.equal((await ingest([e()])).limited,1);
   }finally{await db.exec('ROLLBACK');}
   await db.exec('BEGIN');
   try{
    await db.query('UPDATE snownow_private.usage_days SET raw_events=40000 WHERE day_jst=$1',[today]);assert.equal((await ingest([e()])).limited,1);
   }finally{await db.exec('ROLLBACK');}
   await db.exec('BEGIN');
   try{
    const v=randomUUID();
    await db.query(`INSERT INTO snownow_private.usage_events(event_id,day_jst,visitor_day_id,session_id,event_type,display_mode,platform,entry_source,page_kind)
      SELECT md5('cap'||i::text)::uuid,$1::date,$2::uuid,md5('session'||i::text)::uuid,'page_view','browser','android','direct_unknown','home' FROM generate_series(1,300)i`,[today,v]);
    await db.query('UPDATE snownow_private.usage_days SET accepted_events=accepted_events+300,raw_events=raw_events+300 WHERE day_jst=$1',[today]);
    assert.equal((await ingest([e(v)])).limited,1);
   }finally{await db.exec('ROLLBACK');}
  });
  const old8=await day(8),old3=await day(3),old91=await day(91);
  async function seedDay(d){
   await db.query('INSERT INTO snownow_private.usage_days(day_jst,accepted_events,raw_events) VALUES($1,9,9)',[d]);
   await db.query(`INSERT INTO snownow_private.usage_events SELECT md5(event_id::text||$1)::uuid,$1::date,
     ($1::date::timestamp AT TIME ZONE 'Asia/Tokyo')+interval '12 hours',md5(visitor_day_id::text||$1)::uuid,md5(session_id::text||$1)::uuid,event_type,display_mode,platform,entry_source,page_kind
     FROM snownow_private.usage_events WHERE day_jst=$2`,[d,today]);
  }
  await seedDay(old8);await seedDay(old3);await seedDay(old91);
  await t.test('aggregation failure preserves all raw rows and old receipts',async()=>{
   const before=await count();
   await db.exec("CREATE FUNCTION snownow_private.fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'SYNTHETIC_AGGREGATION_FAILURE';END;$$;CREATE TRIGGER fixture_failure BEFORE INSERT ON snownow_private.usage_daily_summary FOR EACH ROW EXECUTE FUNCTION snownow_private.fixture_fail();");
   await assert.rejects(()=>db.query('SELECT public.maintain_usage_analytics()'),/SYNTHETIC_AGGREGATION_FAILURE/);
   assert.equal(await count(),before);assert.equal(Number(await scalar('SELECT count(*) FROM snownow_private.usage_daily_summary')),0);
   await db.exec('DROP TRIGGER fixture_failure ON snownow_private.usage_daily_summary;DROP FUNCTION snownow_private.fixture_fail();');
  });
  await t.test('cleanup failure rolls back summaries, receipts and every earlier deletion',async()=>{
   const before=await count();
   await db.exec("CREATE FUNCTION snownow_private.fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'SYNTHETIC_CLEANUP_FAILURE';END;$$;CREATE TRIGGER fixture_failure BEFORE DELETE ON snownow_private.usage_events FOR EACH ROW EXECUTE FUNCTION snownow_private.fixture_fail();");
   await assert.rejects(()=>db.query('SELECT public.maintain_usage_analytics()'),/SYNTHETIC_CLEANUP_FAILURE/);
   assert.equal(await count(),before);assert.equal(Number(await scalar('SELECT count(*) FROM snownow_private.usage_daily_summary')),0);
   await db.exec('DROP TRIGGER fixture_failure ON snownow_private.usage_events;DROP FUNCTION snownow_private.fixture_fail();');
  });
  await t.test('count drift stops cleanup instead of silently destroying evidence',async()=>{
   await db.query('UPDATE snownow_private.usage_days SET raw_events=raw_events+1 WHERE day_jst=$1',[old8]);const before=await count();
   await assert.rejects(()=>db.query('SELECT public.maintain_usage_analytics()'),/USAGE_RAW_COUNT_MISMATCH/);assert.equal(await count(),before);
   await db.query('UPDATE snownow_private.usage_days SET raw_events=raw_events-1 WHERE day_jst=$1',[old8]);
  });
  await t.test('verified rollup survives raw deletion, retains 7/90 days and is repeatable',async()=>{
   await db.query('SELECT public.maintain_usage_analytics()');
   assert.equal(Number(await scalar('SELECT count(*) FROM snownow_private.usage_events WHERE day_jst=$1',[old8])),0);
   assert.equal(Number(await scalar('SELECT count(*) FROM snownow_private.usage_events WHERE day_jst=$1',[old3])),9);
   const r=(await q("SELECT * FROM snownow_private.usage_report WHERE day_jst=$1 AND dimension='all'",[old8]))[0];
   assert.equal(Number(r.unique_ids),2);assert.equal(Number(r.pwa_unique_ids),1);assert.equal(Number(r.page_views),3);
   assert.equal(Number(await scalar('SELECT count(*) FROM snownow_private.usage_days WHERE day_jst=$1',[old91])),0);
   const before=await q('SELECT * FROM snownow_private.usage_daily_summary WHERE day_jst=$1 ORDER BY dimension,bucket',[old8]);
   await db.query('SELECT public.maintain_usage_analytics()');assert.deepEqual(await q('SELECT * FROM snownow_private.usage_daily_summary WHERE day_jst=$1 ORDER BY dimension,bucket',[old8]),before);
   assert.equal(Number(await scalar('SELECT count(*) FROM (SELECT day_jst,dimension,bucket FROM snownow_private.usage_report GROUP BY 1,2,3 HAVING count(*)>1)x')),0);
   assert.equal(await scalar('SELECT value FROM public.fixture_protected WHERE id=1'),'unchanged');
   await db.exec(readFileSync(new URL('../supabase/audit/usage-analytics-summary-readonly.sql',import.meta.url),'utf8'));
  });
  await t.test('cron registration is separate, idempotent and uses 00:10 JST (stubbed scheduler only)',async()=>{
   await db.exec("CREATE SCHEMA cron;CREATE TABLE cron.job(jobid bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,jobname text,schedule text,command text,active boolean DEFAULT true);CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE SQL AS $$INSERT INTO cron.job(jobname,schedule,command)VALUES($1,$2,$3)RETURNING jobid$$;");
   const setup=readFileSync(new URL('../supabase/maintenance/usage-analytics-cron-enable-after-approval.sql',import.meta.url),'utf8');
   await db.exec(setup);await db.exec(setup);assert.equal(Number(await scalar('SELECT count(*) FROM cron.job')),1);assert.equal(await scalar('SELECT schedule FROM cron.job'),'10 15 * * *');
  });
  await t.test('measure a bounded 40k-row sample including indexes',async()=>{
   await db.exec('TRUNCATE snownow_private.usage_events,snownow_private.usage_daily_summary,snownow_private.usage_days;');
   await db.query('INSERT INTO snownow_private.usage_days(day_jst,accepted_events,raw_events) SELECT $1::date-i,5000,5000 FROM generate_series(0,7)i',[today]);
   await db.query(`INSERT INTO snownow_private.usage_events(event_id,day_jst,visitor_day_id,session_id,event_type,display_mode,platform,entry_source,page_kind)
    SELECT md5('event'||i)::uuid,$1::date-(i/5000),md5('visitor'||i)::uuid,md5('session'||i)::uuid,'page_view','standalone','android','youtube','home' FROM generate_series(0,39999)i`,[today]);
   const bytes=Number(await scalar("SELECT sum(pg_total_relation_size(t)) FROM unnest(ARRAY['snownow_private.usage_events'::regclass,'snownow_private.usage_days'::regclass,'snownow_private.usage_daily_summary'::regclass])t"));
   t.diagnostic('40,000 raw rows incl indexes: '+bytes+' bytes; embedded PostgreSQL estimate, not Hosted measurement');
   assert.equal((await ingest([e()])).limited,1);
   await db.query('SELECT public.maintain_usage_analytics()');assert.equal(await count(),35000);
  });
 } finally {await db.close();}
});
