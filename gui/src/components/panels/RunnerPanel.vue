<script setup>
import { ref, computed, watch } from 'vue'
import { LoaderCircle, Pause, Play, Settings2, Square } from '@lucide/vue'
import { SimulationPhase } from '../../composables/simulationLifecycle.js'
import OptionHelpTooltip from '../ui/OptionHelpTooltip.vue'
import {
  QUBIT_REPRESENTATION_OPTIONS,
  QUMODE_REPRESENTATION_OPTIONS,
  normalizeRepresentationConfig
} from '../../utils/representations.js'

const props = defineProps({
  projectData: {
    type: Object,
    required: true
  }, 
  backendSimulation: {
    type: Object,
    required: true
  },
  targetSimulationTime: {
    type: Number,
    required: true
  },
  pollingActive: {
    type: Boolean,
    required: true
  },
  phase: {
    type: String,
    required: true
  },
  capabilities: {
    type: Object,
    required: true
  },
  foregroundRequest: {
    type: Object,
    default: null
  }
})

const emit = defineEmits([
  'run',
  'pause',
  'resume',
  'stop',
  'prepareSimulation',
  'updateSimulationTime',
  'updateSimulationConfig',
])

const showAdvancedControls = ref(false)
const normalizedRepresentationConfig = computed(() => (
  normalizeRepresentationConfig(props.projectData.simulationConfig)
))
const simulationTimeDraft = ref(props.projectData.simulationConfig.time)
const qubitRepresentationDraft = ref(
  normalizedRepresentationConfig.value.qubitRepresentation
)
const qumodeRepresentationDraft = ref(
  normalizedRepresentationConfig.value.qumodeRepresentation
)

function representationModel(field) {
  const draft = field === 'qubitRepresentation'
    ? qubitRepresentationDraft
    : qumodeRepresentationDraft
  return computed({
    get: () => draft.value,
    set: value => {
      draft.value = value
      emit('updateSimulationConfig', { [field]: value })
    }
  })
}

const qubitRepresentation = representationModel('qubitRepresentation')
const qumodeRepresentation = representationModel('qumodeRepresentation')

const selectedQubitRepresentation = computed(() => (
  QUBIT_REPRESENTATION_OPTIONS.find(option => option.value === qubitRepresentation.value)
))
const selectedQumodeRepresentation = computed(() => (
  QUMODE_REPRESENTATION_OPTIONS.find(option => option.value === qumodeRepresentation.value)
))

watch(
  () => props.projectData.simulationConfig.time,
  value => {
    simulationTimeDraft.value = value
  },
)
watch(
  () => normalizedRepresentationConfig.value.qubitRepresentation,
  value => {
    qubitRepresentationDraft.value = value
  },
)
watch(
  () => normalizedRepresentationConfig.value.qumodeRepresentation,
  value => {
    qumodeRepresentationDraft.value = value
  },
)

