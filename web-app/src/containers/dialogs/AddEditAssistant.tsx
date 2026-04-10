import { useState, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  IconPlus,
  IconTrash,
  IconChevronDown,
  IconMoodSmile,
} from '@tabler/icons-react'
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react'

import { Textarea } from '@/components/ui/textarea'
import { paramsSettings } from '@/lib/predefinedParams'
import {
  assistantParameterPresets,
  getMatchingAssistantPresetId,
} from '@/lib/assistant-parameter-presets'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme } from '@/hooks/useTheme'
import { AvatarEmoji } from '@/containers/AvatarEmoji'
import { useTranslation } from '@/i18n/react-i18next-compat'
import { cn } from '@/lib/utils'

interface AddEditAssistantProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingKey: string | null
  initialData?: Assistant
  onSave: (assistant: Assistant) => void
}

type ParameterType = 'string' | 'number' | 'boolean' | 'json'
type ThinkingMode = 'default' | 'enabled' | 'disabled'
type ToggleMode = 'default' | 'enabled' | 'disabled'

const THINKING_PARAM_KEY = 'chat_template_kwargs'
const STREAM_PARAM_KEY = 'stream'

const commonNumericParameters = [
  {
    key: 'max_output_tokens',
    title: 'Max Output Tokens',
    description: 'Caps how many tokens the assistant can generate in one response.',
    placeholder: '2048',
    step: '1',
  },
  {
    key: 'temperature',
    title: 'Temperature',
    description: 'Controls response randomness.',
    placeholder: '0.7',
    step: '0.1',
  },
  {
    key: 'top_p',
    title: 'Top P',
    description: 'Sets nucleus sampling probability threshold.',
    placeholder: '0.95',
    step: '0.01',
  },
  {
    key: 'top_k',
    title: 'Top K',
    description: 'Limits sampling to the top K candidate tokens.',
    placeholder: '20',
    step: '1',
  },
  {
    key: 'repeat_penalty',
    title: 'Repeat Penalty',
    description: 'Discourages repeated phrases and loops.',
    placeholder: '1.12',
    step: '0.01',
  },
  {
    key: 'presence_penalty',
    title: 'Presence Penalty',
    description: 'Encourages the model to explore new topics.',
    placeholder: '0.7',
    step: '0.01',
  },
  {
    key: 'frequency_penalty',
    title: 'Frequency Penalty',
    description: 'Reduces word repetition across the response.',
    placeholder: '0.7',
    step: '0.01',
  },
] as const

function getParameterType(value: unknown): ParameterType {
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  if (value !== null && typeof value === 'object') return 'json'
  return 'string'
}

function getThinkingMode(value: unknown): ThinkingMode {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return 'default'
  }

  const enableThinking = (value as { enable_thinking?: unknown }).enable_thinking
  if (enableThinking === true) return 'enabled'
  if (enableThinking === false) return 'disabled'
  return 'default'
}

function getToggleMode(value: unknown): ToggleMode {
  if (value === true) return 'enabled'
  if (value === false) return 'disabled'
  return 'default'
}

function buildParametersFromDraft(
  keys: string[],
  values: unknown[],
  types: ParameterType[]
): Record<string, unknown> {
  const parameters: Record<string, unknown> = {}

  keys.forEach((key, index) => {
    if (!key) return
    const value = values[index]

    if (types[index] === 'number') {
      const parsed = Number(value as string)
      parameters[key] = isNaN(parsed) ? 0 : parsed
      return
    }

    parameters[key] = value
  })

  return parameters
}

