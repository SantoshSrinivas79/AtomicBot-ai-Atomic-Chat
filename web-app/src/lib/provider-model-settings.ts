import { modelSettings } from './predefined'

const OLLAMA_MODEL_SETTINGS: Record<string, ProviderSetting> = {
  temperature: {
    ...modelSettings.temperature,
    controller_props: {
      ...modelSettings.temperature.controller_props,
    },
  },
  top_p: {
    ...modelSettings.top_p,
    controller_props: {
      ...modelSettings.top_p.controller_props,
    },
  },
  frequency_penalty: {
    ...modelSettings.frequency_penalty,
    controller_props: {
      ...modelSettings.frequency_penalty.controller_props,
    },
  },
  presence_penalty: {
    ...modelSettings.presence_penalty,
    controller_props: {
      ...modelSettings.presence_penalty.controller_props,
    },
  },
  max_output_tokens: {
    key: 'max_output_tokens',
    title: 'Max Output Tokens',
    description:
      'Maximum number of tokens to generate for a single response.',
    controller_type: 'input',
    controller_props: {
      value: '',
      placeholder: '2048',
      type: 'number',
    },
  },
  enable_thinking: {
    key: 'enable_thinking',
    title: 'Thinking Mode',
    description:
      'Enable Ollama reasoning mode for supported models. Turn this off for faster visible responses in chat.',
    controller_type: 'checkbox',
    controller_props: {
      value: false,
    },
  },
}

const OLLAMA_MODEL_PARAMETER_KEYS = [
  'temperature',
  'top_p',
  'frequency_penalty',
  'presence_penalty',
  'max_output_tokens',
  'enable_thinking',
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

export function withProviderModelSettings(
  providerName: string,
  model: Model
): Model {
  if (providerName !== 'ollama') {
    return model
  }

  const mergedSettings: Record<string, ProviderSetting> = {
    ...(model.settings ?? {}),
  }

  Object.entries(OLLAMA_MODEL_SETTINGS).forEach(([key, setting]) => {
    if (!mergedSettings[key]) {
      mergedSettings[key] = cloneProviderSetting(setting)
    }
  })

  return {
    ...model,
    settings: mergedSettings,
  }
}

export function extractProviderModelInferenceParameters(
  providerName: string,
  model: Model | null | undefined
): Record<string, unknown> {
  if (providerName !== 'ollama' || !model?.settings) {
    return {}
  }

  return OLLAMA_MODEL_PARAMETER_KEYS.reduce<Record<string, unknown>>(
    (params, key) => {
      const value = model.settings?.[key]?.controller_props?.value

      if (value === '' || value == null) {
        return params
      }

      params[key] = value
      return params
    },
    {}
  )
}
