# STEP2 最終検証報告書

作成・更新日：2026-11-18（日本時間）。ユーザーは隔離環境での84項目完了を承認済み。

## 結論・証跡の扱い

本体 `snownow55/snownow`、`feat/supabase-auth`、基点 `0d1516686e6248757f0ebe96e9f033cc045ffc47`。
既存80チェック＋追加4検証群＝84項目すべてPASS。補助チェック・引き継いだPASSは重複加算しない。001〜080には環境・試験前提も含み、84本の独立したブラウザE2Eではない。
[全84項目CSV](step2-verification-results.csv)と下表を参照。

証跡はユーザー提供のWindows JSON表示・スクリーンショットおよび保存済みCloudログ。Windows最終JSON原本・実DBダンプ・秘密ログをCodexが取得したわけではない。今回84項目は再実行していない。

| 区分 | 結果 | 実施環境・範囲 |
|---|---|---|
| 001〜080 | 80/80 PASS | 実バックアップ由来の隔離DBと試験コピー。JWT claimsはSQLで試験設定 |
| 081 | PASS | 実バックアップを別コンテナへ復旧・照合 |
| 082 | PASS | 復元DBで移行中間・末尾失敗時の構造・データ・権限等保全 |
| 083 | PASS | 実GoTrue・PostgREST・JWT。別の人工DB・架空ユーザー。実バックアップ不使用 |
| 084 | PASS | CLIの履歴・失敗時非記録・正常適用・再適用・非superuser |

Windows状態：`ISOLATED_RUNTIME_DB_TESTS_PASSED`（80）、`PHASE1_GIT_RESTORE_ROLLBACK_PASSED`、`PHASE2_AUTH_POSTGREST_CLI_PASSED`。

別集計の既存ログ：build/lint/型チェックPASS、単体33、E2E74、Preview Origin3、設定不足時2。人工DBの新規・本番型・開発型もPASS。すべて既存結果を引き継ぎ、今回再実行していない。

## 実装

- conditionは新規UI・型・API・RPC・稼働テーブル/公開ビューから撤去。非公開アーカイブ・バックアップ・拒否テスト・期限付きnull互換受付は意図的な履歴/互換参照。
- 湿雪を新規フォーム・API・RPCで拒否し、既存湿雪は保持。保存CHECKは履歴互換を許可。本体内蔵デモの既存30投稿（湿雪4件）を改変しない。
- 7入力項目だけを専用RPCへ渡し、本人ID・時刻をDBで決定。メール未確認・匿名認証・未ログイン拒否。DBでも型・値・有効施設・UTF-16長を検証。
- 全施設共通ユーザーごと60分。transaction advisory lockと同一トランザクションで同時初回も1件だけ成功。失敗・ROLLBACKは枠を消費しない。
- 本人の投稿可能時刻取得、残り時間、429/Retry-After、状態取得失敗時の送信停止。signOut失敗を捕捉し、パスワード変更済みとログアウト失敗を区別。
- 公開9列のsecurity_invokerビュー、非公開user_id/制限/アーカイブ、直接書き込み/TRUNCATE/不要な列・シーケンス権限の撤去。5新規関数のPUBLIC EXECUTEを個別撤去。
- 投稿用NOLOGIN/NOINHERIT/NOBYPASSRLSロールと、postgres所有・引数なし・固定search_pathの限定ID/認証ヘルパー。管理Authロール所属追加、Auth USAGEの過剰付与、グローバル既定権限の一括変更はしない。
- `rls_auto_enable`等の管理関数・無関係なシーケンスを一括REVOKEしない。

## 施設マスター

通常画面と本体内蔵デモは同じ9地域・掲載63施設。59既存行のIDを保持し、士別あさひを非掲載で保持、新規5件を追加するため総数64行。
豊富温泉、音威富士、知内町営、ダイナスティ、暑寒別岳を追加。メムロを道央へ変更。ノーザンアークリゾートは内部名を維持し表示名のみ統一。
**暑寒別岳スキー場の旭川・富良野（asahikawa-furano）分類は確定済み。** マスターとSQLは既に同値のため、今回の変更は文書表記のみ。表示順11。地域別掲載数14/6/11/5/4/6/2/4/11。
営業用・一般公開用デモの別リポジトリは変更対象外。

## 復旧・ロールバック

元の論理バックアップ：地域9・施設59・投稿16・湿雪1・Authユーザー2。必須7ファイルの保存SHAと取得前後の一致を確認。別コンテナで5表（地域/施設/投稿/Auth users/Auth identities）の行ハッシュ、拡張5種の版、イベントトリガー7件の設定・定義ハッシュ等が一致。
移行中間と末尾の故障注入で構造・全対象行・RLS・関数・トリガー・権限・ロール状態の保全を確認。シーケンス定義は保持し採番は巻き戻さないため、現在値の完全一致は要求しない。元IDは不変。

