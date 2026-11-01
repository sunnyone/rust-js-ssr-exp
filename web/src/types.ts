// サーバー (Rust) と JS の間でやり取りする型

export interface Post {
  id: number;
  title: string;
  author: string;
  body: string;
}

/** Rust が render() / loadPage() に渡すリクエスト情報 */
export interface ServerRequest {
  /** "document": HTML の SSR、"data": クライアント遷移用の JSON (/_data/...) */
  mode: "document" | "data";
  method: string;
  /** ページのパス（/_data 経由の場合もプレフィックスを除いたもの） */
  path: string;
  /** 生のクエリ文字列（"?a=1" または ""） */
  search: string;
  query: Record<string, string>;
  /** "http://host:port" */
  origin: string;
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

/**
 * 1 ページ分のサーバー側の結果（loader のデータとリクエスト情報）。
 * 初回は HTML に埋め込まれてハイドレーションに使われ、
 * クライアント遷移時は /_data/... から JSON で取得される。
 */
export interface PageEntry {
  status: number;
  title: string;
  routePath: string;
  data: Record<string, unknown>;
  request: RequestInfo;
}

/** render() の戻り値（JSON にして Rust へ返す） */
export interface RenderResult {
  status: number;
  title: string;
  html: string;
  /** HTML に埋め込むハイドレーション用の状態 */
  state: PageEntry;
}
