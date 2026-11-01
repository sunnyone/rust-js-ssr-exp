mod assets;
mod posts;
mod ssr;

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use axum::Router;
use axum::extract::{Query, State};
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode, Uri, header};
use axum::response::{Html, IntoResponse, Response};
use serde::Deserialize;
use serde_json::json;
use tower_http::services::ServeDir;
use tower_http::set_header::SetResponseHeaderLayer;

use crate::assets::WebDist;
use crate::posts::PostStore;
use crate::ssr::{Export, SsrPool};

#[derive(Clone)]
struct AppState {
    pool: SsrPool,
    head_tags: Arc<str>,
    request_counter: Arc<AtomicU64>,
}

fn env_or<T: std::str::FromStr>(key: &str, default: T) -> T {
    std::env::var(key).ok().and_then(|v| v.parse().ok()).unwrap_or(default)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    let dist = std::env::var("WEB_DIST")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("web/dist"));
    let port: u16 = env_or("PORT", 3000);
    let workers: usize = env_or("SSR_WORKERS", std::thread::available_parallelism().map_or(2, |n| n.get()));
    let timeout = Duration::from_millis(env_or("SSR_TIMEOUT_MS", 2000));

    let web = WebDist::load(&dist)?;
    tracing::info!("loaded Vite build from {} (SSR bundle {} bytes)", dist.display(), web.server_bundle.len());

    let pool = SsrPool::start(workers, timeout, web.server_bundle.clone(), Arc::new(PostStore::sample()))?;
    tracing::info!("started {workers} rquickjs SSR workers");

    let state = AppState { pool, head_tags: web.head_tags.into(), request_counter: Arc::new(AtomicU64::new(0)) };

    // Vite の出力ファイル名にはハッシュが付くので長期キャッシュしてよい
    let assets = tower::ServiceBuilder::new()
        .layer(SetResponseHeaderLayer::overriding(
            header::CACHE_CONTROL,
            HeaderValue::from_static("public, max-age=31536000, immutable"),
        ))
        .service(ServeDir::new(web.client_dir.join("assets")));

    let app = Router::new()
        .nest_service("/assets", assets)
        .fallback(ssr_handler)
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await?;
    tracing::info!("listening on http://{}", listener.local_addr()?);
    axum::serve(listener, app).await?;
    Ok(())
}

/// クライアント遷移用のページデータ API のプレフィックス（`/_data/posts/2` → `/posts/2` の loader 結果）
const DATA_PREFIX: &str = "/_data";

/// entry-server の render() が返す値（web/src/types.ts の RenderResult）
#[derive(Debug, Deserialize)]
struct RenderResult {
    status: u16,
    title: String,
    html: String,
    state: serde_json::Value,
}

/// loadPage() が返す PageEntry のうち、Rust が使う部分
#[derive(Debug, Deserialize)]
struct PageEntryStatus {
    status: u16,
}

/// 全ての未マッチ GET リクエストを、その場で Preact を SSR して返す。
/// `/_data/...` はクライアント遷移用に、同じルートの loader 結果だけを JSON で返す。
async fn ssr_handler(
    State(state): State<AppState>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    Query(query): Query<BTreeMap<String, String>>,
) -> Response {
    if method != Method::GET && method != Method::HEAD {
        return StatusCode::METHOD_NOT_ALLOWED.into_response();
    }

    let (export, path) = match uri.path().strip_prefix(DATA_PREFIX) {
        Some("") => (Export::LoadPage, "/"),
        Some(rest) if rest.starts_with('/') => (Export::LoadPage, rest),
        _ => (Export::Render, uri.path()),
    };

    let request_id = state.request_counter.fetch_add(1, Ordering::Relaxed) + 1;
    let now_ms = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64);
    let request = json!({
        "mode": match export { Export::Render => "document", Export::LoadPage => "data" },
        "method": method.as_str(),
        "path": path,
        "search": uri.query().map(|q| format!("?{q}")).unwrap_or_default(),
        "query": query,
        "origin": format!("http://{}", request_host(&headers)),
        "userAgent": headers.get(header::USER_AGENT).and_then(|v| v.to_str().ok()),
        "requestId": request_id,
        "nowMs": now_ms,
    });

    let called = match state.pool.call(export, request.to_string()).await {
        Ok(called) => called,
        Err(err) => {
            tracing::error!(path = uri.path(), "SSR failed: {err}");
            return (StatusCode::INTERNAL_SERVER_ERROR, format!("SSR failed:\n{err}")).into_response();
        }
    };

    let parsed = match export {
        Export::Render => serde_json::from_str::<RenderResult>(&called.json).map(|out| {
            let status = status_code(out.status);
            (status, Html(document(&state.head_tags, &out.title, &out.html, &out.state))).into_response()
        }),
        Export::LoadPage => serde_json::from_str::<PageEntryStatus>(&called.json).map(|entry| {
            let headers = [(header::CONTENT_TYPE, "application/json"), (header::CACHE_CONTROL, "no-store")];
            (status_code(entry.status), headers, called.json.clone()).into_response()
        }),
    };
    let mut res = match parsed {
        Ok(res) => res,
        Err(err) => {
            tracing::error!(path = uri.path(), "invalid result from {export:?}: {err}");
            return (StatusCode::INTERNAL_SERVER_ERROR, "SSR returned an invalid result").into_response();
        }
    };
    let h = res.headers_mut();
    h.insert("x-ssr-worker", HeaderValue::from(called.worker));
    if let Ok(v) = HeaderValue::from_str(&format!("ssr;dur={:.3}", called.elapsed.as_secs_f64() * 1000.0)) {
        h.insert("server-timing", v);
    }
    res
}

fn status_code(status: u16) -> StatusCode {
    StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR)
}

/// SSR 中の `location.origin` に使うホスト名。URL として壊れる値は使わない
fn request_host(headers: &HeaderMap) -> &str {
    headers
        .get(header::HOST)
        .and_then(|v| v.to_str().ok())
        .filter(|h| !h.is_empty() && h.chars().all(|c| c.is_ascii_alphanumeric() || ".-:[]".contains(c)))
        .unwrap_or("localhost")
}

/// SSR 結果を HTML ドキュメントに埋め込む。ブラウザは Vite のクライアントバンドルで同じ TSX をハイドレーションする。
fn document(head_tags: &str, title: &str, body: &str, state: &serde_json::Value) -> String {
    format!(
        r#"<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
{head_tags}
</head>
<body>
<div id="app">{body}</div>
<script type="application/json" id="__SSR_STATE__">{state}</script>
</body>
</html>
"#,
        title = escape_html(title),
        state = escape_script(&state.to_string()),
    )
}

fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

/// `<script>` 内に JSON を埋め込む際に `</script>` 等で抜けられないようにする
fn escape_script(s: &str) -> String {
    s.replace('<', "\\u003c").replace('>', "\\u003e").replace('&', "\\u0026")
}
