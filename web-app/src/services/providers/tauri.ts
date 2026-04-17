/**
 * Tauri Providers Service - Desktop implementation
 */

import { predefinedProviders } from '@/constants/providers'
import { providerModels } from '@/constants/models'
import { EngineManager, SettingComponentProps } from '@janhq/core'
import { ModelCapabilities } from '@/types/models'
import { modelSettings } from '@/lib/predefined'
import { ExtensionManager } from '@/lib/extension'
import { fetch as fetchTauri } from '@tauri-apps/plugin-http'
import { listVmlxJangModels } from '@/lib/vmlx'
import { DefaultProvidersService } from './default'
import { getModelCapabilities } from '@/lib/models'
import { getProviderSettingValue, isLocalBaseUrl } from '@/lib/utils'
import type { ProviderModelOption } from './types'

export class TauriProvidersService extends DefaultProvidersService {
  fetch(): typeof fetch {
    // Tauri implementation uses Tauri's fetch to avoid CORS issues
    return fetchTauri as typeof fetch
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
    return Promise.race<T>([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`))
        }, timeoutMs)
      }),
    ])
  }

  private async fetchWithTimeout(
    input: string,
    init: RequestInit,
    timeoutMs = 15000
  ) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }
  }

  private async fetchProviderModels(
    provider: ModelProvider,
    headers: Record<string, string>
  ) {
    if (isLocalBaseUrl(provider.base_url)) {
      try {
        // Prefer the webview's native fetch for loopback providers.
        // We have observed Tauri's HTTP plugin establish the connection
        // to Ollama but never resolve the response body for `/v1/models`.
        // Browser fetch sends the request reliably here and keeps the
        // add-model dialog from spinning indefinitely.
        const browserHeaders = { ...headers }
        delete browserHeaders.Origin

        return await this.fetchWithTimeout(
          `${provider.base_url}/models`,
          {
            method: 'GET',
            headers: browserHeaders,
          },
          8000
        )
      } catch (error) {
        console.warn(
          `Browser fetch failed for local provider ${provider.provider} models, falling back to Tauri fetch:`,
          error
        )
        return this.withTimeout(
          fetchTauri(`${provider.base_url}/models`, {
            method: 'GET',
            headers,
            connectTimeout: 8000,
          }),
          10000,
          `${provider.provider} local model fetch`
        )
      }
    }

    try {
      return await this.fetchWithTimeout(
        `${provider.base_url}/models`,
        {
          method: 'GET',
          headers,
        },
        15000
      )
    } catch (error) {
      console.warn(
        `Browser fetch failed for ${provider.provider} models, falling back to Tauri fetch:`,
        error
      )
      return await this.withTimeout(
        fetchTauri(`${provider.base_url}/models`, {
          method: 'GET',
          headers,
          connectTimeout: 15000,
        }),
        18000,
        `${provider.provider} model fetch`
      )
    }
  }

  async getProviders(): Promise<ModelProvider[]> {
    try {
      const builtinProviders = predefinedProviders.map((provider) => {
        let models = provider.models as Model[]
        if (Object.keys(providerModels).includes(provider.provider)) {
          const builtInModels = providerModels[
            provider.provider as unknown as keyof typeof providerModels
          ].models as unknown as string[]

          if (Array.isArray(builtInModels)) {
            models = builtInModels.map((model) => {
              const modelManifest = models.find((e) => e.id === model)
              // TODO: Check chat_template for tool call support
              return {
                ...(modelManifest ?? { id: model, name: model }),
                capabilities: getModelCapabilities(provider.provider, model),
              } as Model
            })
          }
        }

        return {
          ...provider,
          models,
        }
      }).filter(Boolean)

      const runtimeProviders: ModelProvider[] = []
      for (const [providerName, value] of EngineManager.instance().engines) {
        const models = await value.list() ?? [] 
        const provider: ModelProvider = {
          active: false,
          persist: true,
          provider: providerName,
          base_url:
            'inferenceUrl' in value
              ? (value.inferenceUrl as string).replace('/chat/completions', '')
              : '',
          settings: (await value.getSettings()).map((setting) => {
            return {
              key: setting.key,
              title: setting.title,
              description: setting.description,
              controller_type: setting.controllerType as unknown,
              controller_props: setting.controllerProps as unknown,
            }
          }) as ProviderSetting[],
          models: await Promise.all(
            models.map(async (model) => {
              let capabilities: string[] = []

              if ('capabilities' in model && Array.isArray(model.capabilities)) {
                capabilities = [...(model.capabilities as string[])]
              }
              if (!capabilities.includes(ModelCapabilities.TOOLS)) {
                try {
                  const toolSupported = await value.isToolSupported(model.id)
                  if (toolSupported) {
                    capabilities.push(ModelCapabilities.TOOLS)
                  }
                } catch (error) {
                  console.warn(
                    `Failed to check tool support for model ${model.id}:`,
                    error
                  )
                  // Continue without tool capabilities if check fails
                }
              }

              // Add embeddings capability for embedding models
              if (model.embedding && !capabilities.includes(ModelCapabilities.EMBEDDINGS)) {
                capabilities = [...capabilities, ModelCapabilities.EMBEDDINGS]
              }

              return {
                id: model.id,
                model: model.id,
                name: model.name,
                description: model.description,
                capabilities,
                embedding: model.embedding, // Preserve embedding flag for filtering in UI
                provider: providerName,
                settings: Object.values(modelSettings).reduce(
                  (acc, setting) => {
                    let value = setting.controller_props.value
                    if (setting.key === 'ctx_len') {
                      value = 8192 // Default context length for Llama.cpp models
                    }
                    acc[setting.key] = {
                      ...setting,
                      controller_props: {
                        ...setting.controller_props,
                        value: value,
                      },
                    }
                    return acc
                  },
                  {} as Record<string, ProviderSetting>
                ),
              } as Model
            })
          ),
        }
        runtimeProviders.push(provider)
      }

      return runtimeProviders.concat(builtinProviders as ModelProvider[])
    } catch (error: unknown) {
      console.error('Error getting providers in Tauri:', error)
      return []
    }
  }

  async fetchModelsFromProvider(provider: ModelProvider): Promise<ProviderModelOption[]> {
    if (provider.provider === 'vmlx') {
      const modelRoot = getProviderSettingValue(provider, 'model-root')

      if (typeof modelRoot !== 'string' || modelRoot.trim().length === 0) {
        throw new Error('VMLX provider must have model_root configured')
      }

      return listVmlxJangModels(modelRoot)
    }

    if (!provider.base_url) {
      throw new Error('Provider must have base_url configured')
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      // Add Origin header for local providers to avoid CORS issues
      // Some local providers (like Ollama) require an Origin header
      if (isLocalBaseUrl(provider.base_url)) {
        headers['Origin'] = 'tauri://localhost'
      }

      // Only add authentication headers if API key is provided
      if (provider.api_key) {
        headers['x-api-key'] = provider.api_key
        headers['Authorization'] = `Bearer ${provider.api_key}`
      }

      if (provider.custom_header) {
        provider.custom_header.forEach((header) => {
          headers[header.header] = header.value
        })
      }

      // Always use Tauri's fetch to avoid CORS issues
      const response = await this.fetchProviderModels(provider, headers)

      if (!response.ok) {
        // Provide more specific error messages based on status code (aligned with web implementation)
        if (response.status === 401) {
          throw new Error(
            `Authentication failed: API key is required or invalid for ${provider.provider}`
          )
        } else if (response.status === 403) {
          throw new Error(
            `Access forbidden: Check your API key permissions for ${provider.provider}`
          )
        } else if (response.status === 404) {
          throw new Error(
            `Models endpoint not found for ${provider.provider}. Check the base URL configuration.`
          )
        } else {
          throw new Error(
            `Failed to fetch models from ${provider.provider}: ${response.status} ${response.statusText}`
          )
        }
      }

      const data = await response.json()

      // Handle different response formats that providers might use
      if (data.data && Array.isArray(data.data)) {
        // OpenAI format: { data: [{ id: "model-id", name?: "Model Name" }, ...] }
        return data.data
          .map((model: { id?: string; name?: string }) =>
            model.id
              ? { id: model.id, name: model.name || model.id }
              : null
          )
          .filter((model: ProviderModelOption | null): model is ProviderModelOption => model !== null)
      } else if (Array.isArray(data)) {
        // Direct array format: ["model-id1", "model-id2", ...]
        return data
          .map((model) => {
            if (!model) return null
            if (typeof model === 'string') {
              return { id: model, name: model }
            }
            if (typeof model === 'object' && 'id' in model) {
              const typedModel = model as { id?: string; name?: string }
              if (!typedModel.id) return null
              return {
                id: typedModel.id,
                name: typedModel.name || typedModel.id,
              }
            }
            return null
          })
          .filter((model: ProviderModelOption | null): model is ProviderModelOption => model !== null)
      } else if (data.models && Array.isArray(data.models)) {
        // Alternative format: { models: [...] }
        return data.models
          .map((model: string | { id?: string; name?: string }) => {
            if (typeof model === 'string') {
              return { id: model, name: model }
            }
            if (!model.id) return null
            return { id: model.id, name: model.name || model.id }
          })
          .filter((model: ProviderModelOption | null): model is ProviderModelOption => model !== null)
      } else {
        console.warn('Unexpected response format from provider API:', data)
        return []
      }
    } catch (error) {
      console.error('Error fetching models from provider:', error)

      // Preserve structured error messages thrown above
      const structuredErrorPrefixes = [
        'Authentication failed',
        'Access forbidden',
        'Models endpoint not found',
        'Failed to fetch models from',
      ]

      if (
        error instanceof Error &&
        structuredErrorPrefixes.some((prefix) =>
          (error as Error).message.startsWith(prefix)
        )
      ) {
        throw new Error(error.message)
      }

      // Provide helpful error message for any connection errors
      if (error instanceof Error && error.message.includes('fetch')) {
        throw new Error(
          `Cannot connect to ${provider.provider} at ${provider.base_url}. Please check that the service is running and accessible.`
        )
      }

      // Generic fallback
      throw new Error(
        `Unexpected error while fetching models from ${provider.provider}: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  async updateSettings(
    providerName: string,
    settings: ProviderSetting[]
  ): Promise<void> {
    try {
      return ExtensionManager.getInstance()
        .getEngine(providerName)
        ?.updateSettings(
          settings.map((setting) => ({
            ...setting,
            controllerProps: {
              ...setting.controller_props,
              value:
                setting.controller_props.value !== undefined
                  ? setting.controller_props.value
                  : '',
            },
            controllerType: setting.controller_type,
          })) as SettingComponentProps[]
        )
    } catch (error) {
      console.error('Error updating settings in Tauri:', error)
      throw error
    }
  }
}
