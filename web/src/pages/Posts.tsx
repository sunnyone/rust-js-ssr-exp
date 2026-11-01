import type { Post } from "../types.ts";

export function Posts({ posts }: { posts: Post[] }) {
  return (
    <section>
      <h1>Posts</h1>
      <p>一覧データは route の loader から Rust 側の関数（<code>__host.listPosts</code>）を呼んで取得しています。</p>
      <ul>
        {posts.map((post) => (
          <li key={post.id}>
            <a href={`/posts/${post.id}`}>{post.title}</a>
            <small> — {post.author}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}
