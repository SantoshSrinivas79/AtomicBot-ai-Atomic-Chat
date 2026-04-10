import {
  assistantParameterPresets,
  getMatchingAssistantPresetId,
} from '@/lib/assistant-parameter-presets'

describe('assistant-parameter-presets', () => {
  it('matches the built-in default preset when the original parameters are applied', () => {
    expect(
      getMatchingAssistantPresetId({
        temperature: 0.7,
        top_k: 20,
        top_p: 0.8,
        repeat_penalty: 1.12,
      })
    ).toBe('default')
  })

  it('matches the balanced preset when the exact parameters are applied', () => {
    expect(
      getMatchingAssistantPresetId({
        stream: true,
        max_output_tokens: 1536,
        temperature: 0.7,
        chat_template_kwargs: {
          enable_thinking: false,
        },
      })
    ).toBe('balanced')
  })

  it('matches the reasoning preset when thinking is enabled', () => {
    expect(
      getMatchingAssistantPresetId({
        stream: true,
        max_output_tokens: 4096,
        chat_template_kwargs: {
          enable_thinking: true,
        },
      })
    ).toBe('reasoning')
  })

  it('matches the model preset when managed overrides are absent', () => {
    expect(
      getMatchingAssistantPresetId({
        custom_header: 'keep-me',
      })
    ).toBe('model')
  })

  it('returns null for mixed configurations', () => {
    const creativePreset = assistantParameterPresets.find(
      (preset) => preset.id === 'creative'
    )

    expect(creativePreset).toBeTruthy()
    expect(
      getMatchingAssistantPresetId({
        ...(creativePreset?.set ?? {}),
        top_p: 0.95,
      })
    ).toBeNull()
  })
})
