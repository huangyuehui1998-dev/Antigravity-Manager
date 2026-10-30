// src-tauri/src/modules/analytics_hub.rs
// 工业级全电脑财务数据湖与零锁增量同步引擎 (V5.0 实战定稿版)

use chrono::Datelike;
use rusqlite::{params, Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

const ANALYTICS_DB_NAME: &str = "analytics_hub.db";
const DEFAULT_USD_TO_CNY: f64 = 7.22;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PricingEntry {
    pub display_name: String,
    pub input_per_m: f64,
    pub output_per_m: f64,
    pub cache_read_per_m: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnifiedUsageRecord {
    pub id: i64,
    pub timestamp: i64,
    pub source: String,
    pub client_name: String,
    pub account_id: Option<String>,
    pub raw_model: String,
    pub normalized_model: String,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cached_tokens: i64,
    pub total_tokens: i64,
    pub input_unit_price: f64,
    pub output_unit_price: f64,
    pub exchange_rate: f64,
    pub cost_usd: f64,
    pub cost_cny: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FinancialSummary {
    pub total_tokens: i64,
    pub total_cost_usd: f64,
    pub total_cost_cny: f64,
    pub today_tokens: i64,
    pub today_cost_usd: f64,
    pub today_cost_cny: f64,
    pub month_tokens: i64,
    pub month_cost_usd: f64,
    pub month_cost_cny: f64,
    pub saved_cost_usd: f64,
    pub saved_cost_cny: f64,
    pub total_requests: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeriodRollupItem {
    pub period_key: String,
    pub source: String,
    pub normalized_model: String,
    pub total_tokens: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cached_tokens: i64,
    pub total_cost_usd: f64,
    pub total_cost_cny: f64,
    pub request_count: i64,
}

/// 获取 analytics_hub.db 路径
pub fn get_analytics_db_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "Failed to get home dir".to_string())?;
    let data_dir = home.join(".antigravity_tools");
    if !data_dir.exists() {
        fs::create_dir_all(&data_dir).map_err(|e| format!("Failed to create data dir: {}", e))?;
    }
    Ok(data_dir.join(ANALYTICS_DB_NAME))
}

/// 打开/初始化独立数据湖数据库
pub fn open_analytics_db() -> Result<Connection, String> {
    let db_path = get_analytics_db_path()?;
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open analytics db: {}", e))?;

    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| format!("Failed to set WAL mode: {}", e))?;
    conn.pragma_update(None, "busy_timeout", 5000)
        .map_err(|e| format!("Failed to set busy timeout: {}", e))?;
    conn.pragma_update(None, "synchronous", "NORMAL")
        .map_err(|e| format!("Failed to set synchronous: {}", e))?;
    conn.pragma_update(None, "auto_vacuum", "INCREMENTAL")
        .map_err(|e| format!("Failed to set auto_vacuum: {}", e))?;

    // 初始化表结构
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS unified_token_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp INTEGER NOT NULL,
            source TEXT NOT NULL,
            client_name TEXT NOT NULL,
            account_id TEXT,
            raw_model TEXT NOT NULL,
            normalized_model TEXT NOT NULL,
            input_tokens INTEGER NOT NULL,
            output_tokens INTEGER NOT NULL,
            cached_tokens INTEGER NOT NULL,
            total_tokens INTEGER NOT NULL,
            input_unit_price REAL NOT NULL,
            output_unit_price REAL NOT NULL,
            exchange_rate REAL NOT NULL,
            cost_usd REAL NOT NULL,
            cost_cny REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_usage_time ON unified_token_usage(timestamp);
        CREATE INDEX IF NOT EXISTS idx_usage_source ON unified_token_usage(source);
        CREATE INDEX IF NOT EXISTS idx_usage_model ON unified_token_usage(normalized_model);

        CREATE TABLE IF NOT EXISTS sync_checkpoints (
            source_key TEXT PRIMARY KEY,
            file_path TEXT NOT NULL,
            last_mtime INTEGER NOT NULL,
            last_offset INTEGER NOT NULL,
            last_record_id TEXT,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS financial_rollups (
            period_type TEXT NOT NULL,
            period_key TEXT NOT NULL,
            source TEXT NOT NULL,
            normalized_model TEXT NOT NULL,
            total_tokens INTEGER NOT NULL,
            input_tokens INTEGER NOT NULL,
            output_tokens INTEGER NOT NULL,
            cached_tokens INTEGER NOT NULL,
            total_cost_usd REAL NOT NULL,
            total_cost_cny REAL NOT NULL,
            request_count INTEGER NOT NULL,
            PRIMARY KEY (period_type, period_key, source, normalized_model)
        );
        CREATE INDEX IF NOT EXISTS idx_rollup_period ON financial_rollups(period_type, period_key);
        ",
    )
    .map_err(|e| format!("Failed to initialize analytics tables: {}", e))?;

    Ok(conn)
}

/// 90天滑动窗口修剪与整理 (Retention TTL)
pub fn prune_expired_logs(conn: &Connection) -> Result<usize, String> {
    let ninety_days_ago_ms = chrono::Utc::now().timestamp_millis() - (90 * 86400 * 1000);
    let deleted = conn
        .execute(
            "DELETE FROM unified_token_usage WHERE timestamp < ?",
            params![ninety_days_ago_ms],
        )
        .map_err(|e| format!("Failed to prune old usage: {}", e))?;

    let _ = conn.execute("PRAGMA incremental_vacuum(100)", []);
    Ok(deleted)
}


/// 加载本地权威价格表 (~/.cc-switch/cc-switch.db 与 LiteLLM 保底字典)
pub fn load_pricing_table() -> HashMap<String, PricingEntry> {
    let mut map = HashMap::new();

    // 1. 尝试从本地 ~/.cc-switch/cc-switch.db 挂载只读连接
    if let Some(home) = dirs::home_dir() {
        let cc_db = home.join(".cc-switch").join("cc-switch.db");
        if cc_db.exists() {
            let uri = format!("file:{}?mode=ro", cc_db.to_string_lossy());
            if let Ok(conn) = Connection::open_with_flags(
                &uri,
                OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
            ) {
                let mut stmt = conn
                    .prepare(
                        "SELECT model_id, display_name, input_cost_per_million, output_cost_per_million, cache_read_cost_per_million FROM model_pricing",
                    )
                    .ok();
                if let Some(ref mut s) = stmt {
                    if let Ok(rows) = s.query_map([], |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, Option<String>>(1)?,
                            row.get::<_, Option<f64>>(2)?,
                            row.get::<_, Option<f64>>(3)?,
                            row.get::<_, Option<f64>>(4)?,
                        ))
                    }) {
                        for item in rows.flatten() {
                            let (model_id, dname, incost, outcost, cacheread) = item;
                            map.insert(
                                model_id.to_lowercase().trim().to_string(),
                                PricingEntry {
                                    display_name: dname.unwrap_or_else(|| model_id.clone()),
                                    input_per_m: incost.unwrap_or(0.0),
                                    output_per_m: outcost.unwrap_or(0.0),
                                    cache_read_per_m: cacheread.unwrap_or(0.0),
                                },
                            );
                        }
                    }
                }
            }
        }
    }

    // 2. 内置 LiteLLM 官方标准价格表保底
    let defaults = vec![
        ("claude-3-5-sonnet", "Claude 3.5 Sonnet", 3.0, 15.0, 0.3),
        ("claude-3-7-sonnet", "Claude 3.7 Sonnet", 3.0, 15.0, 0.3),
        ("claude-opus-5", "Claude Opus 5", 15.0, 75.0, 1.5),
        ("claude-fable-5", "Claude Fable 5", 10.0, 50.0, 1.0),
        ("gpt-4o", "GPT-4o", 2.5, 10.0, 1.25),
        ("gpt-4o-mini", "GPT-4o Mini", 0.15, 0.60, 0.075),
        ("gpt-5.6-sol", "GPT-5.6 Sol", 5.0, 30.0, 0.5),
        ("gpt-5.6-terra", "GPT-5.6 Terra", 2.5, 15.0, 0.25),
        ("gemini-1.5-pro", "Gemini 1.5 Pro", 1.25, 5.0, 0.3125),
        ("gemini-1.5-flash", "Gemini 1.5 Flash", 0.075, 0.30, 0.01875),
        ("gemini-2.0-flash", "Gemini 2.0 Flash", 0.10, 0.40, 0.025),
        ("gemini-2.5-pro", "Gemini 2.5 Pro", 1.50, 6.0, 0.375),
        ("grok-4.6", "Grok 4.6", 2.0, 6.0, 0.5),
        ("deepseek-chat", "DeepSeek V3", 0.14, 0.28, 0.014),
        ("deepseek-reasoner", "DeepSeek R1", 0.55, 2.19, 0.14),
    ];

    for (k, dname, in_p, out_p, cache_p) in defaults {
        map.entry(k.to_string()).or_insert_with(|| PricingEntry {
            display_name: dname.to_string(),
            input_per_m: in_p,
            output_per_m: out_p,
            cache_read_per_m: cache_p,
        });
    }

    map
}

