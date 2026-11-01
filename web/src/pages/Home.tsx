import { css } from "../../styled-system/css";
import { useRequest } from "../request.ts";

const th = css({ textAlign: "left", pr: "1rem" });

export function Home() {
  const req = useRequest();
  return (
    <section>
      <h1>Preact SSR on Rust</h1>
      <p>
        このページは Node.js を使わず、axum が受けたリクエストごとに rquickjs (QuickJS) 上で
        Preact の TSX コンポーネントを <code>renderToString</code> して返しています。
      </p>
      <p>
        ハイドレーション後のリンク遷移は preact-iso のルーターがクライアント側で行い、ページのデータだけを{" "}
        <code>/_data/...</code> から取得します（フッターに取得元が表示されます）。再読み込みすると改めて SSR されます。
      </p>
      <table>
        <tbody>
          <tr>
            <th class={th}>Method</th>
            <td>{req.method}</td>
          </tr>
          <tr>
            <th class={th}>Path</th>
            <td>{req.path}</td>
          </tr>
          <tr>
            <th class={th}>Query</th>
            <td>
              <code>{JSON.stringify(req.query)}</code>
            </td>
          </tr>
          <tr>
            <th class={th}>User-Agent</th>
            <td>{req.userAgent ?? "(none)"}</td>
          </tr>
          <tr>
            <th class={th}>Rendered at</th>
            <td data-testid="rendered-at">{req.renderedAt}</td>
          </tr>
        </tbody>
      </table>
      <p>
        クエリを付けて再読み込みすると、その値がサーバーでレンダリングされます（例:{" "}
        <a href="/?name=quickjs">/?name=quickjs</a>）。
      </p>
      {req.query.name && <p>Hello, {req.query.name}!</p>}
    </section>
  );
}
