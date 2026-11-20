# STEP2 MVP 開発DB移行手順

更新：2026-11-19 JST。[進捗と残作業](step2-hosted-remaining-work.md)。
本書は手順。今回の実DB書込・削除・push・deployの実行許可ではない。

## 採用した変更

- 旧投稿から新投稿テーブルへコピーしていたDOブロックだけを除外する。旧表を非公開archiveへ移す既存処理はそのまま。旧表を削除しない。
- 新snow_posts / 公開view / post_limitsは0件で開始。空sequenceは1・is_called=false。最初の正規RPC投稿でid=1となり、その時点から60分制限が始まる。
- setvalとpost_limitsの初期化SQLは変更しない。元テーブルが空なので、既存SQLで空の初期状態になる。
- 63施設マスター・9地域・暑寒別岳の旭川/富良野分類、Auth、RLS、RPC、既存権限境界は変更しない。

## 固定するSQL

`supabase/migrations/20261115000100_beta_foundation.sql`

- 新版：26,166 bytes、SHA-256 `41126DCF8E0BFB0B1D583F2F52A05E9D34607B6A459A37E80006AF1167424B5D`
- 旧検証版：26,512 bytes、SHA-256 `2E3A036D0F6305149601170E6B4718BB1AC0850E555DF9AF2497065C88753286`
- 番号20261115000100は、対象Hostedで未適用であることを③で確認できた場合だけ使用する。同じ版が適用済みなら停止し、ファイル書換えで履歴を合わせない。
- 旧版の84PASS/Phase1/Phase2/実バックアップ復旧証跡は旧版の成果として保持する。今回の差分に限る追加10確認は[結果JSON](step2-mvp-empty-start-results.json)。

## 順序

1. Windowsの本体repo snownow55/snownow / feat/supabase-auth / 基点75ae113f9db5を確認。既存変更・STEP3仕様書を保持する。今回のSQLと文書の差分だけを取り込み、新SHAを確認する。commit/pushは今回行わない。
2. [CLI手順](step2-hosted-application-plan.md)に従い、認証を一時ロール作成へ落とさず、読み取り専用で③の履歴/dry-runを確認する。まだ未実施。
3. 実適用の明示承認後、②の最新custom dumpをWindows私用フォルダーへ1回新規取得し、TOC・SHA・読出しを確認。適用枠の書き込み停止/メンテナンスもその承認範囲で行う。
4. 予定がこの移行1件であること、新SHA、対象がsnownow-devであることを再確認して単一トランザクションで適用する。dry-run成功だけで適用したとは扱わない。
5. 事後は施設63、地域9、新投稿0・制限0、旧表非公開、AuthとRLS/RPC、移行履歴1件を確認。旧テスト投稿16件/湿雪1件の新表への復元は期待しない。
6. DB確認後、別途承認された場合だけGitHub push・Vercel Preview反映・Hosted連携スモークへ進む。main/本番/STEP3は含まない。

## 最小バックアップと停止判断

[残作業②](step2-hosted-remaining-work.md)を適用する。旧投稿の完全一致/最新dumpの追加全面リハーサル/新規復旧ツール開発は省略する。
SQLのバイト保持は必須。SQL本文や関数定義の改行を正規化せず、ファイルコピーまたはバイトストリームを使う。生成SQLをPowerShellテキストパイプへ通さない。
移行失敗はトランザクションの成否・構造・履歴を調べるまで停止。成功後の不具合は公開停止＋限定した前進修正を優先。Authや管理領域への全面restoreを行わない。

旧詳細手順はコミット75ae113f9db5および従来の保全アーカイブに保持済み。旧版に記載した最新バックアップ差分/完全復旧一式の追加開発は本MVP手順で置き換える。
