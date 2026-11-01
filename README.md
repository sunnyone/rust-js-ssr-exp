# Preact SSR on Rust (axum + rquickjs)

Preact + TypeScript (TSX) のアプリを、**リクエストごとに** Rust (axum) 内の QuickJS (rquickjs) でサーバーサイドレンダリングし、
ブラウザでは同じ TSX から作ったクライアントバンドルでハイドレーションする検証用プロジェクトです。
ハイドレーション後のページ遷移は [preact-iso](https://github.com/preactjs/preact-iso) のルーターがクライアント側で行い、
ページのデータ（loader の結果）だけを Rust から JSON で取得します。

- **ビルド時**: Node.js + npm + Vite（`web/`）
- **実行時**: Rust のバイナリと `web/dist/` だけ。**Node.js は不要**

```
[ビルド]  web/src/*.tsx ──vite build──────────▶ web/dist/client/assets/*.js, *.css, .vite/manifest.json
                        └─vite build --ssr────▶ web/dist/server/entry-server.js（依存同梱の単一 ESM）

[実行]  ブラウザ ──GET /posts/2──▶ axum ──job──▶ SSR ワーカースレッド (rquickjs Runtime/Context × N)
                                                 └ entry-server.js の render(request) を呼ぶ
                                                   ├ route.loader → __host.getPost() (Rust 関数)
                                                   └ preact-render-to-string で HTML 生成
               ◀── HTML + 状態JSON + <script src="/assets/entry-client-*.js"> ──┘
        ブラウザ ── /assets/entry-client-*.js を読み込み hydrate()

[遷移]  リンククリック → preact-iso が pushState → ページが Promise を throw して suspend（前のページを表示したまま）
        ブラウザ ──GET /_data/posts/3──▶ axum ──job──▶ entry-server.js の loadPage(request) → loader の結果 (JSON)
               ◀── PageEntry JSON ──┘ → 新しいページを描画、document.title を更新
```

## 構成

| パス | 内容 |
| --- | --- |
| `web/` | Preact アプリ（npm プロジェクト、Vite、TypeScript） |
| `web/src/entry-server.tsx` | SSR エントリ。`render(requestJson)`（HTML）と `loadPage(requestJson)`（遷移用データ）を export |
| `web/src/entry-client.tsx` | ブラウザエントリ。埋め込まれた状態をキャッシュに入れて `hydrate()` |
| `web/src/App.tsx` | preact-iso の `LocationProvider` / `Router` によるルーティング |
| `web/src/routes.ts` | ルート定義（`loader` はサーバーでのみ実行され、Rust の関数を呼べる） |
| `web/src/page-data.ts` | URL ごとのページデータのキャッシュ。未取得なら `/_data/...` を fetch して suspend |
| `web/src/server/environment.ts` | QuickJS 用の `URL`（core-js）と、リクエストごとの `location` スタブ |
| `web/src/host.ts` | Rust が公開する `__host` の型付きラッパー（サーバー専用） |
| `web/src/types.ts` | Rust ↔ JS 間でやり取りするデータの型 |
| `web/scripts/check-hydration.mjs` | 起動中のサーバーに対するハイドレーション検証（happy-dom） |
| `src/assets.rs` | `web/dist` の読み込み。Vite manifest からクライアントの script / css タグを生成 |
| `src/ssr.rs` | rquickjs ワーカープール。`console`・`__host` の公開、タイムアウト（interrupt handler）、メモリ上限 |
| `src/main.rs` | axum。`/assets/*` は Vite の出力を配信（長期キャッシュ）、`/_data/*` は遷移用 JSON、それ以外の GET はすべて SSR |

ポイント:

- **SSG ではない**: HTML ファイルは生成しません。リクエストのパス・クエリ・User-Agent・時刻などを JS に渡し、その場で `renderToString` します。
- SSR バンドルは `ssr.noExternal: true` / `ssr.target: "webworker"` で依存を全部含む単一 ESM にしているため、QuickJS 側にモジュールローダーや Node API は不要です。
- QuickJS の Runtime はスレッド間で共有できないため、OS スレッド N 本がそれぞれ Runtime/Context を持ち、起動時にバンドルを一度だけ評価して `render` を保持します。
- `render()` の結果のうち `state`（loader のデータとリクエスト情報）は HTML に JSON で埋め込まれ、ブラウザは同じ props でハイドレーションします。
- サーバーとブラウザは同じ preact-iso のルートマッチ（`exec`）を使うので、SSR・`/_data`・クライアント描画で選ばれるルートが一致します。

## 実行

```sh
# 1. フロントエンドのビルド（Node.js が必要なのはここだけ）
cd web && npm ci && npm run build && cd ..

# 2. サーバー起動（Node.js 不要）
cargo run --release
# → http://localhost:3000/ , /counter?start=42 , /posts , /posts/2 , /nope (404)
```

デプロイ時に必要なのは `target/release/preact-ssr-rquickjs` と `web/dist/` です（`WEB_DIST` で場所を指定）。

環境変数: `PORT`（既定 3000）、`WEB_DIST`（既定はこのリポジトリの `web/dist`）、`SSR_WORKERS`（既定 CPU 数）、
`SSR_TIMEOUT_MS`（1 リクエストの JS 実行上限。既定 2000）、`RUST_LOG`。

レスポンスヘッダ `x-ssr-worker`（担当ワーカー）と `server-timing: ssr;dur=...`（JS レンダリング時間）を付けています。

## テスト・検証

```sh
cargo test                       # manifest からのタグ生成
cd web && npm run typecheck      # TypeScript の型チェック
cd web && npm run check:hydration -- http://localhost:3000   # サーバー起動中に実行
```

`check:hydration` は SSR された HTML を happy-dom に読み込み、ビルド済みのクライアントバンドルを実行して、
ハイドレーション（バッジの切り替え）、SSR 値の引き継ぎ、ボタン操作に加えて、
クライアント遷移（再読み込みなしで `/_data` から取得、`history.back()`、同一ルートでのクエリ変更、404）を確認します。

## 制約・メモ

- サーバーは起動時に `web/dist` を読み込みます。フロントエンドを変更したら `npm run build` してサーバーを再起動してください。
- ワーカーの Context はリクエスト間で再利用されます（起動コスト削減のため）。モジュールのトップレベル変数やグローバルに状態を置くと他のリクエストに漏れるので、リクエスト固有の値は `render()` の引数経由で扱ってください。
- `render()` は同期です。`fetch` などの非同期 API は QuickJS 側に用意していないため、データは loader から Rust の同期関数経由で取得します。
- preact-iso は `location` と `URL` をサーバーでも参照しますが QuickJS には無いので、SSR バンドルにだけ core-js の `URL` を含め、
  `location` は描画中だけリクエストの URL で差し替えます（このため SSR バンドルが約 190KB になります）。
- preact-iso は `sideEffects: false` ですが、Router がデータ取得待ち（throw された Promise）を受け取るための `options` フックは
  `preact-iso/lazy` のトップレベルにあります。`ErrorBoundary` を使ってこのモジュールをバンドルに残しています。
- suspend したページは Router の再描画だけでは描き直されないため、`usePageEntry()` は preact-iso の `lazy()` と同様に
  データ取得後に自身を再描画します。
- 遷移先のデータは毎回サーバーから取得します（表示中のページ以外のキャッシュは遷移時に破棄）。