const currentTime = computed(() => {
  const sim = backendSim.value
  const time = sim.simulation_progress || 0
  
  const minutes = Math.floor(time / 60)
  const seconds = time % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toFixed(3).padStart(6, '0')}`
})

// Backend simulation state (single source of truth)
const backendSim = computed(() => props.backendSimulation || {})

const isSimulationRunning = computed(() => props.phase === SimulationPhase.RUNNING)
const isSimulationPaused = computed(() => props.phase === SimulationPhase.PAUSED)

// Simplified progress calculation (using cumulative target time)
const simulationProgress = computed(() => {
  const sim = backendSim.value
  const targetTime = props.targetSimulationTime || sim.simulation_time
  
  if (!sim.simulation_progress || !targetTime) {
    return 0
  }
  
  const progress = (sim.simulation_progress / targetTime) * 100
  return Math.min(Math.round(progress), 100)
})

const canRunSimulation = computed(() => props.capabilities.canRun)
const canPauseSimulation = computed(() => props.capabilities.canPause)
const canResumeSimulation = computed(() => props.capabilities.canResume)
const canStopSimulation = computed(() => props.capabilities.canStop)
const foregroundAction = computed(() => props.foregroundRequest?.action || null)
const foregroundPending = computed(() => Boolean(foregroundAction.value))
const representationsDisabled = computed(() => (
  Boolean(props.capabilities.editingDisabled)
  || isSimulationRunning.value
  || isSimulationPaused.value
  || props.pollingActive
  || foregroundPending.value
))
const foregroundStatus = computed(() => ({
  prepare: 'Preparing simulation',
  run: 'Starting simulation',
  pause: 'Pausing simulation',
  resume: 'Resuming simulation'
})[foregroundAction.value] || '')

function handleRun() {
  emit('run')
}

function handlePause() {
  emit('pause')
}

function handleResume() {
  emit('resume')
}

function handleStop() {
  emit('stop')
}

function handlePrepareSimulation() {
  emit('prepareSimulation')
}

function toggleAdvancedControls() {
  showAdvancedControls.value = !showAdvancedControls.value
}

function commitSimulationTime(event) {
  const value = Number(event.target.value)
  if (!Number.isFinite(value) || value <= 0) {
    simulationTimeDraft.value = props.projectData.simulationConfig.time
    return
  }
  simulationTimeDraft.value = value
  emit('updateSimulationTime', value)
}

</script>

<template>
  <div class="panel runner-panel" id="runnerPanel">
    <div class="panel-title">Simulation Runner</div>
    
    <!-- Current Time Display -->
    <div class="current-time-display">
      {{ currentTime }}
    </div>

        <!-- Simulation Progress (when running or paused) -->
        <div v-if="isSimulationRunning || isSimulationPaused" class="simulation-progress">
          <div class="progress-info">
            <span>
              {{ (backendSim.simulation_progress || 0).toFixed(3) }}s / {{ (targetSimulationTime || backendSim.simulation_time || 0).toFixed(3) }}s
            </span>
            <span>{{ simulationProgress }}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: simulationProgress + '%' }"></div>
          </div>
        </div>

    <!-- Main Controls -->
    <div class="main-controls">
      <div class="run-duration-group">
        <label>Run for</label>
        <div class="numeric-stepper">
          <input
            type="number"
            :value="simulationTimeDraft"
            step="0.001"
            min="0"
            class="duration-input"
            :disabled="representationsDisabled"
            @change="commitSimulationTime"
          />
          <span class="unit">sec</span>
        </div>
      </div>
      
      <div class="main-buttons">
        <span
          v-if="foregroundStatus"
          class="visually-hidden"
          role="status"
          aria-live="polite"
        >{{ foregroundStatus }}</span>
        <button 
          class="settings-toggle-btn" 
          @click="toggleAdvancedControls"
          :class="{ active: showAdvancedControls }"
          title="Toggle advanced controls"
          :disabled="isSimulationRunning || isSimulationPaused || pollingActive || foregroundPending"
        >
          <Settings2 :size="16" aria-hidden="true" />
        </button>
        
        <!-- Run/Pause/Resume/Stop buttons -->
        <button 
          v-if="!isSimulationRunning && !isSimulationPaused"
          class="run-btn" 
          :disabled="!canRunSimulation"
          @click="handleRun"
          :aria-busy="foregroundAction === 'run'"
          :aria-label="foregroundAction === 'run' ? 'Starting simulation' : 'Run simulation'"
          :title="foregroundAction === 'run'
            ? 'Starting simulation'
            : canRunSimulation
              ? 'Run simulation'
              : 'Define the simulation network before running it'"
        >
          <LoaderCircle
            v-if="foregroundAction === 'run'"
            class="app-loading-spinner"
            :size="16"
            aria-hidden="true"
          />
          <Play v-else :size="16" aria-hidden="true" />
        </button>
        
        <button 
          v-if="isSimulationRunning"
          class="pause-btn" 
          :disabled="!canPauseSimulation"
          @click="handlePause"
          :aria-busy="foregroundAction === 'pause'"
          :aria-label="foregroundAction === 'pause' ? 'Pausing simulation' : 'Pause simulation'"
          :title="foregroundAction === 'pause' ? 'Pausing simulation' : 'Pause simulation'"
        >
          <LoaderCircle
            v-if="foregroundAction === 'pause'"
            class="app-loading-spinner"
            :size="16"
            aria-hidden="true"
          />
          <Pause v-else :size="16" aria-hidden="true" />
        </button>
        
        <button 
          v-if="isSimulationPaused"
          class="resume-btn" 
          :disabled="!canResumeSimulation"
          @click="handleResume"
          :aria-busy="foregroundAction === 'resume'"
          :aria-label="foregroundAction === 'resume' ? 'Resuming simulation' : 'Resume simulation'"
          :title="foregroundAction === 'resume' ? 'Resuming simulation' : 'Resume simulation'"
        >
          <LoaderCircle
            v-if="foregroundAction === 'resume'"
            class="app-loading-spinner"
            :size="16"
            aria-hidden="true"
          />
          <Play v-else :size="16" aria-hidden="true" />
        </button>
        
        <!-- Stop button hidden - behavior TBD with backend developer -->
        <button 
          class="stop-btn" 
          :disabled="!canStopSimulation"
          @click="handleStop"
          title="Stop simulation"
        >
          <Square :size="15" aria-hidden="true" />
        </button>
      </div>
    </div>

    <!-- Advanced Controls (Collapsible) -->
    <div class="advanced-controls" :class="{ visible: showAdvancedControls }">
      <div class="representation-controls" aria-label="Default quantum representations">
        <div class="representation-control qubit-representation-control">
          <label for="qubit-representation">Qubits</label>
          <div class="representation-editor">
            <select
              id="qubit-representation"
              v-model="qubitRepresentation"
              class="representation-select"
              :disabled="representationsDisabled"
            >
              <option
                v-for="option in QUBIT_REPRESENTATION_OPTIONS"
                :key="option.value"
                :value="option.value"
                :title="option.tooltip.replaceAll('**', '')"
              >
                {{ option.label }}
              </option>
            </select>
            <OptionHelpTooltip
              :label="`About ${selectedQubitRepresentation.label}`"
              :text="selectedQubitRepresentation.tooltip"
            />
          </div>
        </div>

        <div class="representation-control qumode-representation-control">
          <label for="qumode-representation">Qmodes</label>
          <div class="representation-editor">
            <select
              id="qumode-representation"
              v-model="qumodeRepresentation"
              class="representation-select"
              :disabled="representationsDisabled"
            >
              <option
                v-for="option in QUMODE_REPRESENTATION_OPTIONS"
                :key="option.value"
                :value="option.value"
                :title="option.tooltip.replaceAll('**', '')"
              >
                {{ option.label }}
              </option>
            </select>
            <OptionHelpTooltip
              :label="`About ${selectedQumodeRepresentation.label}`"
              :text="selectedQumodeRepresentation.tooltip"
            />
          </div>
        </div>
      </div>

      <div class="advanced-buttons">
        <button 
          :disabled="!props.capabilities.canPrepare || pollingActive || foregroundPending"
          class="prepare-simulation-btn" 
          @click="handlePrepareSimulation"
        >
          Prepare
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel {
  background: white;
  border-radius: 8px;
  padding: 5px 16px 2px;
  box-shadow: 0 2px 4px rgba(66, 62, 112, 0.6);
}

.panel-title {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 5px;
  color: #333;
}

/* Current Time Display */
.current-time-display {
  font-size: 2rem;
  font-weight: 700;
  text-align: center;
  margin-bottom: 10px;
  color: #4345ac;
  font-family: 'Courier New', monospace;
  letter-spacing: 1px;
}

/* Simulation Progress */
.simulation-progress {
  margin-bottom: 16px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 4px;
  border: 1px solid #e9ecef;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 0.9rem;
  color: #555;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: #e9ecef;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4345ac, #5a5cbf);
  transition: width 0.3s ease;
}

/* Main Controls */
.main-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.run-duration-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.run-duration-group label {
  font-weight: 500;
  color: #555;
}

.numeric-stepper {
  display: flex;
  align-items: center;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
}

.numeric-stepper input {
  border: none;
  outline: none;
  padding: 6px 2px;
  font-size: 0.9rem;
  width: 50px;
  text-align: right;
}

.numeric-stepper .unit {
  padding: 6px 8px;
  background: #f5f5f5;
  color: #666;
  font-size: 0.85rem;
  border-left: 1px solid #ddd;
}

.main-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-toggle-btn {
  background: none;
  border: 1px solid #4345ac;
  color: #4345ac;
  padding: 0px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
}

.settings-toggle-btn:hover {
  background: #4345ac;
  color: white;
}

.settings-toggle-btn.active {
  background: #4345ac;
  color: white;
}

.run-btn {
  background: #4345ac;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  transition: background 0.2s;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
}

.run-btn:hover:not(:disabled) {
  background: #2d2e70;
}

.run-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.pause-btn {
  background: #ffc107;
  color: #212529;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  transition: background 0.2s;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
}

.pause-btn:hover:not(:disabled) {
  background: #e0a800;
}

.resume-btn {
  background: #28a745;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  transition: background 0.2s;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
}

.resume-btn:hover:not(:disabled) {
  background: #218838;
}

.stop-btn {
  background: #dc3545;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  transition: background 0.2s;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
}

.stop-btn:hover:not(:disabled) {
  background: #c82333;
}

/* Advanced Controls */
.advanced-controls {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s ease-out;
  border-top: 1px solid transparent;
  padding-top: 16px;
  display: none;
}

.advanced-controls.visible {
  max-height: 430px;
  transition: max-height 0.3s ease-in;
  border-top: 1px solid #eee;
  display: block;
}

.representation-controls {
  display: grid;
  gap: var(--app-space-2);
  margin-bottom: var(--app-space-4);
}

.representation-control {
  --representation-color: var(--app-color-primary);
  display: grid;
  grid-template-columns: 5.5rem minmax(0, 1fr);
  gap: var(--app-space-3);
  align-items: center;
  padding: var(--app-space-2) var(--app-space-3);
  border-left: 3px solid var(--representation-color);
  border-radius: var(--app-radius-control);
  background: var(--app-color-surface-subtle);
}

.qubit-representation-control {
  --representation-color: var(--app-color-qubit);
}

.qumode-representation-control {
  --representation-color: var(--app-color-qmode);
}

.representation-control label {
  color: var(--representation-color);
  font-weight: 700;
}

.representation-editor {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 28px;
  gap: var(--app-space-1);
  align-items: center;
}

.representation-select {
  width: 100%;
  min-width: 0;
  border-color: var(--representation-color);
  background: var(--app-color-surface);
  color: var(--app-color-text);
}

.representation-select:disabled {
  border-color: var(--app-color-border);
  background: var(--app-color-disabled-surface);
  color: var(--app-color-disabled-text);
}

.advanced-buttons {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.advanced-buttons button {
  flex: 1;
  border: 1px solid #4345ac;
  background: white;
  color: #4345ac;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
}

.advanced-buttons button:hover:not(:disabled) {
  background: #4345ac;
  color: white;
}

.advanced-buttons button:disabled {
  background: #f5f5f5;
  color: #ccc;
  border-color: #ddd;
  cursor: not-allowed;
}


</style>
