import { describe, expect, it } from 'vitest'

import { modelSettings } from '@/lib/predefined'
import {
  applyMemoryPresetToModel,
  getMemoryPresetForModel,
  inferModelParameterSize,
  inferModelSizeBucket,
  isVisionLikeModel,
} from '@/lib/model-memory-presets'

const makeModel = (overrides: Partial<Model> = {}): Model => ({
  id: 'janhq/Jan-v3-4B-base-instruct-gguf',
  name: 'Jan-v3-4B-base-instruct-gguf',
  capabilities: ['completion'],
  settings: {
    auto_increase_ctx_len: { ...modelSettings.auto_increase_ctx_len, controller_props: { value: true } },
    ctx_len: { ...modelSettings.ctx_len, controller_props: { value: 8192 } },
    batch_size: { ...modelSettings.batch_size, controller_props: { value: 2048 } },
    no_kv_offload: { ...modelSettings.no_kv_offload, controller_props: { value: true } },
  },
  ...overrides,
})

describe('model-memory-presets', () => {
  it('infers the largest parameter size from the model identifier', () => {
    expect(
      inferModelParameterSize(
        makeModel({
          id: 'mlx-community/Qwen3.5-27B-Claude-4.6-Opus-Distilled-MLX-4bit',
        })
      )
    ).toBe(27)
  })

  it('maps model size to the expected bucket', () => {
    expect(inferModelSizeBucket(makeModel({ id: 'foo/Small-4B' }))).toBe('small')
    expect(inferModelSizeBucket(makeModel({ id: 'foo/Reasoner-9B' }))).toBe('medium')
    expect(inferModelSizeBucket(makeModel({ id: 'foo/Code-14B' }))).toBe('large')
    expect(inferModelSizeBucket(makeModel({ id: 'foo/Big-32B' }))).toBe('xlarge')
  })

  it('detects vision-like models from capabilities or name', () => {
    expect(isVisionLikeModel(makeModel({ capabilities: ['vision'] }))).toBe(true)
    expect(
      isVisionLikeModel(
        makeModel({
          capabilities: ['completion'],
          id: 'mlx-community/Qwen3-VL-30B-4bit',
        })
      )
    ).toBe(true)
  })

  it('uses more conservative presets for vision models', () => {
    const preset = getMemoryPresetForModel(
      'mlx',
      makeModel({
        id: 'mlx-community/Qwen3-VL-30B-4bit',
        capabilities: ['vision'],
      }),
      '24gb'
    )

    expect(preset.ctx_len).toBe(1024)
  })

  it('applies llama.cpp memory settings for the selected RAM tier', () => {
    const { changed, model } = applyMemoryPresetToModel(
      'llamacpp',
      makeModel({ id: 'unsloth/Qwen3.5-9B-GGUF' }),
      '8gb'
    )

    expect(changed).toBe(true)
    expect(model.settings?.auto_increase_ctx_len?.controller_props.value).toBe(false)
    expect(model.settings?.ctx_len?.controller_props.value).toBe(2048)
    expect(model.settings?.batch_size?.controller_props.value).toBe(128)
    expect(model.settings?.no_kv_offload?.controller_props.value).toBe(false)
  })
})
