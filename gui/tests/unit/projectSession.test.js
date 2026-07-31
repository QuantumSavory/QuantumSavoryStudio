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
  beforeProjectReplacement = vi.fn(async () => {}),
  getPlatformInfo = vi.fn(() => ({
    versions: { julia: '1.12', quantumSavory: '0.7', app: '1.6' }
  })),
  fetchPlatformInfo = vi.fn(),
  getSimulationStatus = vi.fn()
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
    syncLegacy: vi.fn(),
    clearLogs: vi.fn(),
    getSimulationStatus,
    beforeProjectReplacement
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
    getPlatformInfo,
    fetchPlatformInfo,
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
    clearLogs: calls.clearLogs,
    addLog,
    getSimulationStatus,
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
    isDemoProject,
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

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function snapshotProtectedState(harness) {
  return {
    project: harness.projectData.value,
    projectJson: JSON.stringify(harness.projectData.value),
    name: harness.currentProjectName.value,
    demo: harness.isDemoProject.value,
    selectedItem: harness.selectedItem.value,
    selectedType: harness.selectedType.value,
    mapCenter: [...harness.mapCenter.value],
    mapZoom: harness.mapZoom.value,
    records: JSON.stringify([...harness.records.entries()]),
    recent: window.localStorage.getItem('recentProjectName'),
    effects: {
      barrier: harness.calls.beforeProjectReplacement.mock.calls.length,
      destroy: harness.api.destroySimulation.mock.calls.length,
      save: harness.store.saveProject.mock.calls.length,
      open: harness.store.openProject.mock.calls.length,
      recent: harness.store.setRecentProjectName.mock.calls.length,
      reset: harness.calls.reset.mock.calls.length,
      stop: harness.calls.stop.mock.calls.length,
      stopAlive: harness.calls.stopAlive.mock.calls.length,
      closeWindows: harness.calls.closeWindows.mock.calls.length,
      hide: harness.calls.hide.mock.calls.length,
      clearLogs: harness.calls.clearLogs.mock.calls.length,
      markSaved: harness.calls.markSaved.mock.calls.length,
      syncLegacy: harness.calls.syncLegacy.mock.calls.length
    }
  }
}

