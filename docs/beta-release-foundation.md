# 無料β版リリース準備 STEP 1：開発基盤・セキュリティ

確認日：2026年11月13日（日本時間）

## 方針と作業範囲

SNOW VIKINGは、利用者獲得・現地投稿の蓄積・需要検証を優先し、一般利用者向けの無料β版をPWAで先行公開する。月額500円のサブスクリプションと投稿報酬チケット制は廃止せず、正式版で実装する。

本STEPでは依存関係の脆弱性対応、既存の認証・投稿API・秘密情報管理の確認、およびローカル検証だけを行う。無料β向けのロック解除・閲覧仕様、公式情報取得、チケット、課金、写真、マイページ、アカウント削除、通報・削除・ブロック、管理画面、PWAは変更・実装しない。既存の制度説明、ブランド、スマホUI、デモ機能も維持する。

- 対象リポジトリ：`snownow55/snownow`
- ベース：`feat/supabase-auth` の `9d016d7cb30347920404152f79fc8088880666f7`
- main：`7440d7c320a619862798abd7269b7fd04f187c85`
- 作業ブランチ：`feat/beta-release-foundation`。PRのベースは`feat/supabase-auth`。
- 作業開始時：対象リポジトリの両worktreeに未コミット変更なし。リモートの最新SHAを取得して上記と一致することを確認後、作業ブランチを作成した。
- 初回STEP1ではローカル検証まで実施し、未コミットで停止した。確認後の追加指示により、最終レビュー・作業ブランチのコミット/プッシュ・`feat/supabase-auth`向けPR作成を進める。mainへの変更・マージ、PRのマージ、本番デプロイは引き続き対象外。
- 実DBへの書き込み・権限変更、実メール送信、秘密鍵のローテーションは行わない。
- `snow-viking-demo` / `snow-viking-public-demo` の別リポジトリは変更しない。

## 変更ファイル

| ファイル | 変更 |
| --- | --- |
| `package.json` | Next.jsと対応するESLint設定を更新。開発依存だけに作用するminimatchの限定overrideを追加 |
| `package-lock.json` | 上記と、脆弱な開発依存の修正版を固定 |
| `docs/beta-release-foundation.md` | 本書を新規作成 |

Next.jsが自動変更した`AGENTS.md`の見出しレベルは、不要な整形差分として最終レビューで元に戻した。今後のNext.js実行で再生成される場合があるが、このPRには含めない。

アプリの画面、API、認証の実装コードは変更していない。既存の検証と認証処理に明確な認証回避は見つからず、本番設定を推測して変更することも避けた。新規テストの追加・既存テストの削除や無効化はしていない。

## 依存関係の選定

| パッケージ | 更新前 | 更新後 | 理由 |
| --- | --- | --- | --- |
| next | 16.3.8 | 16.4.6 | 既知の3アドバイザリを解消する同一メジャーの安定版 |
| eslint-config-next | 16.3.8 | 16.4.6 | Next.jsと整合 |
| @next/eslint-plugin-next / @next/env / @next/swc-* | 16.3.8 | 16.4.6 | Next.js関連の推移的依存を整合 |
| typescript-eslint / @typescript-eslint関連 | 8.71.1 | 8.72.2 | 既存の許容範囲内で開発依存を更新 |
| zod（開発依存） | 4.6.5 | 4.6.7 | メモリ枯渇のHighを解消 |
| typescript-estree配下のminimatch | 10.2.6 | 11.0.8 | glob増幅によるDoSのModerateを解消 |
| sharp（Next.js配下） | 0.35.5 | 0.35.5 | 元から画像処理の修正版条件を満たす。Next.js自身も更新 |
| react / react-dom | 19.2.8 | 19.2.8 | 変更不要 |
| @supabase/ssr / @supabase/supabase-js | 0.12.7 / 2.117.3 | 同左 | 変更不要 |

2026年11月13日のnpm dist-tagsではNext.jsの`latest`は16.4.6、canaryは16.5系列だった。16.4.6を前回候補という理由だけでは採用せず、各アドバイザリの16系列修正範囲（16.4.1以降）、現在の安定タグ、Node/React/ESLintのpeer条件を確認した。NodeはNext.jsの要求する20.9以上に対して24.22.1、Reactは19.2.8、ESLintは9.39.5を使用する。バンドルされたバージョン対応のNext.jsドキュメントも確認した。

### minimatchの限定override

