/**
 * Providers Service Types
 */

export type ProviderModelOption = {
  id: string
  name: string
}

export interface ProvidersService {
  getProviders(): Promise<ModelProvider[]>
  fetchModelsFromProvider(provider: ModelProvider): Promise<ProviderModelOption[]>
  updateSettings(providerName: string, settings: ProviderSetting[]): Promise<void>
  fetch(): typeof fetch
}
