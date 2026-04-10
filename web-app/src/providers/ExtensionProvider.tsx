import { ExtensionManager } from '@/lib/extension'
import { APIs } from '@/lib/service'
import { EventEmitter } from '@/services/events/EventEmitter'
import { SystemEvent } from '@/types/events'
import { EngineManager, ModelManager } from '@janhq/core'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { PropsWithChildren, useCallback, useEffect, useState } from 'react'

const LLAMACPP_EXTENSION_KEY = '@janhq/llamacpp-extension'

type StartupOptions = {
  prefer_jan_shared_models?: boolean
  jan_data_folder?: string | null
}

async function applyStartupLlamacppSettings(
  startupOptions?: StartupOptions
): Promise<boolean> {
  try {
    const resolvedStartupOptions =
      startupOptions ?? (await invoke<StartupOptions>('get_startup_options'))
    if (!resolvedStartupOptions?.prefer_jan_shared_models) {
      return false
    }

    const existingSettingsJson = localStorage.getItem(LLAMACPP_EXTENSION_KEY)
    const existingSettings = existingSettingsJson
      ? JSON.parse(existingSettingsJson)
      : []
    let didChange = false

    const upsertSetting = (key: string, value: unknown) => {
      const existing = existingSettings.find((setting: { key?: string }) => setting.key === key)
      if (existing?.controllerProps) {
        if (existing.controllerProps.value === value) {
          return
        }
        existing.controllerProps.value = value
        didChange = true
        return
      }

      existingSettings.push({
        key,
        extensionName: LLAMACPP_EXTENSION_KEY,
        controllerProps: {
          value,
        },
      })
      didChange = true
    }

    upsertSetting('prefer_jan_shared_models', true)

    if (typeof resolvedStartupOptions.jan_data_folder === 'string') {
      upsertSetting('jan_data_folder', resolvedStartupOptions.jan_data_folder)
    }

    if (didChange) {
      localStorage.setItem(
        LLAMACPP_EXTENSION_KEY,
        JSON.stringify(existingSettings)
      )
    }
    return didChange
  } catch (error) {
    console.warn('Failed to apply startup llama.cpp settings:', error)
    return false
  }
}

export function ExtensionProvider({ children }: PropsWithChildren) {
  const [finishedSetup, setFinishedSetup] = useState(false)
  const setupExtensions = useCallback(async () => {
    // Setup core window object for both platforms
    window.core = {
      api: APIs,
    }

    window.core.events = new EventEmitter()
    window.core.extensionManager = new ExtensionManager()
    window.core.engineManager = new EngineManager()
    window.core.modelManager = new ModelManager()

    await applyStartupLlamacppSettings()

    // Register extensions - same pattern for both platforms
    await ExtensionManager.getInstance()
      .registerActive()
      .then(() => ExtensionManager.getInstance().load())
      .then(() => setFinishedSetup(true))
  }, [])

  useEffect(() => {
    setupExtensions()

    let unsubscribe = () => {}
    listen<StartupOptions>(SystemEvent.STARTUP_OPTIONS, async (event) => {
        const didChange = await applyStartupLlamacppSettings(event.payload)
        if (didChange) {
          window.location.reload()
        }
      })
      .then((unsub) => {
        unsubscribe = unsub
      })

    return () => {
      unsubscribe()
      ExtensionManager.getInstance().unload()
    }
  }, [setupExtensions])

  return <>{finishedSetup && children}</>
}
