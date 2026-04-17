use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;

use reqwest::Url;
use tauri::State;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex as AsyncMutex;

use crate::core::state::{AppState, VmlxBackendSession, VmlxSessionInfo};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct VmlxDiscoveredModel {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VmlxLaunchConfig {
    pub continuous_batching: Option<bool>,
    pub use_paged_cache: Option<bool>,
    pub kv_cache_quantization: Option<String>,
    pub cache_memory_percent: Option<f64>,
    pub cache_ttl_minutes: Option<u64>,
    pub default_enable_thinking: Option<bool>,
    pub enable_jit: Option<bool>,
}

fn is_ignored_entry(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.starts_with('.') || name.starts_with("._"))
        .unwrap_or(true)
}

fn model_dir_from_root(model_root: &str, model_id: &str) -> PathBuf {
    Path::new(model_root).join(model_id)
}

fn load_json_value(path: &Path) -> Option<serde_json::Value> {
    let contents = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&contents).ok()
}

fn model_requires_mllm(model_path: &Path) -> bool {
    let config_path = model_path.join("config.json");
    if let Some(config) = load_json_value(&config_path) {
        if config.get("vision_config").is_some() {
            return true;
        }
    }

    let jang_config_path = model_path.join("jang_config.json");
    if let Some(jang_config) = load_json_value(&jang_config_path) {
        if jang_config
            .get("architecture")
            .and_then(|architecture| architecture.get("has_vision"))
            .and_then(|value| value.as_bool())
            .unwrap_or(false)
        {
            return true;
        }
    }

    false
}

fn find_appledouble_entries(model_path: &Path) -> Result<Vec<PathBuf>, String> {
    let entries = std::fs::read_dir(model_path).map_err(|error| error.to_string())?;
    let mut sidecars = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if path
            .file_name()
            .and_then(|name| name.to_str())
            .map(|name| name.starts_with("._"))
            .unwrap_or(false)
        {
            sidecars.push(path);
        }
    }

    sidecars.sort();
    Ok(sidecars)
}

fn parse_port_from_base_url(base_url: &str) -> Result<u16, String> {
    let parsed = Url::parse(base_url).map_err(|error| error.to_string())?;
    parsed
        .port_or_known_default()
        .ok_or_else(|| format!("Base URL does not include a valid port: {base_url}"))
}

async fn is_server_ready(base_url: &str) -> bool {
    let client = reqwest::Client::new();
    let models_url = format!("{}/models", base_url.trim_end_matches('/'));

    match client.get(models_url).send().await {
        Ok(response) => response.status().is_success(),
        Err(_) => false,
    }
}

async fn push_recent_log_line(
    recent_lines: &Arc<AsyncMutex<Vec<String>>>,
    line: String,
) {
    let mut lines = recent_lines.lock().await;
    lines.push(line);
    if lines.len() > 20 {
        let excess = lines.len() - 20;
        lines.drain(0..excess);
    }
}

async fn recent_log_summary(recent_lines: &Arc<AsyncMutex<Vec<String>>>) -> String {
    let lines = recent_lines.lock().await;
    if lines.is_empty() {
        String::new()
    } else {
        format!(" Recent vMLX logs: {}", lines.join(" | "))
    }
}

#[cfg(unix)]
async fn terminate_child(child: &mut tokio::process::Child) {
    if child.id().is_some() {
        let _ = child.start_kill();
        let _ = tokio::time::timeout(Duration::from_secs(3), child.wait()).await;
    }
}

#[cfg(not(unix))]
async fn terminate_child(child: &mut tokio::process::Child) {
    let _ = child.kill().await;
}

async fn stop_existing_vmlx_session(state: &State<'_, AppState>) -> Result<(), String> {
    let session = {
        let mut session_guard = state.vmlx_session.lock().await;
        session_guard.take()
    };

    if let Some(mut session) = session {
        log::info!(
            "Stopping existing VMLX session for model {} (pid {})",
            session.info.model_id,
            session.info.pid
        );
        terminate_child(&mut session.child).await;
    }

    Ok(())
}

async fn cancel_scheduled_unload(state: &AppState) {
    let task = {
        let mut task_guard = state.vmlx_unload_task.lock().await;
        task_guard.take()
    };

    if let Some(task) = task {
        task.abort();
    }
}

