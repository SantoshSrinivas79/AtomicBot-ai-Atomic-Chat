import { getProviderSettingValue } from './utils'

export type VmlxKvCacheQuantization = 'none' | 'q4' | 'q8'

export type VmlxLaunchConfig = {
  continuousBatching?: boolean
  usePagedCache?: boolean
  kvCacheQuantization?: VmlxKvCacheQuantization
  cacheMemoryPercent?: number
  cacheTtlMinutes?: number
  defaultEnableThinking?: boolean
  enableJit?: boolean
}

type VmlxPresetValues = Required<VmlxLaunchConfig>

export const VMLX_PROVIDER_SETTING_KEYS = {
  continuousBatching: 'continuous-batching',
  usePagedCache: 'use-paged-cache',
  kvCacheQuantization: 'kv-cache-quantization',
  cacheMemoryPercent: 'cache-memory-percent',
  cacheTtlMinutes: 'cache-ttl-minutes',
  defaultEnableThinking: 'default-enable-thinking',
  enableJit: 'enable-jit',
} as const

const createVmlxPresetValues = (
  values: VmlxPresetValues
): VmlxPresetValues => values

export const vmlxProviderPresets = [
  {
    id: 'balanced',
    label: 'Balanced',
    description:
      'Recommended default for JANG text chat: batching, paged KV cache, q8 KV quantization, moderate cache budget, thinking off, JIT on.',
    values: createVmlxPresetValues({
      continuousBatching: true,
      usePagedCache: true,
      kvCacheQuantization: 'q8',
      cacheMemoryPercent: 0.15,
      cacheTtlMinutes: 10,
      defaultEnableThinking: false,
      enableJit: true,
    }),
  },
  {
    id: 'memory-saver',
    label: 'Memory Saver',
    description:
      'Lower-memory profile for larger JANG models on 24 GB Macs. Uses q4 KV quantization and a smaller cache budget.',
    values: createVmlxPresetValues({
      continuousBatching: true,
      usePagedCache: true,
      kvCacheQuantization: 'q4',
      cacheMemoryPercent: 0.1,
      cacheTtlMinutes: 5,
      defaultEnableThinking: false,
      enableJit: true,
    }),
  },
  {
    id: 'max-quality',
    label: 'Max Quality',
    description:
      'Favor output fidelity over memory savings. Disables KV quantization while keeping batching, paged cache, and JIT enabled.',
    values: createVmlxPresetValues({
      continuousBatching: true,
      usePagedCache: true,
      kvCacheQuantization: 'none',
      cacheMemoryPercent: 0.2,
      cacheTtlMinutes: 15,
      defaultEnableThinking: false,
      enableJit: true,
    }),
  },
] as const

function cloneProviderSetting(setting: ProviderSetting): ProviderSetting {
  return {
    ...setting,
    controller_props: {
      ...setting.controller_props,
      options: setting.controller_props.options
        ? [...setting.controller_props.options]
        : undefined,
    },
  }
}

