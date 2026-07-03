---
name: native-messaging
description: >-
  Chrome 拡張機能の Native Messaging（拡張機能とローカル PC 上のネイティブホスト間通信）を
  Windows でセットアップ・実装するための Skill。Node.js 製ホストスクリプト、ホストマニフェスト
  JSON、拡張 ID を手動入力して HKCU レジストリに登録する install/uninstall バッチ、および
  拡張側サンプル（manifest.json + sendNativeMessage 版 / connectNative 常時接続版）を一式生成する。
  ユーザーが Native Messaging、ネイティブホスト、native host、sendNativeMessage、
  connectNative、あるいは「ブラウザ拡張からローカルのプログラム・ファイル・OS コマンド・
  ローカルアプリを呼び出したい / 起動したい」といった話題に触れたら、明示的に「Native Messaging」
  と言わなくても必ずこの Skill を使うこと。
---

# Native Messaging 実装 Skill

Chrome 拡張機能から、ローカル PC 上のネイティブホスト（Node.js プログラム）を呼び出す
Native Messaging 機能を、Windows 上に最小構成でセットアップする。

## この Skill が作るもの

`assets/` にテンプレート一式がある。これをユーザーのプロジェクトへコピーし、プレースホルダー
を置換して使う。

```
host/
  host.js            # ネイティブホスト本体（Node.js, stdio）
  host.bat           # Chrome から起動されるラッパー（node host.js を呼ぶ）
scripts/
  gen_extension_key.js  # 拡張 ID を固定する鍵を生成し ID を算出（任意）
install_host.bat     # マニフェスト生成 + HKCU レジストリ登録（ID 自動検出 / 手動入力）
uninstall_host.bat   # レジストリ削除 + マニフェスト削除
extension/           # 動作確認用の最小拡張サンプル
  manifest.json      # MV3, "nativeMessaging" permission
  background.js               # sendNativeMessage（単発）で host と通信
  background-connectnative.js # connectNative（常時接続）で host と通信。使う方を選んで background.js として使う
  popup.html / popup.js
```

ユーザーに**既存の拡張機能がある**場合は `extension/` は参考用とし、`background.js` の
`sendNativeMessage` 呼び出しパターンと `"nativeMessaging"` permission だけを既存拡張に取り込む。

## 実装の前提知識

- ブラウザ ⇔ ホストは **4 バイトのリトルエンディアン長さプレフィックス + UTF-8 JSON 本文** で
  通信する。`host.js` がこのエンコード/デコードを実装済み。
- ホストは stdout を**プロトコル専用**に使う。ログは stderr へ（`console.log` は stdout を
  壊すので使わない）。
- Chrome は `.js` を直接起動できないため、マニフェストの `path` は `host.bat` を指す。
- レジストリ登録先は `HKCU\Software\Google\Chrome\NativeMessagingHosts\<HOST_NAME>`
  （ユーザー単位・管理者権限不要）。
- **`connectNative` で常時接続の Port を保持する場合、置き場所は background service worker
  一択。** `chrome.offscreen` の offscreen document は「アイドルタイムアウトの対象外で長寿命」
  という理由で選びたくなるが、Native Messaging 関連 API（`connectNative` /
  `sendNativeMessage` とも）を**呼び出せない**（`TypeError: connectNative is not a
  function`）。一方 Chrome は「native messaging の Port が接続されている間は service worker を
  アイドル終了させない」ため、素直に service worker に Port を持たせてよい。

詳細なプロトコル仕様・`connectNative` での常駐通信の設計・トラブルシューティングは
[references/protocol-and-troubleshooting.md](references/protocol-and-troubleshooting.md)
を参照する。特に `connectNative` を使う実装に着手する前に「常時接続 (connectNative) の設計」の
節には目を通しておく（同じ落とし穴に一度はまった経験に基づく）。

## セットアップ手順

ユーザーと一緒に次の順で進める。各ステップで何を聞き、何を置換するかを示す。

### 1. ホスト名を決める

逆ドメイン形式の小文字 `com.<vendor>.<product>` を決める（例 `com.tverdownloader.host`）。
これは複数箇所で**完全一致**させる必要があるキー。ユーザーに確認するか、プロジェクト名から提案する。

置換対象（既定値はすべて `com.example.host`）:
- `install_host.bat` の `set HOST_NAME=...` と `set HOST_DESCRIPTION=...`
- `uninstall_host.bat` の `set HOST_NAME=...`
- `extension/background.js`（`connectNative` を使う場合は `background-connectnative.js`）の
  `const HOST_NAME = ...`

### 2. テンプレートをコピーする

`assets/host/`, `assets/install_host.bat`, `assets/uninstall_host.bat` をユーザーのプロジェクト
直下へコピーする（`install_host.bat` と同じ階層に `host/` が来る配置を保つ — `%~dp0host` で
解決するため）。既存拡張がなければ `assets/extension/` もコピーする。

### 3. ホストの処理を実装する

`host.js` の `handleMessage(message)` を、ユーザーがやりたい処理に書き換える。受信した JSON
オブジェクトを受け取り、レスポンスのオブジェクトを返す（または `undefined` で無応答）。
非同期処理（ファイル I/O、子プロセス起動など）は `async/await` で書ける。テンプレートは
受信内容をそのまま返すエコー実装になっている。

