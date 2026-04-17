import { useCallback, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useServiceHub } from '@/hooks/useServiceHub'
import type { ModelLoadPlan } from '@/services/models/types'

interface ModelSupportStatusProps {
  modelId: string | undefined
  provider: string | undefined
  contextSize: number
  className?: string
}

export const ModelSupportStatus = ({
  modelId,
  provider,
  contextSize,
  className,
}: ModelSupportStatusProps) => {
  const [loadPlan, setLoadPlan] = useState<ModelLoadPlan | null>(null)
  const [modelSupportStatus, setModelSupportStatus] = useState<
    'RED' | 'YELLOW' | 'GREEN' | 'LOADING' | null | 'GREY'
  >(null)
  const serviceHub = useServiceHub()

  const planModelLoadWithPath = useCallback(
    async (
      id: string,
      ctxSize: number
    ): Promise<ModelLoadPlan | null> => {
      try {
        const model = await serviceHub.models().getModel(id)
        if (!model?.path) {
          console.error(`Unable to resolve model path for model: ${id}`)
          return null
        }

        return await serviceHub
          .models()
          .planModelLoad(model.path, ctxSize, model.sizeBytes)
      } catch (error) {
        console.error('Error planning model load with path resolution:', error)
        return null
      }
    },
    [serviceHub]
  )

  // Helper function to get icon color based on model support status
  const getStatusColor = (): string => {
    switch (modelSupportStatus) {
      case 'GREEN':
        return 'bg-green-500'
      case 'YELLOW':
        return 'bg-yellow-500'
      case 'RED':
        return 'bg-red-500'
      case 'LOADING':
        return 'bg-secondary'
      default:
        return 'bg-secondary'
    }
  }

  // Helper function to get tooltip text based on model support status
  const getStatusTooltip = (): string => {
    if (loadPlan?.summary) {
      return loadPlan.summary
    }
    switch (modelSupportStatus) {
      case 'GREEN':
        return `Works Well on your device (ctx: ${contextSize})`
      case 'YELLOW':
        return `Might work on your device (ctx: ${contextSize})`
      case 'RED':
        return `Doesn't work on your device  (ctx: ${contextSize})`
      case 'LOADING':
        return 'Checking device compatibility...'
      default:
        return 'Unknown'
    }
  }

  // Check model support when model changes
  useEffect(() => {
    const checkModelSupport = async () => {
      if (modelId && provider === 'llamacpp') {
        // Set loading state immediately
        setModelSupportStatus('LOADING')
        setLoadPlan(null)
        try {
          const plan = await planModelLoadWithPath(
            modelId,
            contextSize
          )
          setLoadPlan(plan)
          setModelSupportStatus(plan?.status ?? null)
        } catch (error) {
          console.error('Error checking model support:', error)
          setLoadPlan(null)
          setModelSupportStatus('RED')
        }
      } else {
        // Only show status for llamacpp models since isModelSupported is specific to llamacpp
        setLoadPlan(null)
        setModelSupportStatus(null)
      }
    }

    checkModelSupport()
  }, [modelId, provider, contextSize, planModelLoadWithPath])

  // Don't render anything if no status or not llamacpp
  if (!modelSupportStatus || provider !== 'llamacpp') {
    return null
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'size-2 flex items-center justify-center rounded-full',
              modelSupportStatus === 'LOADING'
                ? 'size-2.5 border border-t-transparent animate-spin'
                : getStatusColor(),
              className
            )}
          />
        </TooltipTrigger>
        <TooltipContent>
          <div className="max-w-xs space-y-2">
            <p>{getStatusTooltip()}</p>
            {loadPlan && (
              <div className="text-xs text-muted-foreground space-y-1">
                {loadPlan.recommended_context_size > 0 && (
                  <p>
                    Recommended context: {loadPlan.recommended_context_size}
                  </p>
                )}
                {loadPlan.recommended_batch_size > 0 && (
                  <p>
                    Recommended batch size: {loadPlan.recommended_batch_size}
                  </p>
                )}
                {loadPlan.warnings.slice(0, 2).map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
