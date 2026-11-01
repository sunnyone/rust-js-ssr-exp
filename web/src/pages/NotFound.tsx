import { useRequest } from "../router.ts";

export function NotFound() {
  const req = useRequest();
  return (
    <section>
      <h1>404 Not Found</h1>
      <p>
        <code>{req.path}</code> に対応するページはありません。
      </p>
    </section>
  );
}
