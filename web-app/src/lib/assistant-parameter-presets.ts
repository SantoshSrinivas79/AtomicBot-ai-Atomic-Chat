export type AssistantParameterPresetId =
  | 'default'
  | 'model'
  | 'fast'
  | 'balanced'
  | 'precise'
  | 'creative'
  | 'longform'
  | 'reasoning'
  | 'deep_reasoning'

export type AssistantParameterPreset = {
  id: AssistantParameterPresetId
  label: string
  description: string
  set: Record<string, unknown>
  remove: string[]
}

const COMMON_REMOVE_KEYS = [
  'top_p',
  'top_k',
  'repeat_penalty',
  'presence_penalty',
  'frequency_penalty',
]

const MANAGED_PARAM_KEYS = [
  'stream',
  'max_output_tokens',
  'temperature',
  'chat_template_kwargs',
  ...COMMON_REMOVE_KEYS,
]

const ORIGINAL_DEFAULT_SET = {
  temperature: 0.7,
  top_k: 20,
  top_p: 0.8,
  repeat_penalty: 1.12,
}

export const assistantParameterPresets: AssistantParameterPreset[] = [
  {
    id: 'default',
    label: 'Default',
    description:
      'Restores the original built-in assistant defaults.',
    set: ORIGINAL_DEFAULT_SET,
    remove: [
      'stream',
      'max_output_tokens',
      'presence_penalty',
      'frequency_penalty',
      'chat_template_kwargs',
    ],
  },
  {
    id: 'model',
    label: 'Model',
    description: 'Clears the common assistant overrides and defers to the model.',
    set: {},
    remove: MANAGED_PARAM_KEYS,
  },
  {
    id: 'fast',
    label: 'Fast',
    description: 'Fast chat with thinking disabled and short replies.',
    set: {
      stream: true,
      max_output_tokens: 512,
      chat_template_kwargs: {
        enable_thinking: false,
      },
    },
    remove: [...COMMON_REMOVE_KEYS, 'temperature'],
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'General-purpose chat with thinking disabled.',
    set: {
      stream: true,
      max_output_tokens: 1536,
      temperature: 0.7,
      chat_template_kwargs: {
        enable_thinking: false,
      },
    },
    remove: COMMON_REMOVE_KEYS,
  },
  {
    id: 'precise',
    label: 'Precise',
    description: 'Lower randomness with thinking disabled.',
    set: {
      stream: true,
      max_output_tokens: 1024,
      temperature: 0.2,
      chat_template_kwargs: {
        enable_thinking: false,
      },
    },
    remove: COMMON_REMOVE_KEYS,
  },
  {
    id: 'creative',
    label: 'Creative',
    description: 'Higher randomness with thinking disabled.',
    set: {
      stream: true,
      max_output_tokens: 2048,
      temperature: 0.9,
      chat_template_kwargs: {
        enable_thinking: false,
      },
    },
    remove: COMMON_REMOVE_KEYS,
  },
  {
    id: 'longform',
    label: 'Long',
    description: 'Long-form writing with thinking disabled.',
    set: {
      stream: true,
      max_output_tokens: 4096,
      temperature: 0.7,
      chat_template_kwargs: {
        enable_thinking: false,
      },
    },
    remove: COMMON_REMOVE_KEYS,
  },
  {
    id: 'reasoning',
    label: 'Think',
    description: 'Reasoning-focused responses with thinking enabled.',
    set: {
      stream: true,
      max_output_tokens: 4096,
      chat_template_kwargs: {
        enable_thinking: true,
      },
    },
    remove: [...COMMON_REMOVE_KEYS, 'temperature'],
  },
  {
    id: 'deep_reasoning',
    label: 'Deep',
    description: 'Longer reasoning chains with thinking enabled.',
    set: {
      stream: true,
      max_output_tokens: 8192,
      chat_template_kwargs: {
        enable_thinking: true,
      },
    },
    remove: [...COMMON_REMOVE_KEYS, 'temperature'],
  },
]

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const valuesEqual = (left: unknown, right: unknown) => {
  if (isPlainObject(left) && isPlainObject(right)) {
    return JSON.stringify(left) === JSON.stringify(right)
  }

  return left === right
}

export const getMatchingAssistantPresetId = (
  parameters: Record<string, unknown>
): AssistantParameterPresetId | null => {
  const match = assistantParameterPresets.find((preset) => {
    const setMatches = Object.entries(preset.set).every(([key, value]) =>
      valuesEqual(parameters[key], value)
    )
    if (!setMatches) return false

    return preset.remove.every((key) => !(key in parameters))
  })

  return match?.id ?? null
}
