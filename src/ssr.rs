//! rquickjs による SSR ワーカープール。
//!
//! QuickJS の Runtime はスレッドをまたいで共有できないため、専用 OS スレッドを N 本立て、
//! 各スレッドが自分の Runtime / Context を持ち、起動時に Vite が出力した SSR バンドル
//! (`web/dist/server/entry-server.js`、依存を同梱した単一 ESM) を評価して `render` 関数を保持しておく。axum のハンドラはジョブをチャネルに投げ、結果を oneshot で受け取る。

use std::cell::Cell;
use std::rc::Rc;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use anyhow::{Context as _, anyhow};
use rquickjs::prelude::{Coerced, Rest};
use rquickjs::{Context, Ctx, Error, Function, Module, Object, Persistent, Runtime};
use serde::Deserialize;
use tokio::sync::oneshot;

use crate::posts::PostStore;

/// QuickJS 内でのモジュール名（スタックトレースに表示される）
const BUNDLE_NAME: &str = "entry-server.js";

const MEMORY_LIMIT: usize = 64 * 1024 * 1024;
const MAX_STACK_SIZE: usize = 1024 * 1024;

/// entry-server.tsx の render() が返す値（web/src/types.ts の RenderResult）
#[derive(Debug, Deserialize)]
pub struct RenderOutput {
    pub status: u16,
    pub title: String,
    pub html: String,
    pub state: serde_json::Value,
}

pub struct Rendered {
    pub output: RenderOutput,
    pub worker: usize,
    pub elapsed: Duration,
}

struct Job {
    request_json: String,
    reply: oneshot::Sender<Result<Rendered, String>>,
}

#[derive(Clone)]
pub struct SsrPool {
    tx: mpsc::SyncSender<Job>,
}

impl SsrPool {
    /// ワーカーを起動し、全ワーカーで entry-server の読み込みが成功するまで待つ
    pub fn start(
        workers: usize,
        timeout: Duration,
        bundle: Arc<str>,
        posts: Arc<PostStore>,
    ) -> anyhow::Result<Self> {
        let (tx, rx) = mpsc::sync_channel::<Job>(workers * 64);
        let rx = Arc::new(Mutex::new(rx));
        let (ready_tx, ready_rx) = mpsc::channel();

        for id in 0..workers {
            let (rx, bundle, posts, ready_tx) = (rx.clone(), bundle.clone(), posts.clone(), ready_tx.clone());
            std::thread::Builder::new()
                .name(format!("ssr-{id}"))
                .spawn(move || match Worker::new(id, timeout, &bundle, posts) {
                    Ok(worker) => {
                        let _ = ready_tx.send(Ok(()));
                        worker.run(&rx);
                    }
                    Err(e) => {
                        let _ = ready_tx.send(Err(e.context(format!("ssr worker #{id} failed to start"))));
                    }
                })?;
        }
        drop(ready_tx);
        for _ in 0..workers {
            ready_rx.recv().context("ssr worker exited during startup")??;
        }
        Ok(Self { tx })
    }

    pub async fn render(&self, request_json: String) -> Result<Rendered, String> {
        let (reply, rx) = oneshot::channel();
        let tx = self.tx.clone();
        // キューが満杯のときに async ランタイムをブロックしないよう blocking スレッドで送る
        tokio::task::spawn_blocking(move || tx.send(Job { request_json, reply }))
            .await
            .map_err(|e| e.to_string())?
            .map_err(|_| "ssr pool is closed".to_string())?;
        rx.await.map_err(|_| "ssr worker dropped the job".to_string())?
    }
}

struct Worker {
    id: usize,
    timeout: Duration,
    deadline: Rc<Cell<Option<Instant>>>,
    // context は runtime より先に drop される必要がある（フィールドは宣言順に drop される）
    render: Persistent<Function<'static>>,
    context: Context,
    _runtime: Runtime,
}

