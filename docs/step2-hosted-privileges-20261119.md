# Hosted権限確認① 記録

2026-11-19 JST。根拠はユーザー提示のSQL Editor結果スクリーンショット3点。
Project Reference: viidjrhaoxcvunbfdbni / snownow-dev。
postgres実行を前提とする権限メタデータ確認：PASS。
session_user/current_user=postgres、transaction_read_only=on、非superuser、CREATEROLE/BYPASSRLSあり。
アプリ4objectの所有権、public/privateの利用・作成・付与権限、Auth必要4列SELECT/id REFERENCES/uid EXECUTEを確認。
旧関数はpostgres所有、固定search_pathあり。新writer/5関数の名前衝突なし。
AuthスキーマCREATE/GRANT OPTIONなしは設計上想定内。
新writerへの実SET ROLE、将来のCLI認証・実効ロールは未検証。後者は③で確認する。
Cloudからの直接接続・実SQL適用を行った記録ではない。原CSVは容量不足で未読、JSON原本はWindowsに保持。

## 現在の進捗

- 既存84項目および実バックアップ復旧PASSを維持。再実行なし。
- ① PASS（上記範囲）。
- ② 最新バックアップ差分・復旧成果物：Windows実行待ち。未取得・未判定。
- ③ Hosted CLI履歴/dry-run：未実施・今回対象外。
- ④ 適用/push/deploy：未承認・未実施。STEP3禁止。

今回①②の読み取り専用接続・Windowsへの取得・ローカル成果物生成のみ承認済み。
