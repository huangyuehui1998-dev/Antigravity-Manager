// src-tauri/src/modules/kiro_scanner.rs
// Kiro IDE Local Credit Usage Snapshot Sync & Scanner
// 抄自 UsageBar/PaceBar kiro.md & ai_usagebar::kiro & deltaguita/kiro-credit-usage

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

// 抄自 UsageBar/PaceBar kiro.md Token file kiro-auth-token.json
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KiroAuthToken {
    #[serde(rename = "accessToken")]
    pub access_token: Option<String>,
    #[serde(rename = "refreshToken")]
    pub refresh_token: Option<String>,
    #[serde(rename = "expiresAt")]
    pub expires_at: Option<String>,
    #[serde(rename = "profileArn")]
    pub profile_arn: Option<String>,
    #[serde(rename = "clientIdHash")]
    pub client_id_hash: Option<String>,
}

// 抄自 ai_usagebar::kiro Outcome 语义
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum KiroSyncOutcome {
    MissingDb,
    NoAuth,
    NoUsageState,
    Inserted(usize),
    Unchanged,
    Error(String),
}

/// 抄自 UsageBar/PaceBar kiro.md Token file kiro-auth-token.json
/// 只读固定文件 ~/.aws/sso/cache/kiro-auth-token.json，严禁枚举 *.json
pub fn get_kiro_auth_token_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| {
        h.join(".aws")
            .join("sso")
            .join("cache")
            .join("kiro-auth-token.json")
    })
}

/// 读取并校验 kiro-auth-token.json
pub fn read_kiro_auth_token() -> Result<KiroAuthToken, String> {
    let token_path = get_kiro_auth_token_path()
        .ok_or_else(|| "no_auth: cannot resolve home directory".to_string())?;

    if !token_path.exists() {
        return Err("no_auth: kiro-auth-token.json does not exist".to_string());
    }

    let content = fs::read_to_string(&token_path)
        .map_err(|e| format!("no_auth: failed to read token file: {}", e))?;

    let token: KiroAuthToken = serde_json::from_str(&content)
        .map_err(|e| format!("no_auth: invalid token json: {}", e))?;

    // 检查 access_token 是否非空
    if token
        .access_token
        .as_deref()
        .unwrap_or("")
        .trim()
        .is_empty()
    {
        return Err("no_auth: access_token is empty".to_string());
    }

    // 检查是否过期 (expiresAt: RFC3339)
    if let Some(ref exp_str) = token.expires_at {
        if let Ok(exp_time) = chrono::DateTime::parse_from_rfc3339(exp_str) {
            if chrono::Utc::now() > exp_time.with_timezone(&chrono::Utc) {
                return Err("no_auth: token expired".to_string());
            }
        }
    }

    Ok(token)
}

/// 抄自 UsageBar/PaceBar kiro.md Platform Paths
/// 检测 Kiro state database 跨平台路径
pub fn get_kiro_vscdb_path() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            let p = PathBuf::from(&appdata)
                .join("Kiro")
                .join("User")
                .join("globalStorage")
                .join("state.vscdb");
            if p.exists() {
                return Some(p);
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        if let Some(home) = dirs::home_dir() {
            let p = home
                .join("Library")
                .join("Application Support")
                .join("Kiro")
                .join("User")
                .join("globalStorage")
                .join("state.vscdb");
            if p.exists() {
                return Some(p);
            }
        }
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        if let Some(home) = dirs::home_dir() {
            let p = home
                .join(".config")
                .join("Kiro")
                .join("User")
                .join("globalStorage")
                .join("state.vscdb");
            if p.exists() {
                return Some(p);
            }
        }
    }

    // 备用探测兜底（支持测试/异构环境）
    if let Some(home) = dirs::home_dir() {
        let mac_p = home.join("Library/Application Support/Kiro/User/globalStorage/state.vscdb");
        if mac_p.exists() {
            return Some(mac_p);
        }
        let lin_p = home.join(".config/Kiro/User/globalStorage/state.vscdb");
        if lin_p.exists() {
            return Some(lin_p);
        }
    }
    None
}

