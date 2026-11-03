// src-tauri/src/modules/universal_discovery.rs
// 五级全域路径自适应探测引擎 (Five-Tier Universal Discovery Engine)

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

pub struct DiscoveryEngine;

impl DiscoveryEngine {
    /// 综合执行五级路径探测，返回去重且通过真实性校验的有效会话目录集合
    pub fn resolve_all_antigravity_paths() -> Vec<PathBuf> {
        let mut candidates = HashSet::new();

        // Level 1: 跨平台动态环境变量推导
        Self::probe_env_paths(&mut candidates);

        // Level 2: 便携模式与运行进程探测
        Self::probe_portable_and_processes(&mut candidates);

        // Level 3: Windows 注册表与 WSL2 探测
        Self::probe_registry_and_wsl(&mut candidates);

        // Level 4: 全驱动器启发式快速探针 (C:, D:, E:, F:, G:)
        Self::probe_multi_drive_heuristics(&mut candidates);

        // Level 5: 本地记忆配置文件
        Self::probe_cached_manifest(&mut candidates);

        // 最终签名验真：过滤出真正包含有效 DB 的路径并去重排序
        let mut valid: Vec<PathBuf> = candidates
            .into_iter()
            .filter(|p| Self::validate_antigravity_dir(p))
            .collect();
        valid.sort();
        valid
    }

    /// 验证目录是否为合法的 Antigravity 会话数据源
    pub fn validate_antigravity_dir(path: &Path) -> bool {
        if !path.exists() || !path.is_dir() {
            return false;
        }
        let summaries = path.join("conversation_summaries.db");
        let convs_dir = path.join("conversations");
        if summaries.exists() {
            return true;
        }
        if convs_dir.exists() && convs_dir.is_dir() {
            if let Ok(entries) = fs::read_dir(&convs_dir) {
                for entry in entries.flatten() {
                    if entry.path().extension().map_or(false, |ext| ext == "db") {
                        return true;
                    }
                }
            }
        }
        false
    }

    /// L1: 环境变量推导
    fn probe_env_paths(candidates: &mut HashSet<PathBuf>) {
        if let Some(home) = dirs::home_dir() {
            candidates.insert(home.join(".gemini").join("antigravity"));
            candidates.insert(home.join(".gemini").join("antigravity-ide"));
            candidates.insert(home.join(".antigravity_tools"));
        }

        let env_vars = [
            "ANTIGRAVITY_HOME",
            "GEMINI_DATA_DIR",
            "GEMINI_HOME",
            "USERPROFILE",
            "APPDATA",
            "LOCALAPPDATA",
        ];

        for var in env_vars {
            if let Ok(val) = std::env::var(var) {
                let p = PathBuf::from(val);
                candidates.insert(p.clone());
                candidates.insert(p.join(".gemini").join("antigravity"));
                candidates.insert(p.join("antigravity"));
            }
        }
    }

    /// L2: 便携模式 (Portable Mode) 与进程检测
    fn probe_portable_and_processes(candidates: &mut HashSet<PathBuf>) {
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                candidates.insert(exe_dir.join("data").join(".gemini").join("antigravity"));
                candidates.insert(exe_dir.join("data"));
                candidates.insert(exe_dir.to_path_buf());
            }
        }
    }

    /// L3: 注册表与 WSL2 探测
    fn probe_registry_and_wsl(candidates: &mut HashSet<PathBuf>) {
        // Windows 平台探测 WSL2 网络重定向路径
        #[cfg(target_os = "windows")]
        {
            let distros = ["Ubuntu", "Debian", "docker-desktop"];
            for d in distros {
                let wsl_base = PathBuf::from(format!(r"\\wsl.localhost\{}", d));
                let home = wsl_base.join("home");
                if home.exists() {
                    if let Ok(entries) = fs::read_dir(&home) {
                        for e in entries.flatten() {
                            let p = e.path().join(".gemini").join("antigravity");
                            if p.exists() {
                                candidates.insert(p);
                            }
                        }
                    }
                }
            }
        }
    }

    /// L4: 全驱动器启发式探针 (针对非标准盘符如 D:, E:, F:, G:)
    fn probe_multi_drive_heuristics(candidates: &mut HashSet<PathBuf>) {
        let drive_letters = [b'C', b'D', b'E', b'F', b'G'];
        let probe_patterns = [
            "AI数据源文件夹",
            "AI_Tools",
            "Antigravity",
            ".gemini/antigravity",
            "AI用量",
        ];

        for letter in drive_letters {
            let root = format!("{}:\\", letter as char);
            let root_path = Path::new(&root);
            if root_path.exists() {
                for pattern in probe_patterns {
                    let direct = root_path.join(pattern);
                    if direct.exists() {
                        candidates.insert(direct.clone());
                        candidates.insert(direct.join(".gemini").join("antigravity"));
                        candidates.insert(direct.join("antigravity"));
                    }
                }
            }
        }
    }

    /// L5: 记忆配置文件与用户显式自定义目录
    fn probe_cached_manifest(candidates: &mut HashSet<PathBuf>) {
        if let Ok(data_dir) = crate::modules::account::get_data_dir() {
            let manifest_path = data_dir.join("path_manifest.json");
            if manifest_path.exists() {
                if let Ok(content) = fs::read_to_string(&manifest_path) {
                    if let Ok(paths) = serde_json::from_str::<Vec<String>>(&content) {
                        for p in paths {
                            candidates.insert(PathBuf::from(p));
                        }
                    }
                }
            }
        }
    }

    /// 保存用户手动指定的自定义数据源目录
    pub fn save_custom_path(path: &Path) -> Result<(), String> {
        let data_dir = crate::modules::account::get_data_dir().map_err(|e| e.to_string())?;
        let manifest_path = data_dir.join("path_manifest.json");
        let mut paths = Vec::new();
        if manifest_path.exists() {
            if let Ok(content) = fs::read_to_string(&manifest_path) {
                paths = serde_json::from_str::<Vec<String>>(&content).unwrap_or_default();
            }
        }
        let normalized_path = path
            .to_string_lossy()
            .replace('/', "\\")
            .trim_end_matches('\\')
            .to_string();
        if !paths
            .iter()
            .any(|p| p.replace('/', "\\").trim_end_matches('\\') == normalized_path)
        {
            paths.push(normalized_path);
            let json = serde_json::to_string_pretty(&paths).map_err(|e| e.to_string())?;
            fs::write(manifest_path, json).map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}
