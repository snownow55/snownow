# STEP2 開発Hosted適用の最終準備

2026-11-18 JST。実接続・適用・push・Vercel配信・STEP3実装は未承認/未実施。
基点コミット `84a29554d1e4ea299411ed19fa6810aecfae337b` の上に保全修正と本手順を追加する。
成功済み84項目を再実行しない。今回の追加検証は別枠。

## 準備の結論と残る実行条件

- Windowsで109ファイル一致、STEP3未追跡保持、証跡13ファイル/ZIP15エントリの読戻し成功をユーザー確認済み。ZIP 69,919 bytes。既存ZIPと成功記録は上書きしない。
- ZIPの13件の検索失敗は `/` と `\` の違い。辞書キーを `/` に正規化し、重複/危険パス/件数/内容ハッシュを検査する修正を本体スクリプトに反映。
- PowerShell→DockerシェルのCRLF混入はNodeヘルパーでUTF-8/LFのバイト列に変換。旧配布ZIPは変更せず、新しい配布時に `Complete-Step2Preparation.ps1` と `Invoke-LfDocker.cjs` を同梱する。既に成功したWindowsの取り込みをやり直す必要はない。
- 架空バックアップでアプリ限定復旧をPostgreSQL17.11・非superuser postgresで追加検証済み。適用後の新規投稿/制限表/旧保管表/施設を隔離スキーマに保全し、旧行・IDを復元して公開表/列の権限を停止。復旧途中失敗は原子的に戻る。
- **実バックアップ由来の許可TOC/復旧SQLのレビューと隔離リハーサルは未完**。Hostedの権限、最新差分、CLI接続/履歴/dry-run、Vercel統合も未確認。これらが揃うまで適用NO-GO。
- この復旧は旧アプリを公開再開する手順ではない。復旧後は停止状態を保ち、前進修正を別途承認する。

## アプリ限定復旧ファイルとレビュー境界

| ファイル | 用途 / 制限 |
|---|---|
| `supabase/recovery/freeze-writes.sql` | 適用前の別承認済みメンテナンス操作。旧投稿ビュー/裏表の表・列の書込権限だけを停止。Authや読取は止めない。未知の書込RPC/継承権限があれば先に調査し、このSQLだけで停止を保証しない。 |
| `scripts/Build-Step2AppRecovery.py` | DB接続なし。人が選択・レビューした実バックアップTOCと完全一致するIDだけを許可し、復旧SQLを新しい私用フォルダーへ生成。既存出力を拒否。 |
| `supabase/recovery/before-quarantine.sql` | 開発の既知view/private表構成だけを対象。非superuser postgres、所有権、未知の外部FK/view、退避先重複を確認。全対象表をロックし、適用後データを `snownow_step2_quarantine` へ移動。CASCADE/行削除なし。 |
| `dev-app-recovery.sql` / `.list` | **各実バックアップから私用領域に生成する未配布ファイル**。投稿本文を含むためGit・チャット・一般共有へ出さない。 |
| `supabase/recovery/after-lockdown.sql` | 同一トランザクション末尾。旧ACLが復元されても公開前に表/列/関連シーケンス/限定関数の権限を撤去。管理者postgres以外の通常アプリ経路は再開しない。 |

選択範囲：public.regions/resorts/snow_posts(view)、snownow_private.snow_posts、旧email_verified()、各表のindex/identity sequence/constraint/policy/RLS/ACL/行/sequence state。schema自体、Auth/storage/extensions、管理関数/イベントトリガー、グローバルrole/default ACL、CLI履歴は復元しない。
生成器の許可リストは確認済み旧構成の名称に限定する。未知のindex/sequence名やトリガー/関数依存がある場合は無条件に追加せず、TOCとカタログで対象表への所属・必要性をレビューして生成器/試験を改訂する。
`before-quarantine.sql` は新RPC所有者snownow_post_writerにSET ROLEするため、postgresのSET可能な所属と、対象関数/スキーマ所有権が必要。退避先USAGE/CREATEは必要期間だけ付与し末尾で撤去する。

私用フォルダーはWindowsで事前に所有者+SYSTEMだけのACLを設定する。Pythonのmode=0700だけではWindows ACLを保証しない。

```text
pg_restore --list db-full.dump > dev-app-full.toc
# 接続なし。TOCのアプリ対象と従属IDだけを人が確認して approved-app.list を作成。
python scripts/Build-Step2AppRecovery.py --pg-restore <pg_restore実行ファイル> --dump <私用dump> --approved-list <私用approved-app.list> --output <まだ存在しない私用出力フォルダー>
```

生成後はgeneration-receipt.jsonのdump/SQL SHA-256を保存。実バックアップを隔離DBへ復元し、移行→架空の追加投稿→下記3ファイルによる切戻しを検証する。既存の成功済み試験DBを再利用して上書きしない。実Auth/SMTPサービスはこの実データコピーに接続しない。

```text
psql -X -W "service=snownow-dev" --set=ON_ERROR_STOP=1 --single-transaction --file=before-quarantine.sql --file=dev-app-recovery.sql --file=after-lockdown.sql
```

これは将来のHosted切戻しコマンド。今は実行しない。隔離リハーサルは別のローカル接続定義を使用する。ファイル中のBEGIN/COMMITやpsql接続切替はレビューし、単一トランザクションを破らないことを確認する。

## 適用前：接続承認後にだけ実施する確認

1. **対象固定**：Dashboardのsnownow-dev、Project Reference、接続host/port、CLI対象、Vercel PreviewのURL/keyのプロジェクトを照合。Production/mainは対象外。current_database()単独で対象判定しない。
2. **認証とTLS**：パスワードなしの私用pg_service.confに照合済みhost/database/user=postgres/sslmode=verify-fullと必要CAを設定。接続は非表示プロンプトで渡す。パスワードをURL・引数・Git・ログへ入れない。CLIは承認したログイン/スコープtoken保管方式を採用し、隠し入力が利用できない場合は停止する。接続方式の変更は再照合する。
3. **権限**：`supabase/audit/step2-preapply-readonly.sql` を実行。実適用セッションのcurrent_user=postgres、非superuser、CREATEROLE、public/privateの所有/CREATE、AuthのUSAGE（必要なGRANT OPTION含む）/uid EXECUTE/users必要列SELECT/id REFERENCESを確認。管理ロールへの所属追加・SUPERUSER化で回避しない。CLI一時ログインがpostgres同等だと推測しない。
4. **差分**：`supabase/audit/step2-backup-delta-readonly.sql` と既存のカタログ/管理関数・イベントトリガーのハッシュを、私用バックアップinventoryと比較。投稿/施設の行ハッシュ、59施設ID対応、Auth状態、列/ACL/RLS/ポリシー、関数/シーケンス/外部依存を確認。件数16/59/Auth2等を新しい正当な変更で上書き固定しない。差分は原因・新基準値・復旧TOCへの影響を記録する。
5. **停止と最終バックアップ**：旧画面だけで停止扱いにしない。未知の書込RPC/権限継承を確認後、別途承認されたfreeze-writes.sqlで旧投稿の表/列権限を停止し、他の管理者書込も止める。既承認の方式で最新バックアップを新規保存しSHA-256/件数/ID/カタログinventoryを確定。freezeによる意図したACL差分を明記。Freeプランの全面復元/PITRを前提にしない。
6. **復旧ゲート**：この最新バックアップのapp限定復旧3ファイルをレビュー・隔離リハーサル。非公開退避先、SET ROLE、イベントトリガー/管理機能の不変、旧行と適用後追加分の保全を確認。未完なら投稿停止を維持し、適用しない。

## CLI3.2.0：履歴・dry-run・適用

公式Linux版3.2.0を公式checksums.txtで照合し、実行した `--help` で以下を確認済み。Windows版実行とHosted認証は未確認。
`--remote=<ref|branch|url>` は任意値引数なので、明確な `--remote=$SnowDevRef` 形式に統一する。未指定だとlocalが既定。旧2系の`--linked`を混ぜない。

```powershell
$SnowRepo = Read-Host '承認済みコミットを保持する本体リポジトリのパス'
$SnowDevRef = Read-Host '照合済みsnownow-devのProject Reference'
supabase --version
supabase migration list "--remote=$SnowDevRef" --workdir $SnowRepo
supabase db push "--remote=$SnowDevRef" --workdir $SnowRepo --skip-vault --dry-run
# 適用の明示承認と全ゲート通過後だけ
supabase db push "--remote=$SnowDevRef" --workdir $SnowRepo --skip-vault --yes
```

`migration list`やdry-runもHosted接続を伴い、管理API/一時ロール作成等の影響を持ち得る。読み取り専用調査と同一視して事前実行しない。公式ヘルプではremote接続の方法次第でdatabase_write/database_pooling_config_read/projects_read等が必要とされる。必要権限だけを採用し、資格情報の値は共有しない。

dry-runの出力は **20261115000100_beta_foundation.sqlの1件だけ**。他の未反映/既適用版・ローカル欠落・履歴衝突は停止。dry-run成功はDDL権限やHosted実適用成功の保証ではない。
`--include-all/--include-roles/--include-seed`、config push、Vault反映、db reset、履歴repairは使わない。
適用直前/直後のSQL SHA-256は `2E3A036D0F6305149601170E6B4718BB1AC0850E555DF9AF2497065C88753286`（26,512 bytes）。実行ログに秘密情報を保存せず、対象/時刻/操作者/exit code/適用版だけを私用記録する。

## DB適用 → Vercel Preview → 動作確認

1. 停止枠・最終バックアップ・上記ゲートを確認してDB適用。接続断時は再実行せず履歴とカタログを確認する。
2. CLI履歴に20261115000100が1件、公開9列/security_invoker、新RPC/専用ロール/固定search_path/RLS/表列ACL、Auth/管理処理の不変を確認。施設9地域/掲載63/総数64・旧59ID維持。投稿/保管/Auth件数は直前inventoryの値と比較し、試験投稿前の新規件数を混ぜない。稼働PostgRESTのスキーマ認識も確認し、reloadは必要時だけ承認した方法で行う。
3. **pushは自動Previewデプロイを起こし得るため、両方の承認後だけ** `git push origin HEAD:feat/supabase-auth`。forceなし。main/Productionを配信しない。著者メールのVercel所属、Git連携のブランチ/環境、対象コミットを事前照合する。
4. Preview専用 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `NEXT_PUBLIC_SITE_URL` を照合。認証keyの実値をログに出さない。Sensitive共通変数との優先順位も確認。Auth Site URL/redirect allowlist/HTTPS Cookie/Originを確認し、別承認で必要な設定変更だけ実施する。
5. 新Previewが対象commit/Readyでsnownow-devを参照することを確認。匿名一覧、ログイン/未確認拒否、メール確認/回復配送、SSRセッション、Origin拒否、投稿7項目/RPC/60分制限を承認済み開発アカウントで確認。これはHosted統合確認であり84項目全体の再実行ではない。試験投稿は追加分として記録し、無断削除しない。
6. 成功後だけ投稿受付を再開。旧Previewは停止/アクセス制限を継続。旧コードだけに戻すと新DB契約と不整合になるため、単独のVercelロールバックで復旧完了とはしない。

## 失敗時の確定した分岐

- **migration失敗/接続断**：旧セッション終了・履歴・カタログ・行ハッシュを確認。原子的に戻っていれば投稿停止を保ち原因修正後に再承認。シーケンス値を巻き戻さず欠番許容。断片SQLや無条件再実行をしない。
- **DB成功・Preview失敗**：まず投稿を再停止/アクセス制限。新データ/制限時刻を含む緊急バックアップを新規保全し、DB/Previewのどちらの障害か切り分ける。DBが正常なら新コードを修正して前進する方を選べる。旧APIの広い権限は戻さない。
- **アプリDB切戻しが必要**：別の復旧実行承認後、current_user/所有/退避先不存在/バックアップと3ファイルのハッシュを照合し、単一トランザクションでbefore→app復旧→lockdown。失敗時は全体ロールバックして止まり、成功時も外部受付を停止したまま旧行/新規退避/管理不変を確認。
- **CLI履歴**：緊急切戻し時に既存適用履歴を消したりrepairで未適用にしない。適用記録は事実として保持し、その間のdb pushを禁止する。復旧後に改めて新しい前進修正マイグレーションとデータ統合計画をレビュー/承認する。成功しても同じ移行SQLを再適用しない。
- **Auth等の管理領域の障害**：本アプリ限定復旧では扱わず、別途承認したプロバイダー支援/復旧経路へ進む。

## 今回の追加検証と制限

- ZIP6ケース：通常/バックスラッシュ/混在はPASS、重複/欠落/破損は意図した停止をPASS。LF入力4ケースとPS構文もPASS。実Windows5.1/ACLの修正版実行は未確認（Cloud PS7.7でACLのみ模擬）。既存Windows保全成功は保持する。
- 新規のUnixソケット専用PG17.11架空DBで、freeze、限定TOC/復旧SQL生成、非superuserでの復旧、途中失敗ロールバック、適用後行の退避、表/列ACL停止、管理不変をPASS。実バックアップとHostedでの実行可能性は別ゲート。
- CloudのDocker新規起動は容量不足で不可。既存ファイルを削除せず、公式PostgreSQL17.11バイナリをRAMだけに展開して追加検証した。
- 新しいソース/コミット/検証結果はRAM内。Windows保全済みの84a29554d1e4とは別で、永続退避とWindowsへの受渡しが必要。旧配布ZIP/既存バックアップを上書きしない。
