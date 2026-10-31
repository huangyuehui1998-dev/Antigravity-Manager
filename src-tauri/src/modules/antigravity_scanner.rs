// src-tauri/src/modules/antigravity_scanner.rs
// Antigravity 工业级全电脑会话库极速流式增量扫描引擎 (V1.0)

use rusqlite::{params, Connection, OpenFlags};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use crate::modules::analytics_hub::{normalize_model_name, PricingEntry};

const DEFAULT_USD_TO_CNY: f64 = 7.22;

#[derive(Debug)]
enum ProtoVal<'a> {
    Varint(u64),
    Fixed64(&'a [u8]),
    Bytes(&'a [u8]),
    Fixed32(&'a [u8]),
}

/// 零拷贝纯流式 Protobuf Wire-Format 解码器
fn parse_proto_fields<'a>(data: &'a [u8]) -> HashMap<u32, ProtoVal<'a>> {
    let mut fields = HashMap::new();
    let mut pos = 0;
    let len = data.len();

    while pos < len {
        let mut tag: u64 = 0;
        let mut shift = 0;
        let mut tag_ok = false;
        while pos < len {
            let b = data[pos];
            pos += 1;
            tag |= ((b & 0x7F) as u64) << shift;
            if (b & 0x80) == 0 {
                tag_ok = true;
                break;
            }
            shift += 7;
            if shift >= 64 { break; }
        }
        if !tag_ok { break; }

        let field_num = (tag >> 3) as u32;
        let wire_type = (tag & 7) as u8;

        match wire_type {
            0 => {
                let mut val: u64 = 0;
                let mut s = 0;
                let mut val_ok = false;
                while pos < len {
                    let b = data[pos];
                    pos += 1;
                    val |= ((b & 0x7F) as u64) << s;
                    if (b & 0x80) == 0 {
                        val_ok = true;
                        break;
                    }
                    s += 7;
                    if s >= 64 { break; }
                }
                if val_ok {
                    fields.insert(field_num, ProtoVal::Varint(val));
                }
            }
            1 => {
                if pos + 8 <= len {
                    fields.insert(field_num, ProtoVal::Fixed64(&data[pos..pos+8]));
                    pos += 8;
                } else {
                    break;
                }
            }
            2 => {
                let mut l: u64 = 0;
                let mut s = 0;
                let mut l_ok = false;
                while pos < len {
                    let b = data[pos];
                    pos += 1;
                    l |= ((b & 0x7F) as u64) << s;
                    if (b & 0x80) == 0 {
                        l_ok = true;
                        break;
                    }
                    s += 7;
                    if s >= 64 { break; }
                }
                if l_ok {
                    let l_usize = l as usize;
                    if pos + l_usize <= len {
                        fields.insert(field_num, ProtoVal::Bytes(&data[pos..pos+l_usize]));
                        pos += l_usize;
                    } else {
                        break;
                    }
                }
            }
            5 => {
                if pos + 4 <= len {
                    fields.insert(field_num, ProtoVal::Fixed32(&data[pos..pos+4]));
                    pos += 4;
                } else {
                    break;
                }
            }
            _ => break,
        }
    }

    fields
}

/// 读取 Antigravity 会话标题索引映射
pub fn get_antigravity_titles() -> HashMap<String, String> {
    let mut titles = HashMap::new();
    if let Some(home) = dirs::home_dir() {
        let summary_db = home.join(".gemini").join("antigravity").join("conversation_summaries.db");
        if summary_db.exists() {
            let uri = format!("file:{}?mode=ro", summary_db.to_string_lossy());
            if let Ok(conn) = Connection::open_with_flags(&uri, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI) {
                let _ = conn.pragma_update(None, "query_only", "ON");
                if let Ok(mut stmt) = conn.prepare("SELECT conversation_id, title, preview FROM conversation_summaries") {
                    if let Ok(rows) = stmt.query_map([], |row| {
                        let cid: String = row.get(0)?;
                        let title: Option<String> = row.get(1)?;
                        let preview: Option<String> = row.get(2)?;
                        let name = title.filter(|t| !t.trim().is_empty())
                            .or_else(|| preview.filter(|p| !p.trim().is_empty()))
                            .unwrap_or_else(|| "未命名会话".to_string());
                        Ok((cid, name))
                    }) {
                        for item in rows.flatten() {
                            titles.insert(item.0, item.1);
                        }
                    }
                }
            }
        }
    }
    titles
}

