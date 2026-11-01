// ブラウザ側エントリ。SSR された HTML をハイドレーションし、以降のページ遷移は preact-iso が担う。
import { hydrate } from "preact";
import { App } from "./App.tsx";
import { primePage } from "./page-data.ts";
import type { PageEntry } from "./types.ts";
import "./style.css";

const entry: PageEntry = JSON.parse(document.getElementById("__SSR_STATE__")!.textContent!);
primePage(location.pathname + location.search, entry);

hydrate(<App />, document.getElementById("app")!);
document.documentElement.dataset.hydrated = "true";
