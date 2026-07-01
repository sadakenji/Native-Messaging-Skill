# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 本プロジェクトについて

- 本プロジェクトでは Chrome 拡張機能の **Native Messaging** を実装する **Skill** を作成する。
- Skill 本体は `native-messaging/`（`SKILL.md` + `assets/` + `references/`）に実装済み。`References/` 配下は旧プロジェクト（TVer Downloader）から流用した初期の参考ファイルで、現在は経緯の記録として残しているのみ。
- ビルド・lint・テストのコマンドは未定義（`package.json` 等は未作成）。ホスト実装は **Node.js を採用済み**（`native-messaging/assets/host/host.js`）。

## Skill の構成方針（確定事項）

- ホストスクリプトは `References/Native_Messaging.md` が示す `host.bat` → `host.ps1` の PowerShell 2 段構成ではなく、**`host.bat` → `host.js` の Node.js 構成を採用**している。
- 拡張機能 ID の決定方式は、`scripts/gen_extension_key.js` による**鍵方式（自動検出）をデフォルト**とする。RSA 鍵で ID を事前固定し、`host/extension_id.txt` 経由で `install_host.bat` が自動読取する。同ファイルが無い場合のみ、従来通りプロンプトでの**手動入力**にフォールバックする。
- Skill 自体の詳細な手順・置換対象・方針は `native-messaging/SKILL.md` を正とする。プロトコル詳細やトラブルシューティングは `native-messaging/references/protocol-and-troubleshooting.md` を参照する。

## アーキテクチャ

拡張機能が `chrome.runtime.sendNativeMessage` でテキストを送信 → ネイティブホストが受信メッセージに応じて処理を実行 → 応答を返す、という片方向リクエスト/レスポンス型（常駐通信が必要なら `connectNative` に切り替え可能）。

- **拡張機能側**: Chrome 拡張 (Manifest V3)。サンプル一式は `native-messaging/assets/extension/`。
- **host/**: ホスト側ファイルを収めるサブディレクトリ。
  - `host.bat`: Chrome から起動されるラッパー（`node host.js` を呼ぶだけ。Chrome は `.js` を直接起動できないため）。
  - `host.js`: Native Messaging バイナリプロトコルの処理本体（Node.js）。
  - ホストマニフェスト JSON（`install_host.bat` が生成。コミット対象外）。
- **install_host.bat**: 拡張 ID を自動検出（`host/extension_id.txt` があれば）またはプロンプト入力 → ホストマニフェスト JSON 生成 → レジストリ `HKCU\Software\Google\Chrome\NativeMessagingHosts\<HOST_NAME>` に登録。
- **uninstall_host.bat**: レジストリ登録の削除 + マニフェスト JSON の削除。

マニフェストの `path` はホストスクリプトの絶対パス（`%~dp0` 起点）を指す。Native Messaging のバイナリプロトコルは **4 バイトのリトルエンディアン長さプレフィックス + UTF-8 JSON 本文**。

## セットアップ手順

詳細な手順は `native-messaging/SKILL.md` を参照（ホスト名決定・テンプレートコピー・ホスト実装・ID 確定・拡張ロード・登録・動作確認の 7 ステップ）。概略:

1. `node scripts/gen_extension_key.js` を実行し、拡張 ID を事前固定する（鍵方式・推奨）。
2. ブラウザに拡張機能をインストールする（鍵方式なら ID が手順 1 と一致することを確認）。
3. `install_host.bat` を実行する（ID は自動検出、無ければプロンプト入力してマニフェスト生成 + レジストリ登録）。
4. 解除は `uninstall_host.bat` を実行する。

## Windows 固有の制約（厳守）

- 多バイト文字に起因する文字化け・実行エラーを避けるため、**すべての `.bat` および `.ps1` スクリプトの内容は半角英数記号のみ**で記述する（日本語コメント等を含めない）。
- レジストリ登録先は `HKCU`（ユーザー単位、管理者権限不要）。
