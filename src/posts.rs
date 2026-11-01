//! JS 側の loader から呼ばれるサンプルデータ（Rust 側のデータソースの代わり）

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct Post {
    pub id: u32,
    pub title: String,
    pub author: String,
    pub body: String,
}

#[derive(Debug)]
pub struct PostStore {
    posts: Vec<Post>,
}

impl PostStore {
    pub fn sample() -> Self {
        let post = |id, title: &str, author: &str, body: &str| Post {
            id,
            title: title.into(),
            author: author.into(),
            body: body.into(),
        };
        Self {
            posts: vec![
                post(1, "Hello from Rust", "axum", "この記事データは Rust の PostStore から返されています。"),
                post(2, "QuickJS で SSR", "rquickjs", "Node.js なしで Preact の renderToString を実行しています。"),
                post(3, "TSX は Vite でビルド", "vite", "web/ の TSX を Vite で SSR 用とブラウザ用にバンドルしています。"),
            ],
        }
    }

    pub fn list(&self) -> &[Post] {
        &self.posts
    }

    pub fn get(&self, id: &str) -> Option<&Post> {
        let id: u32 = id.parse().ok()?;
        self.posts.iter().find(|p| p.id == id)
    }
}
