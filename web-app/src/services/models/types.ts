/**
 * Models Service Types
 */

import { SessionInfo, modelInfo, ThreadMessage, UnloadResult } from '@janhq/core'
import { Model as CoreModel } from '@janhq/core'

// Types for model catalog
export interface ModelQuant {
  model_id: string
  path: string
  file_size: string
}

export interface MMProjModel {
  model_id: string
  path: string
  file_size: string
}

export interface SafetensorsFile {
  model_id: string
  path: string
  file_size: string
  sha256?: string
}

export interface CatalogModel {
  model_name: string
  description: string
  library_name?: string
  developer?: string
  downloads: number
  num_quants?: number
  quants?: ModelQuant[]
  mmproj_models?: MMProjModel[]
  num_mmproj?: number
  safetensors_files?: SafetensorsFile[]
  num_safetensors?: number
  created_at?: string
  readme?: string
  tools?: boolean
  is_mlx?: boolean
}

export type ModelCatalog = CatalogModel[]

// HuggingFace repository information
export interface HuggingFaceRepo {
  id: string
  modelId: string
  sha: string
  downloads: number
  likes: number
  library_name?: string
  tags: string[]
  pipeline_tag?: string
  createdAt: string
  last_modified: string
  private: boolean
  disabled: boolean
  gated: boolean | string
  author: string
  cardData?: {
    license?: string
    language?: string[]
    datasets?: string[]
    metrics?: string[]
  }
  siblings?: Array<{
    rfilename: string
    size?: number
    blobId?: string
    lfs?: {
      sha256: string
      size: number
      pointerSize: number
    }
  }>
  readme?: string
}

export interface GgufMetadata {
  version: number
  tensor_count: number
  metadata: Record<string, string>
}

export interface ModelValidationResult {
  isValid: boolean
  error?: string
  metadata?: GgufMetadata
}

export interface ModelLoadPlan {
  status: 'RED' | 'YELLOW' | 'GREEN'
  is_unified_memory: boolean
  is_moe: boolean
  requested_context_size: number
  recommended_context_size: number
  maximum_context_size: number
  recommended_batch_size: number
  recommended_no_kv_offload: boolean
  model_size: number
  requested_kv_cache_size: number
  recommended_kv_cache_size: number
  estimated_total_required: number
  recommended_total_required: number
  currently_used_memory: number
  available_memory: number
  memory_headroom: number
  summary: string
  warnings: string[]
}


export type PreflightReason =
  | 'AUTH_REQUIRED'
  | 'LICENSE_NOT_ACCEPTED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'NETWORK'
  | 'UNKNOWN'

export interface ModelsService {
  getModel(modelId: string): Promise<modelInfo | undefined>
  fetchModels(): Promise<modelInfo[]>
  fetchModelCatalog(): Promise<ModelCatalog>
  fetchHuggingFaceRepo(
    repoId: string,
    hfToken?: string
  ): Promise<HuggingFaceRepo | null>
  convertHfRepoToCatalogModel(repo: HuggingFaceRepo): CatalogModel
  updateModel(modelId: string, model: Partial<CoreModel>): Promise<void>
  pullModel(
    id: string,
    modelPath: string,
    modelSha256?: string,
    modelSize?: number,
    mmprojPath?: string,
    mmprojSha256?: string,
    mmprojSize?: number
  ): Promise<void>
  pullModelWithMetadata(
    id: string,
    modelPath: string,
    mmprojPath?: string,
    hfToken?: string,
    skipVerification?: boolean
  ): Promise<void>
  abortDownload(id: string): Promise<void>
  deleteModel(id: string, provider?: string): Promise<void>
  getActiveModels(provider?: string): Promise<string[]>
  stopModel(model: string, provider?: string): Promise<UnloadResult | undefined>
  stopAllModels(): Promise<void>
  startModel(
    provider: ProviderObject,
    model: string,
    bypassAutoUnload?: boolean
  ): Promise<SessionInfo | undefined>
  isToolSupported(modelId: string): Promise<boolean>
  checkMmprojExistsAndUpdateOffloadMMprojSetting(
    modelId: string,
    updateProvider?: (
      providerName: string,
      data: Partial<ModelProvider>
    ) => void,
    getProviderByName?: (providerName: string) => ModelProvider | undefined
  ): Promise<{ exists: boolean; settingsUpdated: boolean }>
  checkMmprojExists(modelId: string): Promise<boolean>
  isModelSupported(
    modelPath: string,
    ctxSize?: number
  ): Promise<'RED' | 'YELLOW' | 'GREEN' | 'GREY'>
  planModelLoad(
    modelPath: string,
    ctxSize?: number
  ): Promise<ModelLoadPlan | null>
  validateGgufFile(filePath: string): Promise<ModelValidationResult>
  getTokensCount(modelId: string, messages: ThreadMessage[]): Promise<number>
}
