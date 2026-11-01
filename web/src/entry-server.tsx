// サーバー側エントリ。Rust (rquickjs) からリクエストごとに呼ばれる。
// `vite build --ssr` で依存込みの単一 ESM にバンドルされる。
//
//   render(requestJson)   → RenderResult の JSON（HTML の SSR）
//   loadPage(requestJson) → PageEntry の JSON（クライアント遷移用の /_data/...）
import { renderToString } from "preact-render-to-string";
import { clearLocation, setLocation } from "./server/environment.ts";
import { App } from "./App.tsx";
import { host } from "./host.ts";
import { clearPages, documentTitle, primePage } from "./page-data.ts";
import { matchRoute } from "./routes.ts";
import type { PageEntry, RenderResult, ServerRequest } from "./types.ts";

/** ルートの loader を実行してページデータを作る */
function buildEntry(req: ServerRequest): PageEntry {
  const { route, params } = matchRoute(req.path);
  const { status = 200, ...data } = route.loader
    ? route.loader({ params, query: req.query, request: req, host })
    : {};
  return {
    status,
    title: route.title(data),
    routePath: route.path,
    data,
    request: {
      ...req,
      params,
      routePath: route.path,
      worker: host.workerId(),
      renderedAt: new Date(req.nowMs).toISOString(),
    },
  };
}

export function render(requestJson: string): string {
  const req: ServerRequest = JSON.parse(requestJson);
  const entry = buildEntry(req);

  // Context はリクエスト間で再利用されるので、リクエスト固有の状態は描画後に必ず消す
  setLocation(req.origin + req.path + req.search);
  try {
    // LocationProvider と同じ方法で URL キーを作る（useLocation().url と一致させる）
    primePage(location.pathname + location.search, entry);
    const result: RenderResult = {
      status: entry.status,
      title: documentTitle(entry.title),
      html: renderToString(<App />),
      state: entry,
    };
    return JSON.stringify(result);
  } finally {
    clearPages();
    clearLocation();
  }
}

export function loadPage(requestJson: string): string {
  return JSON.stringify(buildEntry(JSON.parse(requestJson)));
}
