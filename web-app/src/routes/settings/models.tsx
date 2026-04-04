import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'

import { route } from '@/constants/routes'
import HeaderPage from '@/containers/HeaderPage'
import SettingsMenu from '@/containers/SettingsMenu'
import { Card, CardItem } from '@/containers/Card'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/i18n/react-i18next-compat'
import { useModelProvider } from '@/hooks/useModelProvider'
import { getModelDisplayName, getProviderTitle } from '@/lib/utils'
import Capabilities from '@/containers/Capabilities'
import { DialogEditModel } from '@/containers/dialogs/EditModel'
import { DialogDeleteModel } from '@/containers/dialogs/DeleteModel'
import { ModelSetting } from '@/containers/ModelSetting'
import {
  applyMemoryPresetToModel,
  getMemoryPresetLabel,
  getMemoryPresetForModel,
  type MemoryPresetTier,
} from '@/lib/model-memory-presets'

const LOCAL_MODEL_PROVIDERS = new Set(['llamacpp', 'mlx', 'foundation-models'])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Route = createFileRoute(route.settings.models as any)({
  component: ModelsSettings,
})

function ModelsSettings() {
  const { t } = useTranslation()
  const providers = useModelProvider((state) => state.providers)
  const updateProvider = useModelProvider((state) => state.updateProvider)
  const [selectedTier, setSelectedTier] = useState<MemoryPresetTier>('24gb')

  const localProviders = providers.filter(
    (provider) =>
      LOCAL_MODEL_PROVIDERS.has(provider.provider) && provider.models.length > 0
  )

  const handleApplyMemoryPreset = () => {
    let updatedModelsCount = 0

    localProviders.forEach((provider) => {
      const updatedModels = provider.models.map((model) => {
        const result = applyMemoryPresetToModel(
          provider.provider,
          model,
          selectedTier
        )

        if (result.changed) {
          updatedModelsCount += 1
        }

        return result.model
      })

      updateProvider(provider.provider, { models: updatedModels })
    })

    toast.success(t('settings:models.presetAppliedTitle'), {
      description: t('settings:models.presetAppliedDescription', {
        count: updatedModelsCount,
        tier: getMemoryPresetLabel(selectedTier),
      }),
    })
  }

  return (
    <div className="flex flex-col h-svh w-full">
      <HeaderPage>
        <div className="flex items-center gap-2 w-full">
          <span className="font-medium text-base font-studio">
            {t('common:models')}
          </span>
        </div>
      </HeaderPage>
      <div className="flex h-[calc(100%-60px)]">
        <SettingsMenu />
        <div className="p-4 pt-0 w-full overflow-y-auto">
          <div className="flex flex-col gap-4">
            <Card
              header={
                <div className="mb-2 space-y-4">
                  <h1 className="text-foreground font-medium text-base font-studio">
                    {t('common:models')}
                  </h1>
                  <p className="text-sm mt-1 text-muted-foreground">
                    {t('settings:models.description')}
                  </p>
                  <div className="rounded-2xl border bg-muted/30 p-4 space-y-4">
                    <div className="space-y-1">
                      <h2 className="font-medium">
                        {t('settings:models.memoryProfileTitle')}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {t('settings:models.memoryProfileDescription')}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {(['8gb', '16gb', '24gb'] as const).map((tier) => (
                        <Button
                          key={tier}
                          type="button"
                          size="sm"
                          variant={selectedTier === tier ? 'default' : 'outline'}
                          onClick={() => setSelectedTier(tier)}
                        >
                          {getMemoryPresetLabel(tier)}
                        </Button>
                      ))}
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleApplyMemoryPreset}
                        disabled={localProviders.length === 0}
                      >
                        {t('settings:models.applyMemoryProfile')}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('settings:models.memoryProfileFootnote')}
                    </p>
                  </div>
                </div>
              }
            >
              {localProviders.length === 0 ? (
                <div className="py-8 text-center">
                  <h2 className="font-medium">{t('settings:models.noModels')}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t('settings:models.noModelsDescription')}
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {localProviders.map((provider) => (
                    <div key={provider.provider} className="space-y-2">
                      <div className="px-1">
                        <h2 className="font-medium">
                          {getProviderTitle(provider.provider)}
                        </h2>
                        <p className="text-xs text-muted-foreground">
                          {provider.models.length} {t('providers:models')}
                        </p>
                      </div>
                      <div className="space-y-1">
                        {provider.models.map((model) => {
                          const capabilities = model.capabilities || []

                          return (
                            <CardItem
                              key={`${provider.provider}:${model.id}`}
                              title={
                                <div className="flex items-center gap-2">
                                  <h3
                                    className="font-medium line-clamp-1"
                                    title={model.id}
                                  >
                                    {getModelDisplayName(model)}
                                  </h3>
                                  <Capabilities capabilities={capabilities} />
                                </div>
                              }
                              descriptionOutside={
                                <div className="text-sm text-muted-foreground break-all">
                                  {model.id}
                                  <div className="mt-1 text-xs text-muted-foreground/80">
                                    {t('settings:models.recommendedContext', {
                                      tier: getMemoryPresetLabel(selectedTier),
                                      value: getMemoryPresetForModel(
                                        provider.provider,
                                        model,
                                        selectedTier
                                      ).ctx_len,
                                    })}
                                  </div>
                                </div>
                              }
                              actions={
                                <div className="flex items-center gap-0.5">
                                  <DialogEditModel
                                    provider={provider}
                                    modelId={model.id}
                                  />
                                  {model.settings && (
                                    <ModelSetting provider={provider} model={model} />
                                  )}
                                  <DialogDeleteModel
                                    provider={provider}
                                    modelId={model.id}
                                  />
                                </div>
                              }
                            />
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
