use axum::{
    extract::Query,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

#[derive(Deserialize)]
pub struct FinancialChartQuery {
    pub limit_days: Option<u32>,
}

#[derive(Deserialize)]
pub struct FinancialDetailsQuery {
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

#[derive(Deserialize)]
pub struct DiagnosticsHealthQuery {
    pub hours: Option<u32>,
}

#[derive(Deserialize)]
pub struct AddPathPayload {
    pub path: String,
}

#[derive(Deserialize)]
pub struct ForensicPayload {
    pub account_id: String,
}

async fn admin_get_financial_summary() -> Result<impl IntoResponse, (StatusCode, Json<ErrorResponse>)> {
    match crate::commands::analytics::get_financial_summary().await {
        Ok(res) => Ok(Json(res)),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: e }))),
    }
}

async fn admin_get_financial_chart_data(
    Query(q): Query<FinancialChartQuery>,
) -> Result<impl IntoResponse, (StatusCode, Json<ErrorResponse>)> {
    match crate::commands::analytics::get_financial_chart_data(q.limit_days).await {
        Ok(res) => Ok(Json(res)),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: e }))),
    }
}

async fn admin_get_financial_usage_details(
    Query(q): Query<FinancialDetailsQuery>,
) -> Result<impl IntoResponse, (StatusCode, Json<ErrorResponse>)> {
    match crate::commands::analytics::get_financial_usage_details(q.limit, q.offset).await {
        Ok(res) => Ok(Json(res)),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: e }))),
    }
}

async fn admin_refresh_financial_analytics() -> Result<impl IntoResponse, (StatusCode, Json<ErrorResponse>)> {
    match crate::commands::analytics::refresh_financial_analytics().await {
        Ok(res) => Ok(Json(res)),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: e }))),
    }
}

async fn admin_get_model_health_diagnostics(
    Query(q): Query<DiagnosticsHealthQuery>,
) -> Result<impl IntoResponse, (StatusCode, Json<ErrorResponse>)> {
    match crate::commands::analytics::get_model_health_diagnostics(q.hours).await {
        Ok(res) => Ok(Json(res)),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: e }))),
    }
}

async fn admin_get_official_benchmark_specs() -> Result<impl IntoResponse, (StatusCode, Json<ErrorResponse>)> {
    match crate::commands::analytics::get_official_benchmark_specs().await {
        Ok(res) => Ok(Json(res)),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: e }))),
    }
}

async fn admin_get_discovered_antigravity_paths() -> Result<impl IntoResponse, (StatusCode, Json<ErrorResponse>)> {
    match crate::commands::analytics::get_discovered_antigravity_paths().await {
        Ok(res) => Ok(Json(res)),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: e }))),
    }
}

async fn admin_add_custom_antigravity_path(
    Json(payload): Json<AddPathPayload>,
) -> Result<impl IntoResponse, (StatusCode, Json<ErrorResponse>)> {
    match crate::commands::analytics::add_custom_antigravity_path(payload.path).await {
        Ok(res) => Ok(Json(serde_json::json!({ "success": res }))),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: e }))),
    }
}

async fn admin_run_stealth_canary_probe() -> Result<impl IntoResponse, (StatusCode, Json<ErrorResponse>)> {
    match crate::commands::analytics::run_stealth_canary_probe().await {
        Ok(res) => Ok(Json(res)),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: e }))),
    }
}

async fn admin_export_forensic_dossier(
    Json(payload): Json<ForensicPayload>,
) -> Result<impl IntoResponse, (StatusCode, Json<ErrorResponse>)> {
    match crate::commands::analytics::export_forensic_dossier(payload.account_id).await {
        Ok(res) => Ok(Json(res)),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: e }))),
    }
}

pub fn analytics_admin_routes<S>() -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    Router::new()
        .route("/analytics/financial/summary", get(admin_get_financial_summary))
        .route("/analytics/financial/chart", get(admin_get_financial_chart_data))
        .route("/analytics/financial/details", get(admin_get_financial_usage_details))
        .route("/analytics/financial/refresh", post(admin_refresh_financial_analytics))
        .route("/analytics/diagnostics/health", get(admin_get_model_health_diagnostics))
        .route("/analytics/diagnostics/specs", get(admin_get_official_benchmark_specs))
        .route(
            "/analytics/diagnostics/paths",
            get(admin_get_discovered_antigravity_paths).post(admin_add_custom_antigravity_path),
        )
        .route("/analytics/diagnostics/canary", post(admin_run_stealth_canary_probe))
        .route("/analytics/diagnostics/forensic", post(admin_export_forensic_dossier))
}
