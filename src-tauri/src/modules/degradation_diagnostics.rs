// src-tauri/src/modules/degradation_diagnostics.rs
// 谷歌/大模型降智降速权威评判与金丝雀诊断系统 (Degradation Diagnostic Engine)

use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DegradationStatus {
    Nominal,             // 🟢 满血正常
    Throttled,           // 🟡 队列排队 / 降频
    ThinkingPruned,      // 🟠 思维链被阉割
    ModelSubstituted,    // 🔴 致命欺诈：模型被偷换
    Jailed,              // 🔴 严重风控黑屋
    InsufficientSamples, // ⚪ 样本不足 (N=0)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelHealthReport {
    pub account_id: String,
    pub model_name: String,
    pub exact_model_id: String,
    pub health_score: u32,
    pub status: DegradationStatus,
    pub speed_score: f32,
    pub intel_score: f32,
    pub stability_score: f32,
    pub nominal_tps: f32,
    pub actual_tps: f32,
    pub tps_deviation_pct: f32,
    pub actual_ttft_ms: u64,
    pub expected_ttft_ms: u64,
    pub thinking_ratio: f32,
    pub diagnosis_summary: String,
    pub can_auto_failover: bool,
    #[serde(default)]
    pub sample_count: u32,
}

pub struct CanaryProbe;

impl CanaryProbe {
    /// 生成工业级拟真 TypeScript 状态机边界 Bug 审查探针（零 WAF/风控指纹）
    pub fn generate_stealth_prompt() -> (String, String) {
        let trace_id = Uuid::new_v4().to_string();
        let prompt = format!(
            r#"/**
 * TraceId: {}
 * Review target: State reducer transition invariants for edge-case dispatch.
 */
interface State {{ status: 'idle' | 'pending' | 'resolved' | 'failed'; retryCount: number; flag: boolean; }}
type Action = {{ type: 'NEXT'; bypass: boolean }} | {{ type: 'RESET' }};

function transition(state: State, action: Action): State {{
    if (action.type === 'RESET') return {{ status: 'idle', retryCount: 0, flag: false }};
    const isTerminal = state.status === 'resolved' || (state.status === 'failed' && !action.bypass);
    if (isTerminal) return {{ ...state, retryCount: state.retryCount + 1 }};
    const nextStatus = state.status === 'idle' ? 'pending' : (action.bypass ? 'resolved' : 'failed');
    return {{ status: nextStatus, retryCount: state.retryCount + 1, flag: !state.flag }};
}}

// 演算任务：初始状态 s0 = {{ status: 'pending', retryCount: 1, flag: true }}
// 依次执行 dispatch:
// 1. {{ type: 'NEXT', bypass: false }}
// 2. {{ type: 'NEXT', bypass: true }}
// 请单步推导并给出第 2 次 dispatch 后的完整状态对象。
// 约束：分析推导完成后，最后一行严格输出 JSON: {{"status":string,"retryCount":number,"flag":boolean}}"#,
            trace_id
        );
        (prompt, trace_id)
    }

    /// 校验模型回答的逻辑准确性与思维深度
    pub fn verify_response(
        response_text: &str,
        thinking_tokens: u32,
        is_thinking_model: bool,
    ) -> (bool, bool) {
        // 过滤全部空白字符以容错多格式 JSON（空格、换行、缩进等）
        let compact_text: String = response_text
            .chars()
            .filter(|c| !c.is_whitespace())
            .collect();
        let is_logic_correct = compact_text.contains(r#""status":"resolved""#)
            && compact_text.contains(r#""retryCount":3"#)
            && compact_text.contains(r#""flag":true"#);

        let is_thinking_adequate = if is_thinking_model {
            thinking_tokens >= 200
        } else {
            true
        };

        (is_logic_correct, is_thinking_adequate)
    }
}

/// 长上下文物理参数化延迟模型 TTFT_expected(L, C)
pub fn calculate_expected_ttft(
    prompt_tokens: u64,
    cached_tokens: u64,
    is_pro_model: bool,
    net_rtt_ms: u64,
) -> u64 {
    let ttft_base = if is_pro_model { 350 } else { 200 };
    let k_uncached = if is_pro_model { 0.040 } else { 0.015 }; // ms per token
    let k_cached = 0.003; // ms per token

    let uncached = prompt_tokens.saturating_sub(cached_tokens) as f64;
    let cached = (cached_tokens.min(prompt_tokens)) as f64;

    let compute_ms = (uncached * k_uncached) + (cached * k_cached);
    (ttft_base as f64 + net_rtt_ms as f64 + compute_ms).round() as u64
}

/// 综合健康评分计算引擎 (0 ~ 100)
pub fn evaluate_health(
    actual_tps: f32,
    nominal_tps_min: f32,
    actual_ttft_ms: u64,
    expected_ttft_ms: u64,
    thinking_ratio: f32,
    min_thinking_ratio: f32,
    supports_thinking: bool,
    is_substituted: bool,
) -> (u32, DegradationStatus, f32, f32, f32) {
    if is_substituted {
        return (0, DegradationStatus::ModelSubstituted, 0.0, 0.0, 0.0);
    }

    // 速度评分 S_speed (0~100)
    let tps_ratio = (actual_tps / nominal_tps_min.max(1.0)).min(1.2);
    let s_speed = (tps_ratio * 100.0).min(100.0).max(0.0);

    // 智力与思考评分 S_intel (0~100)
    let s_intel = if supports_thinking {
        if thinking_ratio >= min_thinking_ratio {
            100.0
        } else if thinking_ratio < 0.05 {
            0.0 // 严重被阉割
        } else {
            (thinking_ratio / min_thinking_ratio) * 100.0
        }
    } else {
        100.0
    };

    // 稳定性评分 S_stability (0~100) 依据 TTFT 超标比例
    let ttft_ratio = actual_ttft_ms as f32 / expected_ttft_ms.max(1) as f32;
    let s_stability = if ttft_ratio <= 1.2 {
        100.0
    } else if ttft_ratio >= 4.0 {
        20.0
    } else {
        (1.0 - (ttft_ratio - 1.2) / 2.8) * 80.0 + 20.0
    };

    let total_score = (s_speed * 0.35 + s_intel * 0.45 + s_stability * 0.20).round() as u32;

    let status = if supports_thinking && s_intel < 20.0 {
        DegradationStatus::ThinkingPruned
    } else if total_score >= 85 {
        DegradationStatus::Nominal
    } else if total_score >= 60 {
        DegradationStatus::Throttled
    } else {
        DegradationStatus::Jailed
    };

    (total_score, status, s_speed, s_intel, s_stability)
}
