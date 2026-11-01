// ページごとのサーバーデータ (PageEntry) のキャッシュ。
//
// - サーバー: render() が loader を実行した結果を描画前に prime する（同期レンダリングなので throw しない）
// - ブラウザ初回: HTML に埋め込まれた状態を prime してからハイドレーションする
// - ブラウザ遷移: 未取得の URL なら /_data/... を fetch する Promise を throw する。
//   preact-iso の <Router> はこれを受けて、取得が終わるまで前のページを表示し続ける。
import { useRef, useState } from "preact/hooks";
import { useLocation } from "preact-iso";
import type { PageEntry } from "./types.ts";

const entries = new Map<string, PageEntry>();
const pending = new Map<string, Promise<void>>();

export function primePage(url: string, entry: PageEntry): void {
  entries.set(url, entry);
}

/** 指定 URL 以外のエントリを捨てる（再訪時は改めてサーバーから最新を取得する） */
export function retainOnly(url: string): void {
  for (const key of entries.keys()) if (key !== url) entries.delete(key);
}

export function clearPages(): void {
  entries.clear();
  pending.clear();
}

/** 現在の URL のページデータを返す。未取得なら取得を開始して suspend する */
export function usePageEntry(): PageEntry {
  const { url } = useLocation();
  const [, rerender] = useState(0);
  const waitingFor = useRef<string | null>(null);
  const entry = entries.get(url);
  if (entry) return entry;

  const p = loadPage(url);
  // <Router> は Promise の解決後に自身を再描画するが、suspend したサブツリーは同じ vnode のままなので
  // 再 diff されない。preact-iso の lazy() と同様に、suspend したコンポーネント自身を再描画させる。
  if (waitingFor.current !== url) {
    waitingFor.current = url;
    p.then(() => rerender((n) => n + 1));
  }
  throw p;
}

export const documentTitle = (title: string) => `${title} · Preact SSR on rquickjs`;

function dataUrl(url: string): string {
  return `/_data${url}`;
}

function loadPage(url: string): Promise<void> {
  let p = pending.get(url);
  if (p) return p;
  p = fetch(dataUrl(url), { headers: { accept: "application/json" } })
    .then((res) => res.json() as Promise<PageEntry>)
    .then((entry) => {
      entries.set(url, entry);
      document.title = documentTitle(entry.title);
    })
    .catch((err) => {
      // データが取れない場合は通常のページ遷移にフォールバックし、サーバーの SSR 結果（エラー表示含む）を出す
      console.error(`failed to load ${dataUrl(url)}`, err);
      location.assign(url);
      return new Promise<void>(() => {});
    })
    .finally(() => pending.delete(url));
  pending.set(url, p);
  return p;
}
