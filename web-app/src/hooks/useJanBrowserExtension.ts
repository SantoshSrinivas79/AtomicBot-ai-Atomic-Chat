import { useState, useCallback, useRef } from 'react'
import { useServiceHub } from '@/hooks/useServiceHub'
import { useMCPServers } from '@/hooks/useMCPServers'
import { toast } from 'sonner'
import type { JanBrowserExtensionDialogState } from '@/containers/dialogs/JanBrowserExtensionDialog'

const JAN_BROWSER_MCP_NAME = 'Jan Browser MCP'
const LOCAL_BROWSER_MCP_NAME = 'Local Browser MCP'

// Timeout and polling configuration
const PING_TIMEOUT_MS = 6000 // Backend ping takes up to 3s
const POLL_INTERVAL_MS = 500
const SERVER_START_DELAY_MS = 1000

export type BrowserProviderPreference = 'extension' | 'local'

export function useJanBrowserExtension(preferredProvider?: BrowserProviderPreference) {
  const serviceHub = useServiceHub()
  const { mcpServers, editServer, syncServers } = useMCPServers()

  const [dialogState, setDialogState] = useState<JanBrowserExtensionDialogState>('closed')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)

  const cancelledRef = useRef(false)
  const cancelDeactivationPromiseRef = useRef<Promise<void> | null>(null)
  const operationInProgressRef = useRef(false)

  const janBrowserConfig = mcpServers[JAN_BROWSER_MCP_NAME]
  const localBrowserConfig = mcpServers[LOCAL_BROWSER_MCP_NAME]
  const preferLocalBrowser =
    preferredProvider === 'local' ||
    (preferredProvider !== 'extension' && (localBrowserConfig?.preferred ?? false))
  const hasConfig = !!janBrowserConfig || !!localBrowserConfig
  const isActive = (janBrowserConfig?.active ?? false) || (localBrowserConfig?.active ?? false)

  /**
   * Check if the browser extension is connected (single check)
   */
  const checkExtensionConnection = useCallback(async (): Promise<boolean> => {
    try {
      return await serviceHub.mcp().checkJanBrowserExtensionConnected()
    } catch (error) {
      console.error('Error checking extension connection:', error)
      return false
    }
  }, [serviceHub])

  /**
   * Poll for extension connection with timeout
   */
  const waitForExtensionConnection = useCallback(async (
    maxWaitMs: number = PING_TIMEOUT_MS,
    pollIntervalMs: number = POLL_INTERVAL_MS
  ): Promise<boolean> => {
    const startTime = Date.now()
    while (Date.now() - startTime < maxWaitMs) {
      if (cancelledRef.current) {
        return false
      }
      const connected = await checkExtensionConnection()
      if (connected) {
        return true
      }
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
    }
    return false
  }, [checkExtensionConnection])

  /**
   * Handle successful connection - close dialog and show toast
   */
  const handleConnectionSuccess = useCallback((description?: string) => {
    setDialogOpen(false)
    setDialogState('closed')
    toast.success('Atomic Bot browser tools enabled', description ? { description } : undefined)
  }, [])

  const persistServerState = useCallback(async (
    name: string,
    config: typeof janBrowserConfig | typeof localBrowserConfig,
    active: boolean
  ) => {
    if (!config) return

    editServer(name, {
      ...config,
      active,
    })
    await syncServers()
  }, [editServer, syncServers])

  const deactivateBrowserServers = useCallback(async () => {
    const deactivationTasks: Promise<unknown>[] = []

    if (janBrowserConfig) {
      deactivationTasks.push(
        serviceHub.mcp().deactivateMCPServer(JAN_BROWSER_MCP_NAME).catch((error) => {
          console.error('Error deactivating Jan Browser MCP:', error)
        })
      )
      editServer(JAN_BROWSER_MCP_NAME, {
        ...janBrowserConfig,
        active: false,
      })
    }

    if (localBrowserConfig) {
      deactivationTasks.push(
        serviceHub.mcp().deactivateMCPServer(LOCAL_BROWSER_MCP_NAME).catch((error) => {
          console.error('Error deactivating Local Browser MCP:', error)
        })
      )
      editServer(LOCAL_BROWSER_MCP_NAME, {
        ...localBrowserConfig,
        active: false,
      })
    }

    await Promise.all(deactivationTasks)
    await syncServers()
  }, [editServer, janBrowserConfig, localBrowserConfig, serviceHub, syncServers])

  const activateLocalBrowserFallback = useCallback(async (description?: string) => {
    if (!localBrowserConfig) {
      return false
    }

    console.info('[BrowserTools] Activating Local Browser MCP fallback')
    await serviceHub.mcp().activateMCPServer(LOCAL_BROWSER_MCP_NAME, {
      ...localBrowserConfig,
      active: true,
    })

    if (cancelledRef.current) return true

    if (janBrowserConfig?.active) {
      await serviceHub.mcp().deactivateMCPServer(JAN_BROWSER_MCP_NAME).catch((error) => {
        console.error('Error deactivating Jan Browser MCP while preferring Local Browser MCP:', error)
      })
    }

    if (janBrowserConfig) {
      editServer(JAN_BROWSER_MCP_NAME, {
        ...janBrowserConfig,
        active: false,
      })
    }

    await persistServerState(LOCAL_BROWSER_MCP_NAME, localBrowserConfig, true)
    setDialogOpen(false)
    setDialogState('closed')
    handleConnectionSuccess(description ?? 'Using local Playwright fallback')
    return true
  }, [
    editServer,
    handleConnectionSuccess,
    janBrowserConfig,
    localBrowserConfig,
    persistServerState,
    serviceHub,
  ])

  /**
   * Handle cancel async
   */
  const handleCancel = useCallback(() => {
    cancelledRef.current = true
    setDialogOpen(false)
    setDialogState('closed')
    setIsLoading(false)

    if (janBrowserConfig || localBrowserConfig) {
      setIsCancelling(true)

      const deactivationPromise = deactivateBrowserServers()
        .catch((error) => {
          console.error('Error deactivating browser MCP servers on cancel:', error)
        })
        .finally(() => {
          cancelDeactivationPromiseRef.current = null
          setIsCancelling(false)
        })

      cancelDeactivationPromiseRef.current = deactivationPromise
    }
  }, [deactivateBrowserServers, janBrowserConfig, localBrowserConfig])

  /**
   * Toggle the Jan Browser MCP (called when clicking the browser icon)
   */
  const toggleBrowser = useCallback(async () => {
    // Atomic check - refs update synchronously, prevents race conditions
    if (operationInProgressRef.current) return
    operationInProgressRef.current = true

    try {
      if (!janBrowserConfig && !localBrowserConfig) {
        toast.error('Browser extension MCP not found', {
          description: 'Please check your MCP server configuration',
        })
        return
      }

      if (cancelDeactivationPromiseRef.current) {
        await cancelDeactivationPromiseRef.current
      }

      const newActiveState = !isActive
      cancelledRef.current = false

      setIsLoading(true)
      if (newActiveState) {
        if (preferLocalBrowser) {
          console.info('[BrowserTools] Local Browser MCP is preferred, trying Playwright first')
          try {
            const activated = await activateLocalBrowserFallback('Using preferred local Playwright browser')
            if (activated) {
              return
            }
          } catch (error) {
            console.error('Error activating preferred Local Browser MCP:', error)
            if (!janBrowserConfig) {
              throw error
            }
            console.info('[BrowserTools] Preferred Local Browser MCP failed, falling back to Jan Browser MCP')
          }
        }

        if (janBrowserConfig) {
          console.info('[BrowserTools] Activating Jan Browser MCP')
          await serviceHub.mcp().activateMCPServer(JAN_BROWSER_MCP_NAME, {
            ...janBrowserConfig,
            active: true,
          })

          if (cancelledRef.current) return

          if (localBrowserConfig?.active) {
            await serviceHub.mcp().deactivateMCPServer(LOCAL_BROWSER_MCP_NAME)
          }

          editServer(JAN_BROWSER_MCP_NAME, {
            ...janBrowserConfig,
            active: true,
          })

          if (localBrowserConfig) {
            editServer(LOCAL_BROWSER_MCP_NAME, {
              ...localBrowserConfig,
              active: false,
            })
          }
          await syncServers()

          setDialogOpen(true)
          setDialogState('checking')

          await new Promise(resolve => setTimeout(resolve, SERVER_START_DELAY_MS))

          const connected = await waitForExtensionConnection(PING_TIMEOUT_MS, POLL_INTERVAL_MS)

          if (cancelledRef.current) return

          if (connected) {
            handleConnectionSuccess()
            return
          }

          console.info('[BrowserTools] Jan Browser extension unavailable, attempting Local Browser MCP fallback')
        }

        if (janBrowserConfig) {
          await serviceHub.mcp().deactivateMCPServer(JAN_BROWSER_MCP_NAME).catch((error) => {
            console.error('Error deactivating Jan Browser MCP before local fallback:', error)
          })
          await persistServerState(JAN_BROWSER_MCP_NAME, janBrowserConfig, false)
        }

        if (!localBrowserConfig) {
          setDialogState('not_installed')
          return
        }

        await activateLocalBrowserFallback()
      } else {
        await deactivateBrowserServers()
        toast.success('Atomic Bot browser tools disabled')
      }
    } catch (error) {
      // Don't show error if cancelled
      if (cancelledRef.current) return
      console.error('Error toggling browser MCP:', error)
      setDialogOpen(false)
      setDialogState('closed')
    } finally {
      if (!cancelledRef.current) {
        setIsLoading(false)
      }
      // Always release the mutex
      operationInProgressRef.current = false
    }
  }, [
    janBrowserConfig,
    isActive,
    serviceHub,
    deactivateBrowserServers,
    preferLocalBrowser,
    localBrowserConfig,
    activateLocalBrowserFallback,
    persistServerState,
    waitForExtensionConnection,
    handleConnectionSuccess,
  ])

  return {
    // State
    hasConfig,
    isActive,
    isLoading: isLoading || isCancelling,
    dialogOpen,
    dialogState,

    // Actions
    toggleBrowser,
    handleCancel,
    setDialogOpen,
  }
}
