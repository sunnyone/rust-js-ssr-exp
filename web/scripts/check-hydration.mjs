// 起動中の Rust サーバーから SSR された HTML を取得し、happy-dom 上でクライアントバンドルを実行して
// ハイドレーションとイベントハンドラの動作を確認する（ブラウザが無い環境向けの検証用）。
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

{
  const { window, status, ssrBadge } = await hydrate("/counter?start=42");
  assert(status === 200, "/counter returns 200");
  assert(ssrBadge === "SSR (server)", "SSR HTML shows the server badge");
  assert(window.document.documentElement.dataset.hydrated === "true", "client entry ran");
  assert(badge(window) === "Hydrated (client)", "badge switched to hydrated (useEffect ran)");
  assert(count(window) === "42", "count keeps the server-rendered value 42");
  const [minus, plus] = window.document.querySelectorAll(".counter button");
  plus.click();
  plus.click();
  await tick();
  assert(count(window) === "44", "clicking + twice → 44");
  minus.click();
  await tick();
  assert(count(window) === "43", "clicking - once → 43");
  assert(window.document.querySelectorAll(".counter").length === 1, "no duplicated DOM after hydration");
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
