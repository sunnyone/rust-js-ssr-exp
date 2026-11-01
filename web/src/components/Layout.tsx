import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { useLocation } from "preact-iso";

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

export function Layout({ loading, children }: { loading: boolean; children: ComponentChildren }) {
  const { path } = useLocation();
  return (
    <div class="layout">
      <header>
        <nav>
          {links.map(([href, label]) => (
            <a href={href} class={path === href ? "active" : undefined}>
              {label}
            </a>
          ))}
        </nav>
        {loading && (
          <span class="loading" data-testid="loading">
            Loading…
          </span>
        )}
        <HydrationBadge />
      </header>
      <main>{children}</main>
    </div>
  );
}
