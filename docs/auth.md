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

Supabase の変数が未設定なら通信せず、一覧・詳細の枠と設定不足メッセージを表示します。認証フォームは無効化されます。公開サイトでのコールバック・Cookie 認証投稿は、未設定の Site URL を許可しません。開発時の localhost / 127.0.0.1 はローカルの origin にフォールバックします。

## Supabase ダッシュボードで必要な設定（未適用）

1. Email プロバイダーとメール・パスワード登録を有効にし、Confirm email を ON にします。匿名サインインは今回不要です。
2. Auth URL Configuration の Site URL を `NEXT_PUBLIC_SITE_URL` と一致させます。Redirect URLs にはその origin の `/auth/callback` を追加します。開発と本番はそれぞれ必要な URL だけを許可し、広いワイルドカードは使わないでください。
3. パスワード最小長を UI と合わせて12文字以上に設定します。利用可能なら漏えいパスワード検出も検討してください。
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

このアプリからは未認証・メール未確認・匿名 Auth の投稿を拒否し、新しい投稿権限は付与していません。ただしブラウザで公開される publishable key を使って、アプリの API を経由せず Supabase REST API を呼ぶことはできます。**直接アクセスの拒否は既存 RLS・GRANT に依存します。現在の DB 設定は未確認であり、未認証投稿を全面的に防げるとは保証できません。**

公開前に、snow_posts の RLS 有効化、anon / PUBLIC の INSERT 禁止、authenticated の必要な権限、公開 SELECT の範囲を確認してください。既存ポリシーが匿名投稿を許す場合は、別途承認した DB 作業が必要です。この変更では SQL を実行していません。

所有者制約、投稿頻度制限、通報・管理者処理も別タスクです。Auth を導入してもスパムや虚偽情報の投稿そのものを防げるわけではありません。

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

実 Supabase のメール送受信、JWT 検証・失効の実サービスでの挙動、DB スキーマ・RLS は未検証です。フィクスチャは画面とアプリの制御を検証するためのもので、実 Supabase のセキュリティ検証を代替しません。