`typescript-eslint`を許容範囲内で更新しても、`@typescript-eslint/typescript-estree`は脆弱な`minimatch ^10.2.2`に依存し、Moderateが残った。アドバイザリでは7以上11.0.1未満が対象で、既存10系列の許容範囲内では解消しない。このため、**開発用のtypescript-estree配下だけ**を11.0.8に固定した。アプリや他のESLint依存が使用する3.1.5は変更しない。

```json
"overrides": {
  "@typescript-eslint/typescript-estree": {
    "minimatch": "11.0.8"
  }
}
```

これは推移的依存について意図的にメジャー境界をまたぐ例外であり、無差別なメジャー更新ではない。11.0.8はアドバイザリの修正範囲内の安定版で、実行環境のNodeに対応する。実際の利用箇所はCommonJSの`minimatch(filePath, pattern, { dot: true })`で、そのAPI・通常のTSパス・隠しファイルのマッチ動作を確認した。さらにlint・ビルド・既存テストで回帰を確認する。上流が修正版を正式依存に取り込んだらoverrideを除去できるか再評価する。

`npm audit fix --force`、一括メジャー更新、codemodや大規模リファクタリングは使用していない。`npm ci`でlockfileからの再インストールも確認した。

## アドバイザリの確認

GitHub Advisory APIとnpm auditの双方で確認した。以下はパッケージ上の影響範囲であり、このアプリへの攻撃成立を実証したものではない。

