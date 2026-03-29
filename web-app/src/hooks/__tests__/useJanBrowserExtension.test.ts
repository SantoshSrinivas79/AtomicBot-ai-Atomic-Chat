import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useJanBrowserExtension } from '../useJanBrowserExtension'
import { useMCPServers } from '../useMCPServers'
import { useServiceHub } from '@/hooks/useServiceHub'
import { toast } from 'sonner'

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const janBrowserConfig = {
  command: 'npx',
  args: ['-y', 'search-mcp-server@latest'],
  env: {
    BRIDGE_HOST: '127.0.0.1',
    BRIDGE_PORT: '17389',
  },
  active: false,
  official: true,
} as const

const localBrowserConfig = {
  command: 'npx',
  args: ['-y', '@playwright/mcp@0.0.68'],
  env: {
    PLAYWRIGHT_MCP_USER_DATA_DIR: '$APP_DATA_DIR/playwright-profile',
    PLAYWRIGHT_MCP_OUTPUT_DIR: '$APP_DATA_DIR/playwright-output',
    PLAYWRIGHT_MCP_BROWSER: 'chrome',
  },
  active: false,
  official: true,
} as const

describe('useJanBrowserExtension', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    useMCPServers.setState({
      open: true,
      mcpServers: {
        'Jan Browser MCP': { ...janBrowserConfig },
        'Local Browser MCP': { ...localBrowserConfig },
      },
      settings: {
        toolCallTimeoutSeconds: 90,
        baseRestartDelayMs: 1000,
        maxRestartDelayMs: 30000,
        backoffMultiplier: 2,
      },
      loading: false,
      deletedServerKeys: [],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps Jan Browser MCP active when the extension connects', async () => {
    const mcpService = useServiceHub().mcp()
    vi.mocked(mcpService.checkJanBrowserExtensionConnected).mockResolvedValue(true)

    const { result } = renderHook(() => useJanBrowserExtension())

    await act(async () => {
      const pending = result.current.toggleBrowser()
      await vi.advanceTimersByTimeAsync(1000)
      await pending
    })

    expect(mcpService.activateMCPServer).toHaveBeenCalledWith(
      'Jan Browser MCP',
      expect.objectContaining({ active: true })
    )
    expect(mcpService.activateMCPServer).not.toHaveBeenCalledWith(
      'Local Browser MCP',
      expect.anything()
    )
    expect(useMCPServers.getState().mcpServers['Jan Browser MCP']?.active).toBe(true)
    expect(useMCPServers.getState().mcpServers['Local Browser MCP']?.active).toBe(false)
    expect(toast.success).toHaveBeenCalledWith('Atomic Bot browser tools enabled', undefined)
  })

  it('falls back to Local Browser MCP when the extension is unavailable', async () => {
    const mcpService = useServiceHub().mcp()
    vi.mocked(mcpService.checkJanBrowserExtensionConnected).mockResolvedValue(false)

    const { result } = renderHook(() => useJanBrowserExtension())

    await act(async () => {
      const pending = result.current.toggleBrowser()
      await vi.advanceTimersByTimeAsync(8000)
      await pending
    })

    expect(mcpService.activateMCPServer).toHaveBeenNthCalledWith(
      1,
      'Jan Browser MCP',
      expect.objectContaining({ active: true })
    )
    expect(mcpService.deactivateMCPServer).toHaveBeenCalledWith('Jan Browser MCP')
    expect(mcpService.activateMCPServer).toHaveBeenNthCalledWith(
      2,
      'Local Browser MCP',
      expect.objectContaining({ active: true })
    )
    expect(useMCPServers.getState().mcpServers['Jan Browser MCP']?.active).toBe(false)
    expect(useMCPServers.getState().mcpServers['Local Browser MCP']?.active).toBe(true)
    expect(toast.success).toHaveBeenCalledWith('Atomic Bot browser tools enabled', {
      description: 'Using local Playwright fallback',
    })
  })

  it('uses Local Browser MCP first when it is preferred', async () => {
    const mcpService = useServiceHub().mcp()

    useMCPServers.setState({
      ...useMCPServers.getState(),
      mcpServers: {
        'Jan Browser MCP': { ...janBrowserConfig },
        'Local Browser MCP': { ...localBrowserConfig, preferred: true },
      },
    })

    const { result } = renderHook(() => useJanBrowserExtension())

    await act(async () => {
      await result.current.toggleBrowser()
    })

    expect(mcpService.activateMCPServer).toHaveBeenCalledTimes(1)
    expect(mcpService.activateMCPServer).toHaveBeenCalledWith(
      'Local Browser MCP',
      expect.objectContaining({ active: true, preferred: true })
    )
    expect(mcpService.checkJanBrowserExtensionConnected).not.toHaveBeenCalled()
    expect(useMCPServers.getState().mcpServers['Local Browser MCP']?.active).toBe(true)
    expect(useMCPServers.getState().mcpServers['Jan Browser MCP']?.active).toBe(false)
    expect(toast.success).toHaveBeenCalledWith('Atomic Bot browser tools enabled', {
      description: 'Using preferred local Playwright browser',
    })
  })

  it('falls back to Jan Browser MCP when preferred Local Browser MCP fails', async () => {
    const mcpService = useServiceHub().mcp()
    vi.mocked(mcpService.activateMCPServer)
      .mockRejectedValueOnce(new Error('Playwright failed to launch'))
      .mockResolvedValueOnce(undefined)
    vi.mocked(mcpService.checkJanBrowserExtensionConnected).mockResolvedValue(true)

    useMCPServers.setState({
      ...useMCPServers.getState(),
      mcpServers: {
        'Jan Browser MCP': { ...janBrowserConfig },
        'Local Browser MCP': { ...localBrowserConfig, preferred: true },
      },
    })

    const { result } = renderHook(() => useJanBrowserExtension())

    await act(async () => {
      const pending = result.current.toggleBrowser()
      await vi.advanceTimersByTimeAsync(1000)
      await pending
    })

    expect(mcpService.activateMCPServer).toHaveBeenNthCalledWith(
      1,
      'Local Browser MCP',
      expect.objectContaining({ active: true, preferred: true })
    )
    expect(mcpService.activateMCPServer).toHaveBeenNthCalledWith(
      2,
      'Jan Browser MCP',
      expect.objectContaining({ active: true })
    )
    expect(mcpService.checkJanBrowserExtensionConnected).toHaveBeenCalled()
    expect(useMCPServers.getState().mcpServers['Jan Browser MCP']?.active).toBe(true)
    expect(useMCPServers.getState().mcpServers['Local Browser MCP']?.active).toBe(false)
  })

  it('prefers Jan Browser MCP when the chat explicitly prefers the extension', async () => {
    const mcpService = useServiceHub().mcp()
    vi.mocked(mcpService.checkJanBrowserExtensionConnected).mockResolvedValue(true)

    useMCPServers.setState({
      ...useMCPServers.getState(),
      mcpServers: {
        'Jan Browser MCP': { ...janBrowserConfig },
        'Local Browser MCP': { ...localBrowserConfig, preferred: true },
      },
    })

    const { result } = renderHook(() => useJanBrowserExtension('extension'))

    await act(async () => {
      const pending = result.current.toggleBrowser()
      await vi.advanceTimersByTimeAsync(1000)
      await pending
    })

    expect(mcpService.activateMCPServer).toHaveBeenCalledTimes(1)
    expect(mcpService.activateMCPServer).toHaveBeenCalledWith(
      'Jan Browser MCP',
      expect.objectContaining({ active: true })
    )
    expect(mcpService.checkJanBrowserExtensionConnected).toHaveBeenCalled()
  })
})
