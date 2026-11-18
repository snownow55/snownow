# Windows PowerShell 5.1. Offline evidence preservation only. No DB, Git, Docker or network commands.
[CmdletBinding()]
param([string]$OutputParent = (Join-Path $env:LOCALAPPDATA 'SNOWVIKING-step2-final'))
$ErrorActionPreference = 'Stop'
$SnowUtf8 = [Text.UTF8Encoding]::new($false)
$SnowRecords = [Collections.Generic.List[object]]::new()
$SnowMissing = [Collections.Generic.List[string]]::new()
$SnowDestination = $null
try {
    if (-not $env:LOCALAPPDATA) { throw 'WINDOWS_ENVIRONMENT_REQUIRED' }
    $SnowOutput = [IO.Path]::GetFullPath($OutputParent)
    if ($SnowOutput.StartsWith('\\')) { throw 'USE_PRIVATE_LOCAL_STORAGE' }
    # A backup/evidence destination must not be inside a Git worktree.
    $SnowAncestor = $SnowOutput
    while ($SnowAncestor) {
        if (Test-Path -LiteralPath (Join-Path $SnowAncestor '.git')) { throw 'OUTPUT_INSIDE_GIT' }
        $SnowNext = [IO.Directory]::GetParent($SnowAncestor)
        $SnowAncestor = if ($SnowNext) { $SnowNext.FullName } else { $null }
    }
    function Read-SnowJson([string]$Path) {
        return [IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8) | ConvertFrom-Json
    }
    $SnowPhase1Root = Join-Path $env:LOCALAPPDATA 'SV-step2-final'
    $SnowPhase2Root = Join-Path $env:LOCALAPPDATA 'SV-step2-services'
    $SnowPhase1 = @(Get-ChildItem -LiteralPath $SnowPhase1Root -Directory | Where-Object {
        $SnowResult = Join-Path $_.FullName 'result.json'
        (Test-Path -LiteralPath $SnowResult) -and (Read-SnowJson $SnowResult).status -eq 'PHASE1_GIT_RESTORE_ROLLBACK_PASSED'
    })
    $SnowPhase2 = @(Get-ChildItem -LiteralPath $SnowPhase2Root -Directory | Where-Object {
        $SnowResult = Join-Path $_.FullName 'result.json'
        (Test-Path -LiteralPath $SnowResult) -and (Read-SnowJson $SnowResult).status -eq 'PHASE2_AUTH_POSTGREST_CLI_PASSED'
    } | Sort-Object LastWriteTime -Descending)
    if ($SnowPhase1.Count -eq 0 -or $SnowPhase2.Count -eq 0) { throw 'SUCCESSFUL_RESULTS_NOT_FOUND' }
    $SnowFinal = Read-SnowJson (Join-Path $SnowPhase2[0].FullName 'result.json')
    if ($SnowFinal.remote_supabase_connected -ne $false -or $SnowFinal.real_backup_used -ne $false -or $SnowFinal.synthetic_services_stopped -ne $true) { throw 'UNEXPECTED_PHASE2_SCOPE' }
    if (@($SnowFinal.tests.PSObject.Properties | Where-Object Value -ne 'PASS').Count -gt 0) { throw 'NON_PASS_FINAL_CHECK' }
    $SnowRunnerRoot = Join-Path $env:LOCALAPPDATA 'SV-step2-resumers'
    $SnowRunnerFiles = @(Get-ChildItem -LiteralPath $SnowRunnerRoot -Directory | ForEach-Object {
        Get-ChildItem -LiteralPath $_.FullName -File | Where-Object Name -in @('phase2-resume.mjs','phase2-auth-resume.mjs','phase2-existing-auth-resume.mjs')
    })
    if (@($SnowRunnerFiles | Where-Object Name -eq 'phase2-existing-auth-resume.mjs').Count -eq 0) { throw 'FINAL_RUNNER_NOT_FOUND' }
    $SnowRuntimeRoot = Join-Path $env:LOCALAPPDATA 'SNOWVIKING-restore-lab'
    $SnowStatePath = Join-Path $SnowRuntimeRoot 'restore-lab-state.json'
    if ((Read-SnowJson $SnowStatePath).stage -ne 'RUNTIME_DB_TESTS_PASSED') { throw 'PASSED_80_STATE_NOT_FOUND' }
    $SnowLeaf = 'evidence-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)
    $SnowDestination = Join-Path $SnowOutput $SnowLeaf
    New-Item -ItemType Directory -Path $SnowDestination -Force | Out-Null
    $SnowSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    & icacls.exe $SnowDestination /inheritance:r /grant:r ("*${SnowSid}:(OI)(CI)F") '*S-1-5-18:(OI)(CI)F' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'PRIVATE_ACL_FAILED' }
    $SnowContent = Join-Path $SnowDestination 'content'
    New-Item -ItemType Directory -Path $SnowContent | Out-Null
    function Copy-SnowEvidence([string]$Source,[string]$Relative) {
        $SnowItem = Get-Item -LiteralPath $Source
        if (($SnowItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'REPARSE_POINT_NOT_ALLOWED' }
        if ($SnowItem.Extension -notin @('.json','.mjs','.md','.csv')) { throw 'FILE_TYPE_NOT_ALLOWED' }
        $SnowText = [IO.File]::ReadAllText($Source, [Text.Encoding]::UTF8)
        # Reject secret-looking literal values. No matched text is printed or logged.
        if ($SnowText -match '-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----' -or
            $SnowText -match '\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b' -or
            $SnowText -match 'postgres(?:ql)?://[^/\s''"]+:[^@\s''"]+@' -or
            $SnowText -match '\bsb_secret_[A-Za-z0-9_-]{16,}\b') { throw 'SECRET_LIKE_VALUE_BLOCKED' }
        $SnowBefore = (Get-FileHash -LiteralPath $Source -Algorithm SHA256).Hash
        $SnowTarget = Join-Path $SnowContent $Relative
        New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($SnowTarget)) -Force | Out-Null
        Copy-Item -LiteralPath $Source -Destination $SnowTarget
        $SnowCopied = (Get-FileHash -LiteralPath $SnowTarget -Algorithm SHA256).Hash
        if ($SnowBefore -ne $SnowCopied -or $SnowBefore -ne (Get-FileHash -LiteralPath $Source -Algorithm SHA256).Hash) { throw 'SOURCE_OR_COPY_HASH_CHANGED' }
        $SnowRecords.Add([ordered]@{path=($Relative -replace '\\','/');bytes=$SnowItem.Length;sha256=$SnowCopied})
    }
    foreach ($SnowFolder in $SnowPhase1) {
        Copy-SnowEvidence (Join-Path $SnowFolder.FullName 'result.json') ('phase1\' + $SnowFolder.Name + '\result.json')
    }
    # Retain failed/intermediate results as evidence; do not copy any raw logs or DB material.
    foreach ($SnowFolder in @(Get-ChildItem -LiteralPath $SnowPhase2Root -Directory)) {
        if ($SnowFolder.Name -notmatch '^[a-f0-9]{12}$') { continue }
        $SnowPath = Join-Path $SnowFolder.FullName 'result.json'
        if (Test-Path -LiteralPath $SnowPath) { Copy-SnowEvidence $SnowPath ('phase2\' + $SnowFolder.Name + '\result.json') }
    }
    foreach ($SnowFile in $SnowRunnerFiles) {
        Copy-SnowEvidence $SnowFile.FullName ('runners\' + $SnowFile.Directory.Name + '\' + $SnowFile.Name)
    }
    Copy-SnowEvidence $SnowStatePath 'runtime80\restore-lab-state.json'
    $SnowRuntimeScript = Join-Path $SnowRuntimeRoot 'runtime-tests.mjs'
    if (Test-Path -LiteralPath $SnowRuntimeScript) { Copy-SnowEvidence $SnowRuntimeScript 'runtime80\runtime-tests.mjs' }
    else { $SnowMissing.Add('runtime80/runtime-tests.mjs') }
    # Copy only the final report documents when this script resides in the reviewed repository.
    $SnowRepo = [IO.Directory]::GetParent($PSScriptRoot).FullName
    foreach ($SnowName in @('step2-final-verification-report.md','step2-verification-results.csv','step2-release-migration.md')) {
        $SnowDoc = Join-Path (Join-Path $SnowRepo 'docs') $SnowName
        if (Test-Path -LiteralPath $SnowDoc) { Copy-SnowEvidence $SnowDoc ('reports\' + $SnowName) }
    }
    [IO.File]::WriteAllText((Join-Path $SnowContent 'manifest.json'),(@{files=@($SnowRecords.ToArray());missing_optional=@($SnowMissing.ToArray());source_files_unchanged=$true;tests_rerun=$false;real_backup_included=$false} | ConvertTo-Json -Depth 8),$SnowUtf8)
    $SnowChecks = @(Get-ChildItem -LiteralPath $SnowContent -Recurse -File | ForEach-Object {
        $SnowRelative = $_.FullName.Substring($SnowContent.Length+1) -replace '\\','/'
        ((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() + '  ' + $SnowRelative)
    })
    [IO.File]::WriteAllLines((Join-Path $SnowContent 'SHA256SUMS.txt'),$SnowChecks,$SnowUtf8)
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $SnowZip = Join-Path $SnowDestination 'STEP2-Windows-evidence.zip'
    [IO.Compression.ZipFile]::CreateFromDirectory($SnowContent,$SnowZip)
    $SnowArchive = [IO.Compression.ZipFile]::OpenRead($SnowZip)
    try {
        foreach ($SnowFile in @(Get-ChildItem -LiteralPath $SnowContent -Recurse -File)) {
            $SnowRelative = $SnowFile.FullName.Substring($SnowContent.Length+1) -replace '\\','/'
            $SnowEntry = $SnowArchive.GetEntry($SnowRelative)
            if (-not $SnowEntry) { throw 'ZIP_ENTRY_MISSING' }
            $SnowStream = $SnowEntry.Open()
            $SnowHashAlgorithm = [Security.Cryptography.SHA256]::Create()
            try { $SnowHash = ([BitConverter]::ToString($SnowHashAlgorithm.ComputeHash($SnowStream))).Replace('-','') }
            finally { $SnowStream.Dispose(); $SnowHashAlgorithm.Dispose() }
            if ($SnowHash -ne (Get-FileHash -LiteralPath $SnowFile.FullName -Algorithm SHA256).Hash) { throw 'ZIP_READBACK_HASH_MISMATCH' }
        }
    } finally { $SnowArchive.Dispose() }
    $SnowSummary = [ordered]@{
        status=if ($SnowMissing.Count -eq 0) { 'STEP2_WINDOWS_EVIDENCE_PRESERVED' } else { 'STEP2_WINDOWS_EVIDENCE_PRESERVED_OPTIONAL_MISSING' }
        phase1_success_count=$SnowPhase1.Count
        phase2_final_success=$true
        source_copy_hashes_match=$true
        zip_readback_matches=$true
        files=$SnowRecords.Count
        zip_bytes=(Get-Item -LiteralPath $SnowZip).Length
        zip_sha256=(Get-FileHash -LiteralPath $SnowZip -Algorithm SHA256).Hash
        folder_name=$SnowLeaf
        missing_optional=@($SnowMissing.ToArray())
        tests_rerun=$false
        database_connection_performed=$false
        source_changed_or_deleted=$false
    }
    [IO.File]::WriteAllText((Join-Path $SnowDestination 'SUCCESS.json'),($SnowSummary | ConvertTo-Json -Depth 5),$SnowUtf8)
    $SnowSummary | ConvertTo-Json -Depth 5
} catch {
    $SnowCode = if ($_.Exception.Message -cmatch '^[A-Z0-9_]+$') { $_.Exception.Message } else { 'LOCAL_EVIDENCE_OPERATION_FAILED' }
    [ordered]@{status='EVIDENCE_PRESERVATION_STOPPED';code=$SnowCode;tests_rerun=$false;database_connection_performed=$false;source_changed_or_deleted=$false} | ConvertTo-Json
    throw 'EVIDENCE_PRESERVATION_STOPPED'
}
