# STEP2 MVP 残作業と現在の判定

更新：2026-11-19 JST。正式リリース前MVP。最小工数とセキュリティを優先する。

| 区分 | 現在の状態 |
|---|---|
| 旧版の隔離84項目 | PASS・ユーザー承認済み。再実行しない |
| 実バックアップの限定復旧 | 過去のREAL_BACKUP_APP_RECOVERY_REHEARSAL_PASSEDを保持。再実行しない |
| ① Hosted権限 | postgresを実効ロールとするメタデータ確認PASS。CLI認証経路は③で確認 |
| MVP限定修正 | 旧投稿コピーのみ除外。追加10確認PASS。全84項目を新版で再実行したとは扱わない |
| ② 最新バックアップ | 最小構成へ縮小。実適用直前にWindowsへ1回新規保存。今は未取得 |
| ③ CLI履歴・dry-run | 手順準備のみ。未実施 |
| ④ 実適用・push・deploy | 未承認・未実施。STEP3実装も禁止 |

新SQL：26,166 bytes / SHA-256 `41126DCF8E0BFB0B1D583F2F52A05E9D34607B6A459A37E80006AF1167424B5D`。
旧84項目の対象SQL：26,512 bytes / `2E3A036D0F6305149601170E6B4718BB1AC0850E555DF9AF2497065C88753286`。旧証跡は書き換えない。
コード基点：snownow55/snownow、feat/supabase-auth、75ae113f9db5560692ff4aeef8fcafc571b72f8e。
今回の変更は未コミット。Windowsへの取り込み・ハッシュ確認もまだ未実施。

## ②の最小構成

- snownow-devのみ。Project Reference viidjrhaoxcvunbfdbni。Session pooler aws-0-ap-northeast-1.pooler.supabase.com:5432。
- 実適用直前に、既存の取得方法を最小限用い、新しい私用フォルダーへcustom dumpを1回取得。TLS verify-full、既存postgresの非表示認証、read-onlyを維持。投稿/Auth等の更新状況からバックアップ時点を記録する。
- SHA-256、TOC、pg_restore --file=/dev/nullによるアーカイブ読出しを確認。実データ・SQL・認証値はCloud/Drive/Git/チャットへ送らない。
- 元バックアップ・元ボリュームは保持。旧テスト投稿の全行一致、最新dumpによる追加全面リハーサル、汎用自動復旧ツール開発は不要。停止した最新差分ツール案は未完成・採用しない。
- SQLとデータを含むファイルはバイト列で扱う。SQL全体のCRLF→LF置換、PowerShell 5.1のテキストパイプを禁止。シェルだけLF化してよい。
- 既存バックアップスクリプトの固定件数チェックを新しい運用の合格条件にしない。旧取得/復旧スクリプトを無条件で再実行しない。

## 復旧の最低条件

移行は単一トランザクション。失敗時は停止し、DB/履歴を確認してから判断する。接続断で無条件再実行しない。
コミット後の不具合は公開停止と前進修正を第一候補とする。旧投稿の復活は要件外。
既存のアプリ限定復旧の検証成果は保管するが、最新状態へ未検証のまま実行しない。Auth・管理event triggerへの全面restoreやバックアップからの一括上書きを標準復旧にしない。
安全な前進修正で対応できない構造差分がある場合だけ、その時点で復旧対象を限定して別途確認する。

③の具体的な手順は[適用準備手順](step2-hosted-application-plan.md)。実適用/push/deployの承認を意味しない。
