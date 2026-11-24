# 利用状況計測（適用前）

本番DB・Cron・Vercel設定は未変更。専用ブランチ feat/usage-analytics。既存認証・投稿・公式情報の処理は変更しない。計測フラグは未設定なら無効。

## 指標の意味

- Vercel Web Analytics: ダッシュボードの訪問者・PV・流入元。カスタム有料イベントは使わない。
- Supabase: 日本時間の日別PV、日替わりランダムIDのdistinct、PWA起動、PWA distinct、PWA利用率、OS、SNS、検知インストール。
- PWA利用率 = その日のstandalone利用ID数 / その日の全利用ID数。分子・分母は同じDBの全体行で計算し、Vercelの別方式の訪問者数と混ぜない。
- PWA起動はstandaloneのセッション開始。30分以上操作がない後の復帰も新セッション。ページ遷移・再描画では増やさず、再読み込みではPVのみ増える。OSのプロセス起動回数そのものではない。
- IDはJST日替わり・認証と無関係。同一保存領域のブラウザー/PWAは共有。同じ人でも端末・ブラウザー・保存領域が違えば別ID。iOSのPWAとSafariの保存領域分離、複数タブでの初回生成の競合、ストレージ消去により重複し得る。日またぎの人物追跡はしない。
- SNSは許可リストのutm_source優先、次にreferrerのホストを分類。X、Instagram、LINE、Facebook、YouTube、TikTok、other、direct_unknown。例: `https://snowviking.jp/?utm_source=youtube`。SNSアプリがreferrerを隠す場合はUTMなしで判定できない。SNS別uniqueの和は全体uniqueにはならない。
- `appinstalled`を受信できるブラウザーだけの検知数。iOS等の手動インストール数は取得不可。検知数を全インストール数と呼ばない。
- 同じevent_idの再送、同日/同ID/同modeのvisit、同sessionの開始はDB側で重複排除。失敗時の再送キューは持たず欠測し得る。広告ブロッカー・通信失敗・上限到達でも欠測する。

## 保持・正確性

`20261124000100_usage_analytics.sql`はprivateの3テーブルと集計ビュー、限定RPCを追加。anon/authenticated/service_roleから直接テーブルへのアクセスを禁止しRLS有効。service_roleには受信・メンテナンスRPCの実行だけを許可する。管理者の読み取りSQLは `supabase/audit/usage-analytics-summary-readonly.sql`。

生ログは当日+過去6日（JST日単位）、集計は当日+過去89日。日替わりIDは生ログだけに存在し、日別集計には個別IDを残さない。集計は完全な1日分を毎回再計算し、全体distinctを保持する。書込と集計は同じadvisory lockで排他。集計前後の件数・SHA256を確認し、集計・受領記録・期限切れ削除を1トランザクションで実行。途中失敗は全部ロールバック。集計前に生ログを削除しない。集計障害時は7日を超えて保留し、復旧後に削除する。集計済み生ログ削除後の再実行で集計を0に上書きしない。

管理ビューは生ログが残る日は最新の再集計、削除済み日は保存集計を使い、二重加算しない。管理SQLのdimension=all/bucket=allが全体値。page/source/platform/modeは内訳であり、それぞれを足してdistinctを求めない。

## 上限・容量・費用

固定上限: 5,000イベント/日、300イベント/ID/日、40,000生ログ。最大3イベント/リクエスト、JSON本文4,096bytes、定義外フィールドや日付は拒否。訪問1回の最初はvisit+session_start+PVの3イベントなので、5,000は訪問者数ではない。受信上限時は新規計測だけを捨て、認証・投稿には影響させない。日別rejected_eventsで超過を確認。

隔離PostgreSQL17.5で40,000行を投入したテーブル/インデックス合計は9,494,528bytes（約9.5MB）。日別集計は最大27内訳×90日で小規模。Hostedでの実容量、膨張、WAL、バックアップは別途。目安として15〜30MBの追加余裕を見て、提示された現状27MBと合計約42〜57MBを初期見積りとする。上限はDB全体サイズの保証ではない。DB内の行上限ではHTTPリクエスト数・Vercel実行回数や悪意ある偽造イベントを完全には制限できない。Origin確認はブラウザー対策でありbot認証ではない。

追加有料サービス/カスタムイベント/有料プランは導入しない。Supabase内pg_cronが利用可能なら日次SQLのみで実行し外部取得はしない。利用可能性は本番未確認。別途承認対象の `supabase/maintenance/usage-analytics-cron-enable-after-approval.sql` は00:10 JST（15:10 UTC）、30秒上限、既存同名ジョブは完全一致時のみスキップ。不一致は停止。既存ジョブを変更せず、extensionを勝手に作成しない。

Free/Hobbyの上限到達時の停止や欠測の可能性は残る。Vercel AnalyticsとFunctionsはダッシュボードUsageで、SupabaseはDatabase Size/Egressを確認する。プラン変更・課金設定は行っていない。Hobbyの利用条件に関する懸念をユーザーが認識した上で、現在の無料プランを維持する方針。適合を保証するものではなく、事業目的/収益化時は規約とプランを再確認する。

