<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, provide, watch } from 'vue'
import BaseMap from './components/map/BaseMap.vue'
import NodePanel from './components/panels/NodePanel.vue'
import ProjectStore from './models/ProjectStore.js'
import NodeListPanel from './components/panels/NodeListPanel.vue'
import RunnerPanel from './components/panels/RunnerPanel.vue'
import FloatingProtocolsPanel from './components/panels/FloatingProtocolsPanel.vue'
import { api } from './utils/ApiConnector'
import {JsonViewer} from "vue3-json-viewer"
import { generateUUid } from './utils/Utils'
//import "vue3-json-viewer/dist/vue3-json-viewer.css";
import TieredMenu from 'primevue/tieredmenu';
import {
  Braces,
  Check,
  ChevronRight,
  Copy,
  CopyPlus,
  Download,
  FileJson,
  FilePlus2,
  FileUp,
  FolderOpen,
  Info,
  Library,
  LoaderCircle,
  Menu as MenuIcon,
  PanelRightClose,
  PanelRightOpen,
  Save,
  X
} from '@lucide/vue'
import EdgeListPanel from './components/panels/EdgeListPanel.vue'
import EdgePanel from './components/panels/EdgePanel.vue'
import AnnotationPanel from './components/panels/AnnotationPanel.vue'
import BottomPanel from './components/panels/BottomPanel.vue'
import RightSidebarResizer from './components/RightSidebarResizer.vue'
import ProjectNameDialog from './components/ProjectNameDialog.vue'
import ImportConflictDialog from './components/ImportConflictDialog.vue'
import OpenProjectDialog from './components/OpenProjectDialog.vue'
import AboutModal from './components/AboutModal.vue'
import SystemInformationDialog from './components/SystemInformationDialog.vue'
import UnsavedChangesDialog from './components/UnsavedChangesDialog.vue'
import AlertModal from './components/AlertModal.vue'
import ConfirmModal from './components/ConfirmModal.vue'
import RepeaterChainDialog from './components/RepeaterChainDialog.vue'
import StarNetworkDialog from './components/StarNetworkDialog.vue'
import GraphNetworkDialog from './components/GraphNetworkDialog.vue'
import VoidPanel from './components/panels/VoidPanel.vue'
import ResultsView from './components/panels/ResultsView.vue'
import LucideMenuIcon from './components/LucideMenuIcon.vue'
import SmallScreenWarning from './components/SmallScreenWarning.vue'
import PanicReportDialog from './components/PanicReportDialog.vue'

// Import composables
import { useSimulationController } from './composables/useSimulationController.js'
import { usePanelLayout } from './composables/usePanelLayout.js'
import { useWindowManagement } from './composables/useWindowManagement.js'
import { useNodeEdgeOperations } from './composables/useNodeEdgeOperations.js'
import { useProjectSession } from './composables/useProjectSession.js'
import { useImportExport } from './composables/useImportExport.js'
import { useAppState } from './composables/useAppState.js'
import { useUnsavedChanges } from './composables/useUnsavedChanges.js'
import {
  EDITOR_DRAFT_REGISTRY_KEY,
  createEditorDraftRegistry
} from './composables/editorDraftRegistry.js'
import { useShellGeometry } from './composables/useShellGeometry.js'
import { applicationLoadingMessage } from './composables/applicationLoading.js'

// Import utils
import { validatePayload } from './utils/projectHelpers.js'
import { isEntangledStateStillValid } from './utils/SlotConnectionUtils.js'
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  createEmptyProject
} from './utils/projectDocument.js'
import {
  toScriptExportPayloadFromSimulationPayload,
  toSimulationPayload
} from './utils/simulationPayload.js'
import { UI_SERVICES_KEY } from './composables/uiServices.js'
import { generateRepeaterChain } from './utils/repeaterChain.js'
import { generateStarNetwork } from './utils/starNetwork.js'
import { generateGraphNetwork, GRAPH_TOPOLOGIES } from './utils/graphNetwork.js'
import { DesignCommandService } from './domain/design/DesignCommandService.js'
import { McpControlClient } from './features/mcp/McpControlClient.js'
import { McpEditorBridge } from './features/mcp/McpEditorBridge.js'
import { createSimulationControllerAdapter } from './features/mcp/simulationControllerAdapter.js'
import { frontendBuildInfo } from './utils/frontendBuildInfo.js'
import {
  areConsecutiveLogsEqual,
  normalizeLogGroup,
  normalizeLogSeverity,
  normalizeLogSource,
  parseRawLogDetails
} from './utils/logRecords.js'

// Import demo projects
import demo1 from './demos/1.Entangler.Example.json'
import demo2 from './demos/2.Entangler.Example.with.consumer.json'


const baseMapInstance = ref(null);
const menuButtonRef = ref(null)
const applicationMetadataPending = ref(true)
const mapInitializationPending = ref(true)

const TIME_STEP = 0.1;

// Initialize composables
const projectData = ref(createEmptyProject())
const editorDraftRegistry = createEditorDraftRegistry()
const markProjectDirtyRef = ref(() => {})
provide(EDITOR_DRAFT_REGISTRY_KEY, editorDraftRegistry)
const curveEditingEnabled = ref(false)
const showPhysicalBadges = ref(true)
const annotationCreationEnabled = ref(false)
const designInteractionCount = ref(0)

function updateDesignInteractionBusy(busy) {
  designInteractionCount.value = Math.max(
    0,
    designInteractionCount.value + (busy ? 1 : -1),
  )
}

// Required variables and functions for composables
// Log management functions
const applicationLogs = ref([])
const maxLogs = ref(1000)
const logsResetKey = ref(0)
const applicationLogIds = new Map()

function rememberApplicationLogId(id, logEntry) {
  if (!id) return
  applicationLogIds.delete(id)
  applicationLogIds.set(id, logEntry)
  while (applicationLogIds.size > maxLogs.value) {
    applicationLogIds.delete(applicationLogIds.keys().next().value)
  }
}

