//! Vite のビルド成果物（web/dist）の読み込み。
//!
//! - `dist/server/entry-server.js`: SSR 用バンドル（QuickJS で評価する）
//! - `dist/client/.vite/manifest.json`: クライアントエントリの JS / CSS / 依存チャンクのファイル名

use std::collections::{BTreeSet, HashMap};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::{Context, anyhow};
use serde::Deserialize;

pub const CLIENT_ENTRY: &str = "src/entry-client.tsx";

#[derive(Debug, Deserialize)]
struct ManifestChunk {
    file: String,
    #[serde(default)]
    css: Vec<String>,
    #[serde(default)]
    imports: Vec<String>,
}

pub struct WebDist {
    pub client_dir: PathBuf,
    pub server_bundle: Arc<str>,
    /// HTML の <head> に埋め込む script / css / modulepreload タグ
    pub head_tags: String,
}

impl WebDist {
    pub fn load(dist: &Path) -> anyhow::Result<Self> {
        let hint = "run `npm run build` in web/ first";
        let bundle_path = dist.join("server/entry-server.js");
        let server_bundle = std::fs::read_to_string(&bundle_path)
            .with_context(|| format!("failed to read {} ({hint})", bundle_path.display()))?;

        let client_dir = dist.join("client");
        let manifest_path = client_dir.join(".vite/manifest.json");
        let manifest: HashMap<String, ManifestChunk> = serde_json::from_str(
            &std::fs::read_to_string(&manifest_path)
                .with_context(|| format!("failed to read {} ({hint})", manifest_path.display()))?,
        )
        .with_context(|| format!("invalid {}", manifest_path.display()))?;

        Ok(Self {
            client_dir,
            server_bundle: server_bundle.into(),
            head_tags: head_tags(&manifest, CLIENT_ENTRY)?,
        })
    }
}

/// エントリとその静的 import 先チャンクをたどり、CSS・modulepreload・エントリ script のタグを作る
fn head_tags(manifest: &HashMap<String, ManifestChunk>, entry: &str) -> anyhow::Result<String> {
    let entry_chunk = manifest
        .get(entry)
        .ok_or_else(|| anyhow!("{entry} not found in Vite manifest"))?;

    let mut css = BTreeSet::new();
    let mut preload = BTreeSet::new();
    let mut stack = vec![entry.to_string()];
    let mut seen = BTreeSet::new();
    while let Some(key) = stack.pop() {
        if !seen.insert(key.clone()) {
            continue;
        }
        let chunk = manifest
            .get(&key)
            .ok_or_else(|| anyhow!("{key} not found in Vite manifest"))?;
        css.extend(chunk.css.iter().cloned());
        if key != entry {
            preload.insert(chunk.file.clone());
        }
        stack.extend(chunk.imports.iter().cloned());
    }

    let mut tags = String::new();
    for f in css {
        tags.push_str(&format!("<link rel=\"stylesheet\" href=\"/{f}\">\n"));
    }
    for f in preload {
        tags.push_str(&format!("<link rel=\"modulepreload\" href=\"/{f}\">\n"));
    }
    tags.push_str(&format!("<script type=\"module\" src=\"/{}\"></script>", entry_chunk.file));
    Ok(tags)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_head_tags_from_manifest() {
        let manifest: HashMap<String, ManifestChunk> = serde_json::from_str(
            r#"{
              "src/entry-client.tsx": {"file":"assets/entry-a.js","css":["assets/entry-a.css"],"imports":["_shared.js"]},
              "_shared.js": {"file":"assets/shared-b.js","css":["assets/shared-b.css"]}
            }"#,
        )
        .unwrap();
        let tags = head_tags(&manifest, CLIENT_ENTRY).unwrap();
        assert!(tags.contains(r#"<link rel="stylesheet" href="/assets/entry-a.css">"#));
        assert!(tags.contains(r#"<link rel="stylesheet" href="/assets/shared-b.css">"#));
        assert!(tags.contains(r#"<link rel="modulepreload" href="/assets/shared-b.js">"#));
        assert!(tags.contains(r#"<script type="module" src="/assets/entry-a.js"></script>"#));
    }

    #[test]
    fn missing_entry_is_an_error() {
        assert!(head_tags(&HashMap::new(), CLIENT_ENTRY).is_err());
    }
}