復元時だけ隔離管理権限を使用し、移行自体は非superuserのpostgres。Hostedイベントトリガー所有権を再現するための一時的superuser化は隔離復元トランザクション内限定。実Supabaseへ持ち込まない。
一部拡張所有者のHosted元との完全一致、Hosted既存プロジェクトへの全面復元、適用成功後の実運用切戻しは未検証。
Freeプランでは取得済み論理バックアップを復旧の基礎とし、Dashboard自動復元/PITRが使えると仮定しない。DBロールパスワード、外部署名/暗号鍵、Auth/SMTP/OAuth/Vercel設定、Storageファイル実体はSQLダンプだけで復元できない。

## Phase2実連携

PostgreSQL17.11 / GoTrue2.197.0 / PostgREST14.18 / CLI3.2.0。ネットワークなし親コンテナの名前空間を共有し、ポート未公開、SMTPはコンテナ内受信だけ。
登録・未確認ログイン拒否・メール確認・ログイン・匿名認証拒否、偽装/不正入力拒否、HTTP8同時1成功、60分、回復・パスワード変更・ログアウト後Refresh Token拒否を確認。CLIの故障注入による非記録/保全、正常1回記録、履歴表示、再適用無変更、非superuser適用も成功。
ハーネス不備はdocker cp→標準入力転送、隔離Authロールsearch_path=auth、標準auth.uid()の再利用に修正。後者は定義・所有者不変を確認。実移行SQLは変更していない。Alice/Bobの登録・初回認証を再実行せず既存セッションで再開し、回復試験用のBobの架空パスワードだけ準備した。

ログアウト後も発行済みAccess JWTをPostgRESTが有効期限まで受理することを観測。Refresh Token拒否はPASSだが、即時Access JWT失効は保証していない。今回仕様外のため84項目FAILとはしない。

## 未確認・制限

- 実Supabaseの管理ロール/イベントトリガー/拡張制約下での適用・復旧。
- 稼働中PostgRESTの自動スキーマキャッシュ更新。試験では移行後に起動。
- Hosted gateway・publishable key・実JWT設定・外部SMTP配送/制限・Redirect URL。
- ブラウザ→Next.js/SSR Cookie→実Auth→PostgREST→DBの同一Hosted/Vercel環境E2E。アプリE2Eはmockを含みPhase2は直接HTTP。
- Vercel専用Previewの現在の変数・優先順位。本番/Preview共通Sensitive値を確認済みとしない。
- Hostedでの全面復元/PITR、直近バックアップ後の実DB差分。
- ユーザー横断/IP単位の総量制限は対象外。端末時計は残秒UIに影響し得るがDB許否はDB時刻。

## 現在と次の境界

ユーザーは文書更新・Windows証跡の保全準備・STEP2だけのローカルコミットを承認。実Supabase接続/変更、push、Vercelデプロイ、mainマージ、STEP3実装は未承認。
STEP3仕様文書は保持しコミットから除外する。[移行・復旧手順](step2-release-migration.md)の事前確認と復旧成立条件が満たされてから、別承認で適用へ進む。

移行SQL：20261115000100_beta_foundation.sql、26,512bytes、SHA-256 `2E3A036D0F6305149601170E6B4718BB1AC0850E555DF9AF2497065C88753286`。
Windows最終スクリプト・JSONはWindows保全スクリプトで原本のままコピーし、原本/コピー双方のSHAを照合する。CodexによるWindows原本保全完了の確認は、その実行結果を受け取るまで未確認。

## 個別結果

