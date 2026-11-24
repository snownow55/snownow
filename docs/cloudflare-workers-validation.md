# Cloudflare移行検証（2026-11-24）

ブランチ test/cloudflare-workers。本番基点 f82cadd1。main、本番DB、DNS、既存Vercel、iOS開発ブランチは未変更。DB接続・SQL適用・データ作成削除なし。有料契約・有料リソースなし。

## 実装

vinext 1.4.6 / Vite 8 / Cloudflare Vite plugin / Wranglerを追加。依存React/RSCは19.3.1へ更新（このブランチのみ）。Next.js 16.4.6と既存npm run build/devも残す。Workers専用scriptsを追加し、元のビルドとは分離。

Node画像生成の旧 /pwa-icon/:size は承認済み静的PNGへリダイレクト。Manifest・アイコン原本・Service Workerには変更なし。Service Workerは未実装のまま。

退会の本番/開発判定はSNOW_DEPLOYMENT_ENV優先、未指定時だけ既存VERCEL_ENVへフォールバック。誤指定は拒否。さらに検証ブランチのブラウザー/サーバー/Proxy接続先をsnownow-devへ固定し、本番URLへの接続を防ぐ。この開発限定ガードは本番移行前に別レビューが必要。

Cloudflare Web Analyticsは公開ビーコントークンが設定された場合だけ有効。Vercel解析はこのブランチでは設置しない。プライバシー文面も検証構成へ変更。実ビーコンは未設定・受信未検証。

R2/KV/D1/Durable Objects/Cloudflare Images/共有HTMLキャッシュ/Cronは追加しない。認証・API・ユーザー別画面のno-storeを維持。専用ブランチのVercel自動デプロイは無効。

## 確認結果

- vinext静的スキャン: 15判定対応、0問題。ただし実互換性の保証ではない。
- Workers用ビルド: 成功。ローカルworkerd起動成功。
- 関連テスト17件、型チェック、変更箇所lint成功。
- ローカルブラウザー: トップ、login、signup、post、settings、account/delete、札幌国際詳細の枠組みHTTP200、JavaScript例外なし。Supabaseキーがないため実データ・実認証の成功ではない。
- Manifest: HTTP200、SNOW VIKING、standalone、id=/。
- Manifestの192/512/maskable画像: 全てHTTP200 image/png。
- 他Originからの投稿: 403。開発キーなしの同Origin API: 503で停止。
- パスワード再認証・他人拒否・関連削除等の既存単体テストは成功。実ユーザーでのテストではない。
- スクリプト束のWranglerローカル表示: 154modules / 約1,475KiB。Cloudflare一時プレビューへのデプロイも成功。

Workers起動中のdistを再ビルドするとローカルアセット索引が古くなり404になるため、ビルド後はWranglerを再起動する。再起動後の全アイコン正常配信を確認済み。

## 実認証・RLS・ネイティブの未完了事項

Cloudには開発用公開キー・開発用管理キー・専用テストユーザーの認証情報がない。実登録/メール確認、ログイン/ログアウト/継続、投稿/編集/削除、60分制限、他人拒否、退会、RLSの実認証確認は未実施。既存ユーザーを削除しない。新しい専用アカウントでのみ実施する。

現在のmainは先行無料閲覧で、チケット付与・消費・有料閲覧制御は稼働していない。未実装のチケットを検証済みとは扱わない。

iOS側はcapacitor://localhostとBearer APIを使うが、そのサーバー対応はfeat/ios-native-iconsにありmainには未統合。main基点の今回のWorkerではこのOriginは403。これは既存のOrigin制御が維持された結果であり、iOS API互換性の合格ではない。iOSクライアントを変更せず、既存ネイティブAPI用差分を別の統合作業コピーに取り込んで認証/CORS/OPTIONSを検証する必要がある。

保留中のSupabase PWA計測はまだ取り込まない。SDK追跡部分は再利用可能だが、受信サーバーのVERCEL_ENV判定を同じ環境ヘルパーに移す必要がある。DB/Cronは依然未適用。

## CPUと費用

ローカルの応答時間はwall timeであり、課金対象CPUではない。Cloudflare一時プレビューのTailでCPUを実測した。トップ4〜82ms（2件）、login4〜14ms（4件）、signup3〜18ms（3件）、settings25ms（1件）、account/delete4〜7ms（2件）、contact4〜97ms（2件）。API投稿状態6ms（キー欠如503）、管理API6ms（未認証401）であり、成功する投稿操作のCPUではない。少数のcold/warm混在観測でp95/p99ではない。一時アカウントの契約上限はユーザーのFreeアカウントとして確認していないが、10msを複数超えているため現構成のFree安定運用は未合格。Cloudflare実環境で、トップ/詳細のcold・warm、認証Cookie更新、投稿作成/編集/削除、退会、将来PWA受信のcpuTime・wallTime・outcomeを別々に記録し、CPU超過/メモリー/起動失敗がないか確認する。実ユーザー操作は専用開発アカウントだけで行う。