function addLog(level, message, source = 'App', extendedInfo = null, options = {}) {
  const normalizedLevel = normalizeLogSeverity(level)
  const normalizedSource = normalizeLogSource(source)
  const hasStableId = options.id !== undefined
    && options.id !== null
    && String(options.id).length > 0
  const stableId = hasStableId ? String(options.id) : null

  if (stableId) {
    const existing = applicationLogIds.get(stableId)
    if (existing) return existing
  }

  const suppliedRaw = options.raw ?? parseRawLogDetails(extendedInfo)
  const rawGroup = suppliedRaw && typeof suppliedRaw === 'object' && !Array.isArray(suppliedRaw)
    ? suppliedRaw.group
    : null
  const normalizedGroup = normalizedSource.source === 'Simulator'
    ? normalizeLogGroup(options.group ?? rawGroup)
    : null
  const incomingLog = {
    level: normalizedLevel,
    message,
    source: normalizedSource.source,
    subsystem: normalizedSource.subsystem,
    group: normalizedGroup
  }

  // Check if this message is the same as the last log entry
  const lastLog = applicationLogs.value[applicationLogs.value.length - 1];
  if (
    !stableId
    && lastLog
    && areConsecutiveLogsEqual(lastLog, incomingLog)
  ) {
    // Update the timestamp of the existing log entry
    lastLog.timestamp = options.timestamp || new Date().toISOString();
    lastLog.count = (lastLog.count || 1) + 1;
    rememberApplicationLogId(stableId, lastLog)
    return lastLog;
  }

  const raw = suppliedRaw && typeof suppliedRaw === 'object' && !Array.isArray(suppliedRaw)
    ? { ...suppliedRaw }
    : suppliedRaw === null
      ? {}
      : { details: suppliedRaw }
  raw.source ??= normalizedSource.source
  raw.severity ??= normalizedLevel
  raw.message ??= message
  if (normalizedSource.subsystem) raw.subsystem ??= normalizedSource.subsystem

  const logEntry = {
    id: stableId || generateUUid('log'),
    timestamp: options.timestamp || new Date().toISOString(),
    level: normalizedLevel,
    message,
    source: normalizedSource.source,
    subsystem: normalizedSource.subsystem,
    group: normalizedGroup,
    extendedInfo,
    raw,
    fullMessage: options.fullMessage || null,
    exceptionType: options.exceptionType || null,
    stacktrace: options.stacktrace || null,
    count: 1
  };
  
  applicationLogs.value.push(logEntry);
  const storedLogEntry = applicationLogs.value[applicationLogs.value.length - 1]
  rememberApplicationLogId(stableId, storedLogEntry)
  
  // Keep only the last maxLogs entries
  if (applicationLogs.value.length > maxLogs.value) {
    const removedLogs = new Set(applicationLogs.value.slice(0, -maxLogs.value))
    for (const [id, indexedLog] of applicationLogIds) {
      if (removedLogs.has(indexedLog)) applicationLogIds.delete(id)
    }
    applicationLogs.value = applicationLogs.value.slice(-maxLogs.value);
  }

  return storedLogEntry
}

const activePanic = ref(null)
const platformInfo = computed(() => {
  const cachedPlatformInfo = api.getPlatformInfo()
  return cachedPlatformInfo && typeof cachedPlatformInfo === 'object' ? cachedPlatformInfo : {}
})
const showRepeaterChainDialog = ref(false)
const showStarNetworkDialog = ref(false)
const showGraphNetworkDialog = ref(false)
const confirmationRequest = ref(null)

function confirmAction({ title, message, confirmButtonText = 'Confirm', dangerous = false }) {
  return new Promise(resolve => {
    confirmationRequest.value?.resolve(false)
    confirmationRequest.value = { title, message, confirmButtonText, dangerous, resolve }
  })
}

function resolveConfirmation(result) {
  const request = confirmationRequest.value
  confirmationRequest.value = null
  request?.resolve(result)
}

function projectDocumentContext() {
  return {
    protocolCatalog: () => api.config.value.protocolTypes || {},
    backgroundCatalog: () => api.config.value.bgNoiseOptions || [],
  }
}

// Minimized project data - cleans up project data for API calls
const minimizedProjectData = computed(() => toSimulationPayload(
  projectData.value,
  projectDocumentContext(),
))
const exportScriptPayload = computed(() => toScriptExportPayloadFromSimulationPayload(
  minimizedProjectData.value,
  projectData.value.simulationConfig
))

// Window management is the authoritative owner of result-window state.
const {
  resultWindows,
  showResultsView,
  closeResultWindow,
  closeAllResultWindows,
  bringWindowToFront,
  updateWindowPosition,
  updateWindowSize,
  registerWindowRef,
  unregisterWindowRef,
  refreshAllWindows,
  clearAllPlots
} = useWindowManagement()

provide(UI_SERVICES_KEY, {
  getProjectData: () => projectData.value,
  getDialogFallbackFocus: () => menuButtonRef.value,
  showAlert,
  showResultsView,
  showEntangledSlots,
  hideSlotState
})

/**
 * Check if the currently displayed entangled state still exists in the new response
 * If not, hide the entanglement visualization and close associated result windows
 * @param {Object} response - The get_state response containing new entanglements
 */
function checkAndHideInvalidEntangledStates(response) {
  if (!baseMapInstance.value || !response?.state?.slots?.entanglements) {
    return
  }
  
  try {
    // Get the currently active slot connection state from BaseMap
    const activeState = baseMapInstance.value.getActiveSlotConnectionState()
    
    if (!activeState) {
      // No state currently displayed, nothing to check
      return
    }
    
    // Get new entanglements from response
    const newEntanglements = response.state.slots.entanglements
    
    // Check if the displayed state still exists
    const isStillValid = isEntangledStateStillValid(activeState, newEntanglements)
    
    if (!isStillValid) {
      // Hide the entanglement visualization
      if (baseMapInstance.value.hideSlotConnectionState) {
        baseMapInstance.value.hideSlotConnectionState()
      }
      
      // Find and close all result windows associated with this entangled state
      const stateId = activeState.id
      const windowsToClose = resultWindows.value.filter(window => {
        return window.context?.stateId === stateId
      })
      
      windowsToClose.forEach(window => {
        closeResultWindow(window.id)
      })
    }
  } catch (error) {
    console.error('Error checking entangled states:', error)
  }
}

// Alert modal function
function showAlert(title, message) {
  alertModalTitle.value = title
  alertModalMessage.value = message
  showAlertModal.value = true
}

function closeAlertModal() {
  showAlertModal.value = false
}

function showSimulationPanic(panic) {
  activePanic.value = panic ? { ...panic } : null
}

const {
  phase: simulationPhase,
  foregroundRequest,
  capabilities: simulationCapabilities,
  simulationState,
  simulationStatus,
  backendSimulation,
  targetSimulationTime,
  pollingActive,
  resetSimulation,
  prepareSimulation,
  invalidatePreparedRevision,
  runSimulationWithSteps,
  pauseSimulation,
  resumeSimulation,
  stopSimulation,
  getSimulationStatus,
  stopPolling,
  startAlivePolling,
  stopAlivePolling,
  dispose: disposeSimulationController
} = useSimulationController({
  projectData,
  getProjectName: () => projectData.value.name,
  getSimulationPayload: () => minimizedProjectData.value,
  validatePayload,
  addLog,
  applicationLogs,
  refreshAllWindows,
  checkAndHideInvalidEntangledStates,
  clearAllPlots,
  hideSlotState,
  showAlert,
  showPanic: showSimulationPanic
})

const isNetworkEditingDisabled = computed(() => simulationCapabilities.value.editingDisabled)
let designCommands = null
let mcpBridge = null