ユーザーの要件をヒアリングしてここを実装する。外部コマンドを起動するなら `child_process`、
ファイル操作なら `fs/promises` を使う。

### 3.5. 接続方式を選ぶ

以下のいずれかに該当するかをユーザーに確認する。該当すれば `connectNative`（常時接続）、
しなければ既定の `sendNativeMessage`（単発）でよい。

- 拡張側の異常終了・切断を、どのメッセージを処理中だったかまで含めて検知したい
- 1 回の呼び出しで完結しない、継続的なやり取り（進捗通知・ストリーミングなど）が必要

`connectNative` を選ぶ場合:
- `extension/background-connectnative.js` の内容を `background.js` として使う
  （キュー管理・1 件ずつ ack を待つ実装・disconnect 時のエラーハンドリング込み）。
- Port を保持するコンテキストは **background service worker** に固定する（理由は上記
  「実装の前提知識」および
  [references/protocol-and-troubleshooting.md](references/protocol-and-troubleshooting.md)
  の「常時接続 (connectNative) の設計」を参照）。offscreen document は候補にしない。
- 呼び出し側（popup など）は `chrome.runtime.sendMessage` でリクエストを 1 件ずつ送り、
  service worker からの応答を直接待つ。呼び出し側 → service worker → 別コンテキスト、という
  中継は挟まない（中継先の応答待ち中に service worker がアイドル終了すると "The message port
  closed before a response was received." で応答を失う）。
- `host.js` の `inFlight` 変数と `stdin` の `end` ハンドラで、切断時に処理中だったメッセージを
  ログできる（テンプレートに実装済み）。

### 4. 拡張機能 ID を確定する

拡張 ID は 2 通りで確定できる。**鍵方式（推奨）**を既定とし、不要なら従来の手動取得でもよい。

**鍵方式（推奨・ID を事前固定）**

`node scripts/gen_extension_key.js` を実行する。これは次を行う:
- RSA 鍵ペアを生成し秘密鍵を `scripts/extension_key.pem` に保存
- `extension/manifest.json` に公開鍵 `key` を埋め込み、ID を**リロードや将来のストア公開でも不変**に固定
- 算出した ID を `host/extension_id.txt` に書き出す（次の手順で `install_host.bat` が自動利用）

利点は、Chrome へロードする前に ID が確定し、手動でコピペする必要がないこと。注意点として
`extension_key.pem` は**紛失すると ID が変わる**ため保管し、公開リポジトリにコミットしない
（`.gitignore` 済み。鍵を共有するとなりすましが可能になる）。

Claude Code から実行する場合、毎回の確認プロンプトが煩わしければ `.claude/settings.local.json`
の `permissions.allow` に `"Bash(node scripts/gen_extension_key.js)"` を追加しておくと以後は
自動実行される（このファイルは個人環境のローカル設定なので配布・共有はしない）。

**手動方式（鍵を使わない場合）**

`chrome://extensions` でデベロッパーモードを有効にし、拡張フォルダを読み込んで表示される
**拡張機能 ID**（32 文字の英小文字）を控える。この場合 `extension_id.txt` は作られないので、
次の手順で `install_host.bat` がプロンプトで ID を尋ねる。

### 5. 拡張機能をロードする

`chrome://extensions` →「パッケージ化されていない拡張機能を読み込む」で拡張フォルダを読み込む。
鍵方式なら表示される ID が手順 4 で算出した ID と一致することを確認する。

### 6. ホストを登録する

プロジェクト直下で `install_host.bat` を実行する。`host/extension_id.txt` があれば ID を
自動検出し、無ければプロンプトで尋ねる。これでマニフェスト JSON が `host/<HOST_NAME>.json`
に生成され、レジストリに登録される。Node.js が PATH にない場合はバッチがエラーを出すので、
先に Node.js を導入する。

### 7. 動作確認する

拡張のポップアップ（サンプルなら「Send to host」ボタン）から送信し、ホストの応答が返るか確認する。
返らない場合は
[references/protocol-and-troubleshooting.md](references/protocol-and-troubleshooting.md)
のトラブルシューティングを参照する（多くは ID 不一致・`HOST_NAME` 不一致・Node.js が PATH に
ない、のいずれか）。`connectNative` を使っている場合は同ファイルの「切り分けの手順」に従い、
ホスト単体 → Port を保持するコンテキストの DevTools コンソール → 拡張全体、の順で層ごとに
確認すると原因箇所を素早く絞り込める。

## Windows 固有の制約（厳守）

- すべての `.bat` / `.ps1` の内容は**半角英数記号のみ**。多バイト文字はコードページ依存で
  文字化け・実行失敗の原因になるため、日本語コメントなどを入れない。
- マニフェストの `path` とレジストリは絶対パスで登録される。`host/` フォルダを移動したら
  `install_host.bat` を再実行して登録し直す。

## 対象範囲

この Skill は **Windows + Chrome** を対象とする。Edge を追加する場合や macOS/Linux の
マニフェスト配置は
[references/protocol-and-troubleshooting.md](references/protocol-and-troubleshooting.md)
のレジストリ登録の項を参照して拡張する。
