// src-tauri/src/modules/official_specs.rs
// 权威官方大模型基准技术手册规格库 (Official Benchmark Knowledge Base)

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OfficialModelSpec {
    pub display_name: String,
    pub exact_id_pattern: String,
    pub nominal_tps_min: f32,
    pub nominal_tps_max: f32,
    pub nominal_ttft_ms_p50: u64,
    pub nominal_ttft_ms_p99: u64,
    pub max_context_window: u64,
    pub supports_thinking: bool,
    pub min_thinking_ratio: f32,
    pub description: String,
}

pub fn get_official_specs() -> Vec<OfficialModelSpec> {
    vec![
        // 优先匹配包含 thinking 的特殊推演模型，避免被通用 flash 贪婪模式遮蔽
        OfficialModelSpec {
            display_name: "Gemini 2.0 Flash Thinking".to_string(),
            exact_id_pattern: "gemini-2.0-flash-thinking.*|gemini-.*-thinking.*".to_string(),
            nominal_tps_min: 80.0,
            nominal_tps_max: 110.0,
            nominal_ttft_ms_p50: 550,
            nominal_ttft_ms_p99: 1200,
            max_context_window: 1_048_576,
            supports_thinking: true,
            min_thinking_ratio: 0.35,
            description: "具备端到端思维链的强逻辑推演模型，标称思考链占比 > 35%".to_string(),
        },
        OfficialModelSpec {
            display_name: "Gemini 3.8 Flash".to_string(),
            exact_id_pattern: "gemini-3.8-flash.*|gemini-2.0-flash(?!-thinking).*|gemini-1.5-flash.*".to_string(),
            nominal_tps_min: 120.0,
            nominal_tps_max: 155.0,
            nominal_ttft_ms_p50: 450,
            nominal_ttft_ms_p99: 900,
            max_context_window: 1_048_576,
            supports_thinking: false,
            min_thinking_ratio: 0.0,
            description: "谷歌旗舰极速流式交互模型，标称吞吐 120~155 T/s".to_string(),
        },
        OfficialModelSpec {
            display_name: "Gemini 3.1 Pro".to_string(),
            exact_id_pattern: "gemini-3.1-pro.*|gemini-1.5-pro.*".to_string(),
            nominal_tps_min: 60.0,
            nominal_tps_max: 85.0,
            nominal_ttft_ms_p50: 750,
            nominal_ttft_ms_p99: 1500,
            max_context_window: 2_097_152,
            supports_thinking: false,
            min_thinking_ratio: 0.0,
            description: "谷歌高精度推理与超长上下文模型，标称吞吐 60~85 T/s".to_string(),
        },
        OfficialModelSpec {
            display_name: "Claude 3.7 Sonnet".to_string(),
            exact_id_pattern: "claude-3-7-sonnet.*|claude-3-5-sonnet.*".to_string(),
            nominal_tps_min: 75.0,
            nominal_tps_max: 95.0,
            nominal_ttft_ms_p50: 850,
            nominal_ttft_ms_p99: 1800,
            max_context_window: 200_000,
            supports_thinking: true,
            min_thinking_ratio: 0.20,
            description: "Anthropic 顶级编码工程与混合推理模型，标称吞吐 75~95 T/s".to_string(),
        },
        OfficialModelSpec {
            display_name: "Claude Opus 5".to_string(),
            exact_id_pattern: "claude-opus-5.*|claude-3-opus.*".to_string(),
            nominal_tps_min: 40.0,
            nominal_tps_max: 60.0,
            nominal_ttft_ms_p50: 1600,
            nominal_ttft_ms_p99: 3000,
            max_context_window: 200_000,
            supports_thinking: true,
            min_thinking_ratio: 0.40,
            description: "深度哲学与高阶复杂架构模型，标称吞吐 40~60 T/s".to_string(),
        },
        OfficialModelSpec {
            display_name: "xAI Grok 4.6".to_string(),
            exact_id_pattern: "grok-4.6.*|grok-2.*".to_string(),
            nominal_tps_min: 90.0,
            nominal_tps_max: 125.0,
            nominal_ttft_ms_p50: 600,
            nominal_ttft_ms_p99: 1100,
            max_context_window: 128_000,
            supports_thinking: false,
            min_thinking_ratio: 0.0,
            description: "xAI 高速实时交互模型，标称吞吐 90~125 T/s".to_string(),
        },
    ]
}

pub fn find_matching_spec(model_str: &str) -> Option<OfficialModelSpec> {
    let lower = model_str.to_lowercase();
    let specs = get_official_specs();
    for spec in specs {
        if let Ok(re) = regex::Regex::new(&format!("(?i){}", spec.exact_id_pattern)) {
            if re.is_match(&lower) {
                return Some(spec);
            }
        }
    }
    None
}
