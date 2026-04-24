import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { Assistant } from '@janhq/core'
import { useAssistant, defaultAssistant } from '../useAssistant'

// Mock the services
vi.mock('@/services/assistants', () => ({
  createAssistant: vi.fn(() => Promise.resolve()),
  deleteAssistant: vi.fn(() => Promise.resolve()),
}))

describe('useAssistant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset Zustand store to default state
    act(() => {
      useAssistant.setState({
        assistants: [defaultAssistant],
        currentAssistant: defaultAssistant,
      })
    })
  })

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useAssistant())

    expect(result.current.assistants).toEqual([defaultAssistant])
    expect(result.current.currentAssistant).toEqual(defaultAssistant)
  })

  it('should add assistant', () => {
    const { result } = renderHook(() => useAssistant())

    const newAssistant = {
      id: 'assistant-2',
      name: 'New Assistant',
      avatar: '🤖',
      description: 'A new assistant',
      instructions: 'Help the user',
      created_at: Date.now(),
      parameters: {},
    }

    act(() => {
      result.current.addAssistant(newAssistant)
    })

    expect(result.current.assistants).toHaveLength(2)
    expect(result.current.assistants).toContain(newAssistant)
  })

  it('should update assistant', () => {
    const { result } = renderHook(() => useAssistant())

    const updatedAssistant = {
      ...defaultAssistant,
      name: 'Updated Atomic Chat',
      description: 'Updated description',
    }

    act(() => {
      result.current.updateAssistant(updatedAssistant)
    })

    expect(result.current.assistants[0].name).toBe('Updated Atomic Chat')
    expect(result.current.assistants[0].description).toBe('Updated description')
  })

  it('should delete assistant', () => {
    const { result } = renderHook(() => useAssistant())

    const assistant2 = {
      id: 'assistant-2',
      name: 'Assistant 2',
      avatar: '🤖',
      description: 'Second assistant',
      instructions: 'Help the user',
      created_at: Date.now(),
      parameters: {},
    }

    act(() => {
      result.current.addAssistant(assistant2)
    })

    expect(result.current.assistants).toHaveLength(2)

    act(() => {
      result.current.deleteAssistant('assistant-2')
    })

    expect(result.current.assistants).toHaveLength(1)
    expect(result.current.assistants[0].id).toBe('jan')
  })

  it('should set current assistant', () => {
    const { result } = renderHook(() => useAssistant())

    const newAssistant = {
      id: 'assistant-2',
      name: 'New Current Assistant',
      avatar: '🤖',
      description: 'New current assistant',
      instructions: 'Help the user',
      created_at: Date.now(),
      parameters: {},
    }

    act(() => {
      result.current.setCurrentAssistant(newAssistant)
    })

    expect(result.current.currentAssistant).toEqual(newAssistant)
  })

  it('should set assistants', () => {
    const { result } = renderHook(() => useAssistant())

    const assistants = [
      {
        id: 'assistant-1',
        name: 'Assistant 1',
        avatar: '🤖',
        description: 'First assistant',
        instructions: 'Help the user',
        created_at: Date.now(),
        parameters: {},
      },
      {
        id: 'assistant-2',
        name: 'Assistant 2',
        avatar: '🔧',
        description: 'Second assistant',
        instructions: 'Help with tasks',
        created_at: Date.now(),
        parameters: {},
      },
    ]

    act(() => {
      result.current.setAssistants(assistants)
    })

    expect(result.current.assistants).toEqual(assistants)
    expect(result.current.assistants).toHaveLength(2)
  })

  it('should maintain assistant structure', () => {
    const { result } = renderHook(() => useAssistant())

    expect(result.current.currentAssistant.id).toBe('jan')
    expect(result.current.currentAssistant.name).toBe('Atomic Chat')
    expect(result.current.currentAssistant.avatar).toBe(
      '/images/transparent-logo.png'
    )
    expect(result.current.currentAssistant.instructions).toContain(
      'Before engaging any tools, articulate your complete thought process in natural language'
    )
    expect(typeof result.current.currentAssistant.created_at).toBe('number')
    expect(typeof result.current.currentAssistant.parameters).toBe('object')
  })

  it('should handle empty assistants list', () => {
    const { result } = renderHook(() => useAssistant())

    act(() => {
      result.current.setAssistants([])
    })

    expect(result.current.assistants).toEqual([])
  })

  it('should update assistant in current assistant if it matches', () => {
    const { result } = renderHook(() => useAssistant())

    const updatedDefaultAssistant = {
      ...defaultAssistant,
      name: 'Updated Atomic Chat Name',
    }

    act(() => {
      result.current.updateAssistant(updatedDefaultAssistant)
    })

    expect(result.current.currentAssistant.name).toBe(
      'Updated Atomic Chat Name'
    )
  })

  it('should clone assistant with a new id and copied settings', () => {
    const { result } = renderHook(() => useAssistant())

    const sourceAssistant = {
      id: 'assistant-2',
      name: 'Research Assistant',
      avatar: '🤖',
      description: 'Finds information',
      instructions: 'Search carefully',
      created_at: 12345,
      parameters: { temperature: 0.2, top_p: 0.9 },
    }

    act(() => {
      result.current.addAssistant(sourceAssistant)
    })

    let clonedAssistant: Assistant | null = null
    act(() => {
      clonedAssistant = result.current.cloneAssistant(sourceAssistant.id)
    })

    expect(clonedAssistant).not.toBeNull()
    expect(result.current.assistants).toHaveLength(3)
    expect(clonedAssistant?.id).not.toBe(sourceAssistant.id)
    expect(clonedAssistant?.name).toBe('Research Assistant Copy')
    expect(clonedAssistant?.description).toBe(sourceAssistant.description)
    expect(clonedAssistant?.instructions).toBe(sourceAssistant.instructions)
    expect(clonedAssistant?.parameters).toEqual(sourceAssistant.parameters)
    expect(clonedAssistant?.avatar).toBe(sourceAssistant.avatar)
    expect(clonedAssistant?.created_at).not.toBe(sourceAssistant.created_at)
  })

  it('should increment clone names when copies already exist', () => {
    const { result } = renderHook(() => useAssistant())

    const sourceAssistant = {
      id: 'assistant-2',
      name: 'Research Assistant',
      avatar: '🤖',
      description: 'Finds information',
      instructions: 'Search carefully',
      created_at: 12345,
      parameters: {},
    }

    act(() => {
      result.current.addAssistant(sourceAssistant)
      result.current.addAssistant({
        ...sourceAssistant,
        id: 'assistant-3',
        name: 'Research Assistant Copy',
      })
    })

    let clonedAssistant: Assistant | null = null
    act(() => {
      clonedAssistant = result.current.cloneAssistant(sourceAssistant.id)
    })

    expect(clonedAssistant?.name).toBe('Research Assistant Copy 2')
  })
})