/// 模型别名标准化与清洗
pub fn normalize_model_name(raw: &str) -> (String, String) {
    let raw_lower = raw.trim().to_lowercase();

    if raw_lower.contains("opus") {
        return ("claude-opus-5".to_string(), "Claude Opus 5".to_string());
    }
    if raw_lower.contains("fable") {
        return ("claude-fable-5".to_string(), "Claude Fable 5".to_string());
    }
    if raw_lower.contains("sonnet-3-7") || raw_lower.contains("3.7-sonnet") {
        return ("claude-3-7-sonnet".to_string(), "Claude 3.7 Sonnet".to_string());
    }
    if raw_lower.contains("sonnet") || raw_lower.contains("3-5-sonnet") {
        return ("claude-3-5-sonnet".to_string(), "Claude 3.5 Sonnet".to_string());
    }
    if raw_lower.contains("sol") || raw_lower.contains("gpt-5.6-sol") {
        return ("gpt-5.6-sol".to_string(), "GPT-5.6 Sol".to_string());
    }
    if raw_lower.contains("terra") || raw_lower.contains("gpt-5.6-terra") {
        return ("gpt-5.6-terra".to_string(), "GPT-5.6 Terra".to_string());
    }
    if raw_lower.contains("grok") {
        return ("grok-4.6".to_string(), "Grok 4.6".to_string());
    }
    if raw_lower.contains("cursor-small") || raw_lower.contains("cursor-fast") {
        return ("gpt-4o-mini".to_string(), "Cursor Fast (GPT-4o Mini)".to_string());
    }
    if raw_lower.contains("gpt-4o-mini") {
        return ("gpt-4o-mini".to_string(), "GPT-4o Mini".to_string());
    }
    if raw_lower.contains("gpt-4o") {
        return ("gpt-4o".to_string(), "GPT-4o".to_string());
    }
    if raw_lower.contains("gemini-2.0") {
        return ("gemini-2.0-flash".to_string(), "Gemini 2.0 Flash".to_string());
    }
    if raw_lower.contains("gemini-1.5-pro") {
        return ("gemini-1.5-pro".to_string(), "Gemini 1.5 Pro".to_string());
    }
    if raw_lower.contains("gemini-1.5-flash") {
        return ("gemini-1.5-flash".to_string(), "Gemini 1.5 Flash".to_string());
    }
    if raw_lower.contains("deepseek-r1") || raw_lower.contains("reasoner") {
        return ("deepseek-reasoner".to_string(), "DeepSeek R1".to_string());
    }
    if raw_lower.contains("deepseek") {
        return ("deepseek-chat".to_string(), "DeepSeek V3".to_string());
    }

    (raw.trim().to_string(), raw.trim().to_string())
}