| アドバイザリ | 重要度 | 影響・条件 | 影響範囲と最初の修正版 | 本アプリでの確認 |
| --- | --- | --- | --- | --- |
| [GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw) | Critical | glibc Linuxの画像最適化で使用する上流画像処理ライブラリに起因するRCEの可能性 | Next 10.0.0〜15.5.27→15.5.28、16.0.0〜16.4.0→16.4.1。sharpは0.35.5以上が回避条件 | ブランド画像はunoptimized、sharpは既に0.35.5。ただしAPIや配信環境の悪用可能性を断定せずNext.js本体も更新 |
| [GHSA-p3m5-59mp-jv5r](https://github.com/advisories/GHSA-p3m5-59mp-jv5r) / CVE-2026-94482 | High | Server Actionを持つApp Routerで、細工したリクエストによるCPU占有・DoS | Next 13.0.0〜15.5.27→15.5.28、16.0.0〜16.4.0→16.4.1 | App Routerを使用。アプリのServer Action定義は検出せず。将来の変更も考慮し更新 |
| [GHSA-673q-mjm6-r5xr](https://github.com/advisories/GHSA-673q-mjm6-r5xr) | Critical | Cache Componentsで、複数typed arrayを返すuse cache関数がある場合のRCE | Next 16.0.0〜16.4.0→16.4.1 | use cache / cacheComponentsの使用は検出せず。ただしアドバイザリの更新推奨に従う |
| [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) | High | Zodが大きな制約付きコレクションを検証する際のメモリ枯渇 | zod 4.6.6未満→4.6.6 | ESLint側の開発依存を4.6.7に更新 |
| [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) | Moderate（GitHub表記Medium） | minimatchのglobparts増幅によるDoS | 7.0.0以上11.0.1未満→11.0.1 | 開発用パーサー配下を11.0.8へ限定override |

### 監査件数

件数はnpmの**影響パッケージ数**。Next.jsの1パッケージに3つのアドバイザリがあり、開発依存の親パッケージへの波及も集計されるため、アドバイザリ件数とは異なる。

| 対象 | 修正前 | 修正後 |
| --- | --- | --- |
| `npm audit --omit=dev` | Critical 1、計1パッケージ（Nextの3アドバイザリ） | 全重要度0、exit 0 |
| `npm audit`（開発依存込み） | Moderate 7 / High 1 / Critical 1、計9パッケージ | 全重要度0、exit 0 |

監査結果は確認日時点の公開データベースに対する結果であり、未知の脆弱性や本番設定の安全性を保証しない。

## セキュリティ確認

### 環境変数・秘密情報・Git

- Supabaseクライアント/サーバーは`NEXT_PUBLIC_SUPABASE_URL`と`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`を使用。実装にservice role / secret keyの使用はない。publishable keyは公開可能だが、実際の本番設定に誤って秘密鍵を登録していないことは別途確認が必要。
- `.gitignore`が`.env*`、`.vercel`、PEM鍵、node_modules、Next.js・ブラウザテストの生成物を除外することを`git check-ignore`でも確認した。
- shallow履歴を解除し、取得できた全refsの28コミット・233 blob（うちUTF-8テキスト230）を検査。現行の追跡ファイルと履歴に、追跡された環境ファイル・鍵ファイルはなかった。
- 既知のSupabase secret key、legacy service_role JWT、実ユーザーJWT候補、秘密鍵、GitHub/AWSキー、資格情報付き接続URLのパターンを検査した。秘密情報の値や検出行はログに出力していない。
- 接続URL候補5件は、セキュリティテスト内の`.test`ホストを使う架空URLの履歴であり、実秘密ではなかった。確認できた実秘密の混入は0件。ローテーション・履歴改変は実施していない。
- これは到達可能なローカルrefsを対象にした既知パターン検査であり、未取得/到達不能のオブジェクト、任意形式の秘密値、GitHub Actions/Vercelの保存値まで検査した保証はない。将来のコミットでも秘密情報のレビューが必要。

### 認証・セッション

- ブラウザとサーバーでSupabase SSRを使用し、proxyで`getUser()`によるセッション更新を行う。CookieはSameSite=Lax、HTTPSのサイトURL設定時にSecureを使用する。
- 認証済み応答のprivate/no-storeとコールバックのno-store/no-referrerを確認。これらは将来のPWAキャッシュ設計を代替しない。
- 投稿APIは`getUser()`の検証後、メール確認済み・非匿名を要求。画面上のログイン表示だけを認可に使わない。
- コールバックはPKCE code交換とsignup/recoveryのtoken_hashに対応し、外部へのnextや制御文字を拒否。recoveryの遷移先は再設定画面に固定。
- Supabase本番側のメール確認、匿名Auth、SMTP、Cookie/リダイレクトと正式HTTPS URLの整合は未検証。

### 投稿API・テスト用ルート

- `/api/posts`はOrigin完全一致、認証、メール確認、非匿名、JSONメディアタイプ、実際の受信UTF-8バイト数16KB上限、選択値、コメント1000文字上限、余計なフィールド拒否、有効なDBマスターの投稿先を検証する。
- `user_id`・`created_at`の上書きは入力検証で拒否。利用者JWTとpublishable keyでINSERTし、RLSを迂回しない。実DB側のdefault・RLS・権限は別途検証が必要。
- Preview用Origin追加はVercel提供の具体的な2ホストだけで、本番では無効。Host/forwardedヘッダーや任意の`*.vercel.app`を信頼しない。認証コールバックの許可先は広げない。
- `tests/mock-supabase.mjs`の模擬認証と`/__control`等は127.0.0.1の独立テストサーバー専用。appのAPIルートではない。`SNOW_E2E`は出力先を分離するだけで、実アプリの認証を解除しない。認証を迂回する本番用テストルートは確認されなかった。
- 実DBのUPDATE/DELETE・所有権、投稿頻度制限、スパム対策・通報等は引き続き未確認/未実装。本STEPで閲覧仕様やDBを変更して補うことはしない。

## 本番環境の確認状況と次回の手順

本作業の環境には本番Supabase/Vercel設定を確認できる接続情報がない。コード上の処理、過去の開発DBの確認記録、公開URLの観測を、本番設定の確認済みという意味では扱わない。

| 項目 | 確認できたこと | 未確認と次に必要な手順 |
| --- | --- | --- |
| 本番用Supabase | 実装は環境変数によって接続先を切り替える。既存docsの確認対象はsnownow-dev | Dashboardで本番project ref・環境ラベル・バックアップ/運用担当を特定し、Production/Previewの接続先の分離を確認。秘密値は文書に貼らない |
| RLS | 開発用の`public.snow_posts`はsecurity_invokerビュー、private側RLSを参照するという既存記録あり | 本番のビュー定義、RLS有効化、pg_policies、GRANT/REVOKE、default、triggerをread-onlyで照合。設定確認と実際の拒否テストは区別する |
| 投稿者本人の権限 | APIはuser_id等を受け付けず、DBのdefaultとRLSを前提にする | 本番の`auth.uid()`との対応、他人のID・UPDATE/DELETE・管理者例外を確認。否定テストは別途承認したテスト用DBで実施 |
| 匿名ユーザー | APIは未ログイン・匿名Auth・メール未確認を拒否する | anonロールの直接INSERT、匿名Authのauthenticatedセッション、DB直接読取の許可範囲を確認。画面/APIだけの制限と混同しない |
| メール認証 | アプリに登録・再送・確認コールバックあり。docsには開発環境で最小長8文字確認の記録あり | 本番のConfirm email、匿名サインイン設定、SMTP、送信レート/CAPTCHA、最小長を確認。実メールの受信・期限切れ等の検証は後続作業 |
| パスワード再設定メール | 再設定要求、recovery callback、更新・ログアウトのコードあり | 本番テンプレート、token_hash/PKCE、期限、別端末、再ログインを実メールを用いて別途検証。今回は送信しない |
| 認証リダイレクトURL | `NEXT_PUBLIC_SITE_URL`を正規originに使用し、安全なnextだけ受け付ける | 本番の正式HTTPS URL、Supabase Site URL、Redirect URLs、`/auth/callback`を照合。不要な広いワイルドカードやPreviewとの混在がないか確認 |
| Vercel環境変数 | コードが必要とする3変数名は確認済み。値は未取得 | Production/Preview別のSupabase URL・publishable key・site URLとNode実行バージョンを管理画面で照合。NEXT_PUBLIC値はビルドに埋め込まれるため誤登録がないか確認。変更/再ビルドは今回は行わない |
| 本番デプロイ対象ブランチ | GitHubのmainは7440d7c、最新開発は9d016d7。2026-11-13の公開URL観測は旧ブランドのトップHTTP 200、`/login` HTTP 404 | 公開URLはmain相当だが、VercelのProduction Branch設定・実DeploymentのGit SHAは管理画面での確認が必要。無料β公開先とマージ/公開手順を後続で明示的に決める |

公開URLへの確認はGETのみ。実DB INSERTやメール送信、設定変更は行っていない。

## ローカル検証

環境：Node.js 24.22.1 / npm 11.9.0 / Linux Chromium。

- `npm ci`：成功。更新済みlockfileから再現可能なインストールを確認。
- `npm run build`：成功。Supabase・サイトURLの3公開変数を空にしてビルドし、本番/開発DBには接続しない。
- `npm run lint`：成功。
- `npm test`：30件成功。
- `npm run test`：30件成功。上記と同じスクリプトの別表記だが、要求どおり双方を実行。
- `npm run test:e2e`：68件成功（3.8分）。
- `npm run test:e2e:missing`：2件成功。上記の設定不足ビルドを使用。
- `npm audit --omit=dev`：全重要度0、exit 0。
- `npm audit`：開発依存を含め全重要度0、exit 0。
- minimatch限定overrideのCommonJS API・TSパス・dotオプション：成功。

ブラウザテストは127.0.0.1の模擬Supabaseと独立したNext.jsサーバーを使用する。登録・ログイン・ログアウト、メール確認・パスワード再設定、一覧、地域、検索・並び替え、公式未取得表示、ロック表示、詳細、投稿、デモ、スマホUIの回帰を確認する。模擬DBへの書き込みはメモリ内のみで、本番DBと実メールにはアクセスしない。実メール配信・実DB RLSの安全性を保証する試験ではない。

## 残存リスクと次のSTEP

1. npm audit 0件とローカル試験の成功は、本番RLS・秘密情報設定・実メール・運用の安全性を保証しない。本番確認表を埋め、必要な実DBの否定テスト方法を別途承認する。拒否/ROLLBACKでもシーケンスが進む可能性に注意する。
2. minimatchの限定overrideは上流の想定範囲外のため、将来のtypescript-eslint更新時に必要性と互換性を再検証する。上流の対応が済んだ場合は除去を検討する。
3. 追加指示で承認されたコミット/プッシュとPR作成までで止め、PRのマージ・mainへのマージ・公開は行わない。本番公開ブランチと公開手順は後続で決定する。今回の更新は既存の本番デプロイに反映されていない。
4. 無料β版の閲覧・ロック仕様は後続STEPで決めて実装する。現状のロックUIは閲覧権保護ではなく、詳細の投稿は既存の公開範囲のまま。月額課金・チケットの予定と説明を廃止しない。
5. PWA、朝の公式情報、投稿運営・通報/削除/ブロック、アカウント削除などの公開準備は後続STEP。先行公開に必要な範囲と順序を明確化し、実機検証・利用規約/プライバシー・問い合わせ/運用体制も別途確認する。