const {
  isRightSidebarVisible,
  panelCollapsedStates,
  panelFlexValues,
  rightSidebarMaxWidth,
  rightSidebarMinWidth,
  rightSidebarStyle,
  rightSidebarWidth,
  persistRightSidebarWidth,
  updateRightSidebarWidth,
  toggleRightSidebar
} = usePanelLayout()

const topbarElement = ref(null)
const rightSidebarElement = ref(null)
const bottomPanelContainerElement = ref(null)
const bottomPanelAvailableBounds = useShellGeometry({
  topbar: topbarElement,
  rightSidebar: rightSidebarElement,
  bottomPanelContainer: bottomPanelContainerElement,
  rightSidebarVisible: isRightSidebarVisible
})

// Initialize node/edge operations composable  
const {
  mapCenter,
  mapZoom,
  selectedItem,
  selectedType,
  justCreatedNode,
  handleSelect,
  addNewNode,
  handleMapClick: handleMapClickComposable,
  handleMapStateChange: handleMapStateChangeComposable,
  deleteSelected,
  handleEdgeCreated,
  moveNode
} = useNodeEdgeOperations(projectData, isNetworkEditingDisabled, addLog, {
  hideSlotState,
  showAlert,
  executeDesignOperations: operations => designCommands.execute({
    operations,
    origin: 'gui'
  })
})

designCommands = new DesignCommandService({
  getProject: () => projectData.value,
  editingDisabled: () => isNetworkEditingDisabled.value,
  defaultBackgroundNoise: () => api.getDefaultBgNoise(),
  slotCatalog: () => (
    api.config.value.slotTypes?.length
      ? api.config.value.slotTypes
      : ['Qubit', 'Qumode']
  ),
  backgroundCatalog: () => api.config.value.bgNoiseOptions || [],
  protocolCatalog: () => api.config.value.protocolTypes || {},
  statesCatalog: () => api.config.value.statesZooTypes || [],
  fetchStateTrace: (stateType, parameters, variables) => api.fetchStatesZooTrace(
    stateType,
    parameters,
    { variables },
  ),
  markDirty: () => markProjectDirtyRef.value(),
  generators: {
    repeater_chain: generateRepeaterChain,
    star: generateStarNetwork,
    grid: (net, options) => generateGraphNetwork(net, {
      ...options,
      topology: GRAPH_TOPOLOGIES.GRID
    }),
    all_to_all: (net, options) => generateGraphNetwork(net, {
      ...options,
      topology: GRAPH_TOPOLOGIES.ALL_TO_ALL
    })
  },
  clearDeletedSelection: deletedIds => {
    if (deletedIds.has(selectedItem.value?.id)) handleSelect(null, null)
  },
  onCommitted: async (result, { origin } = {}) => {
    invalidatePreparedRevision()
    if (origin === 'gui' && mcpBridge?.binding) {
      try {
        await mcpBridge.publishGuiCommit(result.summary)
      } catch (error) {
        console.warn('Failed to publish GUI design revision:', error)
      }
    }
  }
})

const mcpState = ref({})
const mcpAvailable = computed(() => (
  platformInfo.value?.capabilities?.mcp?.available === true
))
// Browser control routes are deliberately same-origin. During development
// Vite proxies /_mcp to the loopback backend; production serves the UI and
// these routes from the same Genie origin.
const mcpClient = new McpControlClient()
mcpBridge = new McpEditorBridge({
  client: mcpClient,
  getProject: () => projectData.value,
  getProjectName: () => currentProjectName.value || projectData.value.name,
  getSimulationName: () => api.getScopedSimulationName(
    currentProjectName.value || projectData.value.name
  ),
  getProjectDocumentContext: projectDocumentContext,
  designCommands,
  validateDesign: project => {
    const validation = validatePayload(toSimulationPayload(project, projectDocumentContext()))
    return {
      valid: validation.success,
      issues: validation.success
        ? []
        : [{ code: 'VALIDATION_FAILED', message: validation.error }]
    }
  },
  simulationController: createSimulationControllerAdapter({
    prepareSimulation,
    invalidatePreparedRevision,
    runSimulationWithSteps,
    pauseSimulation,
    resumeSimulation,
    stopSimulation,
    getLastError: () => simulationState.value.lastError
  }),
  flushEditors: async () => {
    if (designInteractionCount.value > 0) return { busy: true }
    const registeredDrafts = await editorDraftRegistry.flushAll()
    if (registeredDrafts.busy || registeredDrafts.valid === false) {
      return registeredDrafts
    }
    const activeElement = document.activeElement
    if (
      activeElement
      && ['INPUT', 'SELECT', 'TEXTAREA'].includes(activeElement.tagName)
      && typeof activeElement.blur === 'function'
    ) {
      activeElement.blur()
      await nextTick()
    }
    const invalidDraft = document.querySelector('[aria-invalid="true"]')
    return invalidDraft
      ? {
          valid: false,
          details: {
            element_id: invalidDraft.id || null,
            label: invalidDraft.getAttribute('aria-label') || null
          }
        }
      : { valid: true }
  },
  onState: state => {
    mcpState.value = state
  }
})
let mcpSnapshotTimer = null
function scheduleMcpSnapshotSafetyNet() {
  clearTimeout(mcpSnapshotTimer)
  mcpSnapshotTimer = setTimeout(() => {
    if (!mcpState.value.bound) {
      mcpSnapshotTimer = null
      return
    }
    if (designInteractionCount.value > 0) {
      scheduleMcpSnapshotSafetyNet()
      return
    }
    designCommands.runExclusive(() => (
      mcpBridge.publishGuiCommit('Unclassified GUI design change')
    )).catch(error => {
      console.warn('Failed to synchronize GUI design revision:', error)
    })
  }, 250)
}

watch(
  () => (mcpState.value.bound ? projectData.value : null),
  (boundProject, previousProject) => {
    if (!boundProject) {
      clearTimeout(mcpSnapshotTimer)
      mcpSnapshotTimer = null
      return
    }
    // Binding itself publishes the current snapshot. Only later deep changes
    // need the safety net.
    if (previousProject == null) return
    scheduleMcpSnapshotSafetyNet()
  },
  { deep: true, flush: 'post' }
)

// Initialize app state composable
const {
  showLoadDialog,
  loadProjectList,
  currentProjectName,
  isDemoProject,
  showJsonViewer,
  jsonViewerMode,
  showImportConflictDialog,
  importedProjectData,
  conflictProjectName,
  showProjectNameDialog,
  projectNameDialogMode,
  projectNameDialogInitialValue,
  showAboutModal,
  showSystemInformation,
  selectedNodeIndex
} = useAppState({ projectData, selectedItem, selectedType })

// Create a ref for markAsSaved that will be set after useUnsavedChanges is initialized
const markAsSavedRef = ref(null)