/// 计算单次调用的商业等值费用 (USD 与 CNY)
pub fn calculate_cost(
    normalized_key: &str,
    input_tokens: i64,
    output_tokens: i64,
    cached_tokens: i64,
    pricing_map: &HashMap<String, PricingEntry>,
) -> (f64, f64, f64, f64) {
    let entry = pricing_map.get(normalized_key).cloned().unwrap_or_else(|| {
        PricingEntry {
            display_name: normalized_key.to_string(),
            input_per_m: 3.0,
            output_per_m: 15.0,
            cache_read_per_m: 0.3,
        }
    });

    let effective_input = (input_tokens - cached_tokens).max(0);
    let in_cost = (effective_input as f64 / 1_000_000.0) * entry.input_per_m;
    let cache_cost = (cached_tokens as f64 / 1_000_000.0) * entry.cache_read_per_m;
    let out_cost = (output_tokens as f64 / 1_000_000.0) * entry.output_per_m;

    let total_usd = in_cost + cache_cost + out_cost;
    let total_cny = total_usd * DEFAULT_USD_TO_CNY;

    (entry.input_per_m, entry.output_per_m, total_usd, total_cny)
}


/// 同步 Cursor 全局与工作区数据库 (以 URI mode=ro 零锁直读)
pub fn sync_cursor_data(
    dest_conn: &mut Connection,
    pricing_map: &HashMap<String, PricingEntry>,
) -> Result<usize, String> {
    let appdata = std::env::var("APPDATA").unwrap_or_default();
    if appdata.is_empty() {
        return Ok(0);
    }

    let cursor_user = PathBuf::from(appdata).join("Cursor").join("User");
    let global_db = cursor_user.join("globalStorage").join("state.vscdb");

    let mut scanned_count = 0;
    let mut files_to_scan = vec![global_db];

    // 扫描工作区存储目录
    let ws_dir = cursor_user.join("workspaceStorage");
    if ws_dir.exists() {
        if let Ok(entries) = fs::read_dir(ws_dir) {
            for entry in entries.flatten() {
                let p = entry.path().join("state.vscdb");
                if p.exists() {
                    files_to_scan.push(p);
                }
            }
        }
    }

    for db_path in files_to_scan {
        if !db_path.exists() {
            continue;
        }

        let mtime = fs::metadata(&db_path)
            .and_then(|m| m.modified())
            .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as i64)
            .unwrap_or(0);

        let source_key = format!("cursor:{}", db_path.to_string_lossy());

        // 检查水位线
        let last_mtime: i64 = dest_conn
            .query_row(
                "SELECT last_mtime FROM sync_checkpoints WHERE source_key = ?",
                params![&source_key],
                |row| row.get(0),
            )
            .unwrap_or(0);

        if mtime > 0 && mtime <= last_mtime {
            continue; // 文件未发生变动，跳过
        }

        // 核心：SQLite 原生只读 URI 打开，杜绝锁死 Cursor
        let uri = format!("file:{}?mode=ro", db_path.to_string_lossy());
        let src_conn = match Connection::open_with_flags(
            &uri,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
        ) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let _ = src_conn.pragma_update(None, "query_only", "ON");
        let _ = src_conn.pragma_update(None, "busy_timeout", 2000);

        // 查询每日统计记录
        let mut stmt = match src_conn.prepare("SELECT [key], [value] FROM ItemTable WHERE [key] LIKE 'aiCodeTracking.dailyStats%'") {
            Ok(s) => s,
            Err(_) => continue,
        };

        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        });

        if let Ok(r_iter) = rows {
            let tx = dest_conn.transaction().map_err(|e| e.to_string())?;
            for item in r_iter.flatten() {
                let (key, val) = item;
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&val) {
                    let date_str = v.get("date").and_then(|d| d.as_str()).unwrap_or("");
                    let composer_lines = v.get("composerSuggestedLines").and_then(|l| l.as_i64()).unwrap_or(0);
                    let tab_lines = v.get("tabSuggestedLines").and_then(|l| l.as_i64()).unwrap_or(0);
                    let total_lines = composer_lines + tab_lines;

                    if total_lines > 0 {
                        let est_tokens = total_lines * 35; // 行业通用经验折算: 1 代码行 ≈ 35 tokens
                        let timestamp = if !date_str.is_empty() {
                            chrono::NaiveDate::parse_from_str(date_str, "%Y-%m-%d")
                                .map(|d| d.and_hms_opt(12, 0, 0).unwrap().and_utc().timestamp_millis())
                                .unwrap_or_else(|_| chrono::Utc::now().timestamp_millis())
                        } else {
                            chrono::Utc::now().timestamp_millis()
                        };

                        let (model_key, dname) = normalize_model_name("claude-3-5-sonnet");
                        let (in_p, out_p, usd, cny) = calculate_cost(&model_key, est_tokens / 2, est_tokens / 2, 0, pricing_map);

                        // 避免重复入库检查
                        let exists: i64 = tx
                            .query_row(
                                "SELECT COUNT(*) FROM unified_token_usage WHERE source = 'cursor' AND account_id = ? AND timestamp = ?",
                                params![&key, timestamp],
                                |r| r.get(0),
                            )
                            .unwrap_or(0);

                        if exists == 0 {
                            let _ = tx.execute(
                                "INSERT INTO unified_token_usage 
                                (timestamp, source, client_name, account_id, raw_model, normalized_model, 
                                 input_tokens, output_tokens, cached_tokens, total_tokens, 
                                 input_unit_price, output_unit_price, exchange_rate, cost_usd, cost_cny)
                                VALUES (?, 'cursor', 'Cursor IDE', ?, 'claude-3-5-sonnet-cursor', ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)",
                                params![
                                    timestamp, &key, &dname, est_tokens / 2, est_tokens / 2, est_tokens,
                                    in_p, out_p, DEFAULT_USD_TO_CNY, usd, cny
                                ],
                            );
                            scanned_count += 1;
                        }
                    }
                }
            }

            // 更新水位线
            let _ = tx.execute(
                "INSERT INTO sync_checkpoints (source_key, file_path, last_mtime, last_offset, last_record_id, updated_at)
                 VALUES (?, ?, ?, 0, '', ?)
                 ON CONFLICT(source_key) DO UPDATE SET last_mtime = excluded.last_mtime, updated_at = excluded.updated_at",
                params![&source_key, &db_path.to_string_lossy(), mtime, chrono::Utc::now().timestamp_millis()],
            );

            let _ = tx.commit();
        }
    }

    Ok(scanned_count)
}

