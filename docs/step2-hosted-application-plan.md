# STEP2 MVP：③ CLI履歴・dry-runの実施手順

2026-11-19 JST。手順の準備のみ。HostedのCLI接続・履歴/dry-runは今回未実行。
対象：snownow-dev / viidjrhaoxcvunbfdbni / aws-0-ap-northeast-1.pooler.supabase.com:5432。
新版SQL：26,166 bytes、SHA-256 `41126DCF8E0BFB0B1D583F2F52A05E9D34607B6A459A37E80006AF1167424B5D`。

## 接続前に確認

1. Windowsに新版のSQL/文書を取り込み、repoのremoteがsnownow55/snownow、branchがfeat/supabase-authであることを確認。既存未コミット変更とSTEP3仕様書を保持。
2. 公式Windows版Supabase CLI 3.2.0のバイナリを公式checksums.txtで照合。実行ファイルのフルパスを指定し、--versionが3.2.0であることを確認。Linux版での過去成功をWindows実行の証明に置き換えない。未準備なら停止。
3. Dashboard名とProject Refを目視確認。既存のDBパスワードを非表示入力する。値をチャット/引数/URL/Gitへ入れず、プロセス環境PGPASSWORDだけへ一時的に渡す。CA PEMは同じdevから取得済みのものを使用。
4. CLI3.2.0の--remote=<project ref>だけでは、環境設定によって一時ログインロール作成へ進む。今回の読取用途ではこの経路を使わない。passwordなしの直接DB URIを--remoteに指定し、libpqのPGPASSWORD補完を使う。URL内にパスワードを入れない。

## Windows PowerShell 5.1での予定コマンド（接続承認後のみ）

```powershell
$SnowRepo = (Read-Host '本体repoのフルパス').Trim().Trim('"')
$SnowCli = (Read-Host 'SHA照合済みSupabase CLI 3.2.0 exeのフルパス').Trim().Trim('"')
$SnowCa = (Read-Host 'snownow-dev CA PEMのフルパス').Trim().Trim('"')
$SnowSql = Join-Path $SnowRepo 'supabase/migrations/20261115000100_beta_foundation.sql'
if ((Get-FileHash -LiteralPath $SnowSql -Algorithm SHA256).Hash -ne '41126DCF8E0BFB0B1D583F2F52A05E9D34607B6A459A37E80006AF1167424B5D') { throw 'SQL_HASH_MISMATCH' }
& $SnowCli --version
# 3.2.0であることを確認してから、以下の接続部分へ進む。

$SnowReadOnlyUri = 'postgresql://postgres.viidjrhaoxcvunbfdbni@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=verify-full&options=-c%20default_transaction_read_only%3Don'
$SnowOldPassword = $env:PGPASSWORD
$SnowOldCa = $env:PGSSLROOTCERT
$SnowSecret = Read-Host '既存snownow-dev DB password（非表示）' -AsSecureString
$SnowPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SnowSecret)
try {
    $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($SnowPtr)
    $env:PGSSLROOTCERT = $SnowCa
    & $SnowCli migration list "--remote=$SnowReadOnlyUri" --workdir $SnowRepo
    if ($LASTEXITCODE -ne 0) { throw 'HISTORY_CHECK_STOPPED' }
    if ((Read-Host '履歴に想定外の差分がなく20261115000100未適用と確認できた場合だけ UNAPPLIED と入力') -cne 'UNAPPLIED') { throw 'HISTORY_REVIEW_STOPPED' }
    & $SnowCli db push "--remote=$SnowReadOnlyUri" --workdir $SnowRepo --skip-vault --dry-run
    if ($LASTEXITCODE -ne 0) { throw 'DRY_RUN_STOPPED' }
} finally {
    $env:PGPASSWORD = $SnowOldPassword
    $env:PGSSLROOTCERT = $SnowOldCa
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($SnowPtr)
    $SnowSecret.Dispose()
}
```

**この接続例自体はHosted未実証**。CLI3.2.0公式ソースの直接URI/libpq補完・options伝播に基づく予定手順。将来の③で実CLIの認証/実効ロール/SSL/読取動作を確認する。
read-onlyで履歴テーブル等の作成を試みて失敗した場合も停止し、読み取り専用を解除しない。
ログに資格情報を含めない。API認証要求・一時ロール作成・ネットワーク制限変更・Vault操作が発生する経路へ切り替えない。接続不明/権限不足も停止。

## ③の合格条件

- 同じdev endpoint、postgres実効ロール、TLS検証、既存認証で完了。読取接続のみ。
- 履歴とローカルmigrationが整合し、20261115000100は未反映。予定は20261115000100_beta_foundation.sqlの1件のみ。
- 新SHAと一致。他migration、同版適用済み、想定外の履歴/権限/DDL要求はNO-GO。
- --include-all/roles/seed、migration repair、db reset、Vault変更、dry-runを外したdb pushは実行しない。

③合格後に停止して報告。実適用・投稿停止の権限変更・削除・push・deploy・main・STEP3は別途明示承認まで禁止。
②の最新バックアップは実適用直前に1回取得する。実適用のコマンドをこの③の一括実行へ混ぜない。