// Project session owns project identity, persistence, and transition teardown.
const {
  transitionGeneration: projectTransitionGeneration,
  transitionPhase: projectTransitionPhase,
  open: openProject,
  openDemo: loadDemoProject,
  create: createNewProject,
  saveAs: createSaveAsProject,
  save: saveProject,
  delete: deleteProject,
  importProject: importProjectIntoSession,
  serializeProjectData,
  deserializeProjectData,
  generateCopyName,
  dispose: disposeProjectSession
} = useProjectSession({
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
  defaultMapCenter: DEFAULT_MAP_CENTER,
  defaultMapZoom: DEFAULT_MAP_ZOOM,
  markAsSaved: () => markAsSavedRef.value?.(),
  resetSimulation,
  stopPolling,
  stopAlivePolling,
  closeAllResultWindows,
  hideSlotState,
  beforeProjectReplacement: () => (
    mcpBridge?.binding
      ? mcpBridge.unbind({ bestEffort: true })
      : undefined
  ),
  confirmDelete: message => confirmAction({
    title: 'Delete project',
    message,
    confirmButtonText: 'Delete',
    dangerous: true
  }),
  showError: message => showAlert('Project Error', message)
})

watch(projectTransitionGeneration, () => {
  annotationCreationEnabled.value = false
  designInteractionCount.value = 0
})

function beginAnnotationCreation() {
  annotationCreationEnabled.value = true
}

async function executeGuiDesignOperations(operations, afterCommit, afterError) {
  try {
    const result = await designCommands.execute({ operations, origin: 'gui' })
    afterCommit?.(result)
    return result
  } catch (error) {
    if (afterError?.(error) === true) return null
    showAlert('Unable to update design', error.message)
    throw error
  }
}

async function handleAnnotationCreated(annotation) {
  try {
    await executeGuiDesignOperations([{
      kind: 'annotations.create',
      id: annotation.id,
      value: annotation
    }])
    handleSelect(
      projectData.value.annotations.find(candidate => candidate.id === annotation.id),
      'annotation'
    )
    addLog('info', `Created annotation: ${annotation.id}`, 'Map')
  } finally {
    annotationCreationEnabled.value = false
  }
}

async function handleNodePositionChanged({ node, position, finish }) {
  try {
    await executeGuiDesignOperations([{
      kind: 'topology.update_node',
      node_id: node.id,
      value: { position: [...position] }
    }])
  } catch {
    // executeGuiDesignOperations owns the standard warning dialog.
  } finally {
    finish?.()
  }
}

function updateProjectDescription(description, afterCommit, afterError) {
  return executeGuiDesignOperations(
    [{
      kind: 'design.update',
      value: { description }
    }],
    afterCommit,
    afterError,
  )
}

function updateSimulationTime(time) {
  return executeGuiDesignOperations([{
    kind: 'design.update',
    value: { simulationConfig: { time } }
  }])
}

function updateSimulationConfig(simulationConfig) {
  return executeGuiDesignOperations([{
    kind: 'design.update',
    value: { simulationConfig }
  }])
}

const applicationShellPendingMessage = computed(() => applicationLoadingMessage({
  applicationMetadataPending: applicationMetadataPending.value,
  mapInitializationPending: mapInitializationPending.value,
  projectTransitionPhase: projectTransitionPhase.value,
  foregroundRequest: foregroundRequest.value
}))
const applicationShellPending = computed(() => Boolean(applicationShellPendingMessage.value))

function handleMapReady() {
  mapInitializationPending.value = false
}

function handleMapInitializationError(error) {
  mapInitializationPending.value = false
  console.error('Map initialization failed:', error)
}

function serializePanicProject() {
  return serializeProjectData()
}

// Unsaved snapshots compare the canonical storage representation.
const {
  hasUnsavedChanges,
  markAsSaved,
  markAsUnsaved
} = useUnsavedChanges(serializeProjectData)
const mcpPanelState = computed(() => ({
  ...mcpState.value,
  dirty: hasUnsavedChanges()
}))

markAsSavedRef.value = markAsSaved
markProjectDirtyRef.value = markAsUnsaved

// Unsaved changes dialog state
const showUnsavedChangesDialog = ref(false)
const pendingAction = ref(null)

// Alert modal state
const showAlertModal = ref(false)
const alertModalTitle = ref('Alert')
const alertModalMessage = ref('')

// Initialize import/export composable
const {
  importProject,
  exportProject,
  validateAndProcessImport,
  handleImportConflictOverwrite,
  handleImportConflictNewName,
  cancelImportConflict
} = useImportExport({
  currentProjectName,
  importedProjectData,
  conflictProjectName,
  showImportConflictDialog,
  addLog,
  importIntoSession: importProjectIntoSession,
  serializeProjectData,
  deserializeProjectData,
  showAlert
})

function showEntangledSlots(slotId) {
  const allEntanglements = simulationStatus.value?.state?.slots?.entanglements;
  if( !allEntanglements ){
    return
  }

  const relatedSlotIds = [];
  allEntanglements.forEach(entanglement => {
    let slotIdToAdd = null;
    if( entanglement[0] === slotId ){
      slotIdToAdd = entanglement[1];
    }else if( entanglement[1] === slotId ){
      slotIdToAdd = entanglement[0];
    }
    if( slotIdToAdd && !relatedSlotIds.includes(slotIdToAdd) ){
      relatedSlotIds.push(slotIdToAdd);
    }
  });

  const entangledSlots = [];
  projectData.value.net.nodes.forEach(node => {
    node.data.slots.forEach(slot => {
      if( relatedSlotIds.includes(slot.id) ){
        entangledSlots.push( { nodeId: node.id, slotId: slot.id } );
      }
    });
  });

  const baseMapComponent = baseMapInstance.value; 
  const entagledState = {
    id: "state_1",
    slots: entangledSlots
  }

  try {
      baseMapComponent.showSlotConnectionState(entagledState);
  } catch (error) {
      console.error('Error calling showSlotConnectionState:', error)
  }
  
}


function hideSlotState() {
  try{
    baseMapInstance.value.hideSlotConnectionState();
  }catch(error){
    console.log('Error calling hideSlotConnectionState:', error)
  }
}


const mainMenuItems = computed(() => {
  let result = [
    { label: 'New', lucideIcon: FilePlus2, command: () => handleMenu('new') },
    { label: 'Open', lucideIcon: FolderOpen, command: () => handleMenu('open') },
    { label: 'Import', lucideIcon: FileUp, command: () => handleMenu('import') },
    { label: 'Export', lucideIcon: Download, command: () => handleMenu('export') },
  ];
  
  // Only show Save if not a demo project
  if (!isDemoProject.value) {
    result.push({ label: 'Save', lucideIcon: Save, command: () => handleMenu('save') })
  }
  
  if( currentProjectName.value ){
    result.push(
      { label: 'Save As', lucideIcon: CopyPlus, command: () => handleMenu('saveas') },
    )
  }
  result.push( { separator: true } );

  
  // Add About entry
  result.push(
    { label: 'About', lucideIcon: Info, command: () => handleMenu('about') }
  )
  
  // Add Demos submenu at the end
  result.push({
    label: 'Demos', 
    lucideIcon: Library,
    items: demoProjects.map(demo => ({
      label: demo.name,
      lucideIcon: FileJson,
      command: () => {
        // Check for unsaved changes before loading demo
        if (hasUnsavedChanges()) {
          pendingAction.value = { type: 'demo', demoData: demo.data }
          showUnsavedChangesDialog.value = true
        } else {
          loadDemoProject(demo.data)
        }
      }
    }))
  })


  result.push(
    { label: 'JSON Viewer', lucideIcon: Braces, command: () => handleMenu('json') },
  )
  
  
  return result;
})

