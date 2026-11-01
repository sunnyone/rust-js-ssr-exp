// サーバー側エントリ。Rust (rquickjs) からリクエストごとに render() が呼ばれる。
// `vite build --ssr` で依存込みの単一 ESM にバンドルされる。
import { renderToString } from "preact-render-to-string";
import { App } from "./App.tsx";
import { host } from "./host.ts";
import { findRoute } from "./router.ts";
import { notFound, routes } from "./routes.ts";
import type { RenderResult, RequestInfo, ServerRequest } from "./types.ts";

/**
 * @param requestJson Rust から渡されるリクエスト情報 (ServerRequest の JSON)
 * @returns RenderResult の JSON
 */
export function render(requestJson: string): string {
  const req: ServerRequest = JSON.parse(requestJson);
  const matched = findRoute(routes, req.path);
  const route = matched ? matched.route : notFound;
  const params = matched ? matched.params : {};

  const { status = 200, ...data } = route.loader
    ? route.loader({ params, query: req.query, request: req, host })
    : {};

  const request: RequestInfo = {
    ...req,
    params,
    routePath: route.path,
    worker: host.workerId(),
    renderedAt: new Date(req.nowMs).toISOString(),
  };
  const html = renderToString(<App page={route.component} data={data} request={request} />);

  const result: RenderResult = {
    status,
    title: route.title(data),
    html,
    state: { routePath: route.path, data, request },
  };
  return JSON.stringify(result);
}
