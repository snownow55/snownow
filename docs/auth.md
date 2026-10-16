# SNOW NOW 認証機能

## 実装

- `/signup`: メール・パスワード登録、確認メール再送。メール確認後に利用。
- `/login`: ログイン。安全なサイト内の `next` に復帰。
- `/forgot-password`: 再設定メール送信。
- `/reset-password`: 再設定リンクで作成したセッションを検証してパスワード更新後、ログアウト。
- `/auth/callback`: PKCE code の交換、または signup / recovery の token_hash を検証。外部への next、バックスラッシュ・制御文字などを拒否。recovery は再設定画面へ固定。失敗は固定のログイン画面へ。
- 共通ヘッダー: ログイン状態とログアウト。SSR の Cookie 共有と proxy によるセッション更新。
- `/api/posts`: 同一サイト Origin、Supabase Auth の getUser、メール確認、匿名 Auth でないこと、投稿内容を検証。利用者の JWT と publishable key で既存テーブルに INSERT。

一覧・詳細は公開のまま。投稿フォームの選択肢と既存の書き込み列は維持し、追加の user_id 列は仮定していません。DB・RLS は変更していません。投稿の所有者管理は今回の実装範囲外です。

## 必要な環境変数

ローカルの `.env.local` または環境設定に登録します。公開変数はビルド時に埋め込まれるため、変更後は再ビルド・再起動してください。

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

publishable key を使用します。service_role / secret key は使わず、公開変数に入れないでください。サイト URL はパス・クエリ・認証情報を含まない正式な origin にします。本番で実行する場合は HTTPS の正式 URL が必要です。今回、本番デプロイはしていません。

Supabase の変数が未設定なら通信せず、一覧・詳細の枠と設定不足メッセージを表示します。認証フォームは無効化されます。公開サイトでのコールバックは、未設定の Site URL を許可しません。Cookie 認証投稿も原則同様ですが、Vercel Preview では後述のシステム環境変数による追加許可があります。開発時の localhost / 127.0.0.1 はローカルの origin にフォールバックします。

### Vercel Preview からの投稿

投稿APIは通常、サイトURL設定とのOrigin完全一致を要求します。Vercel上のPreview（サーバー環境の `VERCEL=1` かつ `VERCEL_ENV=preview`）に限り、Vercelが提供する `VERCEL_URL` と `VERCEL_BRANCH_URL` のHTTPS Originも完全一致で許可します。環境値はパス・ポートなどを含まない正しい `*.vercel.app` ホスト名だけを受け付けます。これは接続元に対するワイルドカード許可ではなく、そのDeployment・ブランチの具体的な2ホストだけの許可です。任意のOrigin、Host、forwardedヘッダーから許可先を追加しません。本番環境ではこの追加許可は無効で、従来のサイトURL設定だけを使います。

Vercelのシステム環境変数がPreviewのサーバーに提供されていることを確認してください。変数がない・不正な場合は許可範囲を広げません。独自Previewドメインは明示的なサイトURL設定が必要です。Supabase接続先は引き続き開発用プロジェクトを使います。この修正はSupabase接続設定・認証・RLSを変更しません。

この追加許可は投稿API専用です。認証コールバックは引き続き正規のサイトURLを使うため、Previewのメール認証・復帰先には、サイトURLと開発用Supabaseのリダイレクト許可設定の整合が別途必要です。公開変数の設定変更には再ビルドが必要です。古いPreview DeploymentのURLには、新しいコードは自動反映されません。

画面では `403 / Forbidden`（URLが許可されない）、`401`（ログイン確認失敗）、`403 / Email verification required`（メール未確認・匿名ユーザー）を区別します。不明な403やJSON以外のエラーはメール未認証と断定せず、固定のアクセス拒否メッセージを表示します。サーバーからの任意の文言は描画しません。

ローカル確認：`npm test`、`npm run test:e2e`、`npx playwright test --config playwright.preview.config.ts`。最後のコマンドはローカルモックと架空のVercelホスト情報でPreview投稿を再現します。実際のVercel・Supabaseには接続しません。

## Supabase ダッシュボードで必要な設定（未適用）

1. Email プロバイダーとメール・パスワード登録を有効にし、Confirm email を ON にします。匿名サインインは今回不要です。
2. Auth URL Configuration の Site URL を `NEXT_PUBLIC_SITE_URL` と一致させます。Redirect URLs にはその origin の `/auth/callback` を追加します。開発と本番はそれぞれ必要な URL だけを許可し、広いワイルドカードは使わないでください。
3. パスワード最小長を UI・入力チェックと合わせて8文字に設定します。新規登録とパスワード再設定は共通の最小長を使います。snownow-dev は、利用者が Supabase ダッシュボードの Email 設定で最小長8文字を確認済みで、アプリと一致しています。公開 `/auth/v1/settings` API は最小長を返さないため、その応答だけでは一致を確認できません。利用可能なら漏えいパスワード検出も検討してください。
4. 登録確認と再設定メールは、別端末でも扱える token_hash 方式を推奨します。テンプレート内のリンクをそれぞれ以下にします。

   Confirm signup:
   ```html
   <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&amp;type=signup">メールアドレスを確認</a>
   ```

   Reset password:
   ```html
   <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&amp;type=recovery">パスワードを再設定</a>
   ```

   既定の ConfirmationURL を使う PKCE code 方式も対応しますが、登録・再設定を開始したブラウザの verifier Cookie が必要です。Site URL 方式では、Site URL と異なるプレビュー環境ではなく正規サイトに戻ります。

