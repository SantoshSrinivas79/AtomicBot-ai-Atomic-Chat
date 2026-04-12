import { invoke } from '@tauri-apps/api/core'

export type VmlxDiscoveredModel = {
  id: string
  name: string
}

export type VmlxSessionInfo = {
  pid: number
  port: number
  model_id: string
  model_path: string
  base_url: string
  server_command: string
}

export async function listVmlxJangModels(
  modelRoot: string
): Promise<VmlxDiscoveredModel[]> {
  return invoke('list_vmlx_jang_models', { modelRoot })
}

export async function ensureVmlxModelServer(params: {
  modelId: string
  modelRoot: string
  baseUrl: string
  serverCommand: string
  timeoutSecs?: number
}): Promise<VmlxSessionInfo> {
  return invoke('ensure_vmlx_model_server', params)
}

export async function stopVmlxModelServer(): Promise<boolean> {
  return invoke('stop_vmlx_model_server')
}

export async function scheduleVmlxModelServerStop(
  idleSecs?: number
): Promise<boolean> {
  return invoke('schedule_vmlx_model_server_stop', { idleSecs })
}

export async function getVmlxServerStatus(): Promise<VmlxSessionInfo | null> {
  return invoke('get_vmlx_server_status')
}
