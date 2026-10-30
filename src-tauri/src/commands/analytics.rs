// src-tauri/src/commands/analytics.rs
// 财务看板与数据湖 Tauri IPC 接口

use crate::modules::analytics_hub::{
    self, FinancialSummary, PeriodRollupItem, UnifiedUsageRecord,
};

#[tauri::command]
pub async fn get_financial_summary() -> Result<FinancialSummary, String> {
    analytics_hub::query_financial_summary()
}

#[tauri::command]
pub async fn get_financial_chart_data(limit_days: Option<u32>) -> Result<Vec<PeriodRollupItem>, String> {
    analytics_hub::query_daily_chart(limit_days.unwrap_or(30))
}

#[tauri::command]
pub async fn get_financial_usage_details(
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<(Vec<UnifiedUsageRecord>, i64), String> {
    analytics_hub::query_usage_details(limit.unwrap_or(50), offset.unwrap_or(0))
}

#[tauri::command]
pub async fn refresh_financial_analytics() -> Result<(usize, usize), String> {
    analytics_hub::refresh_all_analytics()
}