export default function AddEditAssistant({
  open,
  onOpenChange,
  editingKey,
  initialData,
  onSave,
}: AddEditAssistantProps) {
  const [avatar, setAvatar] = useState<string | undefined>(initialData?.avatar)

  const [name, setName] = useState(initialData?.name || '')
  const [description, setDescription] = useState<string | undefined>(
    initialData?.description
  )
  const [instructions, setInstructions] = useState(
    initialData?.instructions || ''
  )
  const { isDark } = useTheme()
  const [paramsKeys, setParamsKeys] = useState<string[]>([''])
  const [paramsValues, setParamsValues] = useState<unknown[]>([''])
  const [paramsTypes, setParamsTypes] = useState<ParameterType[]>(['string'])
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const emojiPickerRef = useRef<HTMLDivElement>(null)
  const emojiPickerTriggerRef = useRef<HTMLDivElement>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  // const [toolStepsInput, setToolStepsInput] = useState('20')

  // Handle click outside emoji picker or trigger
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        emojiPickerRef.current &&
        emojiPickerTriggerRef.current &&
        !emojiPickerRef.current.contains(event.target as Node) &&
        !emojiPickerTriggerRef.current.contains(event.target as Node)
      ) {
        setShowEmojiPicker(false)
      }
    }

    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showEmojiPicker])

  // Reset form when modal opens/closes or editing key changes
  useEffect(() => {
    if (open && editingKey && initialData) {
      setAvatar(initialData.avatar)
      setName(initialData.name)
      setDescription(initialData.description)
      setInstructions(initialData.instructions)
      setShowEmojiPicker(false)
      // setToolStepsInput(String(initialData.tool_steps ?? 20))

      // Convert parameters object to arrays of keys and values
      const keys = Object.keys(initialData.parameters || {})
      const values = Object.values(initialData.parameters || {})

      const types = values.map((value) => getParameterType(value))

      setParamsKeys(keys.length > 0 ? keys : [''])
      setParamsValues(values.length > 0 ? values : [''])
      setParamsTypes(types.length > 0 ? types : ['string'])
    } else if (open) {
      // Add mode - reset form
      resetForm()
    }
  }, [open, editingKey, initialData])

  const resetForm = () => {
    setAvatar(undefined)
    setName('')
    setDescription(undefined)
    setInstructions('')
    setParamsKeys([''])
    setParamsValues([''])
    setParamsTypes(['string'])
    setNameError(null)
    setShowEmojiPicker(false)
    // setToolStepsInput('20')
  }

  const handleParameterChange = (
    index: number,
    value: unknown,
    field: 'key' | 'value' | 'type'
  ) => {
    if (field === 'key') {
      const newKeys = [...paramsKeys]
      newKeys[index] = value as string
      setParamsKeys(newKeys)
    } else if (field === 'value') {
      const newValues = [...paramsValues]

      // Convert value based on parameter type
      if (paramsTypes[index] === 'number' && typeof value === 'string') {
        // Preserve raw string while typing (e.g., "0."), convert on save
        newValues[index] = value
      } else if (
        paramsTypes[index] === 'boolean' &&
        typeof value === 'boolean'
      ) {
        newValues[index] = value
      } else if (paramsTypes[index] === 'json' && typeof value === 'string') {
        try {
          newValues[index] = value === '' ? {} : JSON.parse(value)
        } catch {
          // If JSON is invalid, keep as string
          newValues[index] = value
        }
      } else {
        newValues[index] = value
      }

      setParamsValues(newValues)
    } else {
      const newTypes = [...paramsTypes]
      newTypes[index] = value as ParameterType

      // Reset value based on the new type
      const newValues = [...paramsValues]

      if (value === 'string') {
        newValues[index] = ''
      } else if (value === 'number') {
        newValues[index] = ''
      } else if (value === 'boolean') {
        newValues[index] = false
      } else if (value === 'json') {
        newValues[index] = {}
      }

      setParamsValues(newValues)
      setParamsTypes(newTypes)
    }
  }

  const upsertParameter = (
    paramKey: string,
    value: unknown,
    type: ParameterType
  ) => {
    const existingIndex = paramsKeys.findIndex((key) => key === paramKey)
    const newKeys = [...paramsKeys]
    const newValues = [...paramsValues]
    const newTypes = [...paramsTypes]

    if (existingIndex !== -1) {
      newValues[existingIndex] = value
      newTypes[existingIndex] = type
    } else if (newKeys[newKeys.length - 1] === '') {
      newKeys[newKeys.length - 1] = paramKey
      newValues[newValues.length - 1] = value
      newTypes[newTypes.length - 1] = type
    } else {
      newKeys.push(paramKey)
      newValues.push(value)
      newTypes.push(type)
    }

    setParamsKeys(newKeys)
    setParamsValues(newValues)
    setParamsTypes(newTypes)
  }

  const removeParameterByKey = (paramKey: string) => {
    const existingIndex = paramsKeys.findIndex((key) => key === paramKey)
    if (existingIndex === -1) return

    const newKeys = [...paramsKeys]
    const newValues = [...paramsValues]
    const newTypes = [...paramsTypes]

    newKeys.splice(existingIndex, 1)
    newValues.splice(existingIndex, 1)
    newTypes.splice(existingIndex, 1)

    setParamsKeys(newKeys.length > 0 ? newKeys : [''])
    setParamsValues(newValues.length > 0 ? newValues : [''])
    setParamsTypes(newTypes.length > 0 ? newTypes : ['string'])
  }

  const replaceParameters = (parameters: Record<string, unknown>) => {
    const nextKeys = Object.keys(parameters)
    const nextValues = Object.values(parameters)
    const nextTypes = nextValues.map((value) => getParameterType(value))

    setParamsKeys(nextKeys.length > 0 ? nextKeys : [''])
    setParamsValues(nextValues.length > 0 ? nextValues : [''])
    setParamsTypes(nextTypes.length > 0 ? nextTypes : ['string'])
  }

  const setThinkingMode = (mode: ThinkingMode) => {
    if (mode === 'default') {
      removeParameterByKey(THINKING_PARAM_KEY)
      return
    }

    upsertParameter(
      THINKING_PARAM_KEY,
      { enable_thinking: mode === 'enabled' },
      'json'
    )
  }

  const setToggleMode = (paramKey: string, mode: ToggleMode) => {
    if (mode === 'default') {
      removeParameterByKey(paramKey)
      return
    }

    upsertParameter(paramKey, mode === 'enabled', 'boolean')
  }

  const setNumericParameterValue = (paramKey: string, rawValue: string) => {
    if (rawValue.trim() === '') {
      removeParameterByKey(paramKey)
      return
    }

    upsertParameter(paramKey, rawValue, 'number')
  }

  const handleAddParameter = () => {
    setParamsKeys([...paramsKeys, ''])
    setParamsValues([...paramsValues, ''])
    setParamsTypes([...paramsTypes, 'string'])
  }

  const handleRemoveParameter = (index: number) => {
    const newKeys = [...paramsKeys]
    const newValues = [...paramsValues]
    const newTypes = [...paramsTypes]
    newKeys.splice(index, 1)
    newValues.splice(index, 1)
    newTypes.splice(index, 1)
    setParamsKeys(newKeys.length > 0 ? newKeys : [''])
    setParamsValues(newValues.length > 0 ? newValues : [''])
    setParamsTypes(newTypes.length > 0 ? newTypes : ['string'])
  }

  const applyPreset = (presetId: (typeof assistantParameterPresets)[number]['id']) => {
    const preset = assistantParameterPresets.find((entry) => entry.id === presetId)
    if (!preset) return

    const nextParameters = { ...draftParameters }
    preset.remove.forEach((key) => {
      delete nextParameters[key]
    })
    Object.entries(preset.set).forEach(([key, value]) => {
      nextParameters[key] = value
    })

    replaceParameters(nextParameters)
  }

  const handleSave = () => {
    if (!name.trim()) {
      setNameError(t('assistants:nameRequired'))
      return
    }
    setNameError(null)
    const parameters = buildParametersFromDraft(
      paramsKeys,
      paramsValues,
      paramsTypes
    )

    // const parsedToolSteps = Number(toolStepsInput)
    const assistant: Assistant = {
      avatar,
      id: initialData?.id || Math.random().toString(36).substring(7),
      name,
      created_at: initialData?.created_at || Date.now(),
      description,
      instructions,
      parameters: parameters || {},
      // tool_steps: isNaN(parsedToolSteps) ? 20 : parsedToolSteps,
    }
    onSave(assistant)
    onOpenChange(false)
    resetForm()
  }

  const { t } = useTranslation()
  const getParameterIndex = (paramKey: string) =>
    paramsKeys.findIndex((key) => key === paramKey)
  const thinkingParameterIndex = paramsKeys.findIndex(
    (key) => key === THINKING_PARAM_KEY
  )
  const thinkingMode =
    thinkingParameterIndex !== -1
      ? getThinkingMode(paramsValues[thinkingParameterIndex])
      : 'default'
  const thinkingModeLabel =
    thinkingMode === 'enabled'
      ? t('assistants:thinkingEnabled')
      : thinkingMode === 'disabled'
        ? t('assistants:thinkingDisabled')
        : t('assistants:useModelDefault')
  const streamParameterIndex = getParameterIndex(STREAM_PARAM_KEY)
  const streamMode =
    streamParameterIndex !== -1
      ? getToggleMode(paramsValues[streamParameterIndex])
      : 'default'
  const streamModeLabel =
    streamMode === 'enabled'
      ? t('assistants:streamEnabled')
      : streamMode === 'disabled'
        ? t('assistants:streamDisabled')
        : t('assistants:useModelDefault')
  const draftParameters = buildParametersFromDraft(
    paramsKeys,
    paramsValues,
    paramsTypes
  )
  const selectedPresetId = getMatchingAssistantPresetId(draftParameters)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editingKey
              ? t('assistants:editAssistant')
              : t('assistants:addAssistant')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative">
              <label className="text-sm mb-2 inline-block">
                {t('assistants:emoji')}
              </label>
              <div
                className="border rounded-sm p-1 size-9 flex items-center justify-center cursor-pointer"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                ref={emojiPickerTriggerRef}
              >
                {avatar ? (
                  <AvatarEmoji
                    avatar={avatar}
                    imageClassName="size-5 object-contain"
                    textClassName=""
                  />
                ) : (
                  <IconMoodSmile size={18} className="text-muted-foreground" />
                )}
              </div>
              <div className="relative" ref={emojiPickerRef}>
                <EmojiPicker
                  open={showEmojiPicker}
                  theme={isDark ? ('dark' as Theme) : ('light' as Theme)}
                  className="absolute!s z-40! overflow-y-auto! top-2"
                  height={350}
                  lazyLoadEmojis
                  previewConfig={{ showPreview: false }}
                  onEmojiClick={(emojiData: EmojiClickData) => {
                    // For custom emojis, use the imageUrl instead of the emoji name
                    if (emojiData.isCustom && emojiData.imageUrl) {
                      setAvatar(emojiData.imageUrl)
                    } else {
                      setAvatar(emojiData.emoji)
                    }
                    setShowEmojiPicker(false)
                  }}
                />
              </div>
            </div>

            <div className="space-y-2 w-full">
              <label className="text-sm mb-2 inline-block">
                {t(`common:name`)}
              </label>
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (e.target.value.trim()) setNameError(null)
                }}
                placeholder={t('assistants:enterName')}
                autoFocus
              />
            </div>
          </div>

          {nameError && (
            <div className="ml-12 text-xs text-destructive mt-1">
              {nameError}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm mb-2 inline-block">
              {t('assistants:description')}
            </label>
            <Textarea
              value={description || ''}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('assistants:enterDescription')}
              className="resize-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm mb-2 inline-block">
              {t('assistants:instructions')}
            </label>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder={t('assistants:enterInstructions')}
              className="resize-none"
              rows={4}
            />
            <div className="text-xs text-muted-foreground">
              {t('assistants:instructionsDateHint')}
            </div>
          </div>

          <div className="space-y-2 my-4 mt-6">
            <div className="flex items-center justify-between">
              <label className="text-sm">{t('common:settings')}</label>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm">
                  {t('assistants:configurationPresets')}
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                {assistantParameterPresets.map((preset) => (
                  <Button
                    key={preset.id}
                    type="button"
                    size="sm"
                    variant={selectedPresetId === preset.id ? 'secondary' : 'ghost'}
                    className="h-7 rounded-full px-2 text-xs"
                    title={preset.description}
                    onClick={() => applyPreset(preset.id)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {t('assistants:configurationPresetsDesc')}
              </p>
            </div>
            <div className="space-y-3 rounded-lg border border-border/60 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {t('assistants:streamMode')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('assistants:streamModeDesc')}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <div className="relative w-38 shrink-0">
                      <Input value={streamModeLabel} readOnly />
                      <IconChevronDown
                        size={14}
                        className="text-muted-foreground absolute right-2 top-1/2 -translate-y-1/2"
                      />
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem
                      onClick={() => setToggleMode(STREAM_PARAM_KEY, 'default')}
                    >
                      {t('assistants:useModelDefault')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setToggleMode(STREAM_PARAM_KEY, 'enabled')}
                    >
                      {t('assistants:streamEnabled')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setToggleMode(STREAM_PARAM_KEY, 'disabled')}
                    >
                      {t('assistants:streamDisabled')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {commonNumericParameters.map((setting) => {
                  const parameterIndex = getParameterIndex(setting.key)
                  const value =
                    parameterIndex !== -1
                      ? paramsValues[parameterIndex]?.toString() || ''
                      : ''

                  return (
                    <div
                      key={setting.key}
                      className="space-y-1 rounded-md border border-border/40 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">{setting.title}</p>
                        {parameterIndex !== -1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => removeParameterByKey(setting.key)}
                          >
                            {t('assistants:useModelDefault')}
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {setting.description}
                      </p>
                      <Input
                        value={value}
                        onChange={(e) =>
                          setNumericParameterValue(setting.key, e.target.value)
                        }
                        type="number"
                        step={setting.step}
                        placeholder={setting.placeholder}
                        className="h-9"
                      />
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="flex items-start justify-between gap-3 rounded-lg border border-border/60 p-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {t('assistants:thinkingMode')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('assistants:thinkingModeDesc')}
                </p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <div className="relative w-38 shrink-0">
                    <Input value={thinkingModeLabel} readOnly />
                    <IconChevronDown
                      size={14}
                      className="text-muted-foreground absolute right-2 top-1/2 -translate-y-1/2"
                    />
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem
                    onClick={() => setThinkingMode('default')}
                  >
                    {t('assistants:useModelDefault')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setThinkingMode('enabled')}
                  >
                    {t('assistants:thinkingEnabled')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setThinkingMode('disabled')}
                  >
                    {t('assistants:thinkingDisabled')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {/* <div className="flex justify-between items-center gap-2">
              <div className="w-full">
                <p className="text-sm">{t('assistants:maxToolSteps')}</p>
              </div>
              <Input
                value={toolStepsInput}
                type="number"
                min={0}
                step="any"
                onChange={(e) => {
                  setToolStepsInput(e.target.value)
                }}
                placeholder="20"
                className="w-18 text-right"
              />
            </div> */}
          </div>

          <div className="space-y-2 my-4">
            <div className="flex items-center justify-between">
              <label className="text-sm">
                {t('assistants:predefinedParameters')}
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(paramsSettings).map(([key, setting]) => (
                <div
                  key={key}
                  onClick={() => {
                    // Check if parameter already exists
                    const existingIndex = paramsKeys.findIndex(
                      (k) => k === setting.key
                    )
                    if (existingIndex === -1) {
                      upsertParameter(
                        setting.key,
                        setting.value,
                        getParameterType(setting.value)
                      )
                    }
                  }}
                  className={cn(
                    'text-xs bg-secondary-foreground/5 py-1 px-2 rounded-sm cursor-pointer',
                    paramsKeys.includes(setting.key) && 'opacity-50'
                  )}
                >
                  {setting.title}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm">{t('assistants:parameters')}</label>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleAddParameter}
              >
                <IconPlus size={18} className="text-muted-foreground" />
              </Button>
            </div>

            {paramsKeys.map((key, index) => (
              <div key={index} className="flex items-center gap-4">
                <div
                  key={index}
                  className="flex items-center flex-col sm:flex-row w-full gap-2"
                >
                  <Input
                    value={key}
                    onChange={(e) =>
                      handleParameterChange(index, e.target.value, 'key')
                    }
                    placeholder={t('assistants:key')}
                    className="w-full sm:w-24"
                  />

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <div className="relative w-full sm:w-30">
                        <Input
                          value={
                            paramsTypes[index].charAt(0).toUpperCase() +
                            paramsTypes[index].slice(1)
                          }
                          readOnly
                        />
                        <IconChevronDown
                          size={14}
                          className="text-muted-foreground absolute right-2 top-1/2 -translate-y-1/2"
                        />
                      </div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-32" align="start">
                      <DropdownMenuItem
                        onClick={() =>
                          handleParameterChange(index, 'string', 'type')
                        }
                      >
                        {t('assistants:stringValue')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          handleParameterChange(index, 'number', 'type')
                        }
                      >
                        {t('assistants:numberValue')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          handleParameterChange(index, 'boolean', 'type')
                        }
                      >
                        {t('assistants:booleanValue')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          handleParameterChange(index, 'json', 'type')
                        }
                      >
                        {t('assistants:jsonValue')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {paramsTypes[index] === 'boolean' ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <div className="relative sm:flex-1 w-full">
                          <Input
                            value={
                              paramsValues[index]
                                ? t('assistants:trueValue')
                                : t('assistants:falseValue')
                            }
                            readOnly
                          />
                          <IconChevronDown
                            size={14}
                            className="text-muted-foreground absolute right-2 top-1/2 -translate-y-1/2"
                          />
                        </div>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-24" align="start">
                        <DropdownMenuItem
                          onClick={() =>
                            handleParameterChange(index, true, 'value')
                          }
                        >
                          {t('assistants:trueValue')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            handleParameterChange(index, false, 'value')
                          }
                        >
                          {t('assistants:falseValue')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : paramsTypes[index] === 'json' ? (
                    <Input
                      value={
                        typeof paramsValues[index] === 'object'
                          ? JSON.stringify(paramsValues[index], null, 2)
                          : paramsValues[index]?.toString() || ''
                      }
                      onChange={(e) =>
                        handleParameterChange(index, e.target.value, 'value')
                      }
                      placeholder={t('assistants:jsonValuePlaceholder')}
                      className="sm:flex-1 h-9 w-full"
                    />
                  ) : (
                    <Input
                      value={paramsValues[index]?.toString() || ''}
                      onChange={(e) =>
                        handleParameterChange(index, e.target.value, 'value')
                      }
                      type={paramsTypes[index] === 'number' ? 'number' : 'text'}
                      step={paramsTypes[index] === 'number' ? 'any' : undefined}
                      placeholder={t('assistants:value')}
                      className="sm:flex-1 h-9 w-full"
                    />
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleRemoveParameter(index)}
                >
                  <IconTrash size={18} className="text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSave}>{t('assistants:save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
