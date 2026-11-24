# SNOW VIKING — TestFlight / App Store preparation

2026-11-24。現行Vercel/Supabase前提。Cloudflareは保留。本番・main・DB・Auth設定・Apple署名資源・審査提出は今回未変更。

## 状態

ユーザー申告で完了: Apple Developer登録、Bundle ID `jp.snowviking.app`、App Store Connectアプリ、APIキー、Codemagic/GitHub連携、統合名 `SNOW_VIKING`、グループ `snowviking-ios` の公開設定4変数。値は取得/表示していない。

ローカルで実施: mainのVercel Analytics等の既存更新をiOS作業コピーに競合なく取り込み。Web/モバイルのビルド、署名前のCapacitor SPM同期。新しい報告/ブロック/RLSを人工データのみのPostgreSQL17で検証。実iPhone、Xcodeコンパイル、署名、IPA、Keychain/メール認証、App Storeの申告・送信は未実施。

本番の読み取りOPTIONSは `/api/posts` でHTTP204だがnative向けCORSなし。これをネイティブ対応成功とは判定していない。新しいCodemagic preflightはこの状態で依存インストール前に停止し、未対応APIのままビルド分数を使わない。

## 承認が必要な本番差分

### サーバー API

既存実装を再利用: `lib/native-api.ts`、`lib/supabase-server.ts`、`app/api/posts/route.ts`、`app/api/posts/manage/route.ts`、`app/api/account/delete/route.ts`。ネイティブのJWTは `getUser()` で検証後、既存の本人限定RPCを実行する。Cookie認証のWeb版は同じ経路を維持。Originは `capacitor://localhost` の完全一致。CORSはワイルドカード/資格情報許可なし。サーバー `NATIVE_APP_API_ENABLED=true` は承認後Productionだけに設定する。既存退会管理キーはサーバーに保持し、iOS/公開環境変数へ移さない。

### UGC安全機能

新規移行 `20261124000200_user_content_safety.sql` は投稿編集削除/日次表示に依存。公式収集2件、保留の解析移行は不要。既存の投稿/日時/投稿制限/地域/マスターを更新・削除しない。追加5privateテーブルのRLS、既存投稿へのRESTRICTIVE SELECTポリシー、入出力検証付きRPC、禁止語・投稿停止triggerを追加する。ヘルパーはpostgresのBYPASSRLS/スーパーユーザー権限を前提とし、条件不一致は停止。

- 通報は理由enumのみ。1人1投稿1回、JST1日20件。自動通報数による公開停止はしない。
- 投稿者は投稿IDからDB内部で解決。ユーザーUUIDを公開しない。ブロックは一覧/詳細/件数のDB読取に適用。ログアウトすると匿名閲覧になるため個人のブロックは適用されない。
- ブロック解除は本人のopaqueなblock_idだけ。相手の投稿者UUIDはリストに含めない。
- 通報一覧・運営操作はprivate SQL Editorだけ。anon/authenticated/service_roleには直接テーブル/運営関数の権限を付けない。
- 通報は投稿または通報者の削除でCASCADE。ブロック等も関連Auth削除でCASCADE。匿名化コピーを増やさない。
- 最小の設定可能な禁止語フィルターをSQL triggerで作成/編集に適用。網羅的な検出ではない。人による通報確認と継続運用が必須。

**実Supabaseには未適用**。開発DBへ実適用するにはDashboard URLが project/viidjrhaoxcvunbfdbni であることを確認し、`supabase/content-safety-development-apply.sql`全文をSQL Editorで実行する。原本のSHA256照合・投稿/制限データのハッシュ比較・履歴登録を1トランザクションで行い、失敗時は全体ロールバックする。成功statusはCONTENT_SAFETY_APPLIED_AND_DATA_PRESERVED、再実行は履歴完全一致ならスキップ。SQLだけではproject refを証明できないためUIの確認は必須。Cloudには接続キーがない。隔離DBのテスト合格をHosted DB適用済みと扱わない。運営者ロールの確認、既存移行履歴の確認は実適用時に必要。原本だけを順序指定で適用し、CLIで未適用SQL全件をpushしない。

## 開発環境で残る確認

開発用Supabase `viidjrhaoxcvunbfdbni` を使用。元のユーザーを削除せず、新しく作る専用アカウントA/Bを使う。キー・パスワードはチャットへ出さず、サーバー/CIの保護設定へ登録。

