// src-tauri/src/modules/kiro_scanner.rs
// Kiro IDE & AWS SSO Account and Token Usage Scanner

use crate::modules::analytics_hub::{normalize_model_name, PricingEntry, DEFAULT_USD_TO_CNY};
use rusqlite::{params, Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KiroSSOToken {
    pub start_url: Option<String>,
    pub region: Option<String>,
    pub access_token: Option<String>,
    pub expires_at: Option<String>,
    pub client_id: Option<String>,
}

/// Detect Kiro SSO cache files in ~/.aws/sso/cache/*.json
pub fn get_kiro_sso_files() -> Vec<PathBuf> {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return Vec::new(),
    };
    let sso_dir = home.join(".aws").join("sso").join("cache");
    let mut files = Vec::new();
    if sso_dir.exists() {
        if let Ok(entries) = fs::read_dir(sso_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.extension().map_or(false, |ext| ext == "json") {
                    files.push(p);
                }
            }
        }
    }
    files
}

/// Detect Kiro state database
pub fn get_kiro_vscdb_path() -> Option<PathBuf> {
    if let Ok(appdata) = std::env::var("APPDATA") {
        let p = Path::new(&appdata).join("Kiro").join("User").join("globalStorage").join("state.vscdb");
        if p.exists() {
            return Some(p);
        }
    }
    None
}

/// Synchronize Kiro usage data into analytics_hub.db and token_stats.db
pub fn sync_kiro_data(
    dest_conn: &mut Connection,
    pricing_map: &HashMap<String, PricingEntry>,
) -> Result<usize, String> {
    let mut total_scanned = 0;
    let now_ms = chrono::Utc::now().timestamp_millis();

    // 1. Scan Kiro state.vscdb if present
    if let Some(vscdb_path) = get_kiro_vscdb_path() {
        let mtime = fs::metadata(&vscdb_path)
            .and_then(|m| m.modified())
            .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as i64)
            .unwrap_or(0);

        let source_key = format!("kiro:{}", vscdb_path.to_string_lossy());
        let last_mtime: i64 = dest_conn
            .query_row(
                "SELECT last_mtime FROM sync_checkpoints WHERE source_key = ?",
                params![&source_key],
                |row| row.get(0),
            )
            .unwrap_or(0);

        if mtime > 0 && mtime > last_mtime {
            let uri = format!("file:{}?mode=ro", vscdb_path.to_string_lossy());
            if let Ok(src_conn) = Connection::open_with_flags(
                &uri,
                OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
            ) {
                let _ = src_conn.pragma_update(None, "query_only", "ON");
                let _ = src_conn.pragma_update(None, "busy_timeout", 2000);

                if let Ok(mut stmt) = src_conn.prepare(
                    "SELECT [key], [value] FROM ItemTable WHERE [key] LIKE '%kiro%' OR [key] LIKE '%aiCodeTracking%' LIMIT 100",
                ) {
                    let mut ts_conn_opt = crate::modules::token_stats::connect_db().ok();
                    let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)));
                    if let Ok(r_iter) = rows {
                        for (key, val) in r_iter.flatten() {
                            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&val) {
                                let total_tokens = json.get("totalTokens").and_then(|v| v.as_i64()).unwrap_or(0);
                                if total_tokens > 0 {
                                    let raw_model = json.get("model").and_then(|v| v.as_str()).unwrap_or("kiro-default");
                                    let (normalized, _) = normalize_model_name(raw_model);
                                    let inp = json.get("inputTokens").and_then(|v| v.as_i64()).unwrap_or(total_tokens / 2);
                                    let out = json.get("outputTokens").and_then(|v| v.as_i64()).unwrap_or(total_tokens / 2);
                                    let (in_rate, out_rate, cache_rate) = pricing_map
                                        .get(&normalized)
                                        .map(|p| (p.input_per_m, p.output_per_m, p.cache_read_per_m))
                                        .unwrap_or((1.5, 7.5, 0.15));

                                    let cost_usd = (inp as f64 / 1_000_000.0) * in_rate + (out as f64 / 1_000_000.0) * out_rate;
                                    let cost_cny = cost_usd * DEFAULT_USD_TO_CNY;

                                    let _ = dest_conn.execute(
                                        "INSERT INTO unified_token_usage (
                                            timestamp, source, client_name, account_id, raw_model, normalized_model,
                                            input_tokens, output_tokens, cached_tokens, total_tokens,
                                            input_unit_price, output_unit_price, exchange_rate, cost_usd, cost_cny
                                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                                        params![
                                            mtime, "Kiro", "Kiro IDE", key, raw_model, normalized,
                                            inp, out, 0i64, total_tokens, in_rate, out_rate, DEFAULT_USD_TO_CNY, cost_usd, cost_cny
                                        ],
                                    );

                                    if let Some(ref mut ts_conn) = ts_conn_opt {
                                        let hour_bucket = chrono::DateTime::from_timestamp_millis(mtime)
                                            .map(|dt| dt.format("%Y-%m-%d %H:00").to_string())
                                            .unwrap_or_else(|| chrono::Local::now().format("%Y-%m-%d %H:00").to_string());
                                        let ts_sec = mtime / 1000;
                                        let _ = ts_conn.execute(
                                            "INSERT INTO token_usage (timestamp, account_email, model, input_tokens, output_tokens, cached_tokens, total_tokens)
                                             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                                            params![ts_sec, "kiro-user", &normalized, inp, out, 0i64, total_tokens],
                                        );
                                        let _ = ts_conn.execute(
                                            "INSERT INTO token_stats_hourly (hour_bucket, account_email, total_input_tokens, total_output_tokens, total_cached_tokens, total_tokens, request_count)
                                             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1)
                                             ON CONFLICT(hour_bucket, account_email) DO UPDATE SET
                                                total_input_tokens = total_input_tokens + ?3,
                                                total_output_tokens = total_output_tokens + ?4,
                                                total_tokens = total_tokens + ?5,
                                                request_count = request_count + 1",
                                            params![hour_bucket, "kiro-user", inp, out, total_tokens],
                                        );
                                    }
                                    total_scanned += 1;
                                }
                            }
                        }
                    }
                }
            }

            let _ = dest_conn.execute(
                "INSERT OR REPLACE INTO sync_checkpoints (source_key, file_path, last_mtime, last_offset, last_record_id, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?)",
                params![&source_key, &vscdb_path.to_string_lossy(), mtime, total_scanned as i64, "kiro", now_ms],
            );
        }
    }

    Ok(total_scanned)
}