/// 抄自 UsageBar/PaceBar kiro.md & ai_usagebar::kiro & deltaguita/kiro-credit-usage
/// 精确解析 kiro.kiroAgent usageState CREDIT 水位并 UPSERT 至 kiro_usage_snapshots
pub fn sync_kiro_data(dest_conn: &mut Connection) -> Result<KiroSyncOutcome, String> {
    // 1. 探测 Kiro state.vscdb
    let vscdb_path = match get_kiro_vscdb_path() {
        Some(p) => p,
        None => return Ok(KiroSyncOutcome::MissingDb),
    };

    // 2. 读取固定鉴权 token (无 / 过期均返回 NoAuth)
    let auth_token = match read_kiro_auth_token() {
        Ok(t) => t,
        Err(_) => return Ok(KiroSyncOutcome::NoAuth),
    };

    // 确定唯一 account_id：严格遵循 POST_1DA3 优先级 (profileArn -> kiro-cid: -> kiro-local:)
    let account_id = if let Some(arn) = auth_token
        .profile_arn
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        arn.to_string()
    } else if let Some(cid) = auth_token
        .client_id_hash
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        format!("kiro-cid:{}", cid)
    } else {
        // auth 已 Ok（accessToken 有效未过期）；稳定本地 id，禁止写回 auth 文件
        let path_str = vscdb_path.to_string_lossy();
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(path_str.as_bytes());
        let hash = format!("{:x}", hasher.finalize());
        format!("kiro-local:{}", &hash[..16])
    };

    // M1 门闩前置：确保 kiro_usage_snapshots 表存在，以便先行探测快照行
    dest_conn
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS kiro_usage_snapshots (
          source TEXT NOT NULL DEFAULT 'kiro',
          account_id TEXT NOT NULL,
          snapshot_kind TEXT NOT NULL,
          current_usage REAL NOT NULL,
          usage_limit REAL NOT NULL,
          reset_at TEXT,
          free_trial_json TEXT,
          raw_json TEXT,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (source, account_id, snapshot_kind)
        );",
        )
        .map_err(|e| format!("failed to create kiro_usage_snapshots table: {}", e))?;

    // M1: 探测目标账号是否已有 credit 快照行存在
    let has_snapshot_row: bool = dest_conn
        .query_row(
            "SELECT 1 FROM kiro_usage_snapshots WHERE source = 'kiro' AND account_id = ?1 AND snapshot_kind = 'credit' LIMIT 1",
            params![&account_id],
            |_| Ok(true),
        )
        .unwrap_or(false);

    let mtime = fs::metadata(&vscdb_path)
        .and_then(|m| m.modified())
        .map(|t| {
            t.duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as i64
        })
        .unwrap_or(0);

    let source_key = format!("kiro:{}", vscdb_path.to_string_lossy());
    let last_mtime: i64 = dest_conn
        .query_row(
            "SELECT last_mtime FROM sync_checkpoints WHERE source_key = ?",
            params![&source_key],
            |row| row.get(0),
        )
        .unwrap_or(0);

    // M1 门闩：仅当 snapshot 记录已存在且文件未被修改时，才允许 Unchanged 短路早退；若无 snapshot 行，严禁短路跳过
    if has_snapshot_row && mtime > 0 && mtime <= last_mtime {
        return Ok(KiroSyncOutcome::Unchanged);
    }

    // 打开只读连接
    let src_conn = crate::modules::sqlite_uri::open_sqlite_ro(&vscdb_path)
        .map_err(|e| format!("failed to open kiro state.vscdb: {}", e))?;
    let _ = src_conn.pragma_update(None, "query_only", "ON");
    let _ = src_conn.pragma_update(None, "busy_timeout", 2000);

    // K1: 主路径 SQL（唯一），彻底废除 LIKE 模糊滥扫
    let mut stmt = src_conn
        .prepare("SELECT [value] FROM ItemTable WHERE [key] = 'kiro.kiroAgent' LIMIT 1;")
        .map_err(|e| format!("failed to prepare statement: {}", e))?;

    let val_str_opt: Option<String> = stmt.query_row([], |row| row.get(0)).ok();

    let val_str = match val_str_opt {
        Some(s) if !s.trim().is_empty() => s,
        _ => return Ok(KiroSyncOutcome::NoUsageState),
    };

    let json_val: serde_json::Value = serde_json::from_str(&val_str)
        .map_err(|e| format!("failed to parse kiro.kiroAgent json: {}", e))?;

    // 寻找 usageState（支持直接 usageState 或嵌套 kiro.resourceNotifications.usageState）
    let usage_state = json_val
        .get("usageState")
        .or_else(|| json_val.get("kiro.resourceNotifications.usageState"));

    let usage_breakdowns = usage_state
        .and_then(|us| us.get("usageBreakdowns"))
        .and_then(|b| b.as_array());

    let breakdowns = match usage_breakdowns {
        Some(arr) if !arr.is_empty() => arr,
        _ => return Ok(KiroSyncOutcome::NoUsageState),
    };

    // 查找 type == "CREDIT" 或单元素首项 (对齐 ai_usagebar::kiro credit_breakdown)
    let credit_item = breakdowns
        .iter()
        .find(|item| {
            matches!(
                item.get("type").and_then(|v| v.as_str()),
                Some(t) if t.eq_ignore_ascii_case("CREDIT")
            )
        })
        .or_else(|| breakdowns.first());

    let credit = match credit_item {
        Some(c) => c,
        None => return Ok(KiroSyncOutcome::NoUsageState),
    };

    let current_usage = credit
        .get("currentUsage")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let usage_limit = credit
        .get("usageLimit")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let reset_at = credit
        .get("resetDate")
        .or_else(|| credit.get("resetAt"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let free_trial_json = usage_state
        .and_then(|us| us.get("freeTrialUsage").or_else(|| us.get("freeTrial")))
        .map(|v| v.to_string());

    let now_ms = chrono::Utc::now().timestamp_millis();

    // 确保 kiro_usage_snapshots 表存在 (DDL 严格对齐说明书)
    dest_conn
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS kiro_usage_snapshots (
          source TEXT NOT NULL DEFAULT 'kiro',
          account_id TEXT NOT NULL,
          snapshot_kind TEXT NOT NULL,
          current_usage REAL NOT NULL,
          usage_limit REAL NOT NULL,
          reset_at TEXT,
          free_trial_json TEXT,
          raw_json TEXT,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (source, account_id, snapshot_kind)
        );",
        )
        .map_err(|e| format!("failed to create kiro_usage_snapshots table: {}", e))?;

    // 查询之前值比对是否变更
    let prev_usage: Option<(f64, f64)> = dest_conn
        .query_row(
            "SELECT current_usage, usage_limit FROM kiro_usage_snapshots WHERE source = 'kiro' AND account_id = ?1 AND snapshot_kind = 'credit'",
            params![&account_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .ok();

    let is_changed = match prev_usage {
        Some((prev_curr, prev_lim)) => {
            (prev_curr - current_usage).abs() > 0.0001 || (prev_lim - usage_limit).abs() > 0.0001
        }
        None => true,
    };

    // 执行 UPSERT 写入主 credit 快照
    dest_conn
        .execute(
            "INSERT INTO kiro_usage_snapshots (
          source, account_id, snapshot_kind,
          current_usage, usage_limit, reset_at,
          free_trial_json, raw_json, updated_at
        ) VALUES ('kiro', ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        ON CONFLICT(source, account_id, snapshot_kind) DO UPDATE SET
          current_usage = excluded.current_usage,
          usage_limit = excluded.usage_limit,
          reset_at = excluded.reset_at,
          free_trial_json = excluded.free_trial_json,
          raw_json = excluded.raw_json,
          updated_at = excluded.updated_at;",
            params![
                &account_id,
                "credit",
                current_usage,
                usage_limit,
                &reset_at,
                &free_trial_json,
                &val_str,
                now_ms
            ],
        )
        .map_err(|e| format!("failed to upsert kiro_usage_snapshots: {}", e))?;

    // 若有 freeTrial 则写入 credit_trial 行
    if let Some(ref ft_str) = free_trial_json {
        if let Ok(ft_val) = serde_json::from_str::<serde_json::Value>(ft_str) {
            let ft_curr = ft_val
                .get("currentUsage")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            let ft_lim = ft_val
                .get("usageLimit")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            let _ = dest_conn.execute(
                "INSERT INTO kiro_usage_snapshots (
                  source, account_id, snapshot_kind,
                  current_usage, usage_limit, reset_at,
                  free_trial_json, raw_json, updated_at
                ) VALUES ('kiro', ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                ON CONFLICT(source, account_id, snapshot_kind) DO UPDATE SET
                  current_usage = excluded.current_usage,
                  usage_limit = excluded.usage_limit,
                  reset_at = excluded.reset_at,
                  free_trial_json = excluded.free_trial_json,
                  raw_json = excluded.raw_json,
                  updated_at = excluded.updated_at;",
                params![
                    &account_id,
                    "credit_trial",
                    ft_curr,
                    ft_lim,
                    &reset_at,
                    &free_trial_json,
                    &val_str,
                    now_ms
                ],
            );
        }
    }

    // 成功 UPSERT 快照后推进 checkpoint
    let _ = dest_conn.execute(
        "INSERT OR REPLACE INTO sync_checkpoints (source_key, file_path, last_mtime, last_offset, last_record_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)",
        params![&source_key, &vscdb_path.to_string_lossy(), mtime, 1i64, "kiro", now_ms],
    );

    // M2: 若当前已升级为权威 profileArn，自动清理/合并历史残留的 kiro-cid: / kiro-local: 孤儿快照与账号行，杜绝永久双行分叉
    let is_arn = !account_id.starts_with("kiro-cid:") && !account_id.starts_with("kiro-local:");
    if is_arn {
        let _ = dest_conn.execute(
            "DELETE FROM kiro_usage_snapshots WHERE source = 'kiro' AND (account_id LIKE 'kiro-cid:%' OR account_id LIKE 'kiro-local:%');",
            [],
        );
        let _ = crate::modules::account::get_accounts().map(|accs| {
            for acc in accs {
                if acc.provider.as_deref() == Some("kiro")
                    && (acc.id.starts_with("kiro-cid:") || acc.id.starts_with("kiro-local:"))
                {
                    let _ = crate::modules::account::delete_account(&acc.id);
                }
            }
        });
    }

    // K2: 账号入库与索引同步 (provider="kiro", 身份为 profileArn 或可追溯本地 fallback id，绝不造假邮箱)
    let display_name = if is_arn {
        let short_arn = account_id.split('/').last().unwrap_or(&account_id);
        format!("Kiro ({})", short_arn)
    } else {
        let short_id = if account_id.len() > 8 {
            &account_id[account_id.len() - 8..]
        } else {
            &account_id
        };
        format!("Kiro (local-{})", short_id)
    };
    let access_token_str = auth_token.access_token.unwrap_or_default();
    let refresh_token_str = auth_token.refresh_token.unwrap_or_default();

    let kiro_token = crate::models::token::TokenData {
        access_token: access_token_str,
        refresh_token: refresh_token_str,
        expires_in: 3600,
        expiry_timestamp: now_ms / 1000 + 3600,
        token_type: "Bearer".to_string(),
        email: Some(account_id.clone()),
        project_id: None,
        oauth_client_key: None,
        session_id: None,
        is_gcp_tos: false,
        id_token: None,
    };

    let mut account =
        crate::models::account::Account::new(account_id.clone(), account_id.clone(), kiro_token);
    account.name = Some(display_name);
    account.provider = Some("kiro".to_string());
    account.account_type = Some("kiro".to_string());
    let _ = crate::modules::account::save_account(&account);

    if is_changed {
        Ok(KiroSyncOutcome::Inserted(1))
    } else {
        Ok(KiroSyncOutcome::Unchanged)
    }
}
