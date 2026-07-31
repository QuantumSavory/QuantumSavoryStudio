import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref, watch } from 'vue'
import {
  PROJECT_SCHEMA_VERSION,
  createEmptyProject,
  encodeStoredProject,
} from '../../src/utils/projectCodec'
import { useProjectSession } from '../../src/composables/useProjectSession'

function createHarness({
  projects = {},
  confirmVersionMismatch = vi.fn(() => true),
  destroySimulation = vi.fn(async () => ({ success: true })),
  beforeProjectReplacement = vi.fn(async () => {})
} = {}) {
  const records = new Map(Object.entries(projects))
  const projectData = ref(createEmptyProject('A'))
  const currentProjectName = ref('A')
  const isDemoProject = ref(false)
  const selectedItem = ref({ id: 'selected' })
  const selectedType = ref('node')
  const mapCenter = ref([1, 2])
  const mapZoom = ref(3)
  const calls = {
    reset: vi.fn(),
    stop: vi.fn(),
    stopAlive: vi.fn(),
    closeWindows: vi.fn(),
    hide: vi.fn(),
    markSaved: vi.fn(),
    syncLegacy: vi.fn()
  }
  const store = {
    loadProject: vi.fn(name => records.get(name) || null),
    saveProject: vi.fn((name, data) => records.set(name, data)),
    openProject: vi.fn((name, data) => records.set(name, data)),
    deleteProject: vi.fn(name => records.delete(name)),
    listProjects: vi.fn(() => [...records.keys()]),
    getRecentProjectName: vi.fn(() => window.localStorage.getItem('recentProjectName')),
    setRecentProjectName: vi.fn(name => window.localStorage.setItem('recentProjectName', name)),
    clearRecentProjectName: vi.fn(() => window.localStorage.removeItem('recentProjectName'))
  }
  const api = {
    getDefaultBgNoise: () => ({ type: 'default', parameters: [] }),
    getPlatformInfo: () => ({ versions: { julia: '1.12', quantumSavory: '0.7', app: '1.6' } }),
    fetchPlatformInfo: vi.fn(),
    destroySimulation
  }
  const addLog = vi.fn()
  const showError = vi.fn()
  const session = useProjectSession({
    projectData,
    currentProjectName,
    isDemoProject,
    selectedItem,
    selectedType,
    mapCenter,
    mapZoom,
    clearLogs: vi.fn(),
    addLog,
    getSimulationStatus: vi.fn(),
    defaultMapCenter: [0, 0],
    defaultMapZoom: 4,
    minimumTimeStep: 0.1,
    markAsSaved: calls.markSaved,
    resetSimulation: calls.reset,
    stopPolling: calls.stop,
    stopAlivePolling: calls.stopAlive,
    closeAllResultWindows: calls.closeWindows,
    hideSlotState: calls.hide,
    syncLegacyProjectData: calls.syncLegacy,
    beforeProjectReplacement,
    confirmVersionMismatch,
    showError,
    store,
    api
  })
  return {
    session,
    records,
    projectData,
    currentProjectName,
    selectedItem,
    selectedType,
    mapCenter,
    mapZoom,
    calls,
    store,
    api,
    addLog,
    showError
  }
}

beforeAll(() => {
  const values = new Map()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: key => values.has(key) ? values.get(key) : null,
      removeItem: key => values.delete(key),
      setItem: (key, value) => values.set(key, String(value))
    }
  })
})

beforeEach(() => window.localStorage.clear())

