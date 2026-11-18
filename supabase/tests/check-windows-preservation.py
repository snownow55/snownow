#!/usr/bin/env python3
"""Focused Linux regression checks; PowerShell ACL/identity are explicitly mocked.
Uses synthetic evidence only, never the user's existing evidence or a DB.
"""
from pathlib import Path
import subprocess,os,json,uuid,argparse
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--pwsh',required=True);p.add_argument('--work-parent',required=True);args=p.parse_args()
repo=Path(__file__).resolve().parents[2];root=Path(args.work_parent).resolve()/('preservation-checks-'+uuid.uuid4().hex[:8]);root.mkdir(mode=0o700);ps=Path(args.pwsh).resolve();env=dict(os.environ)
# Parse both PS scripts without running finalization/import.
for p in [repo/'scripts/Preserve-Step2Evidence.ps1',repo/'scripts/Complete-Step2Preparation.ps1']:
 code="$e=$null; [void][Management.Automation.Language.Parser]::ParseFile('"+str(p)+"',[ref]$null,[ref]$e); if($e.Count){throw 'PARSE_FAILED'}"
 subprocess.run([str(ps),'-NoProfile','-Command',code],env=env,capture_output=True,check=True)
print('POWERSHELL_SYNTAX_PASS')
for mode in ['native','backslash','mixed','duplicate','missing','corrupt']:
 profile=root/mode;profile.mkdir()
 def put(relative,data):
  f=profile/relative;f.parent.mkdir(parents=True,exist_ok=True);f.write_text(json.dumps(data) if isinstance(data,dict) else data)
 put('SV-step2-final/111111111111/result.json',{'status':'PHASE1_GIT_RESTORE_ROLLBACK_PASSED'})
 put('SV-step2-services/222222222222/result.json',{'status':'PHASE2_AUTH_POSTGREST_CLI_PASSED','remote_supabase_connected':False,'real_backup_used':False,'synthetic_services_stopped':True,'tests':{'fixture':'PASS'}})
 put('SV-step2-resumers/333333333333/phase2-existing-auth-resume.mjs','// synthetic runner fixture\n')
 put('SNOWVIKING-restore-lab/restore-lab-state.json',{'stage':'RUNTIME_DB_TESTS_PASSED'})
 put('SNOWVIKING-restore-lab/runtime-tests.mjs','// synthetic fixture\n')
 # New output location prevents accidentally recognizing old synthetic evidence.
 output=profile/'new-evidence';output.mkdir()
 s=(repo/'scripts/Preserve-Step2Evidence.ps1').read_text().replace("$SnowSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value","$SnowSid = 'S-1-5-21-111-222-333-1000'")
 s=s.replace('& icacls.exe $SnowDestination /inheritance:r /grant:r ("*${SnowSid}:(OI)(CI)F") \'*S-1-5-18:(OI)(CI)F\' | Out-Null','$global:LASTEXITCODE = 0')
 s=s.replace('$SnowRepo = [IO.Directory]::GetParent($PSScriptRoot).FullName',"$SnowRepo = '"+str(repo).replace("'","''")+"'")
 if mode!='native':
  custom='''$z=[IO.Compression.ZipFile]::Open($SnowZip,[IO.Compression.ZipArchiveMode]::Create)
try { $i=0; foreach($f in @(Get-ChildItem -LiteralPath $SnowContent -Recurse -File)) {
 $n=$f.FullName.Substring($SnowContent.Length+1).Replace('\\','/'); $i++
 if ('MODE' -eq 'missing' -and $i -eq 3) {continue}
 $name=if ('MODE' -eq 'backslash' -or ('MODE' -eq 'mixed' -and $i%2 -eq 0)) {$n.Replace('/','\\')} else {$n}
 $e=$z.CreateEntry($name);$stream=$e.Open()
 try {if('MODE' -eq 'corrupt' -and $i -eq 3) {$stream.WriteByte(1)} else {$src=[IO.File]::OpenRead($f.FullName);try{$src.CopyTo($stream)}finally{$src.Dispose()}}} finally {$stream.Dispose()}
 if('MODE' -eq 'duplicate' -and $n.Contains('/')) {$dupe=$z.CreateEntry($n.Replace('/','\\'));break}
} } finally {$z.Dispose()}
'''.replace('MODE',mode)
  s=s.replace('[IO.Compression.ZipFile]::CreateFromDirectory($SnowContent,$SnowZip)',custom)
 p=profile/'preserver-test.ps1';p.write_text(s,encoding='utf-8-sig')
 x=subprocess.run([str(ps),'-NoProfile','-File',str(p),'-OutputParent',str(output)],capture_output=True,text=True,env={**env,'LOCALAPPDATA':str(profile)})
 result=json.loads(x.stdout);expected={'native':'STEP2_WINDOWS_EVIDENCE_PRESERVED','backslash':'STEP2_WINDOWS_EVIDENCE_PRESERVED','mixed':'STEP2_WINDOWS_EVIDENCE_PRESERVED','duplicate':'DUPLICATE_NORMALIZED_ZIP_ENTRY','missing':'ZIP_FILE_COUNT_MISMATCH','corrupt':'ZIP_READBACK_HASH_MISMATCH'}[mode]
 assert result.get('code',result['status'])==expected,(mode,result,x.stderr[:300]);print('PRESERVER',mode,expected,'WINDOWS_ACL_MOCKED')
# Test the actual LF helper, with a stub Docker that only examines raw stdin.
bin=root/'bin';bin.mkdir();stub=bin/'docker';stub.write_text("#!/usr/bin/env python3\nimport sys\nb=sys.stdin.buffer.read()\nassert b'\\r' not in b and not b.startswith(b'\\xef\\xbb\\xbf') and b.endswith(b'\\n')\nprint('LF_BYTES_OK')\n");stub.chmod(0o700)
for raw in [b'echo ok\n',b'echo ok\r\n',b'echo ok\r',b'\xef\xbb\xbfecho ok\r\n']:
 x=subprocess.run(['node',str(repo/'scripts/Invoke-LfDocker.cjs'),'run','--pull=never','--network','none','--read-only'],input=raw,capture_output=True,env={**env,'PATH':str(bin)+os.pathsep+env['PATH']});assert x.returncode==0 and x.stdout.strip()==b'LF_BYTES_OK',(x.stdout,x.stderr)
print('LF_HELPER_FOUR_INPUT_VARIANTS_PASS')
(root/'result.json').write_text(json.dumps({'status':'WINDOWS_HELPER_REGRESSIONS_PASSED','ps_runtime':'7.7.0 Linux','windows_acl_mocked':True,'windows_ps51_not_run':True,'zip_cases':6,'lf_cases':4},indent=2));print('RESULT_FOLDER',root)
