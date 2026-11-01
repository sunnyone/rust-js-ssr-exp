import { css } from "../../styled-system/css";
import { useRequest } from "../request.ts";

/** 表示中のページのデータを、どのリクエストで・どう取得したかを表示する */
export function RequestFooter() {
  const req = useRequest();
  return (
    <footer class={css({ fontSize: "0.8rem", color: "fg.muted" })}>
      <span data-testid="source">
        {req.mode === "data" ? "Client navigation (data from /_data)" : "Server-rendered HTML"}
      </span>{" "}
      · QuickJS (rquickjs) worker #{req.worker} · request #{req.requestId} · {req.renderedAt}
    </footer>
  );
}
