import { useState } from "preact/hooks";
import { css } from "../../styled-system/css";

const row = css({ display: "flex", gap: "1rem", alignItems: "center", fontSize: "1.5rem" });
const button = css({ fontSize: "1.2rem", w: "2.5rem" });

export function Counter({ initial }: { initial: number }) {
  const [count, setCount] = useState(initial);
  return (
    <section>
      <h1>Counter</h1>
      <p>
        初期値はサーバーで <code>?start=</code> から読み取り SSR されます。ボタンはハイドレーション後に動作します。
      </p>
      <div class={row} data-testid="counter">
        <button class={button} onClick={() => setCount((c) => c - 1)}>-</button>
        <output data-testid="count">{count}</output>
        <button class={button} onClick={() => setCount((c) => c + 1)}>+</button>
      </div>
      <p>
        <a href="/counter?start=42">start=42 で開く</a>
      </p>
    </section>
  );
}
