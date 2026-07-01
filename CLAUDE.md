# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 本プロジェクトについて

- 本プロジェクトでは Chrome 拡張機能の **Native Messaging** を実装する **Skill** を作成する。
- 現時点ではまだ Skill 本体（成果物）は未実装で、`References/` 配下に既存プロジェクト（TVer Downloader）から流用した参考ファイルのみが存在する。
- ビルド・lint・テストのコマンドは未定義（`package.json` 等は未作成）。Node.js ホストを採用する場合は導入時にこのファイルへ追記すること。

## Skill 作成の方針

- `References/` 配下の、既存プロジェクトの成果物の一部であるファイルを参考にする。
- `install_host.bat` へ Chrome 拡張機能の ID を**手動入力**する方式を引き継ぐ（自動検出はしない）。
- ホストスクリプトの構成は、`References/Native_Messaging.md` が示す `host.bat` → `host.ps1` の PowerShell 2 段構成から、**Node.js を採用する構成へ変更してもよい**。

## アーキテクチャ（References が示す想定構成）

拡張機能が `chrome.runtime.sendNativeMessage` でテキストを送信 → ネイティブホストが受信メッセージに応じて処理を実行 → 応答を返す、という片方向リクエスト/レスポンス型。

- **拡張機能側**: Chrome 拡張 (Manifest V3)。
- **host/**: ホスト側ファイルを収めるサブディレクトリ。
  - ホストスクリプト（`host.bat` → `host.ps1`、または Node.js 構成）。
  - ホストマニフェスト JSON（`install_host.bat` が生成）。
- **install_host.bat**: 拡張 ID を入力 → ホストマニフェスト JSON 生成 → レジストリ `HKCU\Software\Google\Chrome\NativeMessagingHosts\<HOST_NAME>` に登録。
- **uninstall_host.bat**: レジストリ登録の削除 + マニフェスト JSON の削除。

マニフェストの `path` はホストスクリプトの絶対パス（`%~dp0` 起点）を指す。Native Messaging のバイナリプロトコルは **4 バイトのリトルエンディアン長さプレフィックス + UTF-8 JSON 本文**。

## セットアップ手順

1. ブラウザに拡張機能をインストールし、拡張 ID を取得する。
2. `install_host.bat` を実行し、プロンプトに拡張 ID を入力する（マニフェスト生成 + レジストリ登録）。
3. 解除は `uninstall_host.bat` を実行する。

## Windows 固有の制約（厳守）

- 多バイト文字に起因する文字化け・実行エラーを避けるため、**すべての `.bat` および `.ps1` スクリプトの内容は半角英数記号のみ**で記述する（日本語コメント等を含めない）。
- レジストリ登録先は `HKCU`（ユーザー単位、管理者権限不要）。
