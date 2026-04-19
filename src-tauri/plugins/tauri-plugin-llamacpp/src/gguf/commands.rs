use super::types::GgufMetadata;
use super::utils::{estimate_kv_cache_internal, read_gguf_metadata_internal};
use crate::gguf::types::{KVCacheError, KVCacheEstimate, ModelLoadPlan, ModelSupportStatus};
use std::collections::HashMap;
use std::fs;
use tauri_plugin_hardware::{get_system_info, SystemInfo, SystemUsage};

const RESERVE_BYTES: u64 = 2288490189;
const GPU_RESERVE_BYTES: u64 = 536870912;
const SAFETY_MARGIN_BYTES: u64 = 1073741824;
const DEFAULT_CONTEXT_SIZE: u64 = 8192;
const MIN_CONTEXT_SIZE: u64 = 1024;

fn mib_to_bytes(value: u64) -> u64 {
    value * 1024 * 1024
}

fn available_bytes(total: u64, used: u64, reserve: u64) -> u64 {
    total.saturating_sub(used).saturating_sub(reserve)
}

fn parse_context_length(meta: &HashMap<String, String>) -> Option<u64> {
    let arch = meta.get("general.architecture")?;
    let key = format!("{}.context_length", arch);
    meta.get(&key)
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|value| *value > 0)
}

fn detect_moe(meta: &HashMap<String, String>) -> bool {
    meta.iter().any(|(key, value)| {
        (key.ends_with(".expert_count")
            || key.ends_with(".expert_used_count")
            || key.ends_with(".expert_feed_forward_length"))
            && value.parse::<u64>().unwrap_or(0) > 0
    })
}

fn choose_context_bucket(max_context: u64, preferred: u64) -> u64 {
    const BUCKETS: &[u64] = &[
        1024, 2048, 3072, 4096, 6144, 8192, 12288, 16384, 24576, 32768, 49152, 65536, 131072,
    ];

    BUCKETS
        .iter()
        .copied()
        .filter(|bucket| *bucket <= max_context && *bucket <= preferred)
        .max()
        .unwrap_or(max_context)
}

fn recommend_batch_size(
    model_size: u64,
    available_memory: u64,
    status: ModelSupportStatus,
    is_moe: bool,
) -> u32 {
    let model_size_gb = model_size as f64 / (1024.0 * 1024.0 * 1024.0);
    let available_memory_gb = available_memory as f64 / (1024.0 * 1024.0 * 1024.0);

    if status == ModelSupportStatus::Red {
        return 32;
    }

    if is_moe || model_size_gb >= 20.0 || available_memory_gb <= 8.0 {
        return if status == ModelSupportStatus::Green {
            64
        } else {
            32
        };
    }

    if model_size_gb >= 12.0 || available_memory_gb <= 12.0 {
        return if status == ModelSupportStatus::Green {
            128
        } else {
            64
        };
    }

    if model_size_gb >= 7.0 || available_memory_gb <= 18.0 {
        return 256;
    }

    512
}

fn summarize_plan(
    status: ModelSupportStatus,
    recommended_context_size: u64,
    recommended_batch_size: u32,
    warnings: &[String],
) -> String {
    let status_text = match status {
        ModelSupportStatus::Green => "Fits comfortably",
        ModelSupportStatus::Yellow => "Needs conservative settings",
        ModelSupportStatus::Red => "Exceeds the current memory budget",
    };

    let mut summary = status_text.to_string();

    if recommended_context_size > 0 {
        summary.push_str(&format!(
            ". Recommended context: {}.",
            recommended_context_size
        ));
    } else {
        summary.push_str(". No safe context fits in memory right now.");
    }

    if recommended_batch_size > 0 {
        summary.push_str(&format!(
            " Recommended batch size: {}.",
            recommended_batch_size
        ));
    }

    if let Some(first_warning) = warnings.first() {
        summary.push(' ');
        summary.push_str(first_warning);
    }

    summary
}

fn effective_model_size(model_size: u64, total_model_bytes: Option<u64>) -> u64 {
    total_model_bytes
        .filter(|value| *value >= model_size)
        .unwrap_or(model_size)
}

