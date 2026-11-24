import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const sql=readFileSync(new URL('../supabase/usage-analytics-production-apply.sql',import.meta.url),'utf8');
const fixture="CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA snownow_private;CREATE SCHEMA supabase_migrations;CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,name text,statements text[]);";
const cron="CREATE SCHEMA cron;CREATE TABLE cron.job(jobid bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,jobname text,schedule text,command text,active boolean DEFAULT true);CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE SQL AS $$INSERT INTO cron.job(jobname,schedule,command)VALUES($1,$2,$3)RETURNING jobid$$;";
test('SQL Editor package preserves source bytes, registers once, and refuses drift atomically',async()=>{
 const db=new PGlite();try{
  await db.exec(fixture+cron);await db.exec(sql);await db.exec(sql);
  const history=(await db.query('SELECT name,statements FROM supabase_migrations.schema_migrations')).rows;
  assert.equal(history.length,1);assert.equal(history[0].name,'usage_analytics');
  assert.equal(history[0].statements[0],readFileSync(new URL('../supabase/migrations/20261124000100_usage_analytics.sql',import.meta.url),'utf8'));
  assert.equal(Number((await db.query('SELECT count(*) AS n FROM cron.job')).rows[0].n),1);
  await db.exec("UPDATE cron.job SET schedule='0 0 * * *'");
  await assert.rejects(db.exec(sql),/USAGE_EXISTING_CRON_REQUIRES_REVIEW/);await db.exec('ROLLBACK');
  assert.equal((await db.query('SELECT schedule FROM cron.job')).rows[0].schedule,'0 0 * * *');
 }finally{await db.close();}
});
test('SQL Editor package rolls migration and history back if Cron is absent',async()=>{
 const db=new PGlite();try{
  await db.exec(fixture);await assert.rejects(db.exec(sql),/USAGE_CRON_EXTENSION_NOT_AVAILABLE/);await db.exec('ROLLBACK');
  assert.equal((await db.query("SELECT to_regclass('snownow_private.usage_events') AS t")).rows[0].t,null);
  assert.equal(Number((await db.query('SELECT count(*) AS n FROM supabase_migrations.schema_migrations')).rows[0].n),0);
 }finally{await db.close();}
});
