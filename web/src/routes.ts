// ルート定義。
// loader はサーバーでのみ実行され（Rust が公開する host API を使える）、
// 戻り値はページの props になる。初回は HTML に埋め込まれ、クライアント遷移時は /_data/... で取得される。
import type { ComponentType } from "preact";
import { exec } from "preact-iso/router";
import type { Host } from "./host.ts";
import type { ServerRequest } from "./types.ts";
import { Home } from "./pages/Home.tsx";
import { Counter } from "./pages/Counter.tsx";
import { Posts } from "./pages/Posts.tsx";
import { Post } from "./pages/Post.tsx";
import { NotFound } from "./pages/NotFound.tsx";

export interface LoaderArgs {
  params: Record<string, string>;
  query: Record<string, string>;
  request: ServerRequest;
  host: Host;
}

/** loader の戻り値。status 以外はページコンポーネントの props になる */
export type LoaderResult<P> = P & { status?: number };

export interface RouteDef<P = any> {
  path: string;
  component: ComponentType<P>;
  title: (data: P) => string;
  loader?: (args: LoaderArgs) => LoaderResult<P>;
}

/** 型推論のためのヘルパー（component の props と loader の戻り値を一致させる） */
function route<P>(r: RouteDef<P>): RouteDef<P> {
  return r;
}

export const routes: RouteDef[] = [
  route({ path: "/", component: Home, title: () => "Home" }),
  route({
    path: "/counter",
    component: Counter,
    title: () => "Counter",
    loader: ({ query }) => ({ initial: Number.parseInt(query.start ?? "0", 10) || 0 }),
  }),
  route({
    path: "/posts",
    component: Posts,
    title: () => "Posts",
    loader: ({ host }) => ({ posts: host.listPosts() }),
  }),
  route({
    path: "/posts/:id",
    component: Post,
    title: ({ post }) => (post ? post.title : "Post not found"),
    loader: ({ params, host }) => {
      const post = host.getPost(params.id);
      return { post, status: post ? 200 : 404 };
    },
  }),
];

/** どのルートにもマッチしない場合（<Route default>） */
export const notFound = route({
  path: "*",
  component: NotFound,
  title: () => "Not Found",
  loader: () => ({ status: 404 }),
});

/** preact-iso の <Router> と同じ規則でルートを選ぶ（サーバー側の loader 実行用） */
export function matchRoute(path: string): { route: RouteDef; params: Record<string, string> } {
  for (const r of routes) {
    const m = exec(path, r.path);
    if (m) return { route: r, params: m.params };
  }
  return { route: notFound, params: {} };
}
