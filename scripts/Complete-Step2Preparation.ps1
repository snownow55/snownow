# After the entire downloaded package SHA-256 has been checked. Offline local import + evidence copy.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$SnowUtf8 = [Text.UTF8Encoding]::new($false)
try {
    if (-not $PSScriptRoot -or -not $env:LOCALAPPDATA) { throw 'RUN_AS_WINDOWS_SCRIPT_FILE' }
    $SnowManifest = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'commit-manifest.json')) | ConvertFrom-Json
    if ($SnowManifest.repository -ne 'snownow55/snownow' -or $SnowManifest.branch -ne 'feat/supabase-auth' -or $SnowManifest.base_commit -ne '0d1516686e6248757f0ebe96e9f033cc045ffc47' -or $SnowManifest.commit -cnotmatch '^[a-f0-9]{40}$') { throw 'PACKAGE_IDENTITY_MISMATCH' }
    $SnowBundle = Join-Path $PSScriptRoot 'STEP2-local-commit.bundle'
    if ((Get-FileHash -LiteralPath $SnowBundle -Algorithm SHA256).Hash -ne $SnowManifest.bundle_sha256) { throw 'BUNDLE_HASH_MISMATCH' }
    $SnowPending = Join-Path $PSScriptRoot 'pending-step3-spec.md'
    if ((Get-FileHash -LiteralPath $SnowPending -Algorithm SHA256).Hash -ne $SnowManifest.pending_step3_sha256) { throw 'PENDING_SPEC_HASH_MISMATCH' }
    $SnowOriginal = @(Get-ChildItem -LiteralPath (Join-Path $env:LOCALAPPDATA 'SV-step2-final') -Directory | Where-Object {
        $SnowResult = Join-Path $_.FullName 'result.json'
        (Test-Path -LiteralPath $SnowResult) -and ((Get-Content -LiteralPath $SnowResult -Raw -Encoding UTF8 | ConvertFrom-Json).status -eq 'PHASE1_GIT_RESTORE_ROLLBACK_PASSED') -and (Test-Path -LiteralPath (Join-Path $_.FullName 'git-worktree\.git'))
    } | Sort-Object LastWriteTime -Descending | Select-Object -First 1)
    if ($SnowOriginal.Count -ne 1) { throw 'PHASE1_GIT_SOURCE_NOT_FOUND' }
    $SnowSource = Join-Path $SnowOriginal[0].FullName 'git-worktree'
    $SnowDestination = Join-Path (Join-Path $env:LOCALAPPDATA 'SNOWVIKING-step2-final') ('committed-' + $SnowManifest.commit.Substring(0,12) + '-' + [guid]::NewGuid().ToString('N').Substring(0,6))
    foreach ($SnowMountPath in @($SnowSource,$SnowDestination,$PSScriptRoot)) { if ($SnowMountPath.Contains(',') -or $SnowMountPath.StartsWith('\\')) { throw 'LOCAL_PATH_WITHOUT_COMMA_REQUIRED' } }
    New-Item -ItemType Directory -Path $SnowDestination -Force | Out-Null
    $SnowSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    & icacls.exe $SnowDestination /inheritance:r /grant:r ("*${SnowSid}:(OI)(CI)F") '*S-1-5-18:(OI)(CI)F' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'PRIVATE_OUTPUT_ACL_FAILED' }
    $SnowGitImage = 'alpine/git:2.54.1'
    $SnowImagePresent = & docker.exe image inspect $SnowGitImage --format '{{.Id}}' 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'CACHED_GIT_IMAGE_NOT_FOUND_NO_PULL_PERFORMED' }
    $SnowShell = @'
