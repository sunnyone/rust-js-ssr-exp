import type { ComponentType } from "preact";
import { RequestContext } from "./router.ts";
import { Layout } from "./components/Layout.tsx";
import type { RequestInfo } from "./types.ts";

interface AppProps {
  page: ComponentType<any>;
  data: Record<string, unknown>;
  request: RequestInfo;
}

/**
 * アプリのルート。サーバー（entry-server）とブラウザ（entry-client）で同じ props を渡すことで
 * SSR の出力とハイドレーション時の初回レンダリングが一致する。
 */
export function App({ page: Page, data, request }: AppProps) {
  return (
    <RequestContext.Provider value={request}>
      <Layout>
        <Page {...data} />
      </Layout>
    </RequestContext.Provider>
  );
}
