// Rust (rquickjs) が SSR ワーカーの globalThis.__host に公開している関数群。
// サーバー専用。ブラウザ用バンドルからは import しないこと。
import type { Post } from "./types.ts";

declare global {
  // eslint-disable-next-line no-var
  var __host: {
    readonly workerId: number;
    /** JSON 文字列 (Post[]) を返す */
    listPosts(): string;
    /** JSON 文字列 (Post | null) を返す */
    getPost(id: string): string;
  };
}

export const host = {
  workerId: () => globalThis.__host.workerId,
  listPosts: (): Post[] => JSON.parse(globalThis.__host.listPosts()),
  getPost: (id: string): Post | null => JSON.parse(globalThis.__host.getPost(id)),
};

export type Host = typeof host;
