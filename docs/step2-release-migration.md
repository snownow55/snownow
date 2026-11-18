# STEP2：開発DB適用・復旧手順

更新：2026-11-18（日本時間）。[最終検証報告書](step2-final-verification-report.md) / [84項目CSV](step2-verification-results.csv)。

## 現在の承認範囲

本体 `snownow55/snownow`、`feat/supabase-auth`、基点 `0d1516686e6248757f0ebe96e9f033cc045ffc47`。
84/84の隔離検証はユーザー承認済み。文書更新・成果物保全・STEP2のローカルコミットまで承認。
**実Supabaseへの接続/変更、GitHub push、Vercelデプロイ、mainマージ、STEP3実装は未承認。** 下記の実環境操作は次回の明示承認後だけに行う。SQL A〜Dと成功済み84項目の再実行は不要。
STEP3仕様文書は保管しSTEP2コミットから除外する。元環境・バックアップ・失敗を含む検証結果は削除しない。

## 固定したDB/API契約

投稿7項目 `resort/area/snow_type/snowfall/roughness/crowd/comment`。稼働用conditionなし、新規湿雪拒否、履歴の湿雪は保持。旧星評価は非公開保管表/バックアップにのみ保持。
`submit_snow_post(payload jsonb)`と`posting_status()`をユーザーJWTで実行。全施設共通で前回成功時刻から60分。ユーザー単位advisory lockと単一トランザクションで投稿・制限時刻を更新する。未確認/匿名/未ログイン、投稿者偽装・不正入力をDBでも拒否。
公開ビューはsecurity_invokerと公開9列のみ。非公開列/制限/旧保管表を保護。通常ロールの直接書き込み/TRUNCATE/対象シーケンス権限を撤去し、5新規関数のPUBLIC EXECUTEを個別撤去。専用ロールはAuthスキーマUSAGEなし。postgres所有・固定search_path・引数なしの限定ヘルパーを使い、管理Authロールの所属追加で回避しない。
`rls_auto_enable`や無関係な関数/シーケンス/グローバル既定権限を一括変更しない。

掲載は9地域63施設、DB総数64（士別あさひを非掲載で保持）。既存59施設IDを維持。新規は豊富温泉、音威富士、知内町営、ダイナスティ、暑寒別岳。メムロは道央。ノーザンアークリゾートは内部名を保持して表示名だけ統一。
**暑寒別岳スキー場は旭川・富良野 `asahikawa-furano`・表示順11で確定済み。** マスター/SQLは既に一致しておりSQL変更は不要。
通常画面/本体内蔵デモは同一マニフェストを参照。既存架空投稿30件（湿雪4件）の値・順序を保持し、新施設の架空投稿を増やさない。

SQL `supabase/migrations/20261115000100_beta_foundation.sql`：26,512 bytes、SHA-256 `2E3A036D0F6305149601170E6B4718BB1AC0850E555DF9AF2497065C88753286`。今回更新しない。

## 検証済みと未確認の境界

80DBチェック、実バックアップの別コンテナ復旧、復元DBでの中間/末尾故障注入、実GoTrue/PostgREST/JWTの架空ユーザー連携、CLI3.2.0の履歴/原子性/再適用が成功。元実バックアップをAuthサービスに渡したわけではない。
PostgreSQL17.11 / supabase/postgres:17.11.0.007 / GoTrue2.197.0 / PostgREST14.18 / CLI3.2.0（Linux版）。
Hostedの管理権限制約・全面復元、実SMTP配送、gateway/key設定、稼働中PostgRESTのキャッシュ更新、ブラウザ/SSR/APIを含むHosted+Vercelの一貫E2Eは未確認。
ログアウト後Refresh Tokenは拒否されるが、既発行Access JWTは有効期限までPostgRESTで受理される。即時失効は保証しない。

## Windows上の証跡を保全する

`scripts/Preserve-Step2Evidence.ps1`をWindowsで実行する。ネットワーク/DB/Git操作はしない。元ファイルを変更せず、最終スクリプト・各段階の結果JSON・80チェックの状態/スクリプトを許可リストだけで新しい保護フォルダーへコピーし、元/コピーのSHA-256とZIP読戻しを確認する。
DBダンプ、roles/schema-reference SQL、private.log、.env、Docker設定/ボリュームはコピーしない。最終JSON/スクリプトに秘密らしい実値があれば中断し、内容を表示しない。報告は件数・一致・段階名だけ。
Windowsの原本はCodexに無いので、その出力を受け取るまでは「保全スクリプト準備済み」であり「Windows保全完了」ではない。既存退避ZIPは最新成功版を収録していない場合がある。

## 接続承認後の最小事前確認

