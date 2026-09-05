import { nextTick, ref } from 'vue'
import ProjectStore from '../models/ProjectStore'
import { api as sharedApi } from '../utils/ApiConnector'
import {
  createEmptyProject,
  decodeProject,
  encodeProject,
  normalizeProjectName
} from '../utils/projectDocument.js'

export const PROJECT_RENAME_LOCKED_MESSAGE = 'Reset or stop the simulation before renaming the project.'

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
  markAsSaved,
  resetSimulation,
  stopPolling,
  stopAlivePolling,
  closeAllResultWindows,
  hideSlotState = () => {},
  beforeProjectReplacement = () => {},
  canRenameProject = () => true,
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
    return transitionGeneration.value
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

  function assertNameAvailable(name, previousName, overwrite) {
    const targetIsDifferentProject = name !== previousName
      && store.listProjects().includes(name)
    if (targetIsDifferentProject && !overwrite) {
      throw new Error(`A project named "${name}" already exists`)
    }
  }

  function codecContext() {
    return {
      protocolCatalog: () => api.config?.value?.protocolTypes || {},
      backgroundCatalog: () => api.config?.value?.bgNoiseOptions || [],
      defaultMapCenter,
      defaultMapZoom,
    }
  }

  function serializeProjectData(name = currentProjectName.value) {
    return encodeProject(projectData.value, {
      ...codecContext(),
      name,
      map: {
        position: [...mapCenter.value],
        zoom: mapZoom.value
      }
    })
  }

  function deserializeProjectData(data) {
    return decodeProject(data, codecContext()).project
  }

  function stopSessionActivity() {
    stopPolling?.()
    stopAlivePolling?.()
    resetSimulation?.()
    closeAllResultWindows?.()
    hideSlotState?.()
  }

  async function preflightProject(raw) {
    return decodeProject(raw, codecContext())
  }

  async function preflightStoredProject(name) {
    const raw = store.loadProject(name)
    if (!raw) throw new Error(`Failed to load project: ${name}`)
    return preflightProject(raw)
  }

  async function commitCandidate({ name, decoded, demo, persist, generation }) {
    if (generation !== transitionGeneration.value) return false

    if (persist) {
      const encoded = encodeProject(decoded.project, {
        ...codecContext(),
        name,
        map: decoded.map,
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
      net: {
        ...projectData.value.net,
        nodes: [],
        edges: [],
        protocols: [],
      },
    }
    await nextTick()
    if (generation !== transitionGeneration.value) return false

    projectData.value = decoded.project
    projectData.value.name = name
    currentProjectName.value = name
    isDemoProject.value = demo
    mapCenter.value = [...decoded.map.position]
    mapZoom.value = decoded.map.zoom

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
      const name = canonicalName(demoData?.name || 'Demo Project')
      const decoded = decodeProject(demoData, codecContext())
      if (generation !== transitionGeneration.value) return false

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
      const encoded = encodeProject(project, {
        ...codecContext(),
        name,
        map: { position: [...defaultMapCenter], zoom: defaultMapZoom },
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

  async function persistUnderName(name, { overwrite = false, renameCurrent = false } = {}) {
    name = canonicalName(name)
    const previousName = currentProjectName.value
    const previousIsDemo = isDemoProject.value
    if (renameCurrent && !canRenameProject()) {
      throw new Error(PROJECT_RENAME_LOCKED_MESSAGE)
    }
    assertNameAvailable(name, previousName, overwrite)

    const generation = cancelTransition()
    const replacementBarrier = projectReplacementBarrier()
    if (replacementBarrier) await replacementBarrier
    if (
      generation !== transitionGeneration.value
      || currentProjectName.value !== previousName
      || isDemoProject.value !== previousIsDemo
    ) return null
    if (renameCurrent && !canRenameProject()) {
      throw new Error(PROJECT_RENAME_LOCKED_MESSAGE)
    }
    assertNameAvailable(name, previousName, overwrite)
    const encoded = encodeProject(projectData.value, {
      ...codecContext(),
      name,
      map: { position: [...mapCenter.value], zoom: mapZoom.value },
    })
    if (renameCurrent) {
      store.renameProject(previousIsDemo ? null : previousName, name, encoded)
    } else {
      store.saveProject(name, encoded)
      store.setRecentProjectName(name)
    }
    stopSessionActivity()
    clearLogs?.()
    currentProjectName.value = name
    projectData.value.name = name
    isDemoProject.value = false
    markAsSaved?.()
    return name
  }

  async function saveAs(name, { overwrite = false } = {}) {
    try {
      name = await persistUnderName(name, { overwrite })
      if (!name) return false
      addLog?.('info', `Project saved as: ${name}`, 'System')
      return true
    } catch (error) {
      addLog?.('error', `Failed to save project: ${error.message}`, 'System')
      showError(`Failed to save project: ${error.message}`)
      return false
    }
  }

  async function rename(name) {
    const previousName = currentProjectName.value
    try {
      if (!previousName) throw new Error('No project to rename')
      name = canonicalName(name)
      if (name === previousName) return true

      name = await persistUnderName(name, { renameCurrent: true })
      if (!name) return false
      addLog?.('info', `Project renamed from ${previousName} to ${name}`, 'System')
      return true
    } catch (error) {
      addLog?.('error', `Failed to rename project: ${error.message}`, 'System')
      showError(`Failed to rename project: ${error.message}`)
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
      markAsSaved?.()
    }
    addLog?.('warning', `Project deleted: ${name}`, 'System')
    return true
  }

  async function importProject(data, finalName) {
    const name = canonicalName(finalName || data?.name)
    const generation = ++transitionGeneration.value
    transitionPhase.value = 'preparing'
    try {
      const candidate = await preflightProject({ ...data, name })
      if (!candidate || generation !== transitionGeneration.value) return false

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
    rename,
    delete: remove,
    importProject,
    serializeProjectData,
    deserializeProjectData,
    generateCopyName,
    dispose
  }
}
