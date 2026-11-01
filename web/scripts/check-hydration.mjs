// 起動中の Rust サーバーから SSR された HTML を取得し、happy-dom 上でクライアントバンドルを実行して
// ハイドレーション、イベントハンドラ、preact-iso によるクライアント遷移の動作を確認する
// （ブラウザが無い環境向けの検証用）。
//
//   node scripts/check-hydration.mjs [baseUrl]   (既定 http://localhost:3000)
import { Window } from "happy-dom";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const base = process.argv[2] ?? "http://localhost:3000";
const distClient = fileURLToPath(new URL("../dist/client/", import.meta.url));

async function hydrate(path) {
  const res = await fetch(base + path);
  const html = await res.text();
  const window = new Window({ url: base + path });
  window.document.write(html);

  // SSR 直後（JS 実行前）の状態
  const ssrBadge = window.document.querySelector("[data-testid=hydration]")?.textContent;

  // <script type="module" src="/assets/..."> をディスク上のビルド成果物から読み、ブラウザと同様に実行する
  const src = window.document.querySelector('script[type="module"]')?.getAttribute("src");
  if (!src) throw new Error(`${path}: client entry script not found`);
  const code = await readFile(distClient + src.replace(/^\//, ""), "utf8");
  vm.runInContext(code, vm.createContext(window));

  await new Promise((r) => setTimeout(r, 50)); // useEffect を走らせる
  return { window, status: res.status, ssrBadge };
}

function assert(cond, message) {
  if (!cond) {
    console.error(`✗ ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${message}`);
  }
}

const badge = (w) => w.document.querySelector("[data-testid=hydration]").textContent;
const count = (w) => w.document.querySelector("[data-testid=count]").textContent;
const tick = () => new Promise((r) => setTimeout(r, 20));
const h1 = (w) => w.document.querySelector("main h1")?.textContent;
const source = (w) => w.document.querySelector("[data-testid=source]")?.textContent;

/** 条件が満たされるまで待つ（クライアント遷移は /_data の取得を待つので非同期） */
async function eventually(cond, timeoutMs = 2000) {
  const until = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > until) return false;
    await tick();
  }
  return true;
}

function clickLink(window, href) {
  const a = [...window.document.querySelectorAll("a")].find((el) => el.getAttribute("href") === href);
  if (!a) throw new Error(`link ${href} not found`);
  a.click();
}

{
  const { window, status, ssrBadge } = await hydrate("/counter?start=42");
  assert(status === 200, "/counter returns 200");
  assert(ssrBadge === "SSR (server)", "SSR HTML shows the server badge");
  assert(window.document.documentElement.dataset.hydrated === "true", "client entry ran");
  assert(badge(window) === "Hydrated (client)", "badge switched to hydrated (useEffect ran)");
  assert(count(window) === "42", "count keeps the server-rendered value 42");
  const [minus, plus] = window.document.querySelectorAll("[data-testid=counter] button");
  plus.click();
  plus.click();
  await tick();
  assert(count(window) === "44", "clicking + twice → 44");
  minus.click();
  await tick();
  assert(count(window) === "43", "clicking - once → 43");
  assert(window.document.querySelectorAll("[data-testid=counter]").length === 1, "no duplicated DOM after hydration");
  await window.happyDOM.close();
}

{
  const { window, status } = await hydrate("/posts/2");
  assert(status === 200, "/posts/2 returns 200");
  const like = window.document.querySelector("article button");
  like.click();
  await tick();
  assert(like.textContent === "♥ 1", "like button works after hydration");
  await window.happyDOM.close();
}

{
  const { window, status } = await hydrate("/nope");
  assert(status === 404, "/nope returns 404");
  assert(badge(window) === "Hydrated (client)", "404 page also hydrates");
  await window.happyDOM.close();
}

{
  // preact-iso によるクライアント遷移: ページを再読み込みせず /_data/... からデータを取得して描画する
  const { window } = await hydrate("/posts");
  window.__notReloaded = true;
  assert(source(window) === "Server-rendered HTML", "initial page is server-rendered");

  clickLink(window, "/posts/2");
  assert(await eventually(() => h1(window) === "QuickJS で SSR"), "client navigation to /posts/2 renders the post");
  assert(window.location.pathname === "/posts/2", "URL updated by pushState");
  assert(window.__notReloaded === true, "no full page reload");
  assert(source(window) === "Client navigation (data from /_data)", "page data came from /_data");
  assert(window.document.title === "QuickJS で SSR · Preact SSR on rquickjs", "document.title updated");
  assert(window.document.querySelectorAll("main").length === 1, "single <main> after navigation");

  const like = window.document.querySelector("article button");
  like.click();
  await tick();
  assert(like.textContent === "♥ 1", "like button works on a client-navigated page");

  window.history.back();
  assert(await eventually(() => h1(window) === "Posts"), "history.back() renders /posts again");
  assert(window.location.pathname === "/posts", "history.back() restores the URL");

  clickLink(window, "/counter");
  assert(await eventually(() => h1(window) === "Counter"), "client navigation to /counter");
  assert(window.document.querySelector('nav a[aria-current="page"]')?.getAttribute("href") === "/counter", "nav highlights /counter");
  assert(count(window) === "0", "counter starts at 0 without ?start");

  clickLink(window, "/counter?start=42");
  assert(
    await eventually(() => count(window) === "42"),
    "same route with a new query (/counter?start=42) reloads data and resets state",
  );

  window.history.pushState(null, "", "/posts/999");
  window.dispatchEvent(new window.PopStateEvent("popstate"));
  assert(await eventually(() => h1(window) === "Post not found"), "popstate to /posts/999 renders not-found page");
  assert(window.__notReloaded === true, "still the same document after all navigations");
  await window.happyDOM.close();
}

{
  // Panda CSS は css() / cva() を静的解析して CSS を生成する。SSR 時とハイドレーション後の DOM で使われている
  // すべてのクラスに対応するルールがビルド済み CSS にあることを確認する（抽出漏れの検出）
  const missing = new Set();
  for (const path of ["/", "/counter", "/posts", "/posts/1", "/nope"]) {
    const { window } = await hydrate(path);
    const href = window.document.querySelector('link[rel="stylesheet"]')?.getAttribute("href");
    const cssText = await readFile(distClient + href.replace(/^\//, ""), "utf8");
    for (const el of window.document.querySelectorAll("[class]")) {
      for (const cls of el.getAttribute("class").split(/\s+/).filter(Boolean)) {
        const selector = "." + cls.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
        if (!new RegExp(`${selector.replace(/[\\.]/g, (c) => `\\${c}`)}[{,:\\[ ]`).test(cssText)) missing.add(cls);
      }
    }
    await window.happyDOM.close();
  }
  assert(missing.size === 0, `every class in the rendered DOM has a CSS rule${missing.size ? ` (missing: ${[...missing].join(", ")})` : ""}`);
}
