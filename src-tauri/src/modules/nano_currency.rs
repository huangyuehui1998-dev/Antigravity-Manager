// src-tauri/src/modules/nano_currency.rs
// 纳美元 (Nano-USD, 1 USD = 10^9 Nano-USD) 整数高精计费核心

use serde::{Deserialize, Serialize};

pub const NANO_PER_USD: i64 = 1_000_000_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default, Serialize, Deserialize)]
pub struct NanoUsd(pub i64);

impl NanoUsd {
    pub const ZERO: Self = Self(0);

    /// 从 Token 数量和每百万 Token 单价(纳美元)安全计算费用，采用 i128 中间运算防溢出
    pub fn from_tokens_checked(tokens: u64, price_per_million_usd_nano: u64) -> Self {
        let tokens_128 = tokens as i128;
        let price_128 = price_per_million_usd_nano as i128;
        let total_nano_128 = (tokens_128 * price_128) / 1_000_000i128;

        let val_i64 = if total_nano_128 > i64::MAX as i128 {
            i64::MAX
        } else {
            total_nano_128 as i64
        };
        Self(val_i64)
    }

    /// 从美元浮点数转换为纳美元
    pub fn from_usd_f64(usd: f64) -> Self {
        Self((usd * NANO_PER_USD as f64).round() as i64)
    }

    /// 转换为美元浮点数（用于展示）
    pub fn to_usd_f64(self) -> f64 {
        self.0 as f64 / NANO_PER_USD as f64
    }

    /// 转换为人民币浮点数（汇率换算）
    pub fn to_cny_f64(self, exchange_rate: f64) -> f64 {
        self.to_usd_f64() * exchange_rate
    }

    /// 饱和加法，避免溢出
    pub fn saturating_add(self, rhs: Self) -> Self {
        Self(self.0.saturating_add(rhs.0))
    }
}

/// 模型阶梯分段定价字典（全部以 10^9 纳美元为基准）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TieredPricing {
    pub prompt_nano: u64,        // 标准输入单价: $1.25/1M => 1,250,000,000 nUSD
    pub cached_prompt_nano: u64, // 缓存命中单价: $0.30/1M => 300,000,000 nUSD
    pub thinking_nano: u64,      // 思考推理单价: $5.00/1M => 5,000,000,000 nUSD
    pub completion_nano: u64,    // 输出补全单价: $5.00/1M => 5,000,000,000 nUSD
}

impl TieredPricing {
    pub fn calculate_cost(&self, prompt: u64, cached: u64, thinking: u64, completion: u64) -> NanoUsd {
        let p_cost = NanoUsd::from_tokens_checked(prompt, self.prompt_nano);
        let cp_cost = NanoUsd::from_tokens_checked(cached, self.cached_prompt_nano);
        let th_cost = NanoUsd::from_tokens_checked(thinking, self.thinking_nano);
        let c_cost = NanoUsd::from_tokens_checked(completion, self.completion_nano);

        p_cost.saturating_add(cp_cost).saturating_add(th_cost).saturating_add(c_cost)
    }
}
