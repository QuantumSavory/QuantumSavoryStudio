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

  function cancelTransition(nextPhase = 'idle') {
    transitionGeneration.value += 1
    transitionPhase.value = nextPhase
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
    return { ...decoded, platformInfo }
  }

  async function preflightStoredProject(name) {
    const raw = store.loadProject(name)
    if (!raw) throw new Error(`Failed to load project: ${name}`)
    return preflightProject(raw, name)
  }

  async function commitCandidate({ name, decoded, demo, persist, generation }) {
    if (generation !== transitionGeneration.value) return false

    if (persist) {
      const encoded = encodeStoredProject(decoded.project, {
        name,
        map: decoded.map,
        uiGlobal: decoded.uiGlobal,
        platformInfo: decoded.platformInfo || currentPlatformInfo(),
        defaultMapCenter,
        defaultMapZoom
      })
      store.openProject(name, encoded)
      store.setRecentProjectName(name)
    }
    if (generation !== transitionGeneration.value) return false

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
    if (generation !== transitionGeneration.value) return false

    projectData.value = decoded.project
    projectData.value.name = name
    currentProjectName.value = name
    isDemoProject.value = demo
    mapCenter.value = [...decoded.map.position]
    mapZoom.value = decoded.map.zoom

    syncLegacyProjectData()
    markAsSaved?.()
    return true
  }

  async function open(name) {
    name = canonicalName(name)
    const generation = ++transitionGeneration.value
    transitionPhase.value = 'preparing'
    try {
      const candidate = await preflightStoredProject(name)
      if (!candidate || generation !== transitionGeneration.value) return false

      transitionPhase.value = 'committing'
      const replacementBarrier = projectReplacementBarrier()
      if (replacementBarrier) await replacementBarrier
      if (generation !== transitionGeneration.value) return false
      try {
        const cleanupResult = await api.destroySimulation(name)
        if (cleanupResult?.success === true) {
          addLog?.('info', `Cleaned up existing simulation for: ${name}`, 'System')
        }
      } catch (error) {
        console.warn('Failed to destroy simulation on project load:', error)
      }
      if (generation !== transitionGeneration.value) return false

      if (!(await commitCandidate({ name, decoded: candidate, demo: false, persist: true, generation }))) return false
      addLog?.('info', `Project opened: ${name}`, 'System')
      await getSimulationStatus?.(false)
      return true
    } catch (error) {
      if (generation === transitionGeneration.value) showError(error.message)
      return false
    } finally {
      if (generation === transitionGeneration.value) transitionPhase.value = 'idle'
    }
  }

  async function openDemo(demoData) {
    const generation = ++transitionGeneration.value
    transitionPhase.value = 'preparing'
    try {
      const decoded = await preflightProject(demoData)
      if (!decoded || generation !== transitionGeneration.value) return false
      const name = canonicalName(decoded.project.name)

      transitionPhase.value = 'committing'
      const replacementBarrier = projectReplacementBarrier()
      if (replacementBarrier) await replacementBarrier
      if (generation !== transitionGeneration.value) return false
      try {
        await api.destroySimulation(name)
      } catch (error) {
        console.warn('Failed to destroy simulation on demo load:', error)
      }
      if (generation !== transitionGeneration.value) return false

      if (!(await commitCandidate({ name, decoded, demo: true, persist: false, generation }))) return false
      if (generation !== transitionGeneration.value) return false
      addLog?.('info', `Demo project loaded: ${name}`, 'System')
      addLog?.('warning', 'This is a demo project. Use "Save As" to create your own copy.', 'System')
      await getSimulationStatus?.(false)
      return true
    } catch (error) {
      if (generation === transitionGeneration.value) showError(error.message)
      return false
    } finally {
      if (generation === transitionGeneration.value) transitionPhase.value = 'idle'
    }
  }

  async function create(name) {
    name = canonicalName(name)
    const generation = ++transitionGeneration.value
    transitionPhase.value = 'committing'
    try {
      const replacementBarrier = projectReplacementBarrier()
      if (replacementBarrier) await replacementBarrier
      if (generation !== transitionGeneration.value) return false
      const project = createEmptyProject(name)
      const encoded = encodeStoredProject(project, {
        name,
        map: { position: [...defaultMapCenter], zoom: defaultMapZoom },
        platformInfo: currentPlatformInfo(),
        defaultMapCenter,
        defaultMapZoom
      })
      store.saveProject(name, encoded)
      store.setRecentProjectName(name)
      if (generation !== transitionGeneration.value) return false

      stopSessionActivity()
      clearLogs?.()
      selectedItem.value = null
      selectedType.value = null
      projectData.value = project
      currentProjectName.value = name
      isDemoProject.value = false
      mapCenter.value = [...defaultMapCenter]
      mapZoom.value = defaultMapZoom
      syncLegacyProjectData()
      markAsSaved?.()
      addLog?.('info', `New project created: ${name}`, 'System')
      return true
    } catch (error) {
      if (generation === transitionGeneration.value) showError(error.message)
      return false
    } finally {
      if (generation === transitionGeneration.value) transitionPhase.value = 'idle'
    }
  }

  function save() {
    const name = currentProjectName.value
    if (!name) return false
    projectData.value.name = name
    store.saveProject(name, serializeProjectData(name))
    markAsSaved?.()
    return true
  }

  async function saveAs(name, { overwrite = false } = {}) {
    try {
      name = canonicalName(name)
      const targetIsDifferentProject = name !== currentProjectName.value
        && store.listProjects().includes(name)
      if (targetIsDifferentProject && !overwrite) {
        throw new Error(`A project named "${name}" already exists`)
      }
      cancelTransition()
      const replacementBarrier = projectReplacementBarrier()
      if (replacementBarrier) await replacementBarrier
      const encoded = encodeStoredProject(projectData.value, {
        name,
        map: { position: [...mapCenter.value], zoom: mapZoom.value },
        platformInfo: currentPlatformInfo(),
        defaultMapCenter,
        defaultMapZoom
      })
      store.saveProject(name, encoded)
      store.setRecentProjectName(name)
      stopSessionActivity()
      clearLogs?.()
      currentProjectName.value = name
      projectData.value.name = name
      isDemoProject.value = false
      syncLegacyProjectData()
      markAsSaved?.()
      addLog?.('info', `Project saved as: ${name}`, 'System')
      return true
    } catch (error) {
      addLog?.('error', `Failed to save project: ${error.message}`, 'System')
      showError(`Failed to save project: ${error.message}`)
      return false
    }
  }

  async function remove(name, { confirmed = false } = {}) {
    name = canonicalName(name)
    if (!confirmed) {
      const accepted = await confirmDelete(`Are you sure you want to delete the project "${name}"? This action cannot be undone.`)
      if (!accepted) return false
    }

    store.deleteProject(name)
    if (currentProjectName.value === name) {
      cancelTransition()
      const replacementBarrier = projectReplacementBarrier()
      if (replacementBarrier) await replacementBarrier
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

  async function importProject(data, finalName) {
    const generation = ++transitionGeneration.value
    transitionPhase.value = 'preparing'
    try {
      const candidate = await preflightProject(data, finalName)
      if (!candidate || generation !== transitionGeneration.value) return false
      const name = canonicalName(finalName || candidate.project.name)

      transitionPhase.value = 'committing'
      const replacementBarrier = projectReplacementBarrier()
      if (replacementBarrier) await replacementBarrier
      if (generation !== transitionGeneration.value) return false
      try {
        await api.destroySimulation(name)
      } catch (error) {
        console.warn('Failed to destroy simulation on project import:', error)
      }
      if (generation !== transitionGeneration.value) return false

      return await commitCandidate({ name, decoded: candidate, demo: false, persist: true, generation })
    } catch (error) {
      if (generation === transitionGeneration.value) showError(error.message)
      return false
    } finally {
      if (generation === transitionGeneration.value) transitionPhase.value = 'idle'
    }
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
    cancelTransition('disposed')
  }

  return {
    transitionGeneration,
    transitionPhase,
    open,
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
