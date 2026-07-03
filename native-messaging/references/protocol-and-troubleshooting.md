# Native Messaging: プロトコル詳細とトラブルシューティング

SKILL.md の手順で詰まったとき、または挙動を深く理解したいときに参照する。

## 目次

- [ワイヤープロトコル](#ワイヤープロトコル)
- [接続方式: sendNativeMessage と connectNative](#接続方式-sendnativemessage-と-connectnative)
- [常時接続 (connectNative) の設計](#常時接続-connectnative-の設計)
- [ホストマニフェストの仕様](#ホストマニフェストの仕様)
- [拡張機能 ID の決まり方と固定方法](#拡張機能-id-の決まり方と固定方法)
- [レジストリ登録](#レジストリ登録)
- [Windows 固有の注意点](#windows-固有の注意点)
- [切り分けの手順](#切り分けの手順)
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

本テンプレートの `host.js` は両対応（stdin が閉じるまでループ）。`sendNativeMessage` なら 1 メッセージ処理後に Chrome が stdin を閉じてホストが終了する。常駐させたい場合は拡張側を `connectNative` + `port.postMessage` / `port.onMessage` に変更する（`extension/background-connectnative.js` がそのテンプレート）。

`connectNative` を選ぶ主な動機は、**拡張側の異常終了・切断を、どのメッセージを処理中だったかまで含めて検知できる**こと。Chrome は Port が切断された瞬間にホスト側の `stdin` を確実に close する（EOF）ため、ホストは「切断された」ことだけでなく「その時どのメッセージを処理していたか」まで `stdin` の `end` イベントの時点で把握できる（`host.js` の `inFlight` 変数がこれを実装）。`sendNativeMessage` では往復のたびにホストが終了するため、この検知はできない。

## 常時接続 (connectNative) の設計

`connectNative` で Port を保持する実装は、置き場所の選択を間違えると動かない、あるいは動くように見えて応答を失う。以下は実際に一度はまった落とし穴。

**Port を保持できるのは service worker（または通常の拡張ページ）のみ。offscreen document では不可。**

`chrome.offscreen` の offscreen document は「MV3 の service worker と違いアイドルタイムアウトの対象外で、明示的に閉じるまで存続する」という理由で、長時間の処理や常時接続の置き場所として選びたくなる。しかし offscreen document が使える API は `chrome.runtime` のメッセージング（`onMessage` / `sendMessage`）や DOM API など限られたものだけで、**Native Messaging 関連 API（`connectNative` と `sendNativeMessage` の両方）はそもそも呼び出せない**。呼ぶと次の例外になる。

```
TypeError: chrome.runtime.connectNative is not a function
```

これは実行時エラーであり、権限不足やマニフェストの誤りではない。offscreen document の中では Native Messaging という選択肢自体が存在しないと理解する。

**代わりに background service worker に Port を持たせてよい。**

MV3 の service worker は通常アイドル状態（目安 30 秒）で自動終了するため、長時間の処理の置き場所としては不安定だと考えられがちである。しかし Chrome は「native messaging の Port が接続されている間は service worker をアイドル終了させない」という扱いをドキュメント化しており、これはパスワードマネージャーなど MV3 移行後の拡張機能でも実際に使われている標準的なパターンである。したがって `connectNative` の Port は素直に `background.js`（service worker）で直接保持してよく、offscreen document のような迂回は不要。

**呼び出し元との間に中継を挟まない。**

「呼び出し側（popup 等） → background → 別コンテキストへ中継し、その応答を `await` してから `sendResponse` を呼ぶ」という構成は避ける。中継先の応答を待っている間に service worker がアイドル終了すると応答が失われ、呼び出し側では次のエラーになる。

```
Unchecked runtime.lastError: The message port closed before a response was received.
```

Port を保持しているコンテキストが、そのまま呼び出し元に直接応答する構成にする（`background-connectnative.js` のように、`onMessage` リスナーの中で Port の応答を待ってから `sendResponse` を呼ぶ）。中継のホップを増やすほど、どこかのコンテキストが先に終了して応答を失うリスクが上がる。

**1 件ずつ送って ack を待つ。**

`connectNative` は双方向の Port なので複数メッセージを続けて送ることもできるが、異常終了検知が目的なら送信中のメッセージは常に高々 1 件にする。ホストからの応答（ack）を待ってから次を送ることで、切断時に `host.js` 側で「どのメッセージの処理中に切れたか」を一意に特定できる（`background-connectnative.js` の `queue` + `processing` がこれを実装）。

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

## 切り分けの手順

`connectNative` が動かない・応答が返らないとき、原因が拡張側にあるのかホスト側にあるのか分からないまま拡張全体をいじり回すと時間を浪費する。次の順で層を分けて確認すると、原因箇所を素早く特定できる。

1. **ホスト単体を Chrome を介さず直接叩く。** `node host/host.js` を起動し、長さプレフィックス付きの JSON を標準入力へ手動で流し込んで応答が返るか確認する（`host.bat` 経由でも同様に）。ここで正常なら、レジストリ登録・拡張 ID・`allowed_origins`・`host.js` 自体はすべて問題なく、原因は拡張側にあると分かる。
2. **Port を保持する予定のコンテキストの DevTools コンソールで、中継コードを一切通さずに `connectNative` を直接呼ぶ。** 例えば service worker が保持する設計なら `chrome://extensions` の対象拡張カードにある「Service Worker」検査リンクからそのコンソールを開き、次のようなコードを直接実行する。

   ```js
   const p = chrome.runtime.connectNative("com.example.host");
   p.onMessage.addListener((m) => console.log("message", m));
   p.onDisconnect.addListener(() => console.log("disconnect", chrome.runtime.lastError));
   p.postMessage({ foo: "bar" });
   ```

   ここで `TypeError: connectNative is not a function` が出れば、そのコンテキストが Native Messaging API を使えない（offscreen document など）ことが確定する。`Access to the specified native messaging host is forbidden` のようなエラーなら ID/`allowed_origins` の不一致を疑う。
3. 1・2 がどちらも正常なら、原因は拡張内の中継ロジック（メッセージの受け渡し方、非同期応答の扱い、待機中の service worker のアイドル終了など）にある。

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

**"TypeError: chrome.runtime.connectNative is not a function"（または `sendNativeMessage` が同様に無い）**
- offscreen document（`chrome.offscreen`）の中で呼んでいないか。offscreen document は Native Messaging 関連 API を一切呼び出せない。Port を保持するコードを background service worker（または popup 等の通常の拡張ページ）へ移す。詳細は [常時接続 (connectNative) の設計](#常時接続-connectnative-の設計) を参照。

**"Unchecked runtime.lastError: The message port closed before a response was received."**
- `connectNative` の Port を保持しているコンテキストとは別のコンテキストへメッセージを中継し、その応答を `await` してから `sendResponse` を呼ぶ構成になっていないか。中継先の処理中に service worker がアイドル終了すると応答を失う。Port を保持するコンテキスト自身が呼び出し元へ直接応答する構成に変更する（詳細は [常時接続 (connectNative) の設計](#常時接続-connectnative-の設計)）。
- `connectNative` を使っていない場合は、`sendResponse` を呼ぶ前に別の非同期処理で例外が起きて途中で return していないか、`onMessage` リスナーが `return true` を返し忘れていないかを確認する。

**メッセージが文字化けする / JSON パースエラー**
- 長さプレフィックスをバイト数で計算しているか（`Buffer.byteLength` 相当）。
- リトルエンディアンで読み書きしているか（`readUInt32LE` / `writeUInt32LE`）。

**変更が反映されない**
- 拡張を再読み込み（`chrome://extensions` のリロード）。ホストは毎回起動されるので再起動不要だが、`connectNative` 常駐中はポートを張り直す。