impl Worker {
    fn new(id: usize, timeout: Duration, bundle: &str, posts: Arc<PostStore>) -> anyhow::Result<Self> {
        let runtime = Runtime::new()?;
        runtime.set_memory_limit(MEMORY_LIMIT);
        runtime.set_max_stack_size(MAX_STACK_SIZE);

        // 無限ループ等で 1 リクエストがワーカーを占有し続けないよう、締め切りを過ぎたら中断する
        let deadline: Rc<Cell<Option<Instant>>> = Rc::new(Cell::new(None));
        let d = deadline.clone();
        runtime.set_interrupt_handler(Some(Box::new(move || d.get().is_some_and(|t| Instant::now() > t))));

        // バンドルは自己完結しているのでモジュールローダーは設定しない（import があれば起動時にエラーになる）
        let context = Context::full(&runtime)?;

        let render = context.with(|ctx| -> anyhow::Result<_> {
            install_globals(&ctx, id, posts).map_err(|e| js_error(&ctx, e))?;
            let namespace = Module::declare(ctx.clone(), BUNDLE_NAME, bundle)
                .and_then(|m| {
                    let (module, promise) = m.eval()?;
                    promise.finish::<()>()?;
                    module.namespace()
                })
                .map_err(|e| js_error(&ctx, e))?;
            let render: Function = namespace
                .get("render")
                .map_err(|e| anyhow!("{BUNDLE_NAME} must export render(): {}", js_error(&ctx, e)))?;
            Ok(Persistent::save(&ctx, render))
        })?;

        Ok(Self { id, timeout, deadline, render, context, _runtime: runtime })
    }

    fn run(self, rx: &Mutex<mpsc::Receiver<Job>>) {
        loop {
            let job = match rx.lock().expect("ssr queue lock poisoned").recv() {
                Ok(job) => job,
                Err(_) => return, // プールが破棄された
            };
            let started = Instant::now();
            self.deadline.set(Some(started + self.timeout));
            let result = self.render_once(&job.request_json);
            self.deadline.set(None);

            let result = result.map(|output| Rendered { output, worker: self.id, elapsed: started.elapsed() });
            let _ = job.reply.send(result);
        }
    }

    fn render_once(&self, request_json: &str) -> Result<RenderOutput, String> {
        self.context.with(|ctx| {
            let render = self.render.clone().restore(&ctx).map_err(|e| e.to_string())?;
            let json: String = render
                .call((request_json,))
                .map_err(|e| js_error(&ctx, e).to_string())?;
            serde_json::from_str(&json).map_err(|e| format!("invalid render() result: {e}"))
        })
    }
}

/// QuickJS に公開するグローバル: `console` と、Rust 側のデータにアクセスする `__host`
fn install_globals(ctx: &Ctx<'_>, worker_id: usize, posts: Arc<PostStore>) -> rquickjs::Result<()> {
    let globals = ctx.globals();

    let console = Object::new(ctx.clone())?;
    for level in ["log", "info", "warn", "error", "debug"] {
        let f = Function::new(ctx.clone(), move |args: Rest<Coerced<String>>| {
            let line = args.0.into_iter().map(|a| a.0).collect::<Vec<_>>().join(" ");
            match level {
                "warn" => tracing::warn!(target: "js", worker = worker_id, "{line}"),
                "error" => tracing::error!(target: "js", worker = worker_id, "{line}"),
                "debug" => tracing::debug!(target: "js", worker = worker_id, "{line}"),
                _ => tracing::info!(target: "js", worker = worker_id, "{line}"),
            }
        })?;
        console.set(level, f)?;
    }
    globals.set("console", console)?;

    let host = Object::new(ctx.clone())?;
    host.set("workerId", worker_id)?;
    let p = posts.clone();
    host.set(
        "listPosts",
        Function::new(ctx.clone(), move || serde_json::to_string(p.list()).expect("posts serialize"))?,
    )?;
    let p = posts;
    host.set(
        "getPost",
        Function::new(ctx.clone(), move |id: String| {
            serde_json::to_string(&p.get(&id)).expect("post serialize")
        })?,
    )?;
    globals.set("__host", host)?;
    Ok(())
}

/// rquickjs のエラーを、JS 例外であればメッセージとスタック付きで文字列化する
fn js_error(ctx: &Ctx<'_>, err: Error) -> anyhow::Error {
    if !matches!(err, Error::Exception) {
        return anyhow!(err);
    }
    let exception = ctx.catch();
    if let Some(obj) = exception.as_object() {
        let message: Option<String> = obj.get("message").ok();
        let stack: Option<String> = obj.get("stack").ok();
        if let Some(message) = message {
            return anyhow!("{message}\n{}", stack.unwrap_or_default());
        }
    }
    if exception.is_null() || exception.is_undefined() {
        // interrupt handler による中断は uncatchable な例外になる
        return anyhow!("JS execution was interrupted (timeout?)");
    }
    let text = exception
        .clone()
        .get::<Coerced<String>>()
        .map(|c| c.0)
        .unwrap_or_else(|_| format!("{exception:?}"));
    anyhow!("uncaught: {text}")
}
