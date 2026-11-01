import { defineConfig } from "vite";

// 2 種類のビルドを出力する:
//   vite build        → dist/client/  ブラウザ用バンドル + .vite/manifest.json（Rust が HTML に埋め込む script/css を引く）
//   vite build --ssr  → dist/server/entry-server.js  QuickJS 用の単一 ESM（依存をすべて同梱、Node API に依存しない）
export default defineConfig(({ isSsrBuild }) => ({
  oxc: {
    jsx: { runtime: "automatic", importSource: "preact" },
  },
  ssr: {
    // Node の組み込みモジュールや外部パッケージ解決を前提にせず、すべてバンドルする
    target: "webworker",
    noExternal: true,
  },
  build: isSsrBuild
    ? {
        outDir: "dist/server",
        target: "es2022",
        minify: false,
        rolldownOptions: {
          output: { format: "es", entryFileNames: "entry-server.js", codeSplitting: false },
        },
      }
    : {
        outDir: "dist/client",
        manifest: true,
        target: "es2022",
        rolldownOptions: { input: "src/entry-client.tsx" },
      },
}));