/// 同步 Codex 本地会话记录 (~/.codex/sessions/**/*.jsonl)
pub fn sync_codex_data(
    dest_conn: &mut Connection,
    pricing_map: &HashMap<String, PricingEntry>,
) -> Result<usize, String> {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return Ok(0),
    };

    let codex_dir = home.join(".codex");
    let mut session_files = Vec::new();

    // 搜索 sessions 和 archived_sessions
    for sub in &["sessions", "archived_sessions"] {
        let p = codex_dir.join(sub);
        if p.exists() {
            if let Ok(entries) = fs::read_dir(p) {
                for entry in entries.flatten() {
                    let f = entry.path();
                    if f.is_file() && f.extension().map_or(false, |ext| ext == "jsonl") {
                        session_files.push(f);
                    } else if f.is_dir() {
                        if let Ok(sub_entries) = fs::read_dir(&f) {
                            for se in sub_entries.flatten() {
                                let sf = se.path();
                                if sf.extension().map_or(false, |ext| ext == "jsonl") {
                                    session_files.push(sf);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let mut scanned_count = 0;

    for sf in session_files {
        let source_key = format!("codex:{}", sf.to_string_lossy());
        let mtime = fs::metadata(&sf)
            .and_then(|m| m.modified())
            .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as i64)
            .unwrap_or(0);

        let last_mtime: i64 = dest_conn
            .query_row(
                "SELECT last_mtime FROM sync_checkpoints WHERE source_key = ?",
                params![&source_key],
                |r| r.get(0),
            )
            .unwrap_or(0);

        if mtime > 0 && mtime <= last_mtime {
            continue;
        }

        let file = match fs::File::open(&sf) {
            Ok(f) => f,
            Err(_) => continue,
        };

        let reader = BufReader::new(file);
        let mut cur_model = "gpt-5.6-sol".to_string();
        let mut final_usage: Option<(i64, i64, i64, i64)> = None; // (in, out, cache, total)
        let mut final_ts = chrono::Utc::now().timestamp_millis();

        for line_res in reader.lines() {
            let line = match line_res {
                Ok(l) => l,
                Err(_) => continue,
            };
            if line.trim().is_empty() {
                continue;
            }

            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&line) {
                let msg_type = val.get("type").and_then(|t| t.as_str()).unwrap_or("");
                let payload = val.get("payload");

                if msg_type == "session_start" || msg_type == "model_change" {
                    if let Some(m) = payload.and_then(|p| p.get("model")).and_then(|m| m.as_str()) {
                        cur_model = m.to_string();
                    }
                } else if msg_type == "event_msg" {
                    if let Some(p) = payload {
                        if p.get("type").and_then(|t| t.as_str()) == Some("thread_settings_applied") {
                            if let Some(m) = p.get("thread_settings").and_then(|ts| ts.get("model")).and_then(|m| m.as_str()) {
                                cur_model = m.to_string();
                            }
                        } else if p.get("type").and_then(|t| t.as_str()) == Some("token_count") {
                            let usage = p.get("info").and_then(|i| i.get("total_token_usage"));
                            if let Some(u) = usage {
                                let in_tokens = u.get("input_tokens").and_then(|v| v.as_i64()).unwrap_or(0);
                                let out_tokens = u.get("output_tokens").and_then(|v| v.as_i64()).unwrap_or(0);
                                let cache_tokens = u.get("cached_input_tokens").or_else(|| u.get("cached_tokens")).and_then(|v| v.as_i64()).unwrap_or(0);
                                let total_tokens = in_tokens + out_tokens;

                                if total_tokens > 0 {
                                    final_usage = Some((in_tokens, out_tokens, cache_tokens, total_tokens));
                                    if let Some(ts_str) = val.get("timestamp").and_then(|v| v.as_str()) {
                                        if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(ts_str) {
                                            final_ts = dt.timestamp_millis();
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        if let Some((in_tokens, out_tokens, cache_tokens, total_tokens)) = final_usage {
            let (norm_key, dname) = normalize_model_name(&cur_model);
            let (in_p, out_p, usd, cny) = calculate_cost(&norm_key, in_tokens, out_tokens, cache_tokens, pricing_map);

            let tx = dest_conn.transaction().map_err(|e| e.to_string())?;
            let _ = tx.execute(
                "INSERT INTO unified_token_usage 
                (timestamp, source, client_name, account_id, raw_model, normalized_model, 
                 input_tokens, output_tokens, cached_tokens, total_tokens, 
                 input_unit_price, output_unit_price, exchange_rate, cost_usd, cost_cny)
                VALUES (?, 'codex', 'Codex CLI', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                params![
                    final_ts, sf.file_stem().and_then(|s| s.to_str()).unwrap_or("session"),
                    &cur_model, &dname, in_tokens, out_tokens, cache_tokens, total_tokens,
                    in_p, out_p, DEFAULT_USD_TO_CNY, usd, cny
                ],
            );

            let _ = tx.execute(
                "INSERT INTO sync_checkpoints (source_key, file_path, last_mtime, last_offset, last_record_id, updated_at)
                 VALUES (?, ?, ?, 0, '', ?)
                 ON CONFLICT(source_key) DO UPDATE SET last_mtime = excluded.last_mtime, updated_at = excluded.updated_at",
                params![&source_key, &sf.to_string_lossy(), mtime, chrono::Utc::now().timestamp_millis()],
            );

            let _ = tx.commit();
            scanned_count += 1;
        }
    }

    Ok(scanned_count)
}

/// 执行全量数据刷新 (Cursor + Codex + 预聚合持久化)
pub fn refresh_all_analytics() -> Result<(usize, usize), String> {
    let mut conn = open_analytics_db()?;
    let pricing = load_pricing_table();

    let cur_count = sync_cursor_data(&mut conn, &pricing)?;
    let codex_count = sync_codex_data(&mut conn, &pricing)?;

    // 重新计算每日聚合持久表
    conn.execute_batch(
        "
        INSERT OR REPLACE INTO financial_rollups (period_type, period_key, source, normalized_model, total_tokens, input_tokens, output_tokens, cached_tokens, total_cost_usd, total_cost_cny, request_count)
        SELECT 
            'daily',
            strftime('%Y-%m-%d', timestamp / 1000, 'unixepoch') AS date_key,
            source,
            normalized_model,
            SUM(total_tokens),
            SUM(input_tokens),
            SUM(output_tokens),
            SUM(cached_tokens),
            SUM(cost_usd),
            SUM(cost_cny),
            COUNT(*)
        FROM unified_token_usage
        GROUP BY date_key, source, normalized_model;
        "
    ).map_err(|e| format!("Failed to update rollups: {}", e))?;

    let _ = prune_expired_logs(&conn);

    Ok((cur_count, codex_count))
}

/// 获取财务看板总览数据 (KPI 顶层数据卡片)
pub fn query_financial_summary() -> Result<FinancialSummary, String> {
    let conn = open_analytics_db()?;
    let now = chrono::Utc::now();
    let today_start = now.date_naive().and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp_millis();
    let month_start = now.date_naive().with_day(1).unwrap_or(now.date_naive()).and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp_millis();

    let (total_toks, total_usd, total_cny, total_reqs): (i64, f64, f64, i64) = conn
        .query_row(
            "SELECT COALESCE(SUM(total_tokens), 0), COALESCE(SUM(cost_usd), 0.0), COALESCE(SUM(cost_cny), 0.0), COUNT(*) FROM unified_token_usage",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .unwrap_or((0, 0.0, 0.0, 0));

    let (today_toks, today_usd, today_cny): (i64, f64, f64) = conn
        .query_row(
            "SELECT COALESCE(SUM(total_tokens), 0), COALESCE(SUM(cost_usd), 0.0), COALESCE(SUM(cost_cny), 0.0) FROM unified_token_usage WHERE timestamp >= ?",
            params![today_start],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .unwrap_or((0, 0.0, 0.0));

    let (month_toks, month_usd, month_cny): (i64, f64, f64) = conn
        .query_row(
            "SELECT COALESCE(SUM(total_tokens), 0), COALESCE(SUM(cost_usd), 0.0), COALESCE(SUM(cost_cny), 0.0) FROM unified_token_usage WHERE timestamp >= ?",
            params![month_start],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .unwrap_or((0, 0.0, 0.0));

    // 预估为您节省的商业支出 (基于免费/包月额度抵扣官方 API 商业价值估算: 约占总商业价值的 90%)
    let saved_usd = total_usd * 0.92;
    let saved_cny = total_cny * 0.92;

    Ok(FinancialSummary {
        total_tokens: total_toks,
        total_cost_usd: total_usd,
        total_cost_cny: total_cny,
        today_tokens: today_toks,
        today_cost_usd: today_usd,
        today_cost_cny: today_cny,
        month_tokens: month_toks,
        month_cost_usd: month_usd,
        month_cost_cny: month_cny,
        saved_cost_usd: saved_usd,
        saved_cost_cny: saved_cny,
        total_requests: total_reqs,
    })
}

/// 查询时序走势列表 (用于 Recharts 图表展示)
pub fn query_daily_chart(limit_days: u32) -> Result<Vec<PeriodRollupItem>, String> {
    let conn = open_analytics_db()?;
    let mut stmt = conn
        .prepare(
            "SELECT period_key, source, normalized_model, total_tokens, input_tokens, output_tokens, cached_tokens, total_cost_usd, total_cost_cny, request_count
             FROM financial_rollups
             WHERE period_type = 'daily'
             ORDER BY period_key DESC
             LIMIT ?",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![limit_days * 15], |r| {
            Ok(PeriodRollupItem {
                period_key: r.get(0)?,
                source: r.get(1)?,
                normalized_model: r.get(2)?,
                total_tokens: r.get(3)?,
                input_tokens: r.get(4)?,
                output_tokens: r.get(5)?,
                cached_tokens: r.get(6)?,
                total_cost_usd: r.get(7)?,
                total_cost_cny: r.get(8)?,
                request_count: r.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for item in rows.flatten() {
        list.push(item);
    }
    list.reverse();
    Ok(list)
}

/// 查询明细流水列表 (带分页)
pub fn query_usage_details(limit: u32, offset: u32) -> Result<(Vec<UnifiedUsageRecord>, i64), String> {
    let conn = open_analytics_db()?;
    let total: i64 = conn
        .query_row("SELECT COUNT(*) FROM unified_token_usage", [], |r| r.get(0))
        .unwrap_or(0);

    let mut stmt = conn
        .prepare(
            "SELECT id, timestamp, source, client_name, account_id, raw_model, normalized_model,
                    input_tokens, output_tokens, cached_tokens, total_tokens,
                    input_unit_price, output_unit_price, exchange_rate, cost_usd, cost_cny
             FROM unified_token_usage
             ORDER BY timestamp DESC
             LIMIT ? OFFSET ?",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![limit, offset], |r| {
            Ok(UnifiedUsageRecord {
                id: r.get(0)?,
                timestamp: r.get(1)?,
                source: r.get(2)?,
                client_name: r.get(3)?,
                account_id: r.get(4)?,
                raw_model: r.get(5)?,
                normalized_model: r.get(6)?,
                input_tokens: r.get(7)?,
                output_tokens: r.get(8)?,
                cached_tokens: r.get(9)?,
                total_tokens: r.get(10)?,
                input_unit_price: r.get(11)?,
                output_unit_price: r.get(12)?,
                exchange_rate: r.get(13)?,
                cost_usd: r.get(14)?,
                cost_cny: r.get(15)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for item in rows.flatten() {
        list.push(item);
    }

    Ok((list, total))
}
