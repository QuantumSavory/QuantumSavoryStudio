import { nextTick, ref } from 'vue'
import ProjectStore from '../models/ProjectStore'
import { api as sharedApi } from '../utils/ApiConnector'
import {
  createEmptyProject,
  decodeStoredProject,
  encodeStoredProject,
  normalizeProjectName
} from '../utils/projectCodec'

function majorVersion(version) {
  return typeof version === 'string' ? version.split('.')[0] : null
}

export function compareProjectVersions(projectVersions, currentVersions) {
  if (!projectVersions || !currentVersions) return null
  const labels = [
    ['Julia', 'julia'],
    ['QuantumSavory', 'quantumSavory'],
    ['App', 'app']
  ]
  const mismatches = labels.flatMap(([label, key]) => {
    const saved = projectVersions[key]
    const current = currentVersions[key]
    if (!saved || !current || majorVersion(saved) === majorVersion(current)) return []
    return [`${label}: ${saved} vs ${current}`]
  })
  return mismatches.length ? mismatches : null
}

export function useProjectSession({
  projectData,
  currentProjectName,
  isDemoProject,
  selectedItem,
  selectedType,
  mapCenter,
  mapZoom,
  clearLogs,
  addLog,
  getSimulationStatus,
  defaultMapCenter,
  defaultMapZoom,
  minimumTimeStep,
  markAsSaved,
  resetSimulation,
  stopPolling,
  stopAlivePolling,
  closeAllResultWindows,
  hideSlotState = () => {},
  syncLegacyProjectData = () => {},
  beforeProjectReplacement = () => {},
  confirmVersionMismatch = message => window.confirm(message),
  confirmDelete = message => window.confirm(message),
  showError = message => window.alert(message),
  store = ProjectStore,
  api = sharedApi
}) {
  const transitionGeneration = ref(0)
  const transitionPhase = ref('idle')
  let activeCommit = null
  let disposed = false

  function cancelTransition(nextPhase = 'idle') {
    const generation = ++transitionGeneration.value
    const settledPhase = disposed ? 'disposed' : nextPhase
    const pendingCommit = activeCommit?.finished || null
    if (!pendingCommit) {
      transitionPhase.value = settledPhase
      return null
    }
    void pendingCommit.then(() => {
      if (generation === transitionGeneration.value && !activeCommit) {
        transitionPhase.value = settledPhase
      }
    })
    return pendingCommit
  }

  function beginReplacement() {
    if (disposed) return null
    const generation = ++transitionGeneration.value
    const precedingCommit = activeCommit?.finished || null
    if (!precedingCommit) transitionPhase.value = 'preparing'
    return { generation, precedingCommit }
  }

  function ownsPreparation(generation) {
    return !disposed && generation === transitionGeneration.value
  }

  function projectReplacementBarrier() {
    const pending = beforeProjectReplacement()
    return pending && typeof pending.then === 'function' ? pending : null
  }

  function canonicalName(value) {
    const name = normalizeProjectName(value, '')
    if (!name) throw new Error('Project name cannot be empty')
    return name
  }

  function codecContext(storageName) {
    return {
      storageName,
      defaultMapCenter,
      defaultMapZoom,
      minimumTime: 1.0,
      minimumTimeStep
    }
  }

  function currentPlatformInfo() {
    const platformInfo = api.getPlatformInfo()
    return platformInfo && typeof platformInfo === 'object' ? platformInfo : null
  }

  function serializeProjectData(name = currentProjectName.value) {
    return encodeStoredProject(projectData.value, {
      name,
      map: {
        position: [...mapCenter.value],
        zoom: mapZoom.value
      },
      platformInfo: currentPlatformInfo(),
      defaultMapCenter,
      defaultMapZoom
    })
  }

  function deserializeProjectData(data, storageName = data?.name) {
    return decodeStoredProject(data, codecContext(storageName)).project
  }

  function stopSessionActivity() {
    stopPolling?.()
    stopAlivePolling?.()
    resetSimulation?.()
    closeAllResultWindows?.()
    hideSlotState?.()
  }

  async function ensurePlatformInfo() {
    if (!currentPlatformInfo()) {
      await api.fetchPlatformInfo()
    }
    return currentPlatformInfo()
  }

  async function preflightProject(raw, storageName) {
    const decoded = decodeStoredProject(raw, codecContext(storageName))
    const platformInfo = await ensurePlatformInfo()
    const mismatch = compareProjectVersions(decoded.platformInfo?.versions, platformInfo?.versions)
    if (mismatch) {
      const accepted = await confirmVersionMismatch(
        `This project (${decoded.project.name}) was saved with a different version of the software, which could affect simulation behavior.\n\n${mismatch.join('\n')}\n\nDo you want to proceed anyway?`
      )
      if (!accepted) return null
    }
    return { ...decoded, platformInfo: platformInfo || decoded.platformInfo }
  }

  async function preflightStoredProject(name) {
    const raw = store.loadProject(name)
    if (!raw) throw new Error(`Failed to load project: ${name}`)
    return preflightProject(raw, name)
  }

  function preparePersistedCandidate({
    name,
    decoded,
    persistenceMethod,
    demo = false,
    cleanupSimulation = false,
    logCleanup = false,
    successMessages = [],
    refreshStatus = false
  }) {
    const document = encodeStoredProject(decoded.project, {
      name,
      map: decoded.map,
      uiGlobal: decoded.uiGlobal,
      platformInfo: decoded.platformInfo || currentPlatformInfo(),
      defaultMapCenter,
      defaultMapZoom
    })
    const verified = decodeStoredProject(document, codecContext(name))
    return {
      name,
      decoded: verified,
      demo,
      cleanupSimulation,
      logCleanup,
      persistence: { method: persistenceMethod, document },
      successMessages,
      refreshStatus
    }
  }

  async function teardownCollaboration() {
    try {
      const replacementBarrier = projectReplacementBarrier()
      if (replacementBarrier) await replacementBarrier
    } catch (error) {
      console.warn('Failed to release project collaboration before replacement:', error)
    }
  }

  async function commitCandidate(candidate) {
    await teardownCollaboration()
    if (candidate.cleanupSimulation) {
      try {
        const cleanupResult = await api.destroySimulation(candidate.name)
        if (candidate.logCleanup && cleanupResult?.success === true) {
          addLog?.('info', `Cleaned up existing simulation for: ${candidate.name}`, 'System')
        }
      } catch (error) {
        console.warn('Failed to destroy simulation during project replacement:', error)
      }
    }
    if (candidate.persistence) {
      store[candidate.persistence.method](candidate.name, candidate.persistence.document)
      store.setRecentProjectName(candidate.name)
    }
    stopSessionActivity()
    clearLogs?.()
    selectedItem.value = null
    selectedType.value = null

    // Give MapLibre-owned marker components one tick to release the old graph.
    projectData.value = {
      ...projectData.value,
      annotations: [],
      net: { nodes: [], edges: [], protocols: [] }
    }
    await nextTick()

    projectData.value = candidate.decoded.project
    projectData.value.name = candidate.name
    currentProjectName.value = candidate.name
    isDemoProject.value = candidate.demo
    mapCenter.value = [...candidate.decoded.map.position]
    mapZoom.value = candidate.decoded.map.zoom

    syncLegacyProjectData()
    markAsSaved?.()
    for (const [level, message, source = 'System'] of candidate.successMessages) {
      addLog?.(level, message, source)
    }
    if (candidate.refreshStatus) {
      try {
        await getSimulationStatus?.(false)
      } catch (error) {
        console.warn('Failed to refresh simulation status after project replacement:', error)
      }
    }
  }

  function clearFailedBootstrapPointer(name, generation) {
    if (!name || !ownsPreparation(generation)) return
    try {
      if (store.getRecentProjectName() === name) {
        store.clearRecentProjectName()
      }
    } catch (error) {
      console.warn('Failed to clear stale recent-project pointer:', error)
    }
  }

  async function runReplacement({
    prepare,
    bootstrapRecentName = null,
    onError = error => showError(error.message)
  }) {
    const transition = beginReplacement()
    if (!transition) return false
    const { generation, precedingCommit } = transition
    let acquiredCommit = false
    try {
      // Give synchronous candidates the same cancellation/supersession window as
      // candidates that fetch platform metadata or await user confirmation.
      await Promise.resolve()
      if (precedingCommit) await precedingCommit
      if (!ownsPreparation(generation)) return false
      transitionPhase.value = 'preparing'

      const candidate = await prepare()
      if (!ownsPreparation(generation)) return false
      if (!candidate) {
        clearFailedBootstrapPointer(bootstrapRecentName, generation)
        return false
      }

      let finishCommit
      const owner = {
        generation,
        finished: new Promise(resolve => { finishCommit = resolve })
      }
      activeCommit = owner
      acquiredCommit = true
      transitionPhase.value = 'committing'
      try {
        // Ownership is rechecked immediately before this point. Once commit
        // starts it is intentionally irrevocable; newer transitions wait for
        // this owner instead of observing or rolling back a half-torn session.
        await commitCandidate(candidate)
        return true
      } finally {
        if (activeCommit === owner) activeCommit = null
        finishCommit()
        if (ownsPreparation(generation)) transitionPhase.value = 'idle'
      }
    } catch (error) {
      if (ownsPreparation(generation)) {
        clearFailedBootstrapPointer(bootstrapRecentName, generation)
      }
      if (acquiredCommit || ownsPreparation(generation)) onError(error)
      return false
    } finally {
      if (ownsPreparation(generation) && !activeCommit) transitionPhase.value = 'idle'
    }
  }

  function prepareOpen(name) {
    return async () => {
      name = canonicalName(name)
      const decoded = await preflightStoredProject(name)
      if (!decoded) return null
      return preparePersistedCandidate({
        name,
        decoded,
        persistenceMethod: 'openProject',
        cleanupSimulation: true,
        logCleanup: true,
        successMessages: [['info', `Project opened: ${name}`]],
        refreshStatus: true
      })
    }
  }

  function open(name) {
    return runReplacement({ prepare: prepareOpen(name) })
  }

  function restoreRecent(name) {
    return runReplacement({
      prepare: prepareOpen(name),
      bootstrapRecentName: name
    })
  }

  function openDemo(demoData) {
    return runReplacement({
      prepare: async () => {
        const decoded = await preflightProject(demoData)
        if (!decoded) return null
        const name = canonicalName(decoded.project.name)
        return {
          name,
          decoded,
          demo: true,
          cleanupSimulation: true,
          logCleanup: false,
          persistence: null,
          successMessages: [
            ['info', `Demo project loaded: ${name}`],
            ['warning', 'This is a demo project. Use "Save As" to create your own copy.']
          ],
          refreshStatus: true
        }
      }
    })
  }

  function create(name) {
    return runReplacement({
      prepare: async () => {
        name = canonicalName(name)
        return preparePersistedCandidate({
          name,
          decoded: {
            project: createEmptyProject(name),
            map: { position: [...defaultMapCenter], zoom: defaultMapZoom },
            uiGlobal: {
              map: { position: [...defaultMapCenter], zoom: defaultMapZoom }
            },
            platformInfo: currentPlatformInfo()
          },
          persistenceMethod: 'saveProject',
          successMessages: [['info', `New project created: ${name}`]]
        })
      }
    })
  }

  function save() {
    if (activeCommit) return false
    const name = currentProjectName.value
    if (!name) return false
    projectData.value.name = name
    store.saveProject(name, serializeProjectData(name))
    markAsSaved?.()
    return true
  }

  function saveAs(name, { overwrite = false } = {}) {
    return runReplacement({
      prepare: async () => {
        name = canonicalName(name)
        const targetIsDifferentProject = name !== currentProjectName.value
          && store.listProjects().includes(name)
        if (targetIsDifferentProject && !overwrite) {
          throw new Error(`A project named "${name}" already exists`)
        }
        return preparePersistedCandidate({
          name,
          decoded: {
            project: projectData.value,
            map: { position: [...mapCenter.value], zoom: mapZoom.value },
            uiGlobal: { map: { position: [...mapCenter.value], zoom: mapZoom.value } },
            platformInfo: currentPlatformInfo()
          },
          persistenceMethod: 'saveProject',
          successMessages: [['info', `Project saved as: ${name}`]]
        })
      },
      onError: error => {
        addLog?.('error', `Failed to save project: ${error.message}`, 'System')
        showError(`Failed to save project: ${error.message}`)
      }
    })
  }

  async function remove(name, { confirmed = false } = {}) {
    name = canonicalName(name)
    if (!confirmed) {
      const accepted = await confirmDelete(`Are you sure you want to delete the project "${name}"? This action cannot be undone.`)
      if (!accepted) return false
    }

    const pendingCommit = cancelTransition()
    if (pendingCommit) await pendingCommit
    store.deleteProject(name)
    if (currentProjectName.value === name) {
      await teardownCollaboration()
      stopSessionActivity()
      projectData.value = createEmptyProject()
      currentProjectName.value = ''
      isDemoProject.value = false
      selectedItem.value = null
      selectedType.value = null
      mapCenter.value = [...defaultMapCenter]
      mapZoom.value = defaultMapZoom
      store.clearRecentProjectName()
      syncLegacyProjectData()
      markAsSaved?.()
    }
    addLog?.('warning', `Project deleted: ${name}`, 'System')
    return true
  }

  function importProject(data, finalName) {
    return runReplacement({
      prepare: async () => {
        const decoded = await preflightProject(data, finalName)
        if (!decoded) return null
        const name = canonicalName(finalName || decoded.project.name)
        return preparePersistedCandidate({
          name,
          decoded,
          persistenceMethod: 'openProject',
          cleanupSimulation: true
        })
      }
    })
  }

  function generateCopyName(baseName) {
    baseName = canonicalName(baseName)
    const existing = new Set(store.listProjects())
    let candidate = `${baseName} (copy)`
    let counter = 2
    while (existing.has(candidate)) {
      candidate = `${baseName} (copy ${counter++})`
    }
    return candidate
  }

  function dispose() {
    disposed = true
    cancelTransition('disposed')
  }

  return {
    transitionGeneration,
    transitionPhase,
    cancel: cancelTransition,
    open,
    restoreRecent,
    openDemo,
    create,
    save,
    saveAs,
    delete: remove,
    importProject,
    serializeProjectData,
    deserializeProjectData,
    generateCopyName,
    dispose
  }
}
