# Native Messaging: プロトコル詳細とトラブルシューティング

SKILL.md の手順で詰まったとき、または挙動を深く理解したいときに参照する。

## 目次

- [ワイヤープロトコル](#ワイヤープロトコル)
- [接続方式: sendNativeMessage と connectNative](#接続方式-sendnativemessage-と-connectnative)
- [ホストマニフェストの仕様](#ホストマニフェストの仕様)
- [拡張機能 ID の決まり方と固定方法](#拡張機能-id-の決まり方と固定方法)
- [レジストリ登録](#レジストリ登録)
- [Windows 固有の注意点](#windows-固有の注意点)
- [トラブルシューティング](#トラブルシューティング)

## ワイヤープロトコル

ブラウザとホストは stdin/stdout 上で次の形式のメッセージをやり取りする。

```
[4 バイト: メッセージ長 (リトルエンディアン unsigned int32)] [UTF-8 JSON 本文]
```

- 長さプレフィックスは JSON 本文のバイト数（文字数ではない）。
- ブラウザ → ホストの 1 メッセージ最大は 4GB だが、ホスト → ブラウザは 1MB。
- ホストは stdout に**バイナリをそのまま**書く。`console.log` は改行を付与し壊れるので使わない。Node.js では `process.stdout.write(buffer)` を使う。
- ホストのデバッグログは必ず **stderr** か別ファイルに出す（stdout はプロトコル専用）。

## 接続方式: sendNativeMessage と connectNative

| 方式 | 用途 | ホストの寿命 |
| --- | --- | --- |
| `chrome.runtime.sendNativeMessage(host, msg, cb)` | 1 回のリクエスト/レスポンス | メッセージ 1 往復ごとにホスト起動→終了 |
| `chrome.runtime.connectNative(host)` | 継続的な双方向通信 | ポートを `disconnect()` するまでホスト常駐 |

本テンプレートの `host.js` は両対応（stdin が閉じるまでループ）。`sendNativeMessage` なら 1 メッセージ処理後に Chrome が stdin を閉じてホストが終了する。常駐させたい場合は拡張側を `connectNative` + `port.postMessage` / `port.onMessage` に変更する。

## ホストマニフェストの仕様

`install_host.bat` が生成する JSON。

```json
{
  "name": "com.example.host",
  "description": "Example Native Messaging Host",
  "path": "C:\\path\\to\\host\\host.bat",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://<EXTENSION_ID>/"]
}
```

- `name`: 逆ドメイン形式の小文字 + 数字 + ドット + アンダースコア。拡張側の `HOST_NAME` と完全一致させる。
- `path`: ホスト起動エントリの**絶対パス**。Windows ではバックスラッシュを `\\` とエスケープする。Chrome は `.exe` / `.bat` / `.com` を直接起動できるが `.js` は不可 → `host.bat` 経由にする。
- `allowed_origins`: 末尾スラッシュ必須。複数拡張を許可するなら配列に追加する。

## 拡張機能 ID の決まり方と固定方法

Chrome の拡張機能 ID は **SHA-256 ハッシュの先頭 16 バイト**を、各 nibble（0〜15）を
`a`〜`p` にマッピングした 32 文字。何のハッシュを取るかで決まり方が変わる。

- **manifest に `key` がある場合**: その公開鍵（DER）のハッシュ。ID が固定され、unpacked でも
  ストア公開後でも不変。`scripts/gen_extension_key.js` はこの方式で ID を事前確定する。
- **`key` が無い unpacked 拡張**: 拡張フォルダの**絶対パス**のハッシュ。フォルダを移動すると
  ID が変わる。
- **ストア公開拡張**: アップロード時に Chrome Web Store が割り当てた鍵のハッシュ（固定）。

`gen_extension_key.js` が使う算出式（Node.js）:

```js
const crypto = require("crypto");
function extensionIdFromDer(der) {
  const hash = crypto.createHash("sha256").update(der).digest();
  let id = "";
  for (let i = 0; i < 16; i++) {
    id += String.fromCharCode(97 + (hash[i] >> 4));
    id += String.fromCharCode(97 + (hash[i] & 0x0f));
  }
  return id;
}
```

`extension_key.pem`（秘密鍵）を紛失すると同じ ID を再現できない。保管し、公開リポジトリには
コミットしない（鍵を共有するとなりすましが可能になる）。

## レジストリ登録

Chrome はマニフェストの場所を以下から探す（Windows）。

```
HKCU\Software\Google\Chrome\NativeMessagingHosts\<HOST_NAME>   (ユーザー単位・管理者不要)
HKLM\Software\Google\Chrome\NativeMessagingHosts\<HOST_NAME>   (全ユーザー・管理者必要)
```

既定値 `(Default)` にマニフェスト JSON の絶対パスを設定する。Edge を対象にするなら `Software\Microsoft\Edge\NativeMessagingHosts\<HOST_NAME>` にも同様に登録する。

## Windows 固有の注意点

- すべての `.bat` / `.ps1` の内容は**半角英数記号のみ**。多バイト文字はコードページ依存で文字化け・実行失敗の原因になる。
- ホストからファイルやコマンドを扱う際、パスに日本語が含まれると Node.js 側は UTF-8 で扱えるが、子プロセス起動時のコードページに注意。
- `host.bat` は `%~dp0`（バッチ自身のディレクトリ）起点で `host.js` を解決するので、フォルダごと移動しても動く。ただし移動したらマニフェストの `path` とレジストリを再登録（`install_host.bat` を再実行）する。

## トラブルシューティング

**"Specified native messaging host not found"**
- レジストリのキー名と `HOST_NAME` が一致しているか。
- レジストリの値がマニフェスト JSON の絶対パスを正しく指しているか。
- マニフェスト JSON が実在するか（`install_host.bat` 実行済みか）。

**"Access to the specified native messaging host is forbidden"**
- マニフェストの `allowed_origins` の拡張 ID が、実際にロードした拡張の ID と一致しているか。`chrome://extensions` で確認。末尾スラッシュも必要。

**"Native host has exited" / すぐ切断される**
- ホストが stdout にプロトコル外のデータ（ログ・BOM・改行）を書いていないか。
- `node` が PATH にあるか（`host.bat` の `node` 起動が失敗していないか）。`where node` で確認。
- ホストスクリプトが例外で即終了していないか。stderr をファイルにリダイレクトして確認: `host.bat` を `node "%~dp0host.js" 2>> "%~dp0host.err.log"` に一時変更する。

**メッセージが文字化けする / JSON パースエラー**
- 長さプレフィックスをバイト数で計算しているか（`Buffer.byteLength` 相当）。
- リトルエンディアンで読み書きしているか（`readUInt32LE` / `writeUInt32LE`）。

**変更が反映されない**
- 拡張を再読み込み（`chrome://extensions` のリロード）。ホストは毎回起動されるので再起動不要だが、`connectNative` 常駐中はポートを張り直す。