async fn launch_vmlx_session(
    state: &State<'_, AppState>,
    model_id: &str,
    model_root: &str,
    base_url: &str,
    server_command: &str,
    timeout_secs: u64,
    launch_config: &VmlxLaunchConfig,
) -> Result<VmlxSessionInfo, String> {
    let model_path = model_dir_from_root(model_root, model_id);
    if !model_path.exists() {
        return Err(format!("VMLX model path does not exist: {}", model_path.display()));
    }

    if !model_path.join("jang_config.json").exists() {
        return Err(format!(
            "VMLX model folder is missing jang_config.json: {}",
            model_path.display()
        ));
    }

    let appledouble_entries = find_appledouble_entries(&model_path)?;
    if !appledouble_entries.is_empty() {
        let sample_entries = appledouble_entries
            .iter()
            .take(3)
            .map(|path| path.display().to_string())
            .collect::<Vec<_>>()
            .join(", ");
        return Err(format!(
            "VMLX model folder contains macOS sidecar files (._*) that break model loading. Clean the folder first, for example with `dot_clean -m \"{}\"`. Sample entries: {}",
            model_path.display(),
            sample_entries
        ));
    }

    let port = parse_port_from_base_url(base_url)?;
    let command_name = if server_command.trim().is_empty() {
        "vmlx"
    } else {
        server_command
    };
    let requires_mllm = model_requires_mllm(&model_path);
    let can_use_batched_runtime = !requires_mllm;

    let mut command = Command::new(command_name);
    command
        .arg("serve")
        .arg(model_path.as_os_str())
        .arg("--served-model-name")
        .arg("local")
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(port.to_string())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if requires_mllm {
        command.arg("--is-mllm");
    }

    if launch_config.continuous_batching.unwrap_or(false) && can_use_batched_runtime {
        command.arg("--continuous-batching");
    }

    if launch_config.use_paged_cache.unwrap_or(false) && can_use_batched_runtime {
        command.arg("--use-paged-cache");
    }

    if can_use_batched_runtime {
        if let Some(kv_cache_quantization) = launch_config.kv_cache_quantization.as_ref() {
        match kv_cache_quantization.as_str() {
            "none" | "q4" | "q8" => {
                command
                    .arg("--kv-cache-quantization")
                    .arg(kv_cache_quantization);
            }
            other => {
                return Err(format!(
                    "Unsupported VMLX KV cache quantization value `{other}`. Expected one of: none, q4, q8."
                ));
            }
        }
    }
    }

    if let Some(cache_memory_percent) = launch_config.cache_memory_percent {
        if !(0.0..=1.0).contains(&cache_memory_percent) || cache_memory_percent == 0.0 {
            return Err(
                "VMLX cache-memory-percent must be greater than 0 and at most 1.0.".to_string(),
            );
        }

        if can_use_batched_runtime {
            command
                .arg("--cache-memory-percent")
                .arg(cache_memory_percent.to_string());
        }
    }

    if let Some(cache_ttl_minutes) = launch_config.cache_ttl_minutes {
        if can_use_batched_runtime {
            command
                .arg("--cache-ttl-minutes")
                .arg(cache_ttl_minutes.to_string());
        }
    }

    if let Some(default_enable_thinking) = launch_config.default_enable_thinking {
        command
            .arg("--default-enable-thinking")
            .arg(if default_enable_thinking { "true" } else { "false" });
    }

    if launch_config.enable_jit.unwrap_or(false) {
        command.arg("--enable-jit");
    }

    if requires_mllm {
        log::info!(
            "VMLX model {} requires MLLM mode; disabling continuous batching, paged cache, KV quantization, and prefix cache tuning for this session",
            model_id
        );
    }

    let mut child = command
        .spawn()
        .map_err(|error| format!("Failed to launch VMLX server `{command_name}`: {error}"))?;

    let pid = child.id().unwrap_or(0) as i32;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let recent_logs = Arc::new(AsyncMutex::new(Vec::new()));

    if let Some(stdout) = stdout {
        let recent_logs = Arc::clone(&recent_logs);
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                log::info!("[vmlx stdout] {}", line);
                push_recent_log_line(&recent_logs, line).await;
            }
        });
    }

    if let Some(stderr) = stderr {
        let recent_logs = Arc::clone(&recent_logs);
        tokio::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                log::warn!("[vmlx stderr] {}", line);
                push_recent_log_line(&recent_logs, line).await;
            }
        });
    }

    let session_info = VmlxSessionInfo {
        pid,
        port: port as i32,
        model_id: model_id.to_string(),
        model_path: model_path.to_string_lossy().into_owned(),
        base_url: base_url.to_string(),
        server_command: command_name.to_string(),
    };

    let deadline = tokio::time::Instant::now() + Duration::from_secs(timeout_secs);

    loop {
        if is_server_ready(base_url).await {
            let mut session_guard = state.vmlx_session.lock().await;
            session_guard.replace(VmlxBackendSession {
                child,
                info: session_info.clone(),
                launch_config: launch_config.clone(),
            });
            log::info!(
                "VMLX server ready for model {} on {}",
                session_info.model_id,
                session_info.base_url
            );
            return Ok(session_info);
        }

        if tokio::time::Instant::now() >= deadline {
            let _ = terminate_child(&mut child).await;
            let recent_logs = recent_log_summary(&recent_logs).await;
            return Err(format!(
                "VMLX server did not become ready within {} seconds for model {}.{}",
                timeout_secs, model_id, recent_logs
            ));
        }

        if let Some(status) = child
            .try_wait()
            .map_err(|error| format!("Failed to inspect VMLX process: {error}"))?
        {
            let recent_logs = recent_log_summary(&recent_logs).await;
            return Err(format!(
                "VMLX server exited before becoming ready (status: {status}).{}",
                recent_logs
            ));
        }

        tokio::time::sleep(Duration::from_millis(250)).await;
    }
}

