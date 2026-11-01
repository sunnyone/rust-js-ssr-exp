import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { useRequest } from "../router.ts";

const links = [
  ["/", "Home"],
  ["/counter", "Counter"],
  ["/posts", "Posts"],
] as const;

/** サーバーでは "SSR"、ハイドレーション後は "Hydrated" を表示する */
function HydrationBadge() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return (
    <span class={`badge ${hydrated ? "badge-on" : ""}`} data-testid="hydration">
      {hydrated ? "Hydrated (client)" : "SSR (server)"}
    </span>
  );
}

export function Layout({ children }: { children: ComponentChildren }) {
  const req = useRequest();
  return (
    <div class="layout">
      <header>
        <nav>
          {links.map(([href, label]) => (
            <a href={href} class={req.routePath === href ? "active" : undefined}>
              {label}
            </a>
          ))}
        </nav>
        <HydrationBadge />
      </header>
      <main>{children}</main>
      <footer>
        Rendered by Preact on QuickJS (rquickjs) inside axum · worker #{req.worker} · request #
        {req.requestId} · {req.renderedAt}
      </footer>
    </div>
  );
}
