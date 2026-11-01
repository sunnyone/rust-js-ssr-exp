// 最小限のルーター。サーバーとブラウザの両方で同じコードが動く。
import { createContext } from "preact";
import { useContext } from "preact/hooks";
import type { RequestInfo } from "./types.ts";

/** "/posts/:id" のようなパターンを path に当てて params を返す。マッチしなければ null。 */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split("/").filter(Boolean);
  const s = path.split("/").filter(Boolean);
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}

export function findRoute<R extends { path: string }>(routes: readonly R[], path: string) {
  for (const route of routes) {
    const params = matchPath(route.path, path);
    if (params) return { route, params };
  }
  return null;
}

/** リクエスト情報（URL・ルートパラメータ・サーバー側の付帯情報）をコンポーネントへ渡す */
export const RequestContext = createContext<RequestInfo | null>(null);

export function useRequest(): RequestInfo {
  const req = useContext(RequestContext);
  if (!req) throw new Error("useRequest() must be used inside <App>");
  return req;
}