5. 確認・再設定メールの有効期限、送信レート、Auth CAPTCHA、SMTP と配信元を確認します。今回、実メール配信は未検証です。
6. ネットワーク制限がある環境は対象 Supabase プロジェクトの HTTPS ホストを許可します。Geist はローカル配信のため Google Fonts への通信は不要です。

## RLS に関する公開前の必須確認

開発用 snownow-dev の SQL Editor で利用者が確認した構成：`public.snow_posts` は `security_invoker=true` のビューで、RLS が有効な `snownow_private.snow_posts` を参照します。唯一の INSERT ポリシーは authenticated 向けで、`user_id = auth.uid()`、`email_verified()`、有効なスキー場の3条件を AND で要求します。投稿用8列の INSERT 権限があり、id・user_id・created_at はデフォルト値で設定されます。独自トリガー・書き込みルールはありません。

`email_verified()` は SQL / STABLE / SECURITY DEFINER、空の search_path で、auth.users を SELECT し、本人・メール確認済み・非空のメール・非匿名を判定します。実行権限は anon になく authenticated にあります。これらは設定の確認であり、実際の INSERT 拒否を保証する試験とは区別します。

公開前に残っている検証事項：

- [ ] 実際のメール未認証セッションによる投稿 API・Supabase 直接 INSERT の拒否。通常ログインの失敗は確認済みですが、実セッションの拒否は未検証です。
- [ ] 未ログインでの Supabase 直接 INSERT の拒否。投稿 API の HTTP 401 は確認済みです。
- [ ] 本人以外の user_id、および無効なスキー場を指定した場合の実際の拒否。
- [ ] UPDATE / DELETE の権限・RLS、および投稿頻度制限・通報・管理者処理。

実 INSERT の検証では、GENERATED ALWAYS の id の採番が拒否や ROLLBACK 後にも進む可能性があります。id の INSERT 権限はないため、現在の権限で明示 ID による採番回避はできません。実施方法と許容する影響について別途承認を得てください。DB・権限変更、実 INSERT、既存投稿の変更・削除はこの作業では行っていません。

## 検証

```bash
npm ci
npm test
npm run lint
npm run build
npm run test:e2e
npm run test:e2e:missing
```

`npm test` は Node.js 22.18 以降（検証環境は24）で TypeScript を直接実行します。ブラウザテストは実 Supabase ではなく、127.0.0.1:54321 の HTTP フィクスチャと3100の独立した Next.js サーバーを使います。メール・本番 DB にはアクセスせず、模擬投稿はプロセス内のみに保持します。既存開発サーバーを止めず `.next-e2e` で実行します。

Chromium は既定で `/usr/bin/chromium` を使用します。別環境は `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` を実行ファイルのパスに設定してください。

実 Supabase での登録・確認メール受信・期限切れ・再設定・ログアウト・RLS・投稿の確認は、設定後にテスト用プロジェクトで別途行ってください。今回の模擬テストは Supabase 側の設定や実 DB の権限を保証しません。

`test:e2e:missing` は直前に環境変数未設定で `npm run build` した成果物を3101で起動し、未設定時の画面表示・認証無効化を検証します。実行中プロセスも未設定にしますが、公開変数はビルド成果物に埋め込まれるためビルド時の設定にも注意してください。

## 今回の検証結果

Node.js 24.19.0 / npm 11.9.0 のクラウド環境で、ユニットテスト4件、ローカル模擬 Supabase を使用するブラウザテスト7件、環境変数なしの本番ビルドでの画面テスト1件が成功しました。`npm run lint` と `npm run build`（TypeScript 検証を含む）も成功しました。

既存の日時表示で発生していた lint エラーは、経過時間の計算をデータ読み込み時に移して解消しました。フォントは同じ Geist を npm パッケージからローカル配信し、ビルド時の Google Fonts 通信依存を除去しています。スマートフォンの390px幅で画面が収まることを検証しています。

利用者のローカル動作テストでは、登録・メール確認・ログイン・投稿・一覧・ログアウト・未ログイン時の投稿画面制限が成功しています。DB 設定の確認と未検証項目は上記の公開前確認事項に記録しています。フィクスチャは画面とアプリの制御を検証するためのもので、実 Supabase のセキュリティ検証を代替しません。
