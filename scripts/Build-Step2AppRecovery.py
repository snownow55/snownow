#!/usr/bin/env python3
"""Offline only: turn an explicitly reviewed TOC list into private app-only SQL.
No DB connection argument is accepted. Output must not exist. Never commit output.
"""
import argparse, pathlib, re, subprocess, os, hashlib, json
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--pg-restore',required=True)
p.add_argument('--dump',required=True)
p.add_argument('--approved-list',required=True)
p.add_argument('--output',required=True)
a=p.parse_args();dump=pathlib.Path(a.dump);approved=pathlib.Path(a.approved_list);out=pathlib.Path(a.output)
if out.exists():p.error('Output already exists; preserve it and use a fresh directory')
patterns=[
 r'FUNCTION snownow_private email_verified\(\) postgres',
 r'ACL snownow_private FUNCTION email_verified\(\) postgres',
 r'(?:TABLE|VIEW|TABLE DATA|ROW SECURITY) (?:public (?:regions|resorts|snow_posts)|snownow_private snow_posts) postgres',
 r'ACL (?:public TABLE (?:regions|resorts|snow_posts)|snownow_private TABLE snow_posts|snownow_private COLUMN snow_posts\.[A-Za-z_][A-Za-z_0-9]*) postgres',
 r'(?:SEQUENCE|SEQUENCE SET|SEQUENCE OWNED BY) (?:public resorts_id_seq|snownow_private snow_posts_id_seq) postgres',
 r'ACL (?:public SEQUENCE resorts_id_seq|snownow_private SEQUENCE snow_posts_id_seq) postgres',
 r'(?:CONSTRAINT|FK CONSTRAINT|POLICY) (?:public (?:regions|resorts)|snownow_private snow_posts) [A-Za-z_][A-Za-z_0-9]* postgres',
 r'INDEX (?:public resorts_region_sort_order_uidx|snownow_private legacy_posts_latest) postgres',
]
def entries(text):
 result={}
 for line in text.splitlines():
  if not line.strip() or line.startswith(';'):continue
  m=re.fullmatch(r'(\d+);\s+\d+\s+\d+\s+(.+)',line)
  if not m or m[1] in result:raise ValueError('Malformed or duplicate TOC ID')
  result[m[1]]=(line,m[2])
 return result
before=hashlib.sha256(dump.read_bytes()).hexdigest()
full=subprocess.run([a.pg_restore,'--list',str(dump)],check=True,capture_output=True,text=True).stdout
all_entries=entries(full);selected=entries(approved.read_text(encoding='utf-8-sig'))
if not selected:raise ValueError('Empty approved list')
for key,(line,desc) in selected.items():
 if key not in all_entries or all_entries[key]!=(line,desc):raise ValueError('Approved list differs from dump TOC')
 if not any(re.fullmatch(x,desc) for x in patterns):raise ValueError('TOC entry outside reviewed application scope: '+key)
expected_ids={k for k,(_,desc) in all_entries.items() if any(re.fullmatch(x,desc) for x in patterns)}
if set(selected)!=expected_ids:raise ValueError('Approved list omits known application dependencies')
required={'TABLE public regions postgres','TABLE public resorts postgres','TABLE snownow_private snow_posts postgres','VIEW public snow_posts postgres','FUNCTION snownow_private email_verified() postgres','TABLE DATA public regions postgres','TABLE DATA public resorts postgres','TABLE DATA snownow_private snow_posts postgres'}
if not required.issubset({x[1] for x in selected.values()}):raise ValueError('Required baseline entries missing')
out.mkdir(mode=0o700,parents=False)
# Windows caller must create the parent with owner/SYSTEM ACL before invoking.
list_copy=out/'dev-app-recovery.list';list_copy.write_text('\n'.join(v[0] for v in selected.values())+'\n')
sql=out/'dev-app-recovery.sql'
subprocess.run([a.pg_restore,'--use-list='+str(list_copy),'--file='+str(sql),str(dump)],check=True,capture_output=True)
if hashlib.sha256(dump.read_bytes()).hexdigest()!=before:raise ValueError('Dump changed during generation')
receipt={'status':'APP_RECOVERY_SQL_GENERATED_NOT_EXECUTED','dump_sha256':before,'toc_entries':len(selected),'sql_sha256':hashlib.sha256(sql.read_bytes()).hexdigest(),'database_connected':False,'hosted_permissions_verified':False}
(out/'generation-receipt.json').write_text(json.dumps(receipt,indent=2));print(json.dumps(receipt))
