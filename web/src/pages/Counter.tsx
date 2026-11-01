import { useState } from "preact/hooks";

export function Counter({ initial }: { initial: number }) {
  const [count, setCount] = useState(initial);
  return (
    <section>
      <h1>Counter</h1>
      <p>
        初期値はサーバーで <code>?start=</code> から読み取り SSR されます。ボタンはハイドレーション後に動作します。
      </p>
      <div class="counter">
        <button onClick={() => setCount((c) => c - 1)}>-</button>
        <output data-testid="count">{count}</output>
        <button onClick={() => setCount((c) => c + 1)}>+</button>
      </div>
      <p>
        <a href="/counter?start=42">start=42 で開く</a>
      </p>
    </section>
  );
}