set -eu
umask 077
safe_git() { git -c safe.directory=/target/repo -C /target/repo "$@"; }
git -c safe.directory=/source -c safe.directory=/source/.git clone --quiet --no-hardlinks --no-checkout /source /target/repo
safe_git bundle verify /package/STEP2-local-commit.bundle >/dev/null 2>&1
safe_git fetch --quiet /package/STEP2-local-commit.bundle refs/heads/feat/supabase-auth:refs/remotes/step2-approved/feat-supabase-auth
safe_git checkout --quiet -B feat/supabase-auth refs/remotes/step2-approved/feat-supabase-auth
safe_git remote set-url origin https://github.com/snownow55/snownow.git
safe_git config --local user.name "$(safe_git show -s --format=%an HEAD)"
safe_git config --local user.email "$(safe_git show -s --format=%ae HEAD)"
safe_git config --local core.autocrlf false
safe_git config --local core.filemode false
safe_git rev-parse HEAD
'@
    # Node normalizes PowerShell's CRLF input and sends exact UTF-8/LF bytes to Docker.
    if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { throw 'NODE_NOT_FOUND' }
    # The only fetch is from the local bundle. No network or Docker daemon socket is mounted.
    $SnowDockerArgs = @('run','--pull=never','--rm','-i','--network','none','--read-only','--tmpfs','/tmp:rw,nosuid,size=64m',
        '--mount',("type=bind,source="+$SnowSource+",target=/source,readonly"),
        '--mount',("type=bind,source="+$SnowDestination+",target=/target"),
        '--mount',("type=bind,source="+$PSScriptRoot+",target=/package,readonly"),
        '--entrypoint','sh',$SnowGitImage,'-s')
    $SnowImported = @($SnowShell | & node.exe (Join-Path $PSScriptRoot 'Invoke-LfDocker.cjs') @SnowDockerArgs)
    if ($LASTEXITCODE -ne 0 -or ($SnowImported -join "`n").Trim() -ne $SnowManifest.commit) { throw 'LOCAL_BUNDLE_IMPORT_FAILED' }
    $SnowRepo = Join-Path $SnowDestination 'repo'
    foreach ($SnowFile in $SnowManifest.committed_files) {
        $SnowPath = [IO.Path]::GetFullPath((Join-Path $SnowRepo $SnowFile.path))
        if (-not $SnowPath.StartsWith($SnowRepo+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'UNSAFE_COMMIT_PATH' }
        if ((Get-FileHash -LiteralPath $SnowPath -Algorithm SHA256).Hash -ne $SnowFile.sha256) { throw 'COMMITTED_FILE_HASH_MISMATCH' }
    }
    Copy-Item -LiteralPath $SnowPending -Destination (Join-Path $SnowRepo 'docs\step3-morning-conditions-spec.md')
    if ((Get-FileHash -LiteralPath (Join-Path $SnowRepo 'docs\step3-morning-conditions-spec.md') -Algorithm SHA256).Hash -ne $SnowManifest.pending_step3_sha256) { throw 'COPIED_PENDING_SPEC_MISMATCH' }
    # A child PowerShell process changes execution policy only for this reviewed script invocation.
    $SnowPreserver = Join-Path $SnowRepo 'scripts\Preserve-Step2Evidence.ps1'
    $SnowPreservedText = & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $SnowPreserver
    if ($LASTEXITCODE -ne 0) { throw 'WINDOWS_EVIDENCE_PRESERVATION_FAILED' }
    $SnowEvidence = ($SnowPreservedText -join "`n") | ConvertFrom-Json
    if ($SnowEvidence.status -notlike 'STEP2_WINDOWS_EVIDENCE_PRESERVED*') { throw 'UNEXPECTED_EVIDENCE_RESULT' }
    $SnowReceipt = [ordered]@{status='STEP2_COMMIT_IMPORTED_AND_EVIDENCE_PRESERVED';commit=$SnowManifest.commit;committed_files=$SnowManifest.committed_files.Count;all_committed_hashes_match=$true;step3_kept_outside_commit=$true;evidence=$SnowEvidence;new_repository_folder_name=(Split-Path $SnowDestination -Leaf);original_environment_unchanged=$true;network_used=$false;tests_rerun=$false;supabase_connected=$false;push_performed=$false}
    [IO.File]::WriteAllText((Join-Path $SnowDestination 'SUCCESS.json'),($SnowReceipt | ConvertTo-Json -Depth 7),$SnowUtf8)
    $SnowReceipt | ConvertTo-Json -Depth 7
} catch {
    $SnowCode = if ($_.Exception.Message -cmatch '^[A-Z0-9_]+$') { $_.Exception.Message } else { 'LOCAL_FINALIZATION_FAILED' }
    [ordered]@{status='STEP2_FINALIZATION_STOPPED';code=$SnowCode;exception_type=$_.Exception.GetType().FullName;error_id=$_.FullyQualifiedErrorId;line=$_.InvocationInfo.ScriptLineNumber;original_environment_unchanged=$true;supabase_connected=$false;push_performed=$false;tests_rerun=$false} | ConvertTo-Json
    throw 'STEP2_FINALIZATION_STOPPED'
}