1. 対象は必ずsnownow-dev。Dashboardの名前/Project Reference/接続方式とCLI指定を照合。SQLのcurrent_database()だけでは本番との区別はできない。本番snow-condition-appには接続しない。
2. 最新バックアップとの増分・件数・既存59施設ID/行ハッシュ・ACL/イベントトリガー等の変更だけ確認する。A〜Dを一律にやり直さない。必要な新規確認は `supabase/audit/step2-preapply-readonly.sql` のカタログ/実効権限/衝突/依存を使う。読み取り専用トランザクションで、本文・メール・認証値・関数本文を出さない。今回そのSQLは実行しない。
3. バックアップが適用直前の状態を代表することを確認。差分があれば同じ保護方式で取得し、関係する復元検証だけ追加する。旧バックアップを上書きしない。FreeのDashboard復元/PITRを前提にしない。
4. 対象履歴、実際の適用セッションのcurrent_user=postgres、必要なAuth USAGE/EXECUTE/SELECT(id,email,email_confirmed_at,is_anonymous)/REFERENCES(id)、CREATEROLE、アプリ所有権を確認。CLI用一時ログインロールがpostgresと同じ権限だと推測しない。
5. Hostedでの復旧経路を下節に従って具体的なファイル/担当/停止時間に落とす。未確定なら適用しない。単に「ローカル全面復元が成功したからHostedでもpg_restore可能」と判断しない。

## CLI3.2.0の使い方（今は接続しない）

Windows版の導入/認証は未確認。承認後に公式配布物のSHAと`--version`/`--help`を確認する。CLI2系のリンク済み対象向け引数を混ぜない。今回検証したCLI3.2.0は`--remote`で対象を明示する。

```powershell
$SnowDevRef = Read-Host '照合済みsnownow-devのProject Reference'
supabase --version
supabase migration list --remote $SnowDevRef
supabase db push --remote $SnowDevRef --skip-vault --dry-run
# 全条件・適用承認が揃った後だけ
supabase db push --remote $SnowDevRef --skip-vault --yes
```

このProject Reference指定によるHosted認証は未検証。隔離で成功したのはループバックDB URL指定である。CLIログイン/実DB接続が管理用ロール作成等を行う場合があるため、読み取り専用調査扱いで事前実行しない。接続承認にはこの影響も含める。
トークン/DBパスワードをURL・引数・チャット・Git・ログへ入れない。対話の非表示入力を使い、その方式が使えなければ停止して資格情報の渡し方を確認する。Native CLIとDocker版で資格情報/ファイルの保管場所が異なることにも注意する。

履歴/構造が想定外、適用済み版がある、dry-runに他のファイルが含まれる場合は中断。seed/Vault設定反映、config push、db reset、未実行版を適用済みにするmigration repairは行わない。
SQL Editor全文適用＋履歴repairへ無断で切り替えない。実行方式と適用ロールを確認したCLIで1ファイル/履歴の原子性を使う。

## Hostedでの復旧方針（アプリ領域限定、復旧用SQLは未実行）

### A. 適用途中に失敗

1. 投稿停止を継続。接続断なら旧セッションの終了を確認し、履歴とアプリカタログ/件数/行ハッシュを読み取る。
2. 同一トランザクションの失敗なら構造・行・RLS/ACLは戻る。81/82で保全確認済みだがHosted独自ガードレールは未実証。シーケンス欠番は許容し、現在値を戻さない。
3. `20261115000100`が未記録で旧構造が保全されていれば、原因修正と再レビュー後に再適用を承認する。SQL断片追加や無条件再実行はしない。

### B. 適用成功後に切り戻す必要が生じた場合

**目的はまず書き込み停止の保全状態へ戻すこと。旧い広い書き込み/閲覧権限を復活させて旧APIを再開しない。**

復旧計画の対象はpostgres所有の4オブジェクト（public.regions、public.resorts、public.snow_postsビュー、snownow_private.snow_posts）とその従属index/sequence/constraint/RLS/policy/ACL、旧email_verified関数だけ。auth/storage/extensions、管理用rls_auto_enable、7イベントトリガー、グローバルロール定義/既定ACLは復元対象から除外する。新設ロールをDROP OWNEDで一括処理しない。

適用前に以下のオフライン準備を済ませる：

1. 実バックアップのTOCから上記アプリ対象と従属オブジェクトのIDだけを許可した `dev-app-recovery.list` を作り、対象と除外を人がレビューする。スキーマ全体指定や文字列publicだけの一括抽出は管理関数を巻き込むため使わない。schema自体のCREATE/OWNER変更も除外し、既存のpublic/privateを使う。
2. `pg_restore --use-list`でアプリ復旧SQLを私用フォルダーへ展開する。本文を含むためGit・チャットへ出さない。Dockerのnetwork=noneのクライアントでよく、DB接続は不要。

```text
pg_restore --use-list=dev-app-recovery.list --file=dev-app-recovery.sql db-full.dump
```