export const vmlxProviderSettings: ProviderSetting[] = [
  {
    key: 'api-key',
    title: 'API Key (optional)',
    description:
      'vMLX local development does not require an API key. Leave this empty unless you front the local server with authentication.',
    controller_type: 'input',
    controller_props: {
      placeholder: 'Optional',
      value: '',
      type: 'password',
      input_actions: ['unobscure', 'copy'],
    },
  },
  {
    key: 'base-url',
    title: 'Base URL',
    description:
      'The local OpenAI-compatible vMLX endpoint. The default is `http://127.0.0.1:8000/v1`.',
    controller_type: 'input',
    controller_props: {
      placeholder: 'http://127.0.0.1:8000/v1',
      value: 'http://127.0.0.1:8000/v1',
    },
  },
  {
    key: 'model-root',
    title: 'Model Root',
    description:
      'Root folder scanned for JANG model subfolders. A subfolder is treated as a JANG model when it contains `jang_config.json`.',
    controller_type: 'input',
    controller_props: {
      placeholder: '/Volumes/Extreme Pro/lmstudio/models/JANGQ-AI',
      value: '/Volumes/Extreme Pro/lmstudio/models/JANGQ-AI',
    },
  },
  {
    key: 'server-command',
    title: 'Server Command',
    description:
      'Executable used to launch the vMLX server process. The default assumes `vmlx` is available on PATH.',
    controller_type: 'input',
    controller_props: {
      placeholder: 'vmlx',
      value: 'vmlx',
    },
  },
  {
    key: 'idle-timeout-secs',
    title: 'Idle Unload Delay',
    description:
      'How long to keep the loaded JANG model warm after a request before unloading it. Use a short idle delay to keep chat responsive without keeping the model resident forever.',
    controller_type: 'input',
    controller_props: {
      placeholder: '180',
      value: '180',
      type: 'number',
    },
  },
  {
    key: VMLX_PROVIDER_SETTING_KEYS.continuousBatching,
    title: 'Continuous Batching',
    description:
      'Keep request batching on for text chat. This is required for paged cache and makes prefix reuse worthwhile across turns.',
    controller_type: 'checkbox',
    controller_props: {
      value: true,
    },
  },
  {
    key: VMLX_PROVIDER_SETTING_KEYS.usePagedCache,
    title: 'Paged KV Cache',
    description:
      'Use paged KV caching so larger prompts and longer chats fit more gracefully on 24 GB Macs.',
    controller_type: 'checkbox',
    controller_props: {
      value: true,
    },
  },
  {
    key: VMLX_PROVIDER_SETTING_KEYS.kvCacheQuantization,
    title: 'KV Cache Quantization',
    description:
      'Quantize the KV cache to reduce memory pressure. `q8` is the best default for JANG text chat; `q4` is the tighter-memory fallback.',
    controller_type: 'dropdown',
    controller_props: {
      value: 'q8',
      options: [
        { value: 'q8', name: 'Q8 (Recommended)' },
        { value: 'q4', name: 'Q4 (Memory Saver)' },
        { value: 'none', name: 'None (Max Quality)' },
      ],
    },
  },
  {
    key: VMLX_PROVIDER_SETTING_KEYS.cacheMemoryPercent,
    title: 'Prefix Cache Memory Fraction',
    description:
      'Fraction of unified memory reserved for the vMLX prompt/prefix cache. Lower values are safer for larger JANG models; higher values help longer multi-turn chats.',
    controller_type: 'input',
    controller_props: {
      value: '0.15',
      placeholder: '0.15',
      type: 'number',
    },
  },
  {
    key: VMLX_PROVIDER_SETTING_KEYS.cacheTtlMinutes,
    title: 'Prefix Cache TTL (minutes)',
    description:
      'Evict prompt cache entries after this many idle minutes. A short TTL keeps memory use predictable during local experimentation.',
    controller_type: 'input',
    controller_props: {
      value: '10',
      placeholder: '10',
      type: 'number',
    },
  },
  {
    key: VMLX_PROVIDER_SETTING_KEYS.defaultEnableThinking,
    title: 'Thinking Mode Default',
    description:
      'Server default for models that support reasoning output. Keep this off for cleaner Atomic Chat text streaming unless you explicitly want thought traces.',
    controller_type: 'checkbox',
    controller_props: {
      value: false,
    },
  },
  {
    key: VMLX_PROVIDER_SETTING_KEYS.enableJit,
    title: 'Enable JIT',
    description:
      'Enable vMLX JIT compilation. This adds warmup cost but is usually worth it for repeated local chat turns.',
    controller_type: 'checkbox',
    controller_props: {
      value: true,
    },
  },
]

export function cloneVmlxProviderSettings(): ProviderSetting[] {
  return vmlxProviderSettings.map(cloneProviderSetting)
}

