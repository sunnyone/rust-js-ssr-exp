// QuickJS 上で SSR するための最小限のブラウザ互換環境（SSR バンドルにだけ含まれる）。
//
// preact-iso の LocationProvider はサーバーでも `location` と `URL` を参照するが、
// QuickJS にはどちらも無い。URL / URLSearchParams は core-js の純 JS 実装で補い、
// location はリクエストごとに setLocation() で差し替える。
import "core-js/actual/url";
import "core-js/actual/url-search-params";

export function setLocation(href: string): void {
  const u = new URL(href);
  (globalThis as { location?: unknown }).location = {
    href: u.href,
    origin: u.origin,
    protocol: u.protocol,
    host: u.host,
    hostname: u.hostname,
    port: u.port,
    pathname: u.pathname,
    search: u.search,
    hash: u.hash,
    toString: () => u.href,
  };
}

export function clearLocation(): void {
  delete (globalThis as { location?: unknown }).location;
}