3. `before-quarantine.sql` と `after-lockdown.sql` を別レビューで作成する。前者は既知のpublic投稿ビュー/新RPC依存だけを外し、現行のアプリ実表・元保管表を新しい非公開復旧スキーマへALTER TABLE ... SET SCHEMAで退避する。行をDROP/DELETEせず、Auth表や管理トリガーには触れない。テーブル/シーケンス移動時の名前衝突、外部依存、関数所有ロールへのSET ROLEの可否を照合し、不明依存があれば中断。CASCADEは使わない。
4. 旧表名の空きを作った後、元のアプリ表/ビュー・行・ID・ポリシー等を復旧SQLで再構築する。新規/退避データは別スキーマに残る。後者のlockdownは復旧表/ビューの公開SELECT、INSERT/UPDATE/DELETE/TRUNCATEと列書き込みを停止し、過去の広い権限が外部へ露出するのを防ぐ。旧email_verifiedの認証ユーザーEXECUTEも復活させない。復旧した構造/行/管理者権限と、公開再開の許可は分離する。
5. この3ファイルを**適用前の隔離コピーで1回だけ**検証する。これは成功済み84の再実行ではなく、追加したHosted向けアプリ限定切戻し経路の新規検証。実Hostedでは元ACLと新しい検証/復旧操作に必要な所有権を照合し、postgresで実行可能と確認するまで採用しない。

切戻し当日（別承認後）：

1. 新しいアプリへの投稿を止め、適用後の新規投稿・制限時刻・Auth状態を含む緊急バックアップを新規保存。
2. current_user=postgresとアプリ所有権、退避先非公開、許可TOCを再確認。
3. 単一セッション/トランザクションで前処理→復旧SQL→公開停止を行う。

```text
psql -X --set=ON_ERROR_STOP=1 --single-transaction \
  --file=before-quarantine.sql --file=dev-app-recovery.sql --file=after-lockdown.sql
```

上の接続先/認証は検証済みの安全なサービス設定や非表示入力で与え、URL/引数にパスワードを含めない。対象は必ず開発プロジェクト。このコマンドは未実行。

4. 元16投稿/湿雪1・59施設ID・9地域・旧構造と、退避した適用後データの保全を確認。Authユーザー2人と管理関数/イベントトリガーの定義・状態が変更されていないことも確認。
5. CLI履歴は復旧構造と一致するよう別レビューした復旧マイグレーション/履歴処理を行う。履歴行だけ削除して再適用させない。Appは保全停止状態を維持し、修正して前進するか旧コードとの整合を取るかを承認してから再開する。

これはHostedで可能な「所有アプリ領域だけの通常DDL/DML」に限定する設計であり、今回実サービスで実行可否を確認したわけではない。安全な3ファイルの生成・隔離検証・Hosted権限確認が未完なら**適用NO-GO**。Auth管理領域そのものが破損した場合はこの経路の対象外で、プロバイダー支援/別途承認した復旧が必要。

## DBとAPIの切替・Git/Preview反映

1. STEP2対象だけローカルコミットしてcommit IDとSQLハッシュを固定。STEP3仕様保管ファイルを除外。pushはまだしない。
2. 別承認後、専用PreviewのURL/publishable keyがsnownow-devと一致し、SITE_URL/Auth callback/HTTPS Cookie/Origin・共通Sensitive変数の優先順位を値を出さず照合。
3. 切替枠で旧Previewの投稿を止めて開発DBへ適用。旧API直接INSERTと新RPCの間に互換性はないため、DBから新API反映まで停止を許容。旧書き込み権限を戻さない。
4. 旧ブラウザのcondition:nullだけ必要なら `SNOW_LEGACY_POSTS_UNTIL` の終了日時を承認。未設定は互換なし。星文字列やRPC余分キーを許可しない。
5. DB事後確認後、forceなしで `git push origin HEAD:feat/supabase-auth`。自動Preview配信を含めて承認が必要。main/Productionは対象外。
6. 新Previewのcommit ID・Ready・接続先・63施設を確認。承認済み開発アカウントでHosted/SSR/API統合と必要なメール/投稿を確認。実行で基準件数が変わる追加分は別記し、無断削除しない。

事後期待値（試験投稿前）：地域9・掲載63・総施設64・旧59ID不変、稼働16/湿雪1・保管16/湿雪1・Auth2、履歴20261115000100が1件。保管16件は同じ元投稿の保全コピーで公開二重表示しない。
公開9列/security_invoker、RLS/5新関数ACL/所有者/search_path、専用ロールAuth USAGEなし、直接書き込み/TRUNCATE/private参照不可、既存管理処理維持も確認。稼働中PostgRESTの認識は実環境で別途確認し、必要なreloadは承認した手順で行う。

## 未実施を維持するもの

本書更新は実Supabaseへの接続・適用を許可/実行するものではない。Hostedアプリ限定切戻し3ファイルの作成/実行可否、実Authメール配送、Vercelを含む統合確認は未完。全DB復元や管理権限拡大で代替しない。
