// サーバー (Rust) と JS の間でやり取りする型

export interface Post {
  id: number;
  title: string;
  author: string;
  body: string;
}

/** Rust が render() に渡すリクエスト情報 */
export interface ServerRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  userAgent: string | null;
  requestId: number;
  nowMs: number;
}

/** コンポーネントから useRequest() で参照できるリクエスト情報 */
export interface RequestInfo extends ServerRequest {
  params: Record<string, string>;
  routePath: string;
  worker: number;
  renderedAt: string;
}

/** render() の戻り値（JSON にして Rust へ返す） */
export interface RenderResult {
  status: number;
  title: string;
  html: string;
  state: HydrationState;
}

/** HTML に埋め込まれ、ブラウザのハイドレーションで使われる状態 */
export interface HydrationState {
  routePath: string;
  data: Record<string, unknown>;
  request: RequestInfo;
}
