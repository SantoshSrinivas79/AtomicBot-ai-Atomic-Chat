export const paramsSettings = {
  stream: {
    key: 'stream',
    value: true,
    title: 'Stream',
    description: `Enables real-time response streaming.`,
  },
  temperature: {
    key: 'temperature',
    value: 0.7,
    title: 'Temperature',
    description: `Controls response randomness. Higher values produce more creative, varied responses. `,
  },
  frequency_penalty: {
    key: 'frequency_penalty',
    value: 0.7,
    title: 'Frequency Penalty',
    description: `Reduces word repetition. Higher values encourage more varied language. Useful for creative writing and content generation.`,
  },
  presence_penalty: {
    key: 'presence_penalty',
    value: 0.7,
    title: 'Presence Penalty',
    description: `Encourages the model to explore new topics. Higher values help prevent the model from fixating on already-discussed subjects.`,
  },
  top_p: {
    key: 'top_p',
    value: 0.95,
    title: 'Top P',
    description: `Set probability threshold for more relevant outputs. Higher values allow more diverse word choices.`,
    controllerType: 'slider',
  },
  top_k: {
    key: 'top_k',
    value: 20,
    title: 'Top K',
    description:
      'Limits sampling to the top K candidate tokens at each step.',
  },
  repeat_penalty: {
    key: 'repeat_penalty',
    value: 1.12,
    title: 'Repeat Penalty',
    description:
      'Discourages repeated phrases and loops in the generated output.',
  },
  max_output_tokens: {
    key: 'max_output_tokens',
    value: 2048,
    title: 'Max Output Tokens',
    description:
      'Caps how many tokens the assistant can generate in one response.',
  },
}