async fn plan_model_load_internal(
    meta: HashMap<String, String>,
    model_size: u64,
    ctx_size: Option<u32>,
    system_info: &SystemInfo,
    system_usage: &SystemUsage,
) -> Result<ModelLoadPlan, KVCacheError> {
    let max_context_from_meta = parse_context_length(&meta).unwrap_or(DEFAULT_CONTEXT_SIZE);
    let requested_context_size = ctx_size
        .map(|value| value as u64)
        .filter(|value| *value > 0)
        .unwrap_or(DEFAULT_CONTEXT_SIZE)
        .min(max_context_from_meta);

    let min_context = MIN_CONTEXT_SIZE.min(max_context_from_meta);
    let requested_kv =
        estimate_kv_cache_internal(meta.clone(), Some(requested_context_size)).await?;
    let minimum_kv = estimate_kv_cache_internal(meta.clone(), Some(min_context)).await?;

    let system_total_bytes = mib_to_bytes(system_info.total_memory);
    let system_used_bytes = mib_to_bytes(system_usage.used_memory);
    let gpu_total_bytes = system_usage
        .gpus
        .iter()
        .map(|gpu| mib_to_bytes(gpu.total_memory))
        .sum::<u64>();
    let gpu_used_bytes = system_usage
        .gpus
        .iter()
        .map(|gpu| mib_to_bytes(gpu.used_memory))
        .sum::<u64>();

    let is_unified_memory = system_info.gpus.is_empty();
    let available_system_memory =
        available_bytes(system_total_bytes, system_used_bytes, RESERVE_BYTES);
    let available_gpu_memory = if is_unified_memory {
        0
    } else {
        available_bytes(gpu_total_bytes, gpu_used_bytes, GPU_RESERVE_BYTES)
    };
    let available_memory = if is_unified_memory {
        available_system_memory
    } else {
        available_system_memory + available_gpu_memory
    };

    let requested_total_required = model_size.saturating_add(requested_kv.size);
    let minimum_total_required = model_size.saturating_add(minimum_kv.size);

    let status = if requested_total_required.saturating_add(SAFETY_MARGIN_BYTES) <= available_memory
    {
        ModelSupportStatus::Green
    } else if minimum_total_required <= available_memory {
        ModelSupportStatus::Yellow
    } else {
        ModelSupportStatus::Red
    };

    let max_context_size = if requested_kv.per_token_size == 0
        || available_memory <= model_size.saturating_add(SAFETY_MARGIN_BYTES)
    {
        0
    } else {
        ((available_memory - model_size - SAFETY_MARGIN_BYTES) / requested_kv.per_token_size)
            .min(max_context_from_meta)
    };

    let preferred_context = if status == ModelSupportStatus::Green {
        requested_context_size
    } else {
        max_context_size.saturating_mul(85) / 100
    };
    let recommended_context_size = if max_context_size == 0 {
        0
    } else if max_context_size >= min_context {
        choose_context_bucket(max_context_size, preferred_context.max(min_context))
    } else {
        max_context_size
    };

    let recommended_kv = if recommended_context_size > 0 {
        estimate_kv_cache_internal(meta.clone(), Some(recommended_context_size)).await?
    } else {
        KVCacheEstimate {
            size: 0,
            per_token_size: requested_kv.per_token_size,
        }
    };
    let recommended_total_required = model_size.saturating_add(recommended_kv.size);
    let is_moe = detect_moe(&meta);
    let recommended_batch_size =
        if recommended_context_size == 0 && status == ModelSupportStatus::Red {
            0
        } else {
            recommend_batch_size(model_size, available_memory, status, is_moe)
        };
    let recommended_no_kv_offload = is_unified_memory
        && (status != ModelSupportStatus::Green
            || is_moe
            || model_size.saturating_mul(10) >= system_total_bytes.saturating_mul(6));

    let mut warnings = Vec::new();

    if status == ModelSupportStatus::Red {
        warnings.push(
            "Model weights plus a minimal KV cache exceed currently available memory.".to_string(),
        );
    } else if status == ModelSupportStatus::Yellow {
        warnings.push(
            "Current context is aggressive for the available memory budget; reduce context or batch size."
                .to_string(),
        );
    }

    if requested_context_size > recommended_context_size && recommended_context_size > 0 {
        warnings.push(format!(
            "Requested context {} is above the recommended {} for the current machine state.",
            requested_context_size, recommended_context_size
        ));
    }

    if is_unified_memory {
        warnings.push(
            "Unified memory systems are sensitive to oversized contexts because weights and KV cache share the same pool."
                .to_string(),
        );
    }

    if is_moe {
        warnings.push(
            "GGUF metadata suggests this is a Mixture-of-Experts model; keep context conservative and consider CPU MoE placement if latency spikes."
                .to_string(),
        );
    }

    let memory_headroom = available_memory as i128 - recommended_total_required as i128;
    let summary = summarize_plan(
        status,
        recommended_context_size,
        recommended_batch_size,
        &warnings,
    );

    Ok(ModelLoadPlan {
        status,
        is_unified_memory,
        is_moe,
        requested_context_size,
        recommended_context_size,
        maximum_context_size: max_context_size,
        recommended_batch_size,
        recommended_no_kv_offload,
        model_size,
        requested_kv_cache_size: requested_kv.size,
        recommended_kv_cache_size: recommended_kv.size,
        estimated_total_required: requested_total_required,
        recommended_total_required,
        currently_used_memory: system_used_bytes,
        available_memory,
        memory_headroom: memory_headroom.clamp(i64::MIN as i128, i64::MAX as i128) as i64,
        summary,
        warnings,
    })
}
/// Read GGUF metadata from a model file
#[tauri::command]
pub async fn read_gguf_metadata(path: String) -> Result<GgufMetadata, String> {
    return read_gguf_metadata_internal(path).await;
}