## セキュリティ・プライバシー

受信API `/api/usage` は正式originのみ、JSON型/サイズ/許可フィールド/サーバーJST日付を検証。Cookie/Authorizationは計測に利用・転送しない。IP、完全UA、メール、AuthID、投稿本文、完全referrer、自由入力UTMをDBに保存しない。Vercelへ送るページURLはクエリー/ハッシュを除外、施設slugも定型に置換。認証コールバック・デモ等は除外。通信基盤の標準ログは独自DBと保持が別。

管理キーは `USAGE_ANALYTICS_SUPABASE_SERVICE_KEY` のサーバー環境変数だけ。NEXT_PUBLIC接頭辞を付けない。service_roleキー自体はプロジェクト全体に強い権限を持つため、ブラウザー・Git・チャットに出さない。保存先URLはProductionでは本番ref、それ以外は開発refとの完全一致を必須にする。管理キーがなければ計測保存だけ503。一般ユーザー向け集計UIは設けない。

## 承認後の本番反映順序

1. 本番専用SQL Editorで上記新規マイグレーション1件をtransactionで適用し、通常の移行履歴を登録。他の未適用SQLは巻き込まない。現段階では未適用。
2. Supabaseでpg_cron利用可否とUTC timezoneを確認し、承認後にメンテナンスSQLを登録。集計ジョブ成功を確認できるまではブラウザー計測を有効化しない。
3. Vercel既存プロジェクトProductionにサーバー用管理キーと `USAGE_ANALYTICS_ENABLED=true`、`NEXT_PUBLIC_USAGE_ANALYTICS_ENABLED=true` を設定。既存Supabase URLは変更しない。Previewには本番キーを渡さない。`.env`の実値はコミットしない。
4. VercelダッシュボードでWeb Analyticsを追加料金なしの範囲でEnable。プラン変更が提示されたら停止。
5. 承認後、対象差分だけmainへ反映・Productionビルド。専用ブランチは自動Previewを無効にしてある。
6. 正式ドメインでAPI204、管理読み取りSQLの当日値と翌日の集計成功を確認。停止はサーバーフラグfalse、ブラウザ側停止は公開フラグfalseで再ビルド。アプリ本体や投稿データに変更不要。

## ローカル確認

`npm run test:usage` は純粋TS/受信APIとPGliteのPostgreSQL17.5で確認。本番Supabase・実Vercel計測・実cron・実Android/iPhoneインストールの検証ではない。Cronはテスト用stubで登録SQLの整合性のみ確認する。


## 本番設定の引き継ぎ（2026-11-24）

Cloudに本番DB・Vercelの認証情報はなく、実適用・設定変更は未実行。管理画面操作が必要。

1. Supabase DashboardのURLが `project/rtgqyctqjfoercdymssd` でプロジェクト名snow-condition-appであることを確認。Integrations → Cronが利用可能であることを確認（未有効なら無料範囲で有効化）。
2. `supabase/usage-analytics-production-apply.sql` 全文をSQL Editorで1回実行。原本のバイト列をBase64から復元しSHA256照合後、新規移行1件と履歴、日次集計ジョブを1トランザクションで適用。新規適用の結果は `USAGE_ANALYTICS_APPLIED`、`cron_00_10_jst=true`、`rls_tables=3`。再実行は履歴が原本完全一致ならスキップする。Cron欠如・既存ジョブ不一致時は全体ロールバックし、既存ジョブは変更しない。このSQL自体はDBのproject refを証明できないため、Dashboard URLの確認は必須。
3. Vercel team snownow2 / project snownow のUsageで、AnalyticsとFunctionsの現在の無料枠・残量を確認。有料機能は追加しない。Analytics → Enable。プラン変更・課金案内が必須なら停止。
4. Settings → Environment VariablesでProductionのみに `USAGE_ANALYTICS_SUPABASE_SERVICE_KEY` （同じ本番Supabaseのサーバー管理キー）、`USAGE_ANALYTICS_ENABLED=true`、`NEXT_PUBLIC_USAGE_ANALYTICS_ENABLED=true` を設定。既存Supabase URL・公開キーは変更しない。管理キーを共有チャットへ送らず、NEXT_PUBLICやPreviewに登録しない。実際の残量をこちらでは確認できず、全アプリ利用量の無料枠内を保証することはできない。
5. SQL成功と設定完了後、アクセス解析差分だけmainに反映。通常pushによる既存Vercel Productionデプロイを利用し、追加の手動デプロイを重ねない。
6. 正式URLを開き、開発者ツールNetworkで `/api/usage` の204を確認。204だけでは保存成功の証明にならない（サーバーフラグfalseでも204）ため管理者用集計SQLで当日の行が増えたことも確認。管理SQLのall行で全体指標、platform/source/mode/pageで内訳を見る。無料上限に到達したイベントは欠測する。
7. 次の00:10 JST以降にCron実行履歴と `usage_days.finalized_at` を確認。スケジュール登録済みだけで実際の定期集計成功とは判定しない。

設定完了前にmainへは反映しない。専用ブランチは自動Preview無効。iOS、既存投稿、認証、公式取得関連の差分は含めない。