1. 新規UGC移行1件を開発に適用。A/Bでログインし、Bのテスト投稿をAが通報/ブロックする。
2. Aの一覧・詳細・件数からBが消え、B/匿名では表示を維持することを確認。Aの解除、BによるAの解除拒否、公開UUIDなしを確認。
3. 運営側で非表示/投稿停止/復帰を実行。他人は操作不可。禁止語付き投稿/編集は拒否し、保存・60分制限・既存投稿の整合性を確認。
4. 専用Aだけ退会し、報告/ブロック等の関連データが削除され、BのAuth/投稿が残ることを確認。

現在のCodemagicリリース用4変数は本番向けのため、開発テストにそのまま使わない。Windowsローカルの既存手順は mobile/README.md。開発APIと開発公開キーを使った専用テスト用構成で行う。実機用の開発ビルドを作る場合は別環境グループ/別ワークフローが必要で、リリース用グループを上書きしない。

## Supabase Auth（本番変更は別承認）

Site URL `https://snowviking.jp` と既存Web Redirect URLsは維持。iOS用に `jp.snowviking.app://auth/callback` をRedirect URLsへ追加する。既に存在すれば追加不要。カスタムschemeはInfo.plist/SceneDelegate/Capacitor側に実装済み。PKCEの確認リンク/パスワード再設定リンクは要求した同じiPhoneで開く（verifierはKeychain）。メールテンプレートが固定Web URLへ上書きしていないか、実メールで確認する。未確認テンプレートを変更しない。

## Codemagicの残る手動確認（未設定の場合だけ）

1. Team settings → codemagic.yaml settings → Code signing identities → iOS certificatesにApple Distribution証明書があること。なければ連携SNOW_VIKINGからGenerate certificate。iOS provisioning profilesでApp Store用・Bundle ID jp.snowviking.appをFetchし、証明書との一致（緑チェック）を確認。APIキー登録だけでは署名資源の存在を保証しない。
2. 署名/API/Auth/DB準備の承認・反映後、手動で既存ブランチのworkflow `ios-testflight` を開始。自動triggerは追加していない。Mac分数の無料残量を確認し、有料アップグレードは行わない。
3. 初回は `testFlightInternalTestingOnly` で内部TestFlightのみ。App Store審査提出はfalse。公開用には、この内部専用フラグを外した別archiveと承認が必要。
4. Xcodeコンパイル/Swift Package解決/署名・IPA/アップロード結果を確認。Codemagic成功だけでTestFlight処理完了とは判定しない。App Store ConnectでProcessing終了後、必要なら輸出コンプライアンスの質問に運営者が回答する。TLS/Keychainのみを用い独自暗号は実装していないが、未確認の法的申告を自動提出しない。

## iPhone実機チェックリスト

- [ ] インストール・アイコン・スプラッシュ・safe area・キーボード・回転
- [ ] 匿名で一覧/詳細/公式情報/当日投稿を閲覧。未取得は0にしない
- [ ] 新規登録、規約同意、同じ端末のメールリンクから復帰
- [ ] ログイン/ログアウト、終了再起動、バックグラウンド復帰のセッション維持
- [ ] パスワード再設定のdeep linkと再設定（本人専用アカウント）
- [ ] 登録エリア保存・再ログイン後保持
- [ ] 投稿成功後に対象施設詳細へ移動。失敗時は遷移しない
- [ ] 本人編集/削除、他人のAPI直接編集/削除拒否、編集済み表示
- [ ] 編集/削除で60分制限が解除されない。チケットは未提供のまま
- [ ] 通報、ブロック、解除、アカウント切替時に以前の表示を残さない
- [ ] 運営の非表示/投稿停止、通信失敗でも虚偽の成功を表示しない
- [ ] 開発専用アカウントでパスワード再認証・退会・関連削除・ログアウト
- [ ] HTTPS外部リンクはシステムブラウザー、mailtoはメールアプリ。開けない場合は案内
- [ ] Terms/Privacy/Contactのリンク、正しい問い合わせ先

## App Store掲載情報の原稿（未提出）