#[tauri::command]
pub async fn estimate_kv_cache_size(
    meta: HashMap<String, String>,
    ctx_size: Option<u64>,
) -> Result<KVCacheEstimate, KVCacheError> {
    estimate_kv_cache_internal(meta, ctx_size).await
}

#[tauri::command]
pub async fn get_model_size(path: String) -> Result<u64, String> {
    if path.starts_with("https://") {
        // Handle remote URL
        let client = reqwest::Client::new();
        let response = client
            .head(&path)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch HEAD request: {}", e))?;

        if let Some(content_length) = response.headers().get("content-length") {
            let content_length_str = content_length
                .to_str()
                .map_err(|e| format!("Invalid content-length header: {}", e))?;
            content_length_str
                .parse::<u64>()
                .map_err(|e| format!("Failed to parse content-length: {}", e))
        } else {
            Ok(0)
        }
    } else {
        // Handle local file using standard fs
        let metadata =
            fs::metadata(&path).map_err(|e| format!("Failed to get file metadata: {}", e))?;
        Ok(metadata.len())
    }
}

#[tauri::command]
pub async fn is_model_supported(
    path: String,
    ctx_size: Option<u32>,
) -> Result<ModelSupportStatus, String> {
    // Get model size
    let model_size = get_model_size(path.clone()).await?;

    // Get system info
    let system_info = get_system_info();

    log::info!("modelSize: {}", model_size);

    // Read GGUF metadata
    let gguf = read_gguf_metadata(path.clone()).await?;

    // Calculate KV cache size
    let kv_cache_size = if let Some(ctx_size) = ctx_size {
        log::info!("Using ctx_size: {}", ctx_size);
        estimate_kv_cache_internal(gguf.metadata, Some(ctx_size as u64))
            .await
            .map_err(|e| e.to_string())?
            .size
    } else {
        estimate_kv_cache_internal(gguf.metadata, None)
            .await
            .map_err(|e| e.to_string())?
            .size
    };

    // Total memory consumption = model weights + kvcache
    let total_required = model_size + kv_cache_size;
    log::info!(
        "isModelSupported: Total memory requirement: {} for {}; Got kvCacheSize: {} from BE",
        total_required,
        path,
        kv_cache_size
    );

    let unified_memory = system_info.gpus.is_empty();
    let total_system_memory: u64 = match unified_memory {
        // Avoid double-counting shared memory in the fit calculation below.
        true => 0,
        false => system_info.total_memory * 1024 * 1024,
    };

    // Calculate total VRAM from all GPUs
    let total_vram: u64 = match unified_memory {
        // On macOS with unified memory, GPU info may be empty
        // Use total RAM as VRAM since memory is shared
        true => {
            log::info!("No GPUs detected (likely unified memory system), using total RAM as VRAM");
            system_info.total_memory * 1024 * 1024
        }
        false => system_info
            .gpus
            .iter()
            .map(|g| g.total_memory * 1024 * 1024)
            .sum::<u64>(),
    };

    log::info!("Total VRAM reported/calculated (in bytes): {}", &total_vram);

    let usable_vram = if total_vram > RESERVE_BYTES {
        total_vram - RESERVE_BYTES
    } else {
        0
    };

    let usable_total_memory = if total_system_memory > RESERVE_BYTES {
        (total_system_memory - RESERVE_BYTES) + usable_vram
    } else {
        usable_vram
    };
    if unified_memory {
        log::info!(
            "Unified memory mode: host RAM is treated as shared VRAM for fit checks (physical RAM: {} bytes)",
            system_info.total_memory * 1024 * 1024
        );
    } else {
        log::info!("System RAM: {} bytes", &total_system_memory);
    }
    log::info!("Total VRAM: {} bytes", &total_vram);
    log::info!("Usable total memory: {} bytes", &usable_total_memory);
    log::info!("Usable VRAM: {} bytes", &usable_vram);
    log::info!("Required: {} bytes", &total_required);

    // Check if model fits in total memory at all (this is the hard limit)
    if total_required > usable_total_memory {
        return Ok(ModelSupportStatus::Red); // Truly impossible to run
    }

    // Check if everything fits in VRAM (ideal case)
    if total_required <= usable_vram {
        return Ok(ModelSupportStatus::Green);
    }

    // If we get here, it means:
    // - Total requirement fits in combined memory
    // - But doesn't fit entirely in VRAM
    // This is the CPU-GPU hybrid scenario
    Ok(ModelSupportStatus::Yellow)
}

