import { useState } from "preact/hooks";
import { css } from "../../styled-system/css";
import type { Post as PostData } from "../types.ts";

function LikeButton() {
  const [likes, setLikes] = useState(0);
  return <button onClick={() => setLikes(likes + 1)}>♥ {likes}</button>;
}

export function Post({ post }: { post: PostData | null }) {
  if (!post) {
    return (
      <section>
        <h1>Post not found</h1>
        <p>
          <a href="/posts">一覧へ戻る</a>
        </p>
      </section>
    );
  }
  return (
    <article>
      <h1>{post.title}</h1>
      <p class={css({ color: "fg.muted" })}>by {post.author}</p>
      <p>{post.body}</p>
      <LikeButton />
      <p>
        <a href="/posts">一覧へ戻る</a>
      </p>
    </article>
  );
}
