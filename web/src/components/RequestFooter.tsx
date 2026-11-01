import { useRequest } from "../request.ts";

/** 表示中のページのデータを、どのリクエストで・どう取得したかを表示する */
export function RequestFooter() {
  const req = useRequest();
  return (
    <footer>
      <span data-testid="source">
        {req.mode === "data" ? "Client navigation (data from /_data)" : "Server-rendered HTML"}
      </span>{" "}
      · QuickJS (rquickjs) worker #{req.worker} · request #{req.requestId} · {req.renderedAt}
    </footer>
  );
}