#[tauri::command]
pub async fn plan_model_load(
    path: String,
    ctx_size: Option<u32>,
    total_model_bytes: Option<u64>,
) -> Result<ModelLoadPlan, String> {
    let model_size = effective_model_size(get_model_size(path.clone()).await?, total_model_bytes);
    let system_info = get_system_info();
    let system_usage = tauri_plugin_hardware::get_system_usage();
    let gguf = read_gguf_metadata(path).await?;
    plan_model_load_internal(
        gguf.metadata,
        model_size,
        ctx_size,
        &system_info,
        &system_usage,
    )
    .await
    .map_err(|err| err.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri_plugin_hardware::{CpuStaticInfo, GpuUsage, SystemInfo, SystemUsage};

    fn fake_system_info(total_memory_mib: u64) -> SystemInfo {
        SystemInfo {
            cpu: CpuStaticInfo {
                name: "Apple M".to_string(),
                core_count: 10,
                arch: "aarch64".to_string(),
                extensions: vec![],
            },
            os_type: "macos".to_string(),
            os_name: "macOS".to_string(),
            total_memory: total_memory_mib,
            gpus: vec![],
        }
    }

    fn fake_system_usage(total_memory_mib: u64, used_memory_mib: u64) -> SystemUsage {
        SystemUsage {
            cpu: 0.0,
            used_memory: used_memory_mib,
            total_memory: total_memory_mib,
            gpus: Vec::<GpuUsage>::new(),
        }
    }

    fn test_meta(context_length: u64) -> HashMap<String, String> {
        HashMap::from([
            ("general.architecture".to_string(), "llama".to_string()),
            ("llama.block_count".to_string(), "40".to_string()),
            ("llama.attention.head_count".to_string(), "32".to_string()),
            ("llama.attention.head_count_kv".to_string(), "8".to_string()),
            ("llama.attention.key_length".to_string(), "128".to_string()),
            (
                "llama.attention.value_length".to_string(),
                "128".to_string(),
            ),
            (
                "llama.context_length".to_string(),
                context_length.to_string(),
            ),
        ])
    }

    #[tokio::test]
    async fn red_plan_does_not_recommend_fake_minimum_context() {
        let plan = plan_model_load_internal(
            test_meta(8192),
            20 * 1024 * 1024 * 1024,
            Some(8192),
            &fake_system_info(24 * 1024),
            &fake_system_usage(24 * 1024, 21 * 1024),
        )
        .await
        .expect("plan");

        assert_eq!(plan.status, ModelSupportStatus::Red);
        assert_eq!(plan.maximum_context_size, 0);
        assert_eq!(plan.recommended_context_size, 0);
        assert_eq!(plan.recommended_batch_size, 0);
        assert!(plan
            .summary
            .contains("No safe context fits in memory right now."));
    }

    #[tokio::test]
    async fn additional_model_bytes_reduce_context_budget() {
        let system_info = fake_system_info(24 * 1024);
        let system_usage = fake_system_usage(24 * 1024, 6 * 1024);

        let base_plan = plan_model_load_internal(
            test_meta(65536),
            13 * 1024 * 1024 * 1024,
            Some(8192),
            &system_info,
            &system_usage,
        )
        .await
        .expect("base plan");
        let larger_plan = plan_model_load_internal(
            test_meta(65536),
            14 * 1024 * 1024 * 1024,
            Some(8192),
            &system_info,
            &system_usage,
        )
        .await
        .expect("larger plan");

        assert!(larger_plan.model_size > base_plan.model_size);
        assert!(larger_plan.estimated_total_required > base_plan.estimated_total_required);
        assert!(larger_plan.maximum_context_size < base_plan.maximum_context_size);
        assert!(larger_plan.recommended_context_size <= base_plan.recommended_context_size);
    }
}
