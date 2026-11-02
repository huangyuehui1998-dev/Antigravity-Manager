// src-tauri/src/modules/model_telemetry.rs
// 纳秒流式遥测、UniversalSseDecoder (带1MB硬水线与心跳过滤) 及 Fail-Open PAC

use bytes::{Bytes, BytesMut};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum ThinkingPayload {
    None,
    Text(String),
    Redacted, // Claude 3.7 加密思考
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ParsedChunkMeta {
    pub exact_model_id: Option<String>,
    pub delta_text: String,
    pub thinking: Option<ThinkingPayload>,
    pub thinking_tokens_official: Option<u32>,
    pub is_final: bool,
}

pub struct UniversalSseDecoder {
    buffer: BytesMut,
    max_frame_bytes: usize,
}

impl UniversalSseDecoder {
    pub fn new() -> Self {
        Self {
            buffer: BytesMut::with_capacity(16 * 1024),
            max_frame_bytes: 1024 * 1024, // 1MB 内存绝对硬水线 (防 OOM)
        }
    }

    /// 提取下一帧完整 SSE Event，具备 1MB 水线守卫并静默过滤 : keep-alive 注释帧
    pub fn decode_next(&mut self, chunk: &[u8]) -> Result<Option<ParsedChunkMeta>, &'static str> {
        if !chunk.is_empty() {
            if self.buffer.len() + chunk.len() > self.max_frame_bytes {
                self.buffer.clear();
                return Err("ERR_SSE_FRAME_OVERFLOW_1MB");
            }
            self.buffer.extend_from_slice(chunk);
        }

        // 查找 \n\n 或 \r\n\r\n 双换行边界
        let boundary = self.find_boundary();
        if boundary.is_none() {
            return Ok(None);
        }

        let (delim_pos, delim_len) = boundary.unwrap();
        let frame_bytes = self.buffer.split_to(delim_pos);
        if self.buffer.len() >= delim_len {
            let _ = self.buffer.split_to(delim_len);
        }

        // 提取有效 data: 载荷，静默过滤心跳注释行 (以 : 开头)
        let mut data_payload = String::new();
        if let Ok(text) = std::str::from_utf8(&frame_bytes) {
            for line in text.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with(':') {
                    // W3C SSE Keep-Alive 注释行，直接静默跳过
                    continue;
                }
                if let Some(rest) = line.strip_prefix("data:") {
                    let r = rest.trim();
                    if r == "[DONE]" {
                        return Ok(Some(ParsedChunkMeta {
                            is_final: true,
                            ..Default::default()
                        }));
                    }
                    data_payload.push_str(r);
                }
            }
        }

        if data_payload.is_empty() {
            return Ok(None);
        }

        // JSON 反序列化与多厂商字段规范提取
        let meta = Self::parse_json_payload(&data_payload);
        Ok(meta)
    }

    fn find_boundary(&self) -> Option<(usize, usize)> {
        for i in 0..self.buffer.len().saturating_sub(1) {
            if self.buffer[i] == b'\n' && self.buffer[i + 1] == b'\n' {
                return Some((i, 2));
            }
            if i + 3 < self.buffer.len()
                && self.buffer[i] == b'\r'
                && self.buffer[i + 1] == b'\n'
                && self.buffer[i + 2] == b'\r'
                && self.buffer[i + 3] == b'\n'
            {
                return Some((i, 4));
            }
        }
        None
    }

    fn parse_json_payload(raw_json: &str) -> Option<ParsedChunkMeta> {
        let v: serde_json::Value = serde_json::from_str(raw_json).ok()?;
        let mut meta = ParsedChunkMeta::default();

        // 1. 物理模型号提取 (Exact Model ID)
        if let Some(m) = v.get("model").and_then(|x| x.as_str()) {
            meta.exact_model_id = Some(m.to_string());
        } else if let Some(m) = v.get("modelVersion").and_then(|x| x.as_str()) {
            meta.exact_model_id = Some(m.to_string());
        }

        // 2. Claude 3.7 原生思考块与 redacted_thinking 适配
        if let Some(delta) = v.get("delta") {
            let delta_type = delta.get("type").and_then(|t| t.as_str()).unwrap_or("");
            if delta_type == "thinking_delta" {
                if let Some(th) = delta.get("thinking").and_then(|t| t.as_str()) {
                    meta.thinking = Some(ThinkingPayload::Text(th.to_string()));
                }
            } else if delta_type == "redacted_thinking" {
                meta.thinking = Some(ThinkingPayload::Redacted);
            } else if let Some(t) = delta.get("text").and_then(|t| t.as_str()) {
                meta.delta_text.push_str(t);
            }
        }

        // 3. Gemini 2.0 / 2.5 官方协议 (thought: true 与 usageMetadata)
        if let Some(candidates) = v.get("candidates").and_then(|c| c.as_array()) {
            if let Some(parts) = candidates.get(0).and_then(|c| c.get("content")).and_then(|c| c.get("parts")).and_then(|p| p.as_array()) {
                for part in parts {
                    let is_thought = part.get("thought").and_then(|t| t.as_bool()).unwrap_or(false);
                    let part_text = part.get("text").and_then(|t| t.as_str()).unwrap_or("");
                    if is_thought {
                        meta.thinking = Some(ThinkingPayload::Text(part_text.to_string()));
                    } else {
                        meta.delta_text.push_str(part_text);
                    }
                }
            }
        }
        if let Some(usage) = v.get("usageMetadata") {
            if let Some(th_count) = usage.get("thoughtsTokenCount").and_then(|u| u.as_u64()) {
                meta.thinking_tokens_official = Some(th_count as u32);
            }
        }

        // 4. OpenAI reasoning_content
        if let Some(choices) = v.get("choices").and_then(|c| c.as_array()) {
            if let Some(delta) = choices.get(0).and_then(|c| c.get("delta")) {
                if let Some(rc) = delta.get("reasoning_content").and_then(|r| r.as_str()) {
                    meta.thinking = Some(ThinkingPayload::Text(rc.to_string()));
                } else if let Some(ct) = delta.get("content").and_then(|c| c.as_str()) {
                    meta.delta_text.push_str(ct);
                }
            }
        }

        Some(meta)
    }
}

/// 生成 Fail-Open PAC 故障安全透传脚本，保证监控工具即使崩溃 IDE 亦可自动直连
pub fn generate_fail_open_pac(port: u16) -> String {
    format!(
        r#"function FindProxyForURL(url, host) {{
  // 故障安全开路 (Fail-Open)：优先本地流式代理遥测；代理离线时无感直连 DIRECT，绝不阻断编程！
  return "PROXY 127.0.0.1:{}; DIRECT";
}}"#,
        port
    )
}
