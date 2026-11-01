import { useState } from "preact/hooks";
import { ErrorBoundary, LocationProvider, Route, Router } from "preact-iso";
import { Layout } from "./components/Layout.tsx";
import { RequestFooter } from "./components/RequestFooter.tsx";
import { retainOnly, usePageEntry } from "./page-data.ts";
import { RequestContext } from "./request.ts";
import { notFound, routes, type RouteDef } from "./routes.ts";

/**
 * ルートのコンポーネントを、ページデータ (loader の結果) を props として渡すラッパーで包む。
 * preact-iso の <Router> はコンポーネントの同一性で遷移を判定するので、ルートごとに一度だけ作る。
 */
const pages = new Map<RouteDef, () => preact.JSX.Element>();
function pageFor(route: RouteDef) {
  let Page = pages.get(route);
  if (!Page) {
    const Component = route.component;
    Page = function RoutePage() {
      const entry = usePageEntry();
      const { path, search } = entry.request;
      return (
        <RequestContext.Provider value={entry.request}>
          {/* URL ごとに状態をリセットする（クエリだけ違う同一ルートへの遷移でも初期値を反映させる） */}
          <Component key={path + search} {...entry.data} />
          <RequestFooter />
        </RequestContext.Provider>
      );
    };
    pages.set(route, Page);
  }
  return Page;
}

/**
 * アプリのルート。サーバー（entry-server）とブラウザ（entry-client）の両方で同じツリーを描画する。
 * URL は LocationProvider が location から読む（サーバーではリクエストごとに location を差し替える）。
 */
export function App() {
  const [loading, setLoading] = useState(false);
  return (
    <LocationProvider>
      <Layout loading={loading}>
        {/*
          ErrorBoundary は描画エラーの捕捉に加え、Router が Promise の throw（データ取得待ち）を
          受け取るための options フックを含む preact-iso/lazy をバンドルに残す役割もある
          （preact-iso は sideEffects: false のため、未使用だとフックごと tree-shake される）
        */}
        <ErrorBoundary onError={(e) => console.error(e)}>
          <Router
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onRouteChange={(url) => retainOnly(url)}
          >
            {routes.map((r) => (
              <Route path={r.path} component={pageFor(r)} />
            ))}
            <Route default component={pageFor(notFound)} />
          </Router>
        </ErrorBoundary>
      </Layout>
    </LocationProvider>
  );
}