const mainMenuElement = ref(null)

function toggleMainMenu(event){
  mainMenuElement.value.toggle(event)
}

// addNodeClickHandler wrapper for the template
function addNodeClickHandler() {
  void addNewNode(null, 'city', mapCenter.value).catch(error => {
    showAlert('Unable to create node', error?.message || 'The node could not be created.')
  })
}

// Demo projects list
const demoProjects = [
  { name: demo1.name, data: demo1 },
  { name: demo2.name, data: demo2 }
]

// The exact frontend version is injected from package-lock.json at build time.
const appVersion = frontendBuildInfo.appVersion

function clearLogs() {
  applicationLogs.value = []
  applicationLogIds.clear()
  logsResetKey.value += 1
}

function openRepeaterChainGenerator() {
  if (isNetworkEditingDisabled.value) {
    showAlert(
      'Layout tools unavailable',
      'Reset or stop the simulation before changing the network layout.'
    )
    return
  }
  showRepeaterChainDialog.value = true
}

function closeRepeaterChainGenerator() {
  showRepeaterChainDialog.value = false
}

async function handleGenerateRepeaterChain(options) {
  if (isNetworkEditingDisabled.value) {
    closeRepeaterChainGenerator()
    showAlert(
      'Layout tools unavailable',
      'Reset or stop the simulation before changing the network layout.'
    )
    return
  }

  try {
    const startNodeName = projectData.value.net.nodes.find(node => node.id === options.startNodeId)?.name
    const endNodeName = projectData.value.net.nodes.find(node => node.id === options.endNodeId)?.name
    await executeGuiDesignOperations([{
      kind: 'network.generate',
      value: { generator: 'repeater_chain', options }
    }])

    closeRepeaterChainGenerator()
    addLog(
      'success',
      `Generated a repeater chain between ${startNodeName} and ${endNodeName}`,
      'Layout Tools'
    )
  } catch (error) {
    closeRepeaterChainGenerator()
    showAlert('Unable to generate repeater chain', error.message)
  }
}

function openStarNetworkGenerator() {
  if (isNetworkEditingDisabled.value) {
    showAlert(
      'Layout tools unavailable',
      'Reset or stop the simulation before changing the network layout.'
    )
    return
  }
  showStarNetworkDialog.value = true
}

function closeStarNetworkGenerator() {
  showStarNetworkDialog.value = false
}

async function handleGenerateStarNetwork(options) {
  if (isNetworkEditingDisabled.value) {
    closeStarNetworkGenerator()
    showAlert(
      'Layout tools unavailable',
      'Reset or stop the simulation before changing the network layout.'
    )
    return
  }

  try {
    const centerName = projectData.value.net.nodes.find(node => node.id === options.centerNodeId)?.name
    await executeGuiDesignOperations([{
      kind: 'network.generate',
      value: { generator: 'star', options }
    }])

    closeStarNetworkGenerator()
    addLog(
      'success',
      `Generated a star network around ${centerName}`,
      'Layout Tools'
    )
  } catch (error) {
    closeStarNetworkGenerator()
    showAlert('Unable to generate star network', error.message)
  }
}

function openGraphNetworkGenerator() {
  if (isNetworkEditingDisabled.value) {
    showAlert(
      'Layout tools unavailable',
      'Reset or stop the simulation before changing the network layout.'
    )
    return
  }
  showGraphNetworkDialog.value = true
}

function closeGraphNetworkGenerator() {
  showGraphNetworkDialog.value = false
}

async function handleGenerateGraphNetwork(options) {
  if (isNetworkEditingDisabled.value) {
    closeGraphNetworkGenerator()
    showAlert(
      'Layout tools unavailable',
      'Reset or stop the simulation before changing the network layout.'
    )
    return
  }

  try {
    await executeGuiDesignOperations([{
      kind: 'network.generate',
      value: {
        generator: options.topology === GRAPH_TOPOLOGIES.GRID ? 'grid' : 'all_to_all',
        options
      }
    }])

    const topologyDescription = options.topology === GRAPH_TOPOLOGIES.GRID
      ? `${options.xCount} by ${options.yCount} grid`
      : 'all-to-all network'
    closeGraphNetworkGenerator()
    addLog('success', `Generated a ${topologyDescription}`, 'Layout Tools')
  } catch (error) {
    closeGraphNetworkGenerator()
    showAlert('Unable to generate graph network', error.message)
  }
}


function handleMenu(action) {
  if (action === 'new') {
    // Check for unsaved changes before creating new project
    if (hasUnsavedChanges()) {
      pendingAction.value = { type: 'new' }
      showUnsavedChangesDialog.value = true
      return
    }
    projectNameDialogMode.value = 'new'
    projectNameDialogInitialValue.value = ''
    showProjectNameDialog.value = true
  } else if (action === 'save') {
    if (!currentProjectName.value) {
      // hsow dialog to enter project name
      showProjectNameDialog.value = true
      projectNameDialogMode.value = 'saveas'
      projectNameDialogInitialValue.value = ''
      showProjectNameDialog.value = true
      return
    }
    saveProject()
    
  } else if (action === 'open') {
    // Check for unsaved changes before opening project
    if (hasUnsavedChanges()) {
      pendingAction.value = { type: 'open' }
      showUnsavedChangesDialog.value = true
      return
    }
    refreshProjectList()
    showLoadDialog.value = true
  } else if (action === 'import') {
    // Check for unsaved changes before importing
    if (hasUnsavedChanges()) {
      pendingAction.value = { type: 'import' }
      showUnsavedChangesDialog.value = true
      return
    }
    importProject()
  } else if (action === 'export') {
    exportProject()
  } else if (action === 'saveas') {
    handleSaveAs()
  } else if (action === 'json') {
    toggleJsonViewerVisibility()
  } else if (action === 'about') {
    showAboutModal.value = true
  }
}

function toggleJsonViewerVisibility(){
  showJsonViewer.value = !showJsonViewer.value
  localStorage.setItem('showJsonViewer', showJsonViewer.value)
}

async function handleProjectNameConfirm(projectName) {
  if (projectNameDialogMode.value === 'new') {
    await createNewProject(projectName)
  } else if (projectNameDialogMode.value === 'saveas') {
    if (!(await createSaveAsProject(projectName))) return
    // If there's a pending action (from unsaved changes dialog), execute it
    if (pendingAction.value) {
      const action = pendingAction.value
      pendingAction.value = null
      // Execute the pending action after a short delay to ensure project is saved
      nextTick(() => {
        executePendingAction(action)
      })
    }
  }
  showProjectNameDialog.value = false
}