/// 增量流式扫描 Antigravity 700+ 会话库并原子入库
pub fn sync_antigravity_data(
    dest_conn: &mut Connection,
    pricing_map: &HashMap<String, PricingEntry>,
) -> Result<usize, String> {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return Ok(0),
    };

    let titles = get_antigravity_titles();
    let conv_dirs = [
        home.join(".gemini").join("antigravity").join("conversations"),
        home.join(".gemini").join("antigravity-ide").join("conversations"),
    ];

    let mut db_paths: Vec<PathBuf> = Vec::new();
    for d in &conv_dirs {
        if d.exists() {
            if let Ok(entries) = fs::read_dir(d) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.extension().map_or(false, |ext| ext == "db") {
                        db_paths.push(p);
                    }
                }
            }
        }
    }

    let mut scanned_count = 0;
    let now_ms = chrono::Utc::now().timestamp_millis();

    for db_path in db_paths {
        let mtime = fs::metadata(&db_path)
            .and_then(|m| m.modified())
            .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as i64)
            .unwrap_or(0);

        let source_key = format!("antigravity:{}", db_path.to_string_lossy());

        // 增量 Checkpoint 水位线过滤（毫秒级判断）
        let last_mtime: i64 = dest_conn
            .query_row(
                "SELECT last_mtime FROM sync_checkpoints WHERE source_key = ?",
                params![&source_key],
                |row| row.get(0),
            )
            .unwrap_or(0);

        if mtime > 0 && mtime <= last_mtime {
            continue;
        }

        let cid = db_path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
        let conv_title = titles.get(&cid).cloned().unwrap_or_else(|| "未命名会话".to_string());

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

        let table_exists: bool = src_conn
            .query_row(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='gen_metadata'",
                [],
                |_| Ok(true),
            )
            .unwrap_or(false);

        if !table_exists {
            continue;
        }

        let mut step_timestamps: HashMap<i64, i64> = HashMap::new();
        if let Ok(mut step_stmt) = src_conn.prepare("SELECT idx, metadata FROM steps WHERE metadata IS NOT NULL") {
            if let Ok(s_rows) = step_stmt.query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, Vec<u8>>(1)?))) {
                for (s_idx, s_meta) in s_rows.flatten() {
                    let top = parse_proto_fields(&s_meta);
                    if let Some(ProtoVal::Bytes(ts_bytes)) = top.get(&1) {
                        let ts_obj = parse_proto_fields(ts_bytes);
                        if let Some(ProtoVal::Varint(sec)) = ts_obj.get(&1) {
                            step_timestamps.insert(s_idx, (*sec as i64) * 1000);
                        }
                    }
                }
            }
        }

        let mut meta_stmt = match src_conn.prepare("SELECT idx, data FROM gen_metadata ORDER BY idx") {
            Ok(s) => s,
            Err(_) => continue,
        };

        let rows = meta_stmt.query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, Vec<u8>>(1)?)));
        if let Ok(r_iter) = rows {
            let tx = match dest_conn.transaction() {
                Ok(t) => t,
                Err(_) => continue,
            };

            let _ = tx.execute(
                "DELETE FROM unified_token_usage WHERE source = 'Antigravity' AND client_name = ?",
                params![&cid],
            );

            let mut batch_count = 0;
            for (idx, data) in r_iter.flatten() {
                if data.is_empty() { continue; }
                let top = parse_proto_fields(&data);
                let cm_bytes = match top.get(&1) {
                    Some(ProtoVal::Bytes(b)) => *b,
                    _ => continue,
                };
                let cm = parse_proto_fields(cm_bytes);

                let raw_model = if let Some(ProtoVal::Bytes(m_bytes)) = cm.get(&19) {
                    String::from_utf8_lossy(m_bytes).to_string()
                } else if let Some(ProtoVal::Varint(1026)) = cm.get(&3) {
                    "claude-opus-4-6-thinking".to_string()
                } else {
                    "gemini-3.8-flash".to_string()
                };

                let usage_bytes = match cm.get(&4) {
                    Some(ProtoVal::Bytes(b)) => *b,
                    _ => continue,
                };
                let usage = parse_proto_fields(usage_bytes);

                let inp = match usage.get(&2) { Some(ProtoVal::Varint(v)) => *v as i64, _ => 0 };
                let out = match usage.get(&3) { Some(ProtoVal::Varint(v)) => *v as i64, _ => 0 };
                let cr  = match usage.get(&5) { Some(ProtoVal::Varint(v)) => *v as i64, _ => 0 };

                if inp > 0 || cr > 0 || out > 0 {
                    let total_tokens = inp + cr + out;
                    let (normalized, _) = normalize_model_name(&raw_model);
                    let (in_rate, out_rate, cache_rate) = pricing_map
                        .get(&normalized)
                        .map(|p| (p.input_per_m, p.output_per_m, p.cache_read_per_m))
                        .unwrap_or((0.75, 3.75, 0.075));

                    let cost_usd = (inp as f64 / 1_000_000.0) * in_rate
                        + (cr as f64 / 1_000_000.0) * cache_rate
                        + (out as f64 / 1_000_000.0) * out_rate;
                    let cost_cny = cost_usd * DEFAULT_USD_TO_CNY;

                    let timestamp = step_timestamps.get(&idx).copied().unwrap_or(mtime);

                    let _ = tx.execute(
                        "INSERT INTO unified_token_usage (
                            timestamp, source, client_name, account_id, raw_model, normalized_model,
                            input_tokens, output_tokens, cached_tokens, total_tokens,
                            input_unit_price, output_unit_price, exchange_rate, cost_usd, cost_cny
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        params![
                            timestamp,
                            "Antigravity",
                            cid,
                            conv_title,
                            raw_model,
                            normalized,
                            inp,
                            out,
                            cr,
                            total_tokens,
                            in_rate,
                            out_rate,
                            DEFAULT_USD_TO_CNY,
                            cost_usd,
                            cost_cny
                        ],
                    );
                    batch_count += 1;
                }
            }

            let _ = tx.execute(
                "INSERT OR REPLACE INTO sync_checkpoints (source_key, file_path, last_mtime, last_offset, last_record_id, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?)",
                params![&source_key, &db_path.to_string_lossy(), mtime, batch_count, &cid, now_ms],
            );

            let _ = tx.commit();
            scanned_count += batch_count;
        }
    }

    Ok(scanned_count)
}
