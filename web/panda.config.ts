import { defineConfig } from "@pandacss/dev";

export default defineConfig({
  // preset-panda の既定トークン（全カラーパレット等）は CSS 変数として全量出力されるため使わず、
  // 必要なトークンだけを下で定義する
  presets: ["@pandacss/preset-base"],
  // ブラウザ既定のスタイル（見出しの余白など）をそのまま使う
  preflight: false,
  include: ["./src/**/*.{ts,tsx}"],
  exclude: [],
  outdir: "styled-system",
  jsxStyleProps: "none",
  theme: {
    extend: {
      semanticTokens: {
        colors: {
          fg: { DEFAULT: { value: "#1f2328" }, muted: { value: "#656d76" } },
          canvas: { value: "#f6f8fa" },
          surface: { value: "#ffffff" },
          border: { value: "#d0d7de" },
          accent: { value: "#0969da" },
          neutral: { subtle: { value: "#eaeef2" } },
          success: { fg: { value: "#1a7f37" }, subtle: { value: "#dafbe1" } },
          attention: { fg: { value: "#9a6700" } },
        },
      },
    },
  },
  globalCss: {
    ":root": {
      fontFamily: "system-ui, sans-serif",
      color: "fg",
      bg: "canvas",
    },
    body: { margin: "0" },
  },
});