function normalizeNumericSetting(
  provider: Pick<ModelProvider, 'settings'>,
  key: string
): number | undefined {
  const rawValue = getProviderSettingValue(provider, key)

  if (typeof rawValue === 'number') {
    return Number.isFinite(rawValue) ? rawValue : undefined
  }

  if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
    return undefined
  }

  const parsed = Number(rawValue)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function extractVmlxLaunchConfig(
  provider: Pick<ModelProvider, 'settings'>
): VmlxLaunchConfig {
  const kvCacheQuantization = getProviderSettingValue(
    provider,
    VMLX_PROVIDER_SETTING_KEYS.kvCacheQuantization
  )
  const defaultEnableThinking = getProviderSettingValue(
    provider,
    VMLX_PROVIDER_SETTING_KEYS.defaultEnableThinking
  )

  return {
    continuousBatching:
      getProviderSettingValue(
        provider,
        VMLX_PROVIDER_SETTING_KEYS.continuousBatching
      ) === true,
    usePagedCache:
      getProviderSettingValue(
        provider,
        VMLX_PROVIDER_SETTING_KEYS.usePagedCache
      ) === true,
    kvCacheQuantization:
      kvCacheQuantization === 'none' ||
      kvCacheQuantization === 'q4' ||
      kvCacheQuantization === 'q8'
        ? kvCacheQuantization
        : undefined,
    cacheMemoryPercent: normalizeNumericSetting(
      provider,
      VMLX_PROVIDER_SETTING_KEYS.cacheMemoryPercent
    ),
    cacheTtlMinutes: normalizeNumericSetting(
      provider,
      VMLX_PROVIDER_SETTING_KEYS.cacheTtlMinutes
    ),
    defaultEnableThinking:
      typeof defaultEnableThinking === 'boolean'
        ? defaultEnableThinking
        : undefined,
    enableJit:
      getProviderSettingValue(provider, VMLX_PROVIDER_SETTING_KEYS.enableJit) ===
      true,
  }
}

function toControllerValue(
  value: string | number | boolean
): string | number | boolean {
  if (typeof value === 'number') {
    return value.toString()
  }
  return value
}

export function applyVmlxPresetToSettings(
  settings: ProviderSetting[],
  presetId: (typeof vmlxProviderPresets)[number]['id']
): ProviderSetting[] {
  const preset = vmlxProviderPresets.find((entry) => entry.id === presetId)
  if (!preset) return settings

  return settings.map((setting) => {
    switch (setting.key) {
      case VMLX_PROVIDER_SETTING_KEYS.continuousBatching:
        return {
          ...setting,
          controller_props: {
            ...setting.controller_props,
            value: preset.values.continuousBatching,
          },
        }
      case VMLX_PROVIDER_SETTING_KEYS.usePagedCache:
        return {
          ...setting,
          controller_props: {
            ...setting.controller_props,
            value: preset.values.usePagedCache,
          },
        }
      case VMLX_PROVIDER_SETTING_KEYS.kvCacheQuantization:
        return {
          ...setting,
          controller_props: {
            ...setting.controller_props,
            value: preset.values.kvCacheQuantization,
          },
        }
      case VMLX_PROVIDER_SETTING_KEYS.cacheMemoryPercent:
        return {
          ...setting,
          controller_props: {
            ...setting.controller_props,
            value: toControllerValue(preset.values.cacheMemoryPercent),
          },
        }
      case VMLX_PROVIDER_SETTING_KEYS.cacheTtlMinutes:
        return {
          ...setting,
          controller_props: {
            ...setting.controller_props,
            value: toControllerValue(preset.values.cacheTtlMinutes),
          },
        }
      case VMLX_PROVIDER_SETTING_KEYS.defaultEnableThinking:
        return {
          ...setting,
          controller_props: {
            ...setting.controller_props,
            value: preset.values.defaultEnableThinking,
          },
        }
      case VMLX_PROVIDER_SETTING_KEYS.enableJit:
        return {
          ...setting,
          controller_props: {
            ...setting.controller_props,
            value: preset.values.enableJit,
          },
        }
      default:
        return setting
    }
  })
}

export function getMatchingVmlxPresetId(
  provider: Pick<ModelProvider, 'settings'> | null | undefined
) {
  if (!provider) return null

  const launchConfig = extractVmlxLaunchConfig(provider)

  const matchingPreset = vmlxProviderPresets.find((preset) => {
    const values = preset.values
    return (
      launchConfig.continuousBatching === values.continuousBatching &&
      launchConfig.usePagedCache === values.usePagedCache &&
      launchConfig.kvCacheQuantization === values.kvCacheQuantization &&
      launchConfig.cacheMemoryPercent === values.cacheMemoryPercent &&
      launchConfig.cacheTtlMinutes === values.cacheTtlMinutes &&
      launchConfig.defaultEnableThinking === values.defaultEnableThinking &&
      launchConfig.enableJit === values.enableJit
    )
  })

  return matchingPreset?.id ?? null
}
