// ブラウザ側エントリ。SSR された HTML にイベントハンドラ等をハイドレーションする。
import { hydrate } from "preact";
import { App } from "./App.tsx";
import { notFound, routes } from "./routes.ts";
import type { HydrationState } from "./types.ts";
import "./style.css";

const state: HydrationState = JSON.parse(document.getElementById("__SSR_STATE__")!.textContent!);
const route = routes.find((r) => r.path === state.routePath) ?? notFound;

hydrate(
  <App page={route.component} data={state.data} request={state.request} />,
  document.getElementById("app")!,
);
document.documentElement.dataset.hydrated = "true";
