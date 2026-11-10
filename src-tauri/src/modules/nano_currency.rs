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
    pub fn calculate_cost(
        &self,
        prompt: u64,
        cached: u64,
        thinking: u64,
        completion: u64,
    ) -> NanoUsd {
        let uncached_prompt = prompt.saturating_sub(cached);
        let p_cost = NanoUsd::from_tokens_checked(uncached_prompt, self.prompt_nano);
        let cp_cost = NanoUsd::from_tokens_checked(cached, self.cached_prompt_nano);
        let th_cost = NanoUsd::from_tokens_checked(thinking, self.thinking_nano);
        let c_cost = NanoUsd::from_tokens_checked(completion, self.completion_nano);

        p_cost
            .saturating_add(cp_cost)
            .saturating_add(th_cost)
            .saturating_add(c_cost)
    }
}

pub fn get_model_pricing(model: &str) -> TieredPricing {
    let m = model.to_lowercase();
    if m.contains("claude-opus") || m.contains("claude-3-opus") || m.contains("opus") {
        TieredPricing {
            prompt_nano: 15_000_000_000,
            cached_prompt_nano: 3_750_000_000,
            thinking_nano: 75_000_000_000,
            completion_nano: 75_000_000_000,
        }
    } else if m.contains("claude-3-7") || m.contains("claude-3-5-sonnet") || m.contains("sonnet") {
        TieredPricing {
            prompt_nano: 3_000_000_000,
            cached_prompt_nano: 750_000_000,
            thinking_nano: 15_000_000_000,
            completion_nano: 15_000_000_000,
        }
    } else if m.contains("claude-3-5-haiku") || m.contains("haiku") {
        TieredPricing {
            prompt_nano: 800_000_000,
            cached_prompt_nano: 200_000_000,
            thinking_nano: 4_000_000_000,
            completion_nano: 4_000_000_000,
        }
    } else if m.contains("gemini-2.0-flash")
        || m.contains("gemini-2.5-flash")
        || m.contains("gemini-3.8-flash")
        || m.contains("flash")
    {
        TieredPricing {
            prompt_nano: 150_000_000,
            cached_prompt_nano: 37_500_000,
            thinking_nano: 600_000_000,
            completion_nano: 600_000_000,
        }
    } else if m.contains("gpt-4o-mini") {
        TieredPricing {
            prompt_nano: 150_000_000,
            cached_prompt_nano: 75_000_000,
            thinking_nano: 600_000_000,
            completion_nano: 600_000_000,
        }
    } else if m.contains("gpt-4o") {
        TieredPricing {
            prompt_nano: 2_500_000_000,
            cached_prompt_nano: 1_250_000_000,
            thinking_nano: 10_000_000_000,
            completion_nano: 10_000_000_000,
        }
    } else if m.contains("o3-mini") || m.contains("o1-mini") {
        TieredPricing {
            prompt_nano: 1_100_000_000,
            cached_prompt_nano: 550_000_000,
            thinking_nano: 4_400_000_000,
            completion_nano: 4_400_000_000,
        }
    } else if m.contains("o1") || m.contains("o3") {
        TieredPricing {
            prompt_nano: 15_000_000_000,
            cached_prompt_nano: 7_500_000_000,
            thinking_nano: 60_000_000_000,
            completion_nano: 60_000_000_000,
        }
    } else if m.contains("gpt-4-turbo") || m.contains("gpt-4") {
        TieredPricing {
            prompt_nano: 10_000_000_000,
            cached_prompt_nano: 5_000_000_000,
            thinking_nano: 30_000_000_000,
            completion_nano: 30_000_000_000,
        }
    } else if (m.contains("gemini") && m.contains("pro")) || m.contains("pro") {
        TieredPricing {
            prompt_nano: 1_250_000_000,
            cached_prompt_nano: 312_500_000,
            thinking_nano: 5_000_000_000,
            completion_nano: 5_000_000_000,
        }
    } else {
        TieredPricing {
            prompt_nano: 1_000_000_000,
            cached_prompt_nano: 250_000_000,
            thinking_nano: 3_000_000_000,
            completion_nano: 3_000_000_000,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelPricingRuleDto {
    pub input: f64,
    pub output: f64,
    pub cached: f64,
    pub reasoning: f64,
}

pub fn get_standard_pricing_catalog() -> std::collections::HashMap<String, ModelPricingRuleDto> {
    let models = vec![
        "gemini-3.8-flash",
        "gemini-3.7-flash",
        "gemini-3.6-flash",
        "gemini-3.5-flash",
        "gemini-3-flash",
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-3.1-pro",
        "gemini-3-pro",
        "gemini-2.5-pro",
        "gemini-2.0-pro",
        "claude-sonnet-4-6",
        "claude-sonnet-4-5",
        "claude-3-7-sonnet",
        "claude-3-5-sonnet",
        "claude-opus-4-6",
        "claude-opus-4-5",
        "claude-3-opus",
        "claude-haiku-4",
        "claude-3-5-haiku",
        "gpt-4o",
        "gpt-4o-mini",
        "gpt-4-turbo",
        "gpt-4",
        "o1",
        "o1-mini",
        "o3",
        "o3-mini",
        "default",
    ];
    let mut map = std::collections::HashMap::new();
    for m in models {
        let p = get_model_pricing(m);
        map.insert(
            m.to_string(),
            ModelPricingRuleDto {
                input: p.prompt_nano as f64 / 1_000_000_000.0,
                output: p.completion_nano as f64 / 1_000_000_000.0,
                cached: p.cached_prompt_nano as f64 / 1_000_000_000.0,
                reasoning: p.thinking_nano as f64 / 1_000_000_000.0,
            },
        );
    }
    map
}