無料: 100,000動的リクエスト/日、CPU10ms、128MB。Paidは最低$5/月、HTTP CPU既定30秒（設定により最大5分）、10Mリクエスト/月・30M CPU-ms/月の含有枠があり、超過課金あり。CPU上限だけが失敗原因ならPaidで緩和できるが、フレームワーク互換性・誤った環境判定・iOS認証未統合は課金しても解消しない。契約変更はしていない。

## 認証後の次の操作

本番やDNSを触らず、CloudflareのFreeアカウント内にsnowviking-cf-devだけを作成する。Wranglerログインやアカウント登録をこちらで完了する認証情報はない。秘密キーはチャット/Gitに送らない。

- Node24。`npm ci`。
- cloudflare.env.exampleを参照し、開発Supabaseの公開キーをbuild環境へ設定。`SNOW_DEPLOYMENT_ENV=development`、URLはviidjrhaoxcvunbfdbni。NEXT_PUBLIC_SITE_URLは検証用workers.devの正確なorigin（正式URLは禁止）。
- 退会用service_roleは同じ開発プロジェクトのものだけをCloudflare Worker Secretsへ設定。公開キー/URL/site URL/SNOW_DEPLOYMENT_ENV/退会有効フラグはruntimeにも設定。管理キーをNEXT_PUBLICへ入れない。
- `npm run build:vinext`。`npm run deploy:vinext`は開発向け設定の検査後にデプロイ。ユーザーの既存WorkerやDNSに触れない。
- Git連携の場合はビルドを `npm ci && npm run build:vinext`、デプロイを `npm run deploy:vinext`、対象ブランチをtest/cloudflare-workersのみに限定。build/runtime両方の設定を合わせる。管理キーを未信頼PRに渡さない。
- この検証ブランチでは共有キャッシュ/有料Imagesを使わない。Cloudflare Web Analyticsを使う場合は検証用サイトの公開ビーコントークンだけをbuildに追加。
- 開発用Authのリダイレクト許可に検証URL/auth/callbackを追加する場合も、本番Authは触らない。既存設定は保持。
- 実認証操作とWorkersログ/CPU測定が完了してから無料移行を判定。CPU超過が未解消・実認証未実施のままDNS切替しない。

## 本番移行の順序（未実行）

実測合格 → 検証用ハードコードガードを正式な環境判定へ置換レビュー → 同じ本番Supabaseを参照する別候補を準備 → DNS全レコード/TTL/DNSSECを保全 → Vercelを残したまま段階切替。問題時は配信先だけVercelへ戻す。DBスキーマ変更なしならDBの復元不要。


## Cloudflare実環境の結果

Wranglerの無料一時プレビュー機能で検証専用アカウントを作成し、snowviking-cf-devだけを公開した。ユーザーの既存Cloudflareアカウントや本番資源には接続していない。ログ用一時認証情報・claim用URLはGitに保存しない。

一時URL: https://snowviking-cf-dev.incandescent-pangolin.workers.dev
期限: 2026-11-25 00:36:06 JST（期限後は利用不可）。開発キー未設定なので画面・配信確認専用。Supabaseの実データは取得していない。

通常のブラウザーUAでトップ/login/signup/post/settings/account/delete/札幌国際詳細の画面枠はHTTP200、JS例外なし。実環境のManifest、192/512/maskable/180 PNG、旧アイコンURLも200。最初の自動HTTPクライアントは入口の1010/403により拒否されたため、その応答をWorker実行失敗やCPU超過と混同していない。

CPU根拠は docs/cloudflare-workers-observations.json。TailのcpuTime/wallTimeを別々に保存し、Cookie/IP/リクエストヘッダー/認証情報は除外。安定性やスループットの負荷試験は行っていない。実CPU上限への適合検証はFree10ms超の観測により未合格。PaidならCPU枠は十分緩和される見込みだが、課金/契約/有料リソース作成は一切していない。

このブランチを本番へそのままマージしない。開発限定DBガードと検証用プライバシー文面が入っている。継続にはユーザー所有のCloudflare Freeアカウントへの認証と、開発Supabaseのbuild/runtime設定が必要。手順は上記。アカウントを作成/ログインし、Workers & PagesでGitHubのこのブランチだけを接続する。Vercelは維持し、独自ドメインは割り当てない。Web Analyticsのビーコントークンも必要なら検証サイト用だけを登録する。
