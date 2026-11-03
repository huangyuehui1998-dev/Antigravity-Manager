// src-tauri/src/modules/sqlite_uri.rs
// SQLite 只读 URI 跨平台规范化与安全打开模块

use rusqlite::{Connection, OpenFlags};
use std::path::Path;

/// 生成符合 RFC 3986 与 SQLite 规范的只读 file: URI
pub fn make_sqlite_ro_uri(path: &Path) -> String {
    // 1) 取路径字符串
    let raw = path.to_string_lossy();

    // 2) 统一分隔符：Windows `\` → `/`
    let mut p = raw.replace('\\', "/");

    // 2b) 去掉 Windows 长路径前缀 `\\?\` 或 `\\.\`
    for prefix in ["//?/", "//./"] {
        if let Some(s) = p.strip_prefix(prefix) {
            p = s.to_string();
            break;
        }
    }

    // 3) 盘符规范化：`C:/Users/...` → `/C:/Users/...` (SQLite URI 标准)
    if p.len() >= 2 && p.as_bytes()[1] == b':' {
        let drive = p.chars().next().unwrap().to_ascii_uppercase();
        let rest = &p[2..];
        let rest = if rest.starts_with('/') {
            rest.to_string()
        } else {
            format!("/{rest}")
        };
        p = format!("/{drive}:{rest}");
    } else if p.starts_with("//") {
        // UNC 路径保持双斜杠
    } else if !p.starts_with('/') {
        if let Ok(canon) = path.canonicalize() {
            return make_sqlite_ro_uri(&canon);
        }
        p = format!("/{}", p.trim_start_matches('/'));
    }

    // 4) 百分号编码保留字符（# 作为 fragment 锚点、? 作为 query 边界、空格等）
    let encoded = p
        .replace('#', "%23")
        .replace('?', "%3F")
        .replace(' ', "%20");

    // 5) SQLite URI
    format!("file:{}?mode=ro", encoded)
}

/// 优先以只读 URI 打开数据库，失败时无缝降级为裸路径只读打开
pub fn open_sqlite_ro(path: &Path) -> Result<Connection, String> {
    let uri = make_sqlite_ro_uri(path);
    match Connection::open_with_flags(
        &uri,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
    ) {
        Ok(c) => Ok(c),
        Err(e1) => {
            tracing::warn!("sqlite URI open failed ({uri}): {e1}; fallback bare path");
            Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
                .map_err(|e2| format!("uri={e1}; bare={e2}"))
        }
    }
}