|番号|分類|項目|結果|
|---|---|---|---|
|001|前提・隔離|開始状態が試験コピー準備済み|PASS|
|002|前提・隔離|対象コンテナ・DB識別子|PASS|
|003|前提・隔離|コンテナ存在|PASS|
|004|前提・隔離|実行中・外部ネットワークなし|PASS|
|005|前提・隔離|許可イメージ一致|PASS|
|006|前提・隔離|ポート公開なし|PASS|
|007|前提・隔離|想定外マウントなし|PASS|
|008|前提・隔離|準備用管理者の確認|PASS|
|009|前提・隔離|postgres非superuser|PASS|
|010|前提・隔離|掲載63・投稿16・Auth2の基準件数|PASS|
|011|前提・隔離|親DBとコピーの行ハッシュ一致|PASS|
|012|前提・隔離|掲載63・非掲載施設保持|PASS|
|013|専用ロール|NOLOGIN・NOINHERIT・NOBYPASSRLS・非superuser|PASS|
|014|専用ロール|AuthスキーマUSAGEなし|PASS|
|015|anon|専用ロール所属なし|PASS|
|016|anon|公開16投稿を参照可能|PASS|
|017|anon|非公開user_id参照拒否|PASS|
|018|anon|制限表参照拒否|PASS|
|019|anon|保管表参照拒否|PASS|
|020|anon|TRUNCATE拒否|PASS|
|021|anon|直接UPDATE拒否|PASS|
|022|anon|直接DELETE拒否|PASS|
|023|anon|公開ビューINSERT拒否|PASS|
|024|anon|IDヘルパー実行拒否|PASS|
|025|anon|認証ヘルパー実行拒否|PASS|
|026|anon|文字長ヘルパー実行拒否|PASS|
|027|authenticated|専用ロール所属なし|PASS|
|028|authenticated|公開16投稿を参照可能|PASS|
|029|authenticated|非公開user_id参照拒否|PASS|
|030|authenticated|制限表参照拒否|PASS|
|031|authenticated|保管表参照拒否|PASS|
|032|authenticated|TRUNCATE拒否|PASS|
|033|authenticated|直接UPDATE拒否|PASS|
|034|authenticated|直接DELETE拒否|PASS|
|035|authenticated|公開ビューINSERT拒否|PASS|
|036|authenticated|IDヘルパー実行拒否|PASS|
|037|authenticated|認証ヘルパー実行拒否|PASS|
|038|authenticated|文字長ヘルパー実行拒否|PASS|
|039|PUBLIC EXECUTE|IDヘルパーPUBLIC EXECUTEなし|PASS|
|040|PUBLIC EXECUTE|認証ヘルパーPUBLIC EXECUTEなし|PASS|
|041|PUBLIC EXECUTE|文字長ヘルパーPUBLIC EXECUTEなし|PASS|
|042|PUBLIC EXECUTE|posting_status PUBLIC EXECUTEなし|PASS|
|043|PUBLIC EXECUTE|submit_snow_post PUBLIC EXECUTEなし|PASS|
|044|本人ID|専用ロールのauth.uid直接実行拒否|PASS|
|045|本人ID|限定ヘルパー経由の本人ID取得|PASS|
|046|認証|本人IDなし拒否|PASS|
|047|認証|メール未確認拒否|PASS|
|048|認証|匿名認証拒否|PASS|
|049|認証|anonのRPC拒否|PASS|
|050|認証|未確認ユーザーのclaims偽装拒否|PASS|
|051|認証|匿名ユーザーのclaims偽装拒否|PASS|
|052|入力|user_id偽装拒否|PASS|
|053|入力|condition追加拒否|PASS|
|054|入力|新規湿雪拒否|PASS|
|055|入力|未知の施設拒否|PASS|
|056|入力|非掲載施設拒否|PASS|
|057|入力|UTF-16長1002拒否|PASS|
|058|入力|area=null拒否|PASS|
|059|入力|snowfall数値拒否|PASS|
|060|入力|配列payload拒否|PASS|
|061|入力|UTF-16長1000許可|PASS|
|062|入力|ROLLBACKで枠を消費しない|PASS|
|063|入力|異常系後も元16投稿保持|PASS|
|064|同時投稿|試験ロック解放|PASS|
|065|同時投稿|8RPCに予期しないエラーなし|PASS|
|066|同時投稿|8RPCで成功1・制限7|PASS|
|067|同時投稿|追加投稿1件だけ|PASS|
|068|頻度|別施設も同じ制限・残秒・次回時刻|PASS|
|069|頻度|別ユーザー独立|PASS|
|070|頻度|59分拒否|PASS|
|071|頻度|60分許可|PASS|
|072|更新削除|本人UPDATE拒否|PASS|
|073|更新削除|本人DELETE拒否|PASS|
|074|更新削除|他人UPDATE拒否|PASS|
|075|更新削除|他人DELETE拒否|PASS|
|076|保全|試験コピー最終19投稿・Auth6|PASS|
|077|保全|湿雪1保持|PASS|
|078|保全|親DB行ハッシュ不変|PASS|
|079|保全|元コピー行ハッシュ不変|PASS|
|080|保全|最終postgres非superuser|PASS|
|081|追加検証|実バックアップの別コンテナ復旧|PASS|
|082|追加検証|移行中間・末尾失敗時の構造・行・権限等の保全|PASS|
|083|追加検証|実GoTrue・PostgREST・JWT連携（架空ユーザー）|PASS|
|084|追加検証|CLI履歴・失敗時非記録・正常適用・再適用|PASS|