- 名前: SNOW VIKING
- サブタイトル: ゲレンデ選びに今の情報を
- カテゴリー案: スポーツ（副カテゴリーは天気を検討）
- サポートURL: https://snowviking.jp/contact
- プライバシーURL: https://snowviking.jp/privacy
- マーケティングURL: https://snowviking.jp/
- 問い合わせ: snowviking.official@gmail.com
- キーワード案: スキー,スノーボード,ゲレンデ,雪質,北海道,積雪,コンディション
- 説明案: 「SNOW VIKINGは、ゲレンデ選びに役立つ現地コンディションを共有するアプリです。北海道のスキー場一覧から施設を選び、当日のユーザー投稿や、対応施設の公式発表を確認できます。ログインすると雪質・混雑・コメントの投稿、登録エリアの保存ができます。自分の投稿は編集・削除でき、アプリ内からアカウントを削除できます。不適切な投稿の通報、投稿者のブロックにも対応します。公式情報が未発表・未取得の場合は、その旨を表示します。投稿は利用者による情報で、現地の状況や安全を保証するものではありません。現在は先行無料公開中で、アプリ内課金は提供していません。」

スクリーンショットは実際のiPhone/TestFlight画面を使用し、未提供の自動取得対象/課金/Pushを宣伝しない。年齢レーティングは新しい質問票にUGC等を正しく回答して確定する（推測値を設定しない）。著作権者名/販売者の公開名は運営者が確認。

## App Privacy申告案（最終確認・提出は運営者）

| データ | 目的/リンク | 根拠 |
|---|---|---|
| メールアドレス | アプリ機能、本人に紐付く | Supabase Auth |
| ユーザーID | アプリ機能、安全管理、本人に紐付く | 投稿・設定・制限・報告/ブロック |
| ユーザーコンテンツ | アプリ機能、安全管理、本人に紐付く | コメント・現地情報・通報 |
| 診断/利用データ | 保存設定の確認後に確定 | Vercel/Supabase標準ログの実保持設定は未確認 |

GPS、広告ID、連絡先・写真ライブラリーへのアクセス機能は実装していない。広告追跡/第三者広告目的の横断追跡は未実装。iOSクライアント本体にVercel Analyticsや保留中PWA計測を設置していない。Webのプライバシー文面とiOS実データ経路を混同しない。AppleのApp PrivacyとSDK Privacy Manifestは別で、Capacitorの同梱manifestを確認済みだが、archiveに含まれるSDK群のPrivacy Report/Apple検査はmacOSビルド後に確認する。

## 審査情報・運営準備

レビュー担当向けアカウントは運営者が用意し、App Store Connectの非公開Review Informationへ登録。秘密情報をGitやこの文書に書かない。連絡担当者名/電話は人が入力。レビュー手順は「匿名閲覧→ログイン→投稿→本人編集/削除→通報/ブロック→設定で解除→アカウント削除」。メール認証・制限・0時リセット・当日公式情報の欠測を説明し、架空の公式数値を用意しない。

通報運営: `supabase/audit/content-safety-reports-readonly.sql` を管理者が確認。対応は `SELECT snownow_private.review_post_report(対象report_id,'hide');` / `'suspend'` / `'dismiss'` / `'restore_post'` / `'resume_author'` を承認された環境で実行。一般ユーザーは実行不可。24時間以内の一次確認を運用目標案とするが、運営者が継続できる体制を確定する必要がある。緊急窓口は上記メール。

Apple 1.2のfilter/report/block/contact、5.1.1(v)のアカウント削除、4.2の十分なアプリ体験を対象に準備。連絡先/通報UIがあるだけで審査通過を保証しない。Keychain・同梱画面・deep link・外部ブラウザーを使うが、4.2の判断は実機体験とApple審査に依存する。メール/パスワードのみの認証であり、現時点でSNSログインを追加しない。

## 公開までの実施順（本番は未実行）

1. 開発SQL適用・専用ユーザー実認証/退会/通報/ブロック・他人拒否を確認。
2. 新規UGC SQL1件と本番API/共有UI差分、Native有効フラグ、Auth Redirect追加について承認を取得。
3. 承認後、本番SQLと履歴を1トランザクションで適用→必要なサーバー/共有UIだけmainへ反映。iOS資源・Cloudflare・保留解析SQLを巻き込まない。
4. Codemagic内部TestFlightビルド→実機チェック→必要な修正。署名用キーは保護された統合だけ。
5. メタデータ・プライバシー・UGC運営体制・スクリーンショット・審査アカウントを確定。
6. 内部専用フラグを外す公開候補ビルドを別途承認。審査提出/一般公開はそれぞれ承認後に行う。

Cloudflare競合: `lib/supabase-server.ts` はiOSのBearer対応と検証ブランチの開発DB固定が同じ箇所にある。Cloudflare側をそのままcherry-pickしない。iOS対応はVercel前提で準備し、Cloudflareブランチは今回変更していない。