pub async fn cleanup_vmlx_session(state: &AppState) {
    cancel_scheduled_unload(state).await;

    let session = {
        let mut session_guard = state.vmlx_session.lock().await;
        session_guard.take()
    };

    if let Some(mut session) = session {
        terminate_child(&mut session.child).await;
        log::info!("VMLX server cleaned up successfully");
    }
}

#[tauri::command]
pub async fn list_vmlx_jang_models(model_root: String) -> Result<Vec<VmlxDiscoveredModel>, String> {
    let root = PathBuf::from(&model_root);
    if !root.exists() {
        return Err(format!("VMLX model root does not exist: {}", root.display()));
    }

    let entries = std::fs::read_dir(&root).map_err(|error| error.to_string())?;
    let mut models = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if is_ignored_entry(&path) || !path.is_dir() {
            continue;
        }

        if path.join("jang_config.json").exists() {
            let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };

            models.push(VmlxDiscoveredModel {
                id: name.to_string(),
                name: name.to_string(),
            });
        }
    }

    models.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(models)
}

#[tauri::command]
pub async fn ensure_vmlx_model_server(
    state: State<'_, AppState>,
    model_id: String,
    model_root: String,
    base_url: String,
    server_command: String,
    timeout_secs: Option<u64>,
    launch_config: Option<VmlxLaunchConfig>,
) -> Result<VmlxSessionInfo, String> {
    let timeout_secs = timeout_secs.unwrap_or(60);
    let launch_config = launch_config.unwrap_or_default();
    cancel_scheduled_unload(state.inner()).await;

    {
        let mut session_guard = state.vmlx_session.lock().await;
        if let Some(session) = session_guard.as_mut() {
            let same_model = session.info.model_id == model_id;
            let same_base_url = session.info.base_url == base_url;
            let same_launch_config = session.launch_config == launch_config;
            let process_running = session
                .child
                .try_wait()
                .map_err(|error| format!("Failed to inspect VMLX process: {error}"))?
                .is_none();

            if same_model
                && same_base_url
                && same_launch_config
                && process_running
                && is_server_ready(&base_url).await
            {
                return Ok(session.info.clone());
            }
        }
    }

    stop_existing_vmlx_session(&state).await?;
    launch_vmlx_session(
        &state,
        &model_id,
        &model_root,
        &base_url,
        &server_command,
        timeout_secs,
        &launch_config,
    )
    .await
}

#[tauri::command]
pub async fn stop_vmlx_model_server(state: State<'_, AppState>) -> Result<bool, String> {
    cancel_scheduled_unload(state.inner()).await;

    let session = {
        let mut session_guard = state.vmlx_session.lock().await;
        session_guard.take()
    };

    if let Some(mut session) = session {
        terminate_child(&mut session.child).await;
        log::info!("Stopped VMLX session for model {}", session.info.model_id);
        Ok(true)
    } else {
        Ok(false)
    }
}

#[tauri::command]
pub async fn schedule_vmlx_model_server_stop(
    state: State<'_, AppState>,
    idle_secs: Option<u64>,
) -> Result<bool, String> {
    let idle_secs = idle_secs.unwrap_or(180);
    cancel_scheduled_unload(state.inner()).await;

    let has_session = {
        let session_guard = state.vmlx_session.lock().await;
        session_guard.is_some()
    };

    if !has_session {
        return Ok(false);
    }

    let vmlx_session = state.vmlx_session.clone();
    let vmlx_unload_task = state.vmlx_unload_task.clone();

    let task = tokio::spawn(async move {
        tokio::time::sleep(Duration::from_secs(idle_secs)).await;

        let session = {
            let mut session_guard = vmlx_session.lock().await;
            session_guard.take()
        };

        if let Some(mut session) = session {
            log::info!(
                "Stopping idle VMLX session for model {} after {} seconds",
                session.info.model_id,
                idle_secs
            );
            terminate_child(&mut session.child).await;
        }

        let mut task_guard = vmlx_unload_task.lock().await;
        task_guard.take();
    });

    let mut task_guard = state.vmlx_unload_task.lock().await;
    task_guard.replace(task);

    Ok(true)
}

#[tauri::command]
pub async fn get_vmlx_server_status(
    state: State<'_, AppState>,
) -> Result<Option<VmlxSessionInfo>, String> {
    let mut session_guard = state.vmlx_session.lock().await;

    if let Some(session) = session_guard.as_mut() {
        let process_running = session
            .child
            .try_wait()
            .map_err(|error| format!("Failed to inspect VMLX process: {error}"))?
            .is_none();

        if process_running {
            return Ok(Some(session.info.clone()));
        }

        session_guard.take();
    }

    Ok(None)
}