function expectProtectedState(harness, snapshot) {
  expect(harness.projectData.value).toBe(snapshot.project)
  expect(JSON.stringify(harness.projectData.value)).toBe(snapshot.projectJson)
  expect(harness.currentProjectName.value).toBe(snapshot.name)
  expect(harness.isDemoProject.value).toBe(snapshot.demo)
  expect(harness.selectedItem.value).toBe(snapshot.selectedItem)
  expect(harness.selectedType.value).toBe(snapshot.selectedType)
  expect(harness.mapCenter.value).toEqual(snapshot.mapCenter)
  expect(harness.mapZoom.value).toBe(snapshot.mapZoom)
  expect(JSON.stringify([...harness.records.entries()])).toBe(snapshot.records)
  expect(window.localStorage.getItem('recentProjectName')).toBe(snapshot.recent)
  expect({
    barrier: harness.calls.beforeProjectReplacement.mock.calls.length,
    destroy: harness.api.destroySimulation.mock.calls.length,
    save: harness.store.saveProject.mock.calls.length,
    open: harness.store.openProject.mock.calls.length,
    recent: harness.store.setRecentProjectName.mock.calls.length,
    reset: harness.calls.reset.mock.calls.length,
    stop: harness.calls.stop.mock.calls.length,
    stopAlive: harness.calls.stopAlive.mock.calls.length,
    closeWindows: harness.calls.closeWindows.mock.calls.length,
    hide: harness.calls.hide.mock.calls.length,
    clearLogs: harness.calls.clearLogs.mock.calls.length,
    markSaved: harness.calls.markSaved.mock.calls.length,
    syncLegacy: harness.calls.syncLegacy.mock.calls.length
  }).toEqual(snapshot.effects)
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

  it.each([
    {
      label: 'saved open',
      seedTarget: true,
      run: (harness) => harness.session.open('B'),
      persistence: 'open',
      cleanup: 1,
      status: 1,
      demo: false
    },
    {
      label: 'import',
      run: (harness, document) => harness.session.importProject(document, 'B'),
      persistence: 'open',
      cleanup: 1,
      status: 0,
      demo: false
    },
    {
      label: 'demo',
      run: (harness, document) => harness.session.openDemo(document),
      persistence: null,
      cleanup: 1,
      status: 1,
      demo: true
    },
    {
      label: 'create',
      run: harness => harness.session.create('B'),
      persistence: 'save',
      cleanup: 0,
      status: 0,
      demo: false
    },
    {
      label: 'Save As',
      run: harness => harness.session.saveAs('B'),
      persistence: 'save',
      cleanup: 0,
      status: 0,
      demo: false
    }
  ])('keeps protected state unchanged until one $label candidate commits', async ({
    seedTarget,
    run,
    persistence,
    cleanup,
    status,
    demo
  }) => {
    const activeDocument = encodeStoredProject(createEmptyProject('A'), { name: 'A' })
    const candidateProject = createEmptyProject('B')
    candidateProject.description = 'prepared candidate'
    const candidateDocument = encodeStoredProject(candidateProject, {
      name: 'B',
      map: { position: [8, 9], zoom: 10 }
    })
    const barrier = deferred()
    const beforeProjectReplacement = vi.fn(() => barrier.promise)
    const projects = { A: activeDocument }
    if (seedTarget) projects.B = candidateDocument
    const harness = createHarness({ projects, beforeProjectReplacement })
    harness.projectData.value.description = 'unsaved active work'
    window.localStorage.setItem('recentProjectName', 'A')
    const before = snapshotProtectedState(harness)

    const pending = run(harness, candidateDocument)
    await vi.waitFor(() => expect(beforeProjectReplacement).toHaveBeenCalledOnce())

    // The owner has entered commit and requested collaboration release, but no
    // active-session or project-document effect can precede that barrier.
    before.effects.barrier = 1
    expectProtectedState(harness, before)

    barrier.resolve()
    expect(await pending).toBe(true)
    expect(harness.currentProjectName.value).toBe('B')
    expect(harness.projectData.value.name).toBe('B')
    expect(harness.isDemoProject.value).toBe(demo)
    expect(harness.selectedItem.value).toBeNull()
    expect(harness.selectedType.value).toBeNull()
    expect(beforeProjectReplacement).toHaveBeenCalledOnce()
    expect(harness.api.destroySimulation).toHaveBeenCalledTimes(cleanup)
    expect(harness.store.openProject).toHaveBeenCalledTimes(persistence === 'open' ? 1 : 0)
    expect(harness.store.saveProject).toHaveBeenCalledTimes(persistence === 'save' ? 1 : 0)
    expect(harness.store.setRecentProjectName).toHaveBeenCalledTimes(persistence ? 1 : 0)
    expect(window.localStorage.getItem('recentProjectName')).toBe(persistence ? 'B' : 'A')
    expect(harness.calls.getSimulationStatus).toHaveBeenCalledTimes(status)
    expect(harness.calls.reset).toHaveBeenCalledOnce()
    expect(harness.calls.stop).toHaveBeenCalledOnce()
    expect(harness.calls.stopAlive).toHaveBeenCalledOnce()
    expect(harness.calls.closeWindows).toHaveBeenCalledOnce()
    expect(harness.calls.hide).toHaveBeenCalledOnce()
    expect(harness.calls.clearLogs).toHaveBeenCalledOnce()
    expect(harness.calls.syncLegacy).toHaveBeenCalledOnce()
    expect(harness.calls.markSaved).toHaveBeenCalledOnce()
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
    {
      label: 'saved open',
      waitsForConfirmation: true,
      seedTarget: true,
      run: harness => harness.session.open('B')
    },
    {
      label: 'import',
      waitsForConfirmation: true,
      run: (harness, document) => harness.session.importProject(document, 'B')
    },
    {
      label: 'demo',
      waitsForConfirmation: true,
      run: (harness, document) => harness.session.openDemo(document)
    },
    {
      label: 'create',
      waitsForConfirmation: false,
      run: harness => harness.session.create('B')
    },
    {
      label: 'Save As',
      waitsForConfirmation: false,
      run: harness => harness.session.saveAs('B')
    }
  ])('cancels $label candidate work without protected-state effects', async ({
    waitsForConfirmation,
    seedTarget,
    run
  }) => {
    const mismatch = deferred()
    const confirmVersionMismatch = vi.fn(() => mismatch.promise)
    const candidateDocument = encodeStoredProject(createEmptyProject('B'), {
      name: 'B',
      platformInfo: {
        versions: { julia: '2.0', quantumSavory: '0.7', app: '1.6' }
      }
    })
    const projects = {
      A: encodeStoredProject(createEmptyProject('A'), { name: 'A' })
    }
    if (seedTarget) projects.B = candidateDocument
    const harness = createHarness({ projects, confirmVersionMismatch })
    harness.projectData.value.description = 'must survive cancellation'
    window.localStorage.setItem('recentProjectName', 'A')
    const before = snapshotProtectedState(harness)

    const pending = run(harness, candidateDocument)
    if (waitsForConfirmation) {
      await vi.waitFor(() => expect(confirmVersionMismatch).toHaveBeenCalledOnce())
      expectProtectedState(harness, before)
    }
    harness.session.cancel()
    if (waitsForConfirmation) mismatch.resolve(true)

    expect(await pending).toBe(false)
    expectProtectedState(harness, before)
    expect(harness.session.transitionPhase.value).toBe('idle')
    expect(harness.showError).not.toHaveBeenCalled()
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

  it.each([
    ['import', (harness, document) => harness.session.importProject(document)],
    ['demo', (harness, document) => harness.session.openDemo(document)],
  ])('admits a raw %s name before normalization or platform lookup', async (
    _operation,
    run,
  ) => {
    const document = encodeStoredProject(createEmptyProject('B'), { name: 'B' })
    document.name = '   '
    const harness = createHarness()
    harness.api.getPlatformInfo = vi.fn(() => null)

    expect(await run(harness, document)).toBe(false)

    expect(harness.showError).toHaveBeenCalledWith(
      expect.stringMatching(/schema validation.*\/name/i),
    )
    expect(harness.api.fetchPlatformInfo).not.toHaveBeenCalled()
    expect(harness.api.destroySimulation).not.toHaveBeenCalled()
    expect(harness.store.saveProject).not.toHaveBeenCalled()
    expect(harness.store.openProject).not.toHaveBeenCalled()
  })

  it.each([
    ['open', (harness, _document) => harness.session.open('B'), true],
    ['import', (harness, document) => harness.session.importProject(document, 'B'), false],
    ['demo', (harness, document) => harness.session.openDemo(document), false],
  ])('preserves protected state when %s platform preflight fails', async (
    _operation,
    run,
    stored,
  ) => {
    const document = encodeStoredProject(createEmptyProject('B'), { name: 'B' })
    const fetchPlatformInfo = vi.fn(async () => {
      throw new Error('platform unavailable')
    })
    const harness = createHarness({
      projects: stored ? { B: document } : {},
      getPlatformInfo: vi.fn(() => null),
      fetchPlatformInfo
    })
    window.localStorage.setItem('recentProjectName', 'A')
    const before = snapshotProtectedState(harness)

    expect(await run(harness, document)).toBe(false)

    expectProtectedState(harness, before)
    expect(fetchPlatformInfo).toHaveBeenCalledOnce()
    expect(harness.showError).toHaveBeenCalledWith('platform unavailable')
  })

  it.each([
    ['automatic bootstrap restore', 'restoreRecent', true],
    ['ordinary saved open', 'open', false]
  ])('%s preserves an invalid stored document and has the scoped pointer policy', async (
    _label,
    operation,
    clearsPointer
  ) => {
    const invalidDocument = encodeStoredProject(createEmptyProject('B'), { name: 'B' })
    invalidDocument.schemaVersion = PROJECT_SCHEMA_VERSION - 1
    const harness = createHarness({ projects: { B: invalidDocument } })
    window.localStorage.setItem('recentProjectName', 'B')
    const before = snapshotProtectedState(harness)

    expect(await harness.session[operation]('B')).toBe(false)

    before.recent = clearsPointer ? null : 'B'
    expectProtectedState(harness, before)
    expect(harness.records.get('B')).toEqual(invalidDocument)
    expect(harness.store.clearRecentProjectName).toHaveBeenCalledTimes(clearsPointer ? 1 : 0)
    expect(harness.showError).toHaveBeenCalledWith(
      expect.stringMatching(/schema validation.*schemaVersion/i)
    )
  })

  it('does not clear a bootstrap pointer after that restore becomes stale', async () => {
    const confirmation = deferred()
    const confirmVersionMismatch = vi.fn(() => confirmation.promise)
    const stored = encodeStoredProject(createEmptyProject('Old Recent'), {
      name: 'Old Recent',
      platformInfo: {
        versions: { julia: '2.0', quantumSavory: '0.7', app: '1.6' }
      }
    })
    const harness = createHarness({
      projects: { 'Old Recent': stored },
      confirmVersionMismatch
    })
    window.localStorage.setItem('recentProjectName', 'Old Recent')
    const storedBefore = JSON.stringify(harness.records.get('Old Recent'))

    const restoring = harness.session.restoreRecent('Old Recent')
    await vi.waitFor(() => expect(confirmVersionMismatch).toHaveBeenCalledOnce())
    expect(await harness.session.create('User Project')).toBe(true)
    confirmation.resolve(true)

    expect(await restoring).toBe(false)
    expect(harness.currentProjectName.value).toBe('User Project')
    expect(window.localStorage.getItem('recentProjectName')).toBe('User Project')
    expect(JSON.stringify(harness.records.get('Old Recent'))).toBe(storedBefore)
    expect(harness.store.clearRecentProjectName).not.toHaveBeenCalled()
    expect(harness.api.destroySimulation).not.toHaveBeenCalled()
    expect(harness.calls.reset).toHaveBeenCalledOnce()
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

  it('queues Save As behind an acquired open commit', async () => {
    let resolveDestroy
    const destroySimulation = vi.fn(() => new Promise(resolve => { resolveDestroy = resolve }))
    const stored = encodeStoredProject(createEmptyProject('B'), { name: 'B' })
    const harness = createHarness({ projects: { B: stored }, destroySimulation })

    const pendingOpen = harness.session.open('B')
    await vi.waitFor(() => {
      expect(harness.session.transitionPhase.value).toBe('committing')
    })

    const pendingSaveAs = harness.session.saveAs('C')
    expect(harness.currentProjectName.value).toBe('A')
    expect(harness.records.has('C')).toBe(false)
    expect(harness.session.transitionPhase.value).toBe('committing')

    resolveDestroy({ success: true })
    expect(await pendingOpen).toBe(true)
    expect(await pendingSaveAs).toBe(true)
    expect(harness.session.transitionPhase.value).toBe('idle')
    expect(harness.currentProjectName.value).toBe('C')
    expect(harness.store.openProject).toHaveBeenCalledOnce()
    expect(harness.store.saveProject).toHaveBeenCalledOnce()
    expect(harness.calls.reset).toHaveBeenCalledTimes(2)
  })

  it('lets an acquired commit finish before deleting its former active project', async () => {
    let resolveDestroy
    const destroySimulation = vi.fn(() => new Promise(resolve => { resolveDestroy = resolve }))
    const stored = encodeStoredProject(createEmptyProject('B'), { name: 'B' })
    const active = encodeStoredProject(createEmptyProject('A'), { name: 'A' })
    const harness = createHarness({ projects: { A: active, B: stored }, destroySimulation })

    const pendingOpen = harness.session.open('B')
    await vi.waitFor(() => {
      expect(harness.session.transitionPhase.value).toBe('committing')
    })

    const pendingDelete = harness.session.delete('A', { confirmed: true })
    expect(harness.records.has('A')).toBe(true)
    expect(harness.currentProjectName.value).toBe('A')

    resolveDestroy({ success: true })
    expect(await pendingOpen).toBe(true)
    expect(await pendingDelete).toBe(true)
    expect(harness.session.transitionPhase.value).toBe('idle')
    expect(harness.currentProjectName.value).toBe('B')
    expect(harness.records.has('A')).toBe(false)
    expect(harness.records.has('B')).toBe(true)
    expect(harness.calls.reset).toHaveBeenCalledOnce()
  })

  it('does not roll back an acquired commit when cancellation arrives mid-teardown', async () => {
    const cleanup = deferred()
    const stored = encodeStoredProject(createEmptyProject('B'), { name: 'B' })
    const harness = createHarness({
      projects: { B: stored },
      destroySimulation: vi.fn(() => cleanup.promise)
    })

    const pending = harness.session.open('B')
    await vi.waitFor(() => {
      expect(harness.session.transitionPhase.value).toBe('committing')
    })
    harness.session.cancel()
    expect(harness.currentProjectName.value).toBe('A')
    expect(harness.session.transitionPhase.value).toBe('committing')

    cleanup.resolve({ success: true })
    expect(await pending).toBe(true)
    await vi.waitFor(() => expect(harness.session.transitionPhase.value).toBe('idle'))
    expect(harness.currentProjectName.value).toBe('B')
    expect(harness.store.openProject).toHaveBeenCalledOnce()
    expect(harness.calls.reset).toHaveBeenCalledOnce()
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
