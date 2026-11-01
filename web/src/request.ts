import { createContext } from "preact";
import { useContext } from "preact/hooks";
import type { RequestInfo } from "./types.ts";

/** 表示中のページを返したリクエストの情報（URL・ルートパラメータ・サーバー側の付帯情報） */
export const RequestContext = createContext<RequestInfo | null>(null);

export function useRequest(): RequestInfo {
  const req = useContext(RequestContext);
  if (!req) throw new Error("useRequest() must be used inside a route page");
  return req;
}