function handleProjectNameCancel() {
  showProjectNameDialog.value = false
}

function handleOpenProjectSelect(projectName) {
  showLoadDialog.value = false
  // Check for unsaved changes before opening project
  if (hasUnsavedChanges()) {
    pendingAction.value = { type: 'open', projectName: projectName }
    showUnsavedChangesDialog.value = true
    return
  }
  openProject(projectName)
}

function handleOpenProjectClose() {
  showLoadDialog.value = false
}

function refreshProjectList() {
  loadProjectList.value = ProjectStore.getRecentProjects(50)
}

async function handleDeleteProjectFromDialog(projectName) {
  if (await deleteProject(projectName)) refreshProjectList()
}

function handleNewProjectFromDialog() {
  showLoadDialog.value = false
  handleMenu('new')
}

function handleImportProjectFromDialog() {
  showLoadDialog.value = false
  handleMenu('import')
}

function toggleJsonViewerMode(){
  jsonViewerMode.value = jsonViewerMode.value === 'full' ? 'minimized' : 'full'
  localStorage.setItem('jsonViewerMode', jsonViewerMode.value)
}


function handleSaveAs() {
  if (!currentProjectName.value) {
    showAlert('Save As', 'No project to save. Please create or open a project first.')
    return
  }
  
  projectNameDialogMode.value = 'saveas'
  projectNameDialogInitialValue.value = generateCopyName(currentProjectName.value)
  showProjectNameDialog.value = true
}

// Handle unsaved changes dialog actions
function handleUnsavedChangesSave() {
  showUnsavedChangesDialog.value = false
  const action = pendingAction.value
  pendingAction.value = null
  
  // Save the project first
  if (currentProjectName.value) {
    saveProject()
  } else {
    // If no project name, show save as dialog first
    handleSaveAs()
    // Store the pending action to execute after save
    pendingAction.value = action
    return
  }
  
  // Execute the pending action
  executePendingAction(action)
}

function handleUnsavedChangesDiscard() {
  showUnsavedChangesDialog.value = false
  const action = pendingAction.value
  pendingAction.value = null
  
  // Mark as saved (discard changes)
  markAsSaved()
  
  // Execute the pending action
  executePendingAction(action)
}

function handleUnsavedChangesCancel() {
  showUnsavedChangesDialog.value = false
  pendingAction.value = null
}

function executePendingAction(action) {
  if (!action) return
  
  switch (action.type) {
    case 'new':
      projectNameDialogMode.value = 'new'
      projectNameDialogInitialValue.value = ''
      showProjectNameDialog.value = true
      break
    case 'open':
      if (action.projectName) {
        // Opening specific project from dropdown or dialog
        openProject(action.projectName)
      } else {
        // Opening project list dialog
        refreshProjectList()
        showLoadDialog.value = true
      }
      break
    case 'import':
      importProject()
      break
    case 'demo':
      loadDemoProject(action.demoData)
      break
  }
}

onMounted( async () => {
  // Capture the startup restore target before any await. A user can create or
  // open a project while platform metadata is loading; that newer session must
  // not be replaced by a late read of recent-project storage.
  const startupRecentProjectName = ProjectStore.getRecentProjectName()
  const startupTransitionGeneration = projectTransitionGeneration.value

  // Fetch application catalogs and platform metadata together. Their loading
  // state is shell-owned so simulation polling never drives the global spinner.
  await Promise.allSettled([
    api.init(),
    api.fetchPlatformInfo(),
    api.fetchSimulationLogGroups()
  ])
  applicationMetadataPending.value = false
  // Restore only if no user-initiated project transition won the startup race.
  if (
    startupRecentProjectName
    && !currentProjectName.value
    && projectTransitionGeneration.value === startupTransitionGeneration
  ) {
    await openProject(startupRecentProjectName)
  }
  
  startAlivePolling();
  
  // Add beforeunload handler to warn about unsaved changes
  window.addEventListener('beforeunload', handleBeforeUnload)
  window.addEventListener('pagehide', handlePageExit)
})

// Handle browser beforeunload event to warn about unsaved changes
function handleBeforeUnload(event) {
  if (hasUnsavedChanges()) {
    // Modern browsers ignore the message but still show a dialog
    event.preventDefault()
    // For older browsers
    event.returnValue = ''
    return ''
  }
}

function handlePageExit() {
  mcpBridge.sendUnbindBeacon()
}

// Clean up beforeunload handler on unmount
onUnmounted(() => {
  resolveConfirmation(false)
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.removeEventListener('pagehide', handlePageExit)
  clearTimeout(mcpSnapshotTimer)
  mcpBridge.dispose()
  disposeProjectSession()
  disposeSimulationController()
})
</script>