describe('project session', () => {
  it('clears old annotations during graph release and commits the candidate annotations', async () => {
    const oldAnnotation = {
      id: 'annotation_old',
      markdown: 'Old',
      bounds: { west: -2, south: -1, east: 2, north: 1 },
      backgroundColor: '#ffffff',
      borderColor: '#000000',
      area: null,
    }
    const nextAnnotation = {
      ...oldAnnotation,
      id: 'annotation_next',
      markdown: 'Next',
    }
    const target = createEmptyProject('B')
    target.annotations.push(nextAnnotation)
    const harness = createHarness({
      projects: { B: encodeStoredProject(target, { name: 'B' }) },
    })
    harness.projectData.value.annotations.push(oldAnnotation)
    const observedAnnotationIds = []
    const stop = watch(
      harness.projectData,
      project => observedAnnotationIds.push(project.annotations.map(annotation => annotation.id)),
      { flush: 'sync' },
    )

    expect(await harness.session.open('B')).toBe(true)
    stop()

    expect(observedAnnotationIds).toContainEqual([])
    expect(harness.projectData.value.annotations).toEqual([nextAnnotation])
  })

  it('renames before Save As serialization and starts a clean session', async () => {
    const harness = createHarness()
    expect(await harness.session.saveAs('B')).toBe(true)
    expect(harness.currentProjectName.value).toBe('B')
    expect(harness.projectData.value.name).toBe('B')
    expect(harness.records.get('B').name).toBe('B')
    expect(harness.calls.reset).toHaveBeenCalledOnce()
    expect(harness.calls.closeWindows).toHaveBeenCalledOnce()
    expect(harness.store.setRecentProjectName).toHaveBeenCalledWith('B')
    expect(window.localStorage.getItem('recentProjectName')).toBe('B')
  })

  it('awaits collaboration teardown before replacing the active project', async () => {
    let releaseTeardown
    const beforeProjectReplacement = vi.fn(() => new Promise(resolve => {
      releaseTeardown = resolve
    }))
    const harness = createHarness({ beforeProjectReplacement })

    const saving = harness.session.saveAs('B')
    await vi.waitFor(() => expect(beforeProjectReplacement).toHaveBeenCalledOnce())
    expect(harness.currentProjectName.value).toBe('A')
    expect(harness.records.has('B')).toBe(false)

    releaseTeardown()
    expect(await saving).toBe(true)
    expect(harness.currentProjectName.value).toBe('B')
  })

  it('rejects a duplicate Save As without changing either project', async () => {
    const storedTarget = encodeStoredProject(createEmptyProject('B'), { name: 'B' })
    const harness = createHarness({ projects: { B: storedTarget } })
    const activeProject = harness.projectData.value

    expect(await harness.session.saveAs(' B ')).toBe(false)
    expect(harness.currentProjectName.value).toBe('A')
    expect(harness.projectData.value).toBe(activeProject)
    expect(harness.projectData.value.name).toBe('A')
    expect(harness.records.get('B')).toEqual(storedTarget)
    expect(harness.store.saveProject).not.toHaveBeenCalled()
    expect(harness.store.setRecentProjectName).not.toHaveBeenCalled()
    expect(harness.calls.reset).not.toHaveBeenCalled()
    expect(harness.showError).toHaveBeenCalledWith(
      'Failed to save project: A project named "B" already exists'
    )
  })

  it('overwrites a different existing project only when explicitly requested', async () => {
    const storedTarget = encodeStoredProject(createEmptyProject('B'), { name: 'B' })
    const harness = createHarness({ projects: { B: storedTarget } })
    harness.projectData.value.description = 'Replacement'

    expect(await harness.session.saveAs('B', { overwrite: true })).toBe(true)
    expect(harness.currentProjectName.value).toBe('B')
    expect(harness.records.get('B').description).toBe('Replacement')
  })

  it('does not tear down the current session when version confirmation is declined', async () => {
    const stored = encodeStoredProject(createEmptyProject('B'), {
      name: 'B',
      map: { position: [5, 6], zoom: 7 },
      platformInfo: { versions: { julia: '2.0', quantumSavory: '0.7', app: '1.6' } }
    })
    const harness = createHarness({ projects: { B: stored }, confirmVersionMismatch: vi.fn(() => false) })
    expect(await harness.session.open('B')).toBe(false)
    expect(harness.currentProjectName.value).toBe('A')
    expect(harness.projectData.value.name).toBe('A')
    expect(harness.calls.reset).not.toHaveBeenCalled()
    expect(harness.calls.closeWindows).not.toHaveBeenCalled()
    expect(harness.api.destroySimulation).not.toHaveBeenCalled()
  })

  it.each([
    ['open', harness => harness.session.open('B'), true],
    ['import', (harness, document) => harness.session.importProject(document, 'B'), false],
    ['demo', (harness, document) => harness.session.openDemo(document), false],
  ])('rejects a noncurrent document during %s before session or storage effects', async (
    _operation,
    run,
    stored,
  ) => {
    const document = encodeStoredProject(createEmptyProject('B'), { name: 'B' })
    document.schemaVersion = PROJECT_SCHEMA_VERSION - 1
    const harness = createHarness({ projects: stored ? { B: document } : {} })
    const activeProject = harness.projectData.value
    const activeName = harness.currentProjectName.value
    const activeSelection = harness.selectedItem.value

    expect(await run(harness, document)).toBe(false)

    expect(harness.projectData.value).toBe(activeProject)
    expect(harness.currentProjectName.value).toBe(activeName)
    expect(harness.selectedItem.value).toBe(activeSelection)
    expect(harness.store.saveProject).not.toHaveBeenCalled()
    expect(harness.store.openProject).not.toHaveBeenCalled()
    expect(harness.store.setRecentProjectName).not.toHaveBeenCalled()
    expect(harness.api.destroySimulation).not.toHaveBeenCalled()
    expect(harness.calls.reset).not.toHaveBeenCalled()
    expect(harness.calls.closeWindows).not.toHaveBeenCalled()
    expect(harness.showError).toHaveBeenCalledWith(
      expect.stringMatching(/schema validation.*schemaVersion/i),
    )
  })

  it('allows only the newest overlapping open to commit', async () => {
    let resolveFirstConfirmation
    const firstConfirmation = new Promise(resolve => { resolveFirstConfirmation = resolve })
    const projectA = encodeStoredProject(createEmptyProject('Old'), {
      name: 'Old',
      map: { position: [1, 1], zoom: 2 },
      platformInfo: { versions: { julia: '2.0', quantumSavory: '0.7', app: '1.6' } }
    })
    const projectB = encodeStoredProject(createEmptyProject('Newest'), {
      name: 'Newest',
      map: { position: [8, 9], zoom: 10 }
    })
    const harness = createHarness({
      projects: { Old: projectA, Newest: projectB },
      confirmVersionMismatch: vi.fn(() => firstConfirmation)
    })

    const first = harness.session.open('Old')
    const second = harness.session.open('Newest')
    expect(await second).toBe(true)
    resolveFirstConfirmation(true)
    expect(await first).toBe(false)
    expect(harness.currentProjectName.value).toBe('Newest')
    expect(harness.projectData.value.name).toBe('Newest')
    expect(harness.mapCenter.value).toEqual([8, 9])
  })

  it('exposes preparing and committing phases for application loading feedback', async () => {
    let resolveDestroy
    const destroySimulation = vi.fn(() => new Promise(resolve => { resolveDestroy = resolve }))
    const stored = encodeStoredProject(createEmptyProject('B'), { name: 'B' })
    const harness = createHarness({ projects: { B: stored }, destroySimulation })

    const pending = harness.session.open('B')
    expect(harness.session.transitionPhase.value).toBe('preparing')
    await vi.waitFor(() => {
      expect(harness.session.transitionPhase.value).toBe('committing')
    })

    resolveDestroy({ success: true })
    expect(await pending).toBe(true)
    expect(harness.session.transitionPhase.value).toBe('idle')

    harness.session.dispose()
    expect(harness.session.transitionPhase.value).toBe('disposed')
  })

  it('clears a canceled transition phase when Save As supersedes an open', async () => {
    let resolveDestroy
    const destroySimulation = vi.fn(() => new Promise(resolve => { resolveDestroy = resolve }))
    const stored = encodeStoredProject(createEmptyProject('B'), { name: 'B' })
    const harness = createHarness({ projects: { B: stored }, destroySimulation })

    const pendingOpen = harness.session.open('B')
    await vi.waitFor(() => {
      expect(harness.session.transitionPhase.value).toBe('committing')
    })

    expect(await harness.session.saveAs('C')).toBe(true)
    expect(harness.session.transitionPhase.value).toBe('idle')
    resolveDestroy({ success: true })
    expect(await pendingOpen).toBe(false)
    expect(harness.session.transitionPhase.value).toBe('idle')
    expect(harness.currentProjectName.value).toBe('C')
  })

  it('clears a canceled transition phase when deleting the active project', async () => {
    let resolveDestroy
    const destroySimulation = vi.fn(() => new Promise(resolve => { resolveDestroy = resolve }))
    const stored = encodeStoredProject(createEmptyProject('B'), { name: 'B' })
    const active = encodeStoredProject(createEmptyProject('A'), { name: 'A' })
    const harness = createHarness({ projects: { A: active, B: stored }, destroySimulation })

    const pendingOpen = harness.session.open('B')
    await vi.waitFor(() => {
      expect(harness.session.transitionPhase.value).toBe('committing')
    })

    expect(await harness.session.delete('A', { confirmed: true })).toBe(true)
    expect(harness.session.transitionPhase.value).toBe('idle')
    resolveDestroy({ success: true })
    expect(await pendingOpen).toBe(false)
    expect(harness.session.transitionPhase.value).toBe('idle')
    expect(harness.currentProjectName.value).toBe('')
  })

  it('logs simulation cleanup only when the backend reports success', async () => {
    const stored = encodeStoredProject(createEmptyProject('B'), { name: 'B' })
    const success = createHarness({ projects: { B: stored } })
    expect(await success.session.open('B')).toBe(true)
    expect(success.addLog).toHaveBeenCalledWith(
      'info',
      'Cleaned up existing simulation for: B',
      'System'
    )

    const unsuccessful = createHarness({
      projects: { B: stored },
      destroySimulation: vi.fn(async () => ({ success: false }))
    })
    expect(await unsuccessful.session.open('B')).toBe(true)
    expect(unsuccessful.addLog).not.toHaveBeenCalledWith(
      'info',
      'Cleaned up existing simulation for: B',
      'System'
    )
  })

  it('deleting the active project performs complete teardown and commits an empty session', async () => {
    const harness = createHarness({ projects: { A: encodeStoredProject(createEmptyProject('A'), { name: 'A' }) } })
    expect(await harness.session.delete('A', { confirmed: true })).toBe(true)
    expect(harness.currentProjectName.value).toBe('')
    expect(harness.projectData.value).toEqual(createEmptyProject())
    expect(harness.selectedItem.value).toBeNull()
    expect(harness.selectedType.value).toBeNull()
    expect(harness.calls.reset).toHaveBeenCalledOnce()
    expect(harness.calls.stop).toHaveBeenCalledOnce()
    expect(harness.calls.stopAlive).toHaveBeenCalledOnce()
    expect(harness.calls.closeWindows).toHaveBeenCalledOnce()
    expect(harness.calls.markSaved).toHaveBeenCalledOnce()
    expect(harness.store.clearRecentProjectName).toHaveBeenCalledOnce()
  })

  it('does not overwrite an existing project when an imported version is declined', async () => {
    const original = encodeStoredProject(createEmptyProject('B'), {
      name: 'B',
      platformInfo: { versions: { julia: '1.12', quantumSavory: '0.7', app: '1.6' } }
    })
    const imported = encodeStoredProject(createEmptyProject('Imported B'), {
      name: 'Imported B',
      platformInfo: { versions: { julia: '2.0', quantumSavory: '0.7', app: '1.6' } }
    })
    const harness = createHarness({
      projects: { B: original },
      confirmVersionMismatch: vi.fn(() => false)
    })

    expect(await harness.session.importProject(imported, ' B ')).toBe(false)
    expect(harness.records.get('B')).toEqual(original)
    expect(harness.currentProjectName.value).toBe('A')
    expect(harness.calls.reset).not.toHaveBeenCalled()
    expect(harness.api.destroySimulation).not.toHaveBeenCalled()
  })
})
