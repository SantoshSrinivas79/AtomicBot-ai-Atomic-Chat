import { modelSettings } from '@/lib/predefined'
import { ModelCapabilities } from '@/types/models'

export type MemoryPresetTier = '8gb' | '16gb' | '24gb'

type ModelSizeBucket = 'small' | 'medium' | 'large' | 'xlarge'

type ModelPresetValues = {
  ctx_len: number
  batch_size?: number
  auto_increase_ctx_len?: boolean
  no_kv_offload?: boolean
}

const SIZE_PATTERN = /(\d+(?:\.\d+)?)\s*[Bb](?![a-z])/g

const LLAMACPP_PRESETS: Record<
  MemoryPresetTier,
  Record<ModelSizeBucket, ModelPresetValues>
> = {
  '8gb': {
    small: { auto_increase_ctx_len: false, ctx_len: 4096, batch_size: 256, no_kv_offload: false },
    medium: { auto_increase_ctx_len: false, ctx_len: 2048, batch_size: 128, no_kv_offload: false },
    large: { auto_increase_ctx_len: false, ctx_len: 1536, batch_size: 64, no_kv_offload: false },
    xlarge: { auto_increase_ctx_len: false, ctx_len: 1024, batch_size: 32, no_kv_offload: false },
  },
  '16gb': {
    small: { auto_increase_ctx_len: false, ctx_len: 8192, batch_size: 512, no_kv_offload: false },
    medium: { auto_increase_ctx_len: false, ctx_len: 4096, batch_size: 256, no_kv_offload: false },
    large: { auto_increase_ctx_len: false, ctx_len: 3072, batch_size: 128, no_kv_offload: false },
    xlarge: { auto_increase_ctx_len: false, ctx_len: 2048, batch_size: 64, no_kv_offload: false },
  },
  '24gb': {
    small: { auto_increase_ctx_len: false, ctx_len: 8192, batch_size: 512, no_kv_offload: false },
    medium: { auto_increase_ctx_len: false, ctx_len: 8192, batch_size: 256, no_kv_offload: false },
    large: { auto_increase_ctx_len: false, ctx_len: 4096, batch_size: 128, no_kv_offload: false },
    xlarge: { auto_increase_ctx_len: false, ctx_len: 2048, batch_size: 64, no_kv_offload: false },
  },
}

const CTX_ONLY_PRESETS: Record<
  MemoryPresetTier,
  Record<ModelSizeBucket, Pick<ModelPresetValues, 'ctx_len'>>
> = {
  '8gb': {
    small: { ctx_len: 4096 },
    medium: { ctx_len: 2048 },
    large: { ctx_len: 1024 },
    xlarge: { ctx_len: 1024 },
  },
  '16gb': {
    small: { ctx_len: 8192 },
    medium: { ctx_len: 4096 },
    large: { ctx_len: 2048 },
    xlarge: { ctx_len: 1536 },
  },
  '24gb': {
    small: { ctx_len: 8192 },
    medium: { ctx_len: 8192 },
    large: { ctx_len: 4096 },
    xlarge: { ctx_len: 2048 },
  },
}

const getModelPresetSource = (providerName: string, tier: MemoryPresetTier) => {
  if (providerName === 'llamacpp') {
    return LLAMACPP_PRESETS[tier]
  }
  return CTX_ONLY_PRESETS[tier]
}

export const getMemoryPresetLabel = (tier: MemoryPresetTier) => {
  switch (tier) {
    case '8gb':
      return '8 GB'
    case '16gb':
      return '16 GB'
    case '24gb':
      return '24 GB'
  }
}

export const inferModelParameterSize = (model: Model): number | null => {
  const candidates = [model.displayName, model.name, model.id].filter(
    (candidate): candidate is string => Boolean(candidate)
  )
  const matches = candidates.flatMap((candidate) =>
    Array.from(candidate.matchAll(SIZE_PATTERN), (match) => Number(match[1]))
  )

  if (matches.length === 0) return null

  return Math.max(...matches.filter((value) => Number.isFinite(value)))
}

export const inferModelSizeBucket = (model: Model): ModelSizeBucket => {
  const parameterSize = inferModelParameterSize(model)

  if (parameterSize == null) return 'medium'
  if (parameterSize <= 4) return 'small'
  if (parameterSize <= 9) return 'medium'
  if (parameterSize <= 14) return 'large'
  return 'xlarge'
}

export const isVisionLikeModel = (model: Model): boolean => {
  if (model.capabilities?.includes(ModelCapabilities.VISION)) {
    return true
  }

  return /\b(vl|vision)\b/i.test(
    [model.displayName, model.name, model.id].filter(Boolean).join(' ')
  )
}

export const getMemoryPresetForModel = (
  providerName: string,
  model: Model,
  tier: MemoryPresetTier
): ModelPresetValues => {
  const sizeBucket = inferModelSizeBucket(model)
  const basePreset = getModelPresetSource(providerName, tier)[sizeBucket]
  const preset: ModelPresetValues = { ...basePreset }

  if (!isVisionLikeModel(model)) {
    return preset
  }

  preset.ctx_len = Math.max(1024, Math.floor(preset.ctx_len / 2))

  if ('batch_size' in preset && preset.batch_size != null) {
    preset.batch_size = Math.max(32, Math.floor(preset.batch_size / 2))
  }

  return preset
}

const upsertSetting = (
  model: Model,
  key: keyof ModelPresetValues,
  value: string | number | boolean
) => {
  const template = model.settings?.[key] ?? modelSettings[key]

  if (!template) return undefined

  return {
    ...template,
    controller_props: {
      ...template.controller_props,
      value,
    },
  }
}

export const applyMemoryPresetToModel = (
  providerName: string,
  model: Model,
  tier: MemoryPresetTier
) => {
  const preset = getMemoryPresetForModel(providerName, model, tier)
  const keys = Object.keys(preset) as Array<keyof ModelPresetValues>
  let changed = false
  const nextSettings = { ...(model.settings ?? {}) }

  keys.forEach((key) => {
    const nextValue = preset[key]
    if (nextValue == null) return

    const currentValue = nextSettings[key]?.controller_props?.value
    if (currentValue === nextValue) return

    const updated = upsertSetting(model, key, nextValue)
    if (!updated) return

    nextSettings[key] = updated
    changed = true
  })

  return {
    changed,
    model: changed
      ? {
          ...model,
          settings: nextSettings,
        }
      : model,
  }
}
