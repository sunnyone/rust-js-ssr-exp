import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { useLocation } from "preact-iso";
import { css, cva } from "../../styled-system/css";

const links = [
  ["/", "Home"],
  ["/counter", "Counter"],
  ["/posts", "Posts"],
] as const;

const badge = cva({
  base: { fontSize: "0.8rem", px: "0.6rem", py: "0.2rem", borderRadius: "9999px" },
  variants: {
    hydrated: {
      false: { bg: "neutral.subtle" },
      true: { bg: "success.subtle", color: "success.fg" },
    },
  },
});

const navLink = cva({
  base: { mr: "1rem", color: "accent", textDecoration: "none" },
  variants: {
    active: { true: { fontWeight: "bold", textDecoration: "underline" } },
  },
});

/** サーバーでは "SSR"、ハイドレーション後は "Hydrated" を表示する */
function HydrationBadge() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return (
    <span class={badge({ hydrated })} data-testid="hydration">
      {hydrated ? "Hydrated (client)" : "SSR (server)"}
    </span>
  );
}

export function Layout({ loading, children }: { loading: boolean; children: ComponentChildren }) {
  const { path } = useLocation();
  return (
    <div class={css({ maxW: "760px", mx: "auto", p: "1rem" })}>
      <header
        class={css({
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid",
          borderColor: "border",
          pb: "0.5rem",
        })}
      >
        <nav>
          {links.map(([href, label]) => (
            <a href={href} class={navLink({ active: path === href })} aria-current={path === href ? "page" : undefined}>
              {label}
            </a>
          ))}
        </nav>
        {loading && (
          <span class={css({ fontSize: "0.8rem", color: "attention.fg" })} data-testid="loading">
            Loading…
          </span>
        )}
        <HydrationBadge />
      </header>
      <main
        class={css({
          bg: "surface",
          border: "1px solid",
          borderColor: "border",
          borderRadius: "6px",
          px: "1.5rem",
          py: "1rem",
          my: "1rem",
        })}
      >
        {children}
      </main>
    </div>
  );
}
