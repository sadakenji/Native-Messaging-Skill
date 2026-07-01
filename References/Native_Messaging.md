# Native_Messaging.md

このファイルは、本プロジェクトにおけるNative Messaging機能実装の方針について述べる。

## 概要

本体の拡張機能からテキストを送信し、ネイティブホストが受信メッセージに応じて動作を実行した後、応答を返す。

## アーキテクチャ

- 本体のChrome拡張 (Manifest V3)。`chrome.runtime。sendNativeMessage` でホストと通信
- **host/** — このサブディレクトリにNative Messagingのホスト側ファイル、スクリプトおよびホストマニュフェストJSONを収める。スクリプトは`host.bat` → `host.ps1` の2段構成。
  - `host.bat`: Chromeから起動されるエントリポイント（PowerShellを呼び出すラッパー）。
  - `host.ps1`: Native Messagingバイナリプロトコル（4バイト長さプレフィックス + JSON）の処理本体。
- **install_host.bat** — ホストマニフェストJSON生成 + レジストリ登録（`HKCU\Software\Google\Chrome\NativeMessagingHosts\...`）。
- **uninstall_host.bat** — レジストリからホスト登録を削除。
- すべての .bat および .ps1 スクリプトの内容は半角英数記号のみ。

## セットアップ

- ブラウザ側に機能拡張をインストールし、拡張IDを得る。
```
install_host.bat   # 拡張IDを入力 → マニフェスト生成 + レジストリ登録
```

## Windows固有の注意点

- 多バイト文字に起因する問題を避けるため、すべての .bat および .ps1 スクリプトの内容は半角英数記号のみとする。