<template>
  <div>
    <SmallScreenWarning />
    <div ref="topbarElement" class="topbar">
      <div class="topbar-title">
        <img src="./assets/logo.png" alt="" class="topbar-logo">
        QuantumSavory Studio
        <button
          type="button"
          class="version-badge"
          :aria-label="`QuantumSavory Studio version ${appVersion}. Open System Information`"
          title="Open System Information"
          @click="showSystemInformation = true"
        >
          v{{ appVersion }}
        </button>
        <span
          v-if="applicationShellPending"
          class="topbar-loading-indicator"
          role="status"
          aria-live="polite"
        >
          <LoaderCircle class="app-loading-spinner" :size="16" aria-hidden="true" />
          <span class="visually-hidden">{{ applicationShellPendingMessage }}</span>
        </span>
      </div>
      <div class="topbar-right">
        <div class="topbar-menu">
          <div v-if="currentProjectName" class="project-name-container">
            <span class="project-name-label" :title="currentProjectName">{{ currentProjectName }}</span>
          </div>
          
          <div class="action-buttons">
            <button ref="menuButtonRef" class="menu-btn hamburger-btn" @click="toggleMainMenu" aria-label="Menu">
              <MenuIcon :size="28" aria-hidden="true" />
            </button>
            <TieredMenu ref="mainMenuElement" id="main_menu" :model="mainMenuItems" :popup="true">
              <template #itemicon="{ item }">
                <LucideMenuIcon :item="item" />
              </template>
              <template #submenuicon>
                <ChevronRight :size="15" aria-hidden="true" />
              </template>
            </TieredMenu>
          </div>
        </div>
      </div>
    </div>
    <div class="app" :style="rightSidebarStyle">
      <div class="main-panel">
        <BaseMap 
          ref="baseMapInstance"
          :nodes="projectData.net.nodes"
          :edges="projectData.net.edges"
          :annotations="projectData.annotations"
          :selected-item="selectedItem"
          :selected-type="selectedType"
          :annotation-creation-enabled="annotationCreationEnabled"
          :center="mapCenter"
          :zoom="mapZoom"
          :editing-locked="isNetworkEditingDisabled"
          :curve-editing-enabled="curveEditingEnabled"
          :show-physical-badges="showPhysicalBadges"
          :physical-config="projectData.net.physicalConfig"
          @select="handleSelect"
          @map-click="handleMapClickComposable"
          @edge-created="handleEdgeCreated"
          @annotation-created="handleAnnotationCreated"
          @map-state-change="handleMapStateChangeComposable"
          @design-operations="executeGuiDesignOperations"
          @interaction-busy="updateDesignInteractionBusy"
          @node-position-changed="handleNodePositionChanged"
          @map-ready="handleMapReady"
          @map-initialization-error="handleMapInitializationError"
          @delete="deleteSelected"
          :style="'https://tiles.stadiamaps.com/styles/alidade_smooth.json'"
        />
      </div>
      


      <!---------------- RIGHT SIDEBAR -------------->
      <!-- Sidebar Toggle Button (outside sidebar so it doesn't slide with it) -->
      <button 
        v-if="projectData"
        type="button"
        class="sidebar-toggle-btn" 
        :class="{ 'sidebar-toggle-btn-hidden': !isRightSidebarVisible }"
        @click="toggleRightSidebar"
        :aria-label="isRightSidebarVisible ? 'Hide simulation sidebar' : 'Show simulation sidebar'"
        :title="isRightSidebarVisible ? 'Hide panel' : 'Show panel'"
      >
        <PanelRightClose v-if="isRightSidebarVisible" :size="15" aria-hidden="true" />
        <PanelRightOpen v-else :size="15" aria-hidden="true" />
      </button>
      
      <div 
        id="simulation-sidebar"
        ref="rightSidebarElement"
        class="sidebar sidebar-right" 
        :class="{ 'sidebar-hidden': !isRightSidebarVisible }"
        v-if="projectData"
      >
        <RightSidebarResizer
          :width="rightSidebarWidth"
          :min-width="rightSidebarMinWidth"
          :max-width="rightSidebarMaxWidth"
          :disabled="!isRightSidebarVisible"
          controls="simulation-sidebar"
          @update:width="updateRightSidebarWidth"
          @resize-end="persistRightSidebarWidth"
        >
          <div class="info-panel">
            <div style="padding: 1px 4px 0px !important;">
              <RunnerPanel 
                id="runnerPanel" 
                :projectData="projectData"
                :backendSimulation="backendSimulation"
                :targetSimulationTime="targetSimulationTime"
                :pollingActive="pollingActive"
                :foregroundRequest="foregroundRequest"
                :phase="simulationPhase"
                :capabilities="simulationCapabilities"
                @run="runSimulationWithSteps" 
                @pause="pauseSimulation"
                @resume="resumeSimulation"
                @stop="stopSimulation"
                @prepareSimulation="prepareSimulation"
                @updateSimulationTime="updateSimulationTime"
                @updateSimulationConfig="updateSimulationConfig"
            />
            </div>
          <div class="custom-panels-container">
            <!-- First Panel: NodePanel or EdgePanel -->
            <div 
              class="custom-panel"
              :style="{ flex: panelFlexValues.first }"
            >
              <!-- NodePanel for selected node -->
              <NodePanel
                id="nodePanel" 
                v-if="selectedType === 'node' && selectedItem"
                :key="selectedItem && selectedItem.id"
                :node="selectedItem" 
                :projectData="projectData"
                :nodeIndex="selectedNodeIndex"
                :justCreated="justCreatedNode"
                :editingLocked="isNetworkEditingDisabled"
                :variables="projectData.variables"
                v-model:collapsed="panelCollapsedStates.selectedElementPanel"
                @delete="deleteSelected"
                @design-operations="executeGuiDesignOperations"
                @name-edit-complete="justCreatedNode = false"
              />
              <!-- EdgePanel for selected edge -->
              <EdgePanel 
                id="edgePanel" 
                v-else-if="selectedType === 'edge' && selectedItem"
                :projectData="projectData"
                :key="selectedItem && selectedItem.id"
                :edge="selectedItem"
                :editingLocked="isNetworkEditingDisabled"
                :variables="projectData.variables"
                v-model:collapsed="panelCollapsedStates.selectedElementPanel"
                @delete="deleteSelected"
                @design-operations="executeGuiDesignOperations"
              />
              <AnnotationPanel
                id="annotationPanel"
                v-else-if="selectedType === 'annotation' && selectedItem"
                :key="selectedItem.id"
                :annotation="selectedItem"
                v-model:collapsed="panelCollapsedStates.selectedElementPanel"
                @delete="deleteSelected"
                @design-operations="executeGuiDesignOperations"
              />
              <VoidPanel 
                v-else
                v-model:collapsed="panelCollapsedStates.selectedElementPanel"
              >Nothing Selected</VoidPanel>
            </div>
            
            <!-- Node List Panel -->
            <div 
              class="custom-panel"
              :style="{ flex: panelFlexValues.nodeList }"
            >
              <NodeListPanel
                id="nodeListPanel" 
                :nodes="projectData.net.nodes"
                :selected-node="selectedItem && selectedType === 'node' ? selectedItem : null"
                :editingLocked="isNetworkEditingDisabled"
                v-model:collapsed="panelCollapsedStates.nodeListPanel"
                @select="node => handleSelect(node, 'node')" 
                @addNewNode="addNodeClickHandler"
                @move-node="moveNode"
              />
            </div>
            
            <!-- Edge List Panel -->
            <div 
              class="custom-panel"
              :style="{ flex: panelFlexValues.edgeList }"
            >
              <EdgeListPanel
                id="edgeListPanel" 
                :projectData="projectData" 
                :edges="projectData.net.edges"
                :selected-edge="selectedItem && selectedType === 'edge' ? selectedItem : null"
                v-model:collapsed="panelCollapsedStates.edgeListPanel"
                @select="edge => handleSelect(edge, 'edge')"
              />
            </div>
            
            <!-- Floating Protocols Panel -->
            <div 
              class="custom-panel"
              :style="{ flex: panelFlexValues.floating }"
            >
              <FloatingProtocolsPanel 
                id="floatingProtocolsPanel" 
                v-if="api.config.value.protocolTypes?.floating"
                :protocols="projectData.net.protocols"
                :editingLocked="isNetworkEditingDisabled"
                :variables="projectData.variables"
                :projectData="projectData"
                v-model:collapsed="panelCollapsedStates.floatingProtocolsPanel"
                @design-operations="executeGuiDesignOperations"
              />
              <div v-else></div>
            </div>
          </div>

          

          </div>
        </RightSidebarResizer>
      </div>
    </div>

    <!-- Tabbed tools panel at bottom -->
    <div ref="bottomPanelContainerElement" class="logs-panel-container">
      <BottomPanel
        :logs="applicationLogs"
        :logs-reset-key="logsResetKey"
        :max-logs="200"
        :show-timestamps="true"
        :allow-clear="true"
        :simulation-log-groups="api.config.value.simulationLogGroups || []"
        :helpers-disabled="isNetworkEditingDisabled"
        :curve-editing-enabled="curveEditingEnabled"
        :show-physical-badges="showPhysicalBadges"
        :annotation-creation-enabled="annotationCreationEnabled"
        :variables="projectData.variables"
        :project-data="projectData"
        :export-script-payload="exportScriptPayload"
        :variables-disabled="isNetworkEditingDisabled"
        :tags-explorer-enabled="simulationCapabilities.canExploreTags"
        :mcp-available="mcpAvailable"
        :mcp-state="mcpPanelState"
        :mcp-client="mcpClient"
        :mcp-bridge="mcpBridge"
        :project-name="currentProjectName || projectData.name"
        :available-bounds="bottomPanelAvailableBounds"
        v-model:collapsed="panelCollapsedStates.bottomPanel"
        @clear-logs="clearLogs"
        @update-description="updateProjectDescription"
        @open-repeater-chain-generator="openRepeaterChainGenerator"
        @open-star-network-generator="openStarNetworkGenerator"
        @open-graph-network-generator="openGraphNetworkGenerator"
        @add-annotation="beginAnnotationCreation"
        @update:curve-editing-enabled="curveEditingEnabled = $event"
        @update:show-physical-badges="showPhysicalBadges = $event"
        @design-operations="executeGuiDesignOperations"
      />
    </div>

    <RepeaterChainDialog
      :show="showRepeaterChainDialog"
      :nodes="projectData.net.nodes"
      :edges="projectData.net.edges"
      :protocol-types="api.config.value.protocolTypes"
      :variables="projectData.variables"
      @confirm="handleGenerateRepeaterChain"
      @cancel="closeRepeaterChainGenerator"
    />

    <StarNetworkDialog
      :show="showStarNetworkDialog"
      :nodes="projectData.net.nodes"
      :edges="projectData.net.edges"
      @confirm="handleGenerateStarNetwork"
      @cancel="closeStarNetworkGenerator"
    />

    <GraphNetworkDialog
      :show="showGraphNetworkDialog"
      :nodes="projectData.net.nodes"
      :edges="projectData.net.edges"
      @confirm="handleGenerateGraphNetwork"
      @cancel="closeGraphNetworkGenerator"
    />

    <!-- Open Project Dialog Component -->
    <OpenProjectDialog
      :show="showLoadDialog"
      :projects="loadProjectList"
      @select-project="handleOpenProjectSelect"
      @close="handleOpenProjectClose"
      @delete-project="handleDeleteProjectFromDialog"
      @new-project="handleNewProjectFromDialog"
      @import-project="handleImportProjectFromDialog"
    />

    <!-- Import Conflict Dialog Component -->
    <ImportConflictDialog
      :show="showImportConflictDialog"
      :project-name="conflictProjectName"
      @overwrite="handleImportConflictOverwrite"
      @new-name="handleImportConflictNewName"
      @cancel="cancelImportConflict"
    />

    <!-- Project Name Dialog Component -->
    <ProjectNameDialog
      :show="showProjectNameDialog"
      :title="projectNameDialogMode === 'new' ? 'New Project' : 'Save As'"
      :confirm-button-text="projectNameDialogMode === 'new' ? 'Create' : 'Save'"
      :initial-value="projectNameDialogInitialValue"
      :mode="projectNameDialogMode"
      @confirm="handleProjectNameConfirm"
      @cancel="handleProjectNameCancel"
    />

    <!-- Unsaved Changes Dialog Component -->
    <UnsavedChangesDialog
      :show="showUnsavedChangesDialog"
      @save="handleUnsavedChangesSave"
      @discard="handleUnsavedChangesDiscard"
      @cancel="handleUnsavedChangesCancel"
    />

    <!-- About Modal Component -->
    <AboutModal
      :show="showAboutModal"
      @close="showAboutModal = false"
    />

    <SystemInformationDialog
      :show="showSystemInformation"
      :platform-info="platformInfo"
      @close="showSystemInformation = false"
    />

    <!-- Alert Modal Component -->
    <AlertModal
      :show="showAlertModal"
      :title="alertModalTitle"
      :message="alertModalMessage"
      @close="closeAlertModal"
    />

    <PanicReportDialog
      :show="Boolean(activePanic)"
      :panic="activePanic || {}"
      :serialize-project="serializePanicProject"
      :project-name="currentProjectName || projectData.name"
      :platform-info="platformInfo"
      @close="activePanic = null"
    />

    <ConfirmModal
      v-if="confirmationRequest"
      :show="true"
      :title="confirmationRequest.title"
      :message="confirmationRequest.message"
      :confirm-button-text="confirmationRequest.confirmButtonText"
      :dangerous="confirmationRequest.dangerous"
      @confirm="resolveConfirmation(true)"
      @cancel="resolveConfirmation(false)"
    />

    <div v-if="showJsonViewer" class="json-viewer-box">
      <div class="json-viewer-header" style="display: flex; align-items: center; justify-content: space-between;">
        <h3 style="cursor: pointer; text-transform: capitalize;" @click="toggleJsonViewerMode">{{jsonViewerMode}}</h3>
        <!-- close button -->
        <button class="menu-btn hamburger-btn" @click="toggleJsonViewerVisibility" aria-label="Close">
          <X :size="22" aria-hidden="true" />
        </button>
      </div>
      <JsonViewer :value="jsonViewerMode === 'full' ? projectData : minimizedProjectData" expanded :expandDepth="10" copyable boxed sort theme="light">
        <template #copy="{ copied }">
          <span class="json-copy-control">
            <Check v-if="copied" :size="15" aria-hidden="true" />
            <Copy v-else :size="15" aria-hidden="true" />
            <span class="visually-hidden">{{ copied ? 'Copied JSON' : 'Copy JSON' }}</span>
          </span>
        </template>
      </JsonViewer>
    </div>


    <!-- Floating result windows -->
    <ResultsView
      v-for="window in resultWindows"
      :key="window.id"
      :ref="(el) => {
        // Handle both single ref and array (Vue may pass array in some cases)
        const ref = Array.isArray(el) ? el[0] : el
        if (ref) {
          registerWindowRef(window.id, ref)
        } else {
          unregisterWindowRef(window.id)
        }
      }"
      :windowId="window.id"
      :itemDetails="{ type: window.type, item: window.item, context: window.context }"
      :position="window.position"
      :size="window.size"
      :zIndex="window.zIndex"
      :projectData="projectData"
      @close="closeResultWindow(window.id)"
      @bring-to-front="bringWindowToFront(window.id)"
      @update-position="updateWindowPosition(window.id, $event)"
      @update-size="updateWindowSize(window.id, $event)"
    />
  </div>
</template>

<!-- Styles extracted to assets/app.css and imported via main.js -->
