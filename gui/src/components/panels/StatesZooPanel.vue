<template>
  <div class="states-zoo-panel" data-testid="states-zoo-panel">
    <div class="states-zoo-header">
      <HelpCallout>
        Create reusable symbolic states and preview their density matrices.
      </HelpCallout>
      <button
        type="button"
        class="add-states-zoo-button"
        :disabled="disabled || typesLoading || statesZooTypes.length === 0"
        @click="addStateVariable"
      >
        <Plus :size="15" aria-hidden="true" />
        Add State
      </button>
    </div>

    <HelpCallout
      class="states-zoo-weight-help"
      title="Weighted and unweighted states"
      variant="detailed"
    >
      <p>
        By convention, unweighted state recipes have unit trace. Weighted recipes retain their
        generation weight instead of requiring unit trace; for physical parameter values, that
        trace is the probability of successful state generation.
      </p>
      <p>
        Studio requires the absolute trace to be finite and nonzero. It divides the weighted state
        by that magnitude and makes the magnitude available as an automatically generated
        <code>Float64</code> companion variable named <code>&lt;state name&gt;_tr</code>.
      </p>
    </HelpCallout>

    <div v-if="typesLoading" class="states-zoo-catalog-status" role="status">
      Loading States Zoo types…
    </div>
    <div v-else-if="typesError" class="states-zoo-catalog-error" role="alert">
      <span>{{ typesError }}</span>
      <button type="button" @click="loadStatesZooTypes">Retry types</button>
    </div>

    <div v-if="zooVariables.length === 0" class="empty-states-zoo">
      No States Zoo variables
    </div>

    <div v-else class="states-zoo-list">
      <article
        v-for="variable in zooVariables"
        :key="variable.id"
        class="states-zoo-row"
        :data-variable-id="variable.id"
      >
        <div class="states-zoo-row-header">
          <label class="states-zoo-field states-zoo-name-field">
            <span>Name</span>
            <input
              :value="stateDraft(variable).name"
              type="text"
              class="states-zoo-name-input"
              :class="{ 'invalid-states-zoo-name': !!variableNameError(variable) }"
              :aria-invalid="!!variableNameError(variable)"
              :aria-describedby="variableNameError(variable) ? `states-zoo-name-error-${variable.id}` : undefined"
              :aria-label="`State variable name for ${variable.id}`"
              :disabled="disabled"
              @input="changeStateName(variable, $event.target.value)"
            />
            <small
              v-if="variableNameError(variable)"
              :id="`states-zoo-name-error-${variable.id}`"
              class="states-zoo-name-error"
              role="alert"
            >
              {{ variableNameError(variable) }}
            </small>
          </label>

          <button
            type="button"
            class="delete-states-zoo-button noborder"
            :disabled="disabled || stateDeleteBlocked(variable)"
            :title="deleteTitle(variable)"
            :aria-label="`Delete state variable ${variable.name || variable.id}`"
            @click="deleteStateVariable(variable)"
          >
            <Trash2 :size="15" aria-hidden="true" />
          </button>
        </div>

        <div class="states-zoo-row-content">
          <div class="states-zoo-controls">
            <label class="states-zoo-field states-zoo-type-field">
              <span>State type</span>
              <select
                class="states-zoo-type-select"
                :value="stateDraft(variable).value.state_type"
                :aria-label="`State type for ${variable.name || variable.id}`"
                :aria-invalid="!stateType(stateDraft(variable).value.state_type)"
                :disabled="disabled || typesLoading || statesZooTypes.length === 0"
                @change="changeStateType(variable, $event.target.value)"
              >
                <option
                  v-if="!stateType(stateDraft(variable).value.state_type)"
                  :value="stateDraft(variable).value.state_type"
                  disabled
                >
                  Unavailable type ({{ stateDraft(variable).value.state_type }})
                </option>
                <option
                  v-for="type in statesZooTypes"
                  :key="type.id"
                  :value="type.id"
                  :disabled="unweightedTransitionBlocked(variable, type)"
                  :title="unweightedTransitionTitle(variable, type)"
                >
                  {{ type.displayName }}
                </option>
              </select>
            </label>

            <div
              v-for="parameter in parametersFor(variable)"
              :key="parameter.name"
              class="states-zoo-parameter-control"
              :data-parameter-name="parameter.name"
            >
              <div
                v-tooltip.top="parameter.doc || 'No parameter documentation is available.'"
                class="states-zoo-parameter-label"
              >
                <span>{{ parameter.name }}</span>
                <span class="states-zoo-parameter-range-text">
                  {{ parameter.min }}–{{ parameter.max }}
                </span>
              </div>
              <select
                class="states-zoo-parameter-source"
                :value="parameterSourceId(variable, parameter.name)"
                :aria-label="`Source for ${parameter.name} of ${variable.name || variable.id}`"
                :disabled="disabled"
                @change="changeParameterSource(variable, parameter, $event.target.value)"
              >
                <option value="">Direct value</option>
                <option
                  v-for="source in compatibleParameterVariables"
                  :key="source.id"
                  :value="source.id"
                >
                  {{ source.name }} ({{ source.type }})
                </option>
              </select>
              <div class="states-zoo-parameter-inputs">
                <input
                  type="range"
                  class="states-zoo-parameter-range"
                  :min="parameter.min"
                  :max="parameter.max"
                  step="any"
                  :value="parameterDisplayValue(variable, parameter.name)"
                  :aria-label="`${parameter.name} range for ${variable.name || variable.id}`"
                  :aria-invalid="parameterValueInvalid(variable, parameter)"
                  :disabled="disabled || parameterIsLinked(variable, parameter.name)"
                  @input="changeParameter(variable, parameter.name, $event.target.value)"
                />
                <input
                  type="number"
                  class="states-zoo-parameter-input"
                  :min="parameter.min"
                  :max="parameter.max"
                  step="any"
                  :value="parameterDisplayValue(variable, parameter.name)"
                  :aria-label="`${parameter.name} value for ${variable.name || variable.id}`"
                  :aria-invalid="parameterValueInvalid(variable, parameter)"
                  :disabled="disabled || parameterIsLinked(variable, parameter.name)"
                  @input="changeParameter(variable, parameter.name, $event.target.value)"
                />
              </div>
            </div>

            <p
              v-if="!stateType(stateDraft(variable).value.state_type) && !typesLoading"
              class="states-zoo-row-type-error"
              role="alert"
            >
              This saved state type is not available from the server.
            </p>
          </div>

          <div class="states-zoo-preview-column">
            <div
              class="states-zoo-preview"
              :aria-busy="previewState(variable.id).busy"
            >
              <img
                v-if="previewState(variable.id).imageUrl"
                class="states-zoo-preview-image"
                :src="previewState(variable.id).imageUrl"
                :alt="`State preview for ${variable.name || variable.id}`"
              />
              <div v-else class="states-zoo-preview-placeholder">
                Preview unavailable
              </div>
              <div
                v-if="previewState(variable.id).busy"
                class="states-zoo-preview-overlay"
                role="status"
                aria-label="Rendering state preview"
              >
                <LoaderCircle class="states-zoo-preview-spinner" :size="28" aria-hidden="true" />
                <span class="visually-hidden">Rendering state preview</span>
              </div>
            </div>
            <div
              v-if="previewState(variable.id).error"
              class="states-zoo-preview-error"
              role="alert"
            >
              <span>{{ previewState(variable.id).error }}</span>
              <button
                type="button"
                :disabled="previewState(variable.id).busy"
                @click="retryPreview(variable)"
              >
                Retry preview
              </button>
            </div>
            <HelpCallout
              v-if="isWeighted(variable) && traceVariable(variable)"
              class="states-zoo-trace-note"
            >
              Generated <code>Float64</code> companion variable
              <code>{{ traceVariable(variable).name }}</code>
              with trace value <strong>{{ traceVariable(variable).value }}</strong>.
            </HelpCallout>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup>
import { computed, inject, onMounted, onUnmounted, reactive, ref, toRaw, watch } from 'vue'
import { LoaderCircle, Plus, Trash2 } from '@lucide/vue'
import { EDITOR_DRAFT_REGISTRY_KEY } from '../../composables/editorDraftRegistry'
import {
  VariableReference,
  isStatesZooParameterSourceVariable,
  isStatesZooTraceVariable,
  isStatesZooVariable,
  isVariableReference,
  isVariableReferenced,
  referencedStatesZooParameterVariables,
  statesZooValueReferencesVariable
} from '../../models/Variable'
import { api } from '../../utils/ApiConnector'
import { watermarkGeneratedPng } from '../../utils/pngWatermark'
import { generateUUid } from '../../utils/Utils'
import HelpCallout from '../ui/HelpCallout.vue'

const PREVIEW_DEBOUNCE_MS = 500

const props = defineProps({
  variables: {
    type: Array,
    default: () => []
  },
  projectData: {
    type: Object,
    required: true
  },
  disabled: {
    type: Boolean,
    default: false
  }
})
const emit = defineEmits(['designOperations'])

const statesZooTypes = ref([])
const typesLoading = ref(false)
const typesError = ref('')
const previewStates = reactive({})
const previewTimers = new Map()
const previewControllers = new Map()
const previewGenerations = new Map()
const stateDrafts = reactive({})
const dirtyStateDrafts = new Set()
const stateDraftVersions = new Map()
const pendingStateCommits = new Map()
const draftRegistry = inject(EDITOR_DRAFT_REGISTRY_KEY, null)
let catalogController = null
let isUnmounted = false

const zooVariables = computed(() => props.variables.filter(isStatesZooVariable))
const compatibleParameterVariables = computed(() => (
  props.variables.filter(isStatesZooParameterSourceVariable)
))

function normalizeParameter(parameter) {
  return {
    name: String(parameter.name),
    min: Number(parameter.min),
    max: Number(parameter.max),
    good: Number(parameter.good),
    doc: String(parameter.doc || '')
  }
}

function normalizeStateType(type) {
  return {
    id: String(type.id),
    displayName: type.display_name || type.id,
    weighted: type.weighted === true,
    parameters: Array.isArray(type.parameters)
      ? type.parameters.map(normalizeParameter)
      : []
  }
}

function stateType(typeId) {
  return statesZooTypes.value.find(type => type.id === typeId)
}

function parametersFor(variable) {
  return stateType(stateDraft(variable).value.state_type)?.parameters || []
}

function defaultParameters(type) {
  return Object.fromEntries(type.parameters.map(parameter => [parameter.name, parameter.good]))
}

function traceVariableId(variable) {
  return `${variable.id}_tr`
}

function traceVariableSlot(variable) {
  const id = traceVariableId(variable)
  return props.variables.find(candidate => candidate.id === id)
}

function traceVariable(variable) {
  const candidate = traceVariableSlot(variable)
  return isStatesZooTraceVariable(candidate)
    && candidate.statesZooTraceSourceId === variable.id
    ? candidate
    : undefined
}

function isWeighted(variable) {
  return stateType(stateDraft(variable).value.state_type)?.weighted === true
}

function traceName(variable) {
  return `${stateDraft(variable).name}_tr`
}

function traceIdCollisionError(variable) {
  const candidate = traceVariableSlot(variable)
  if (!candidate || candidate === traceVariable(variable)) return ''
  return `Cannot generate trace variable because ID '${traceVariableId(variable)}' is already in use`
}

function traceNameCollisionError(variable) {
  const expectedName = traceName(variable)
  const companion = traceVariable(variable)
  const collision = props.variables.find(candidate => (
    candidate !== variable
    && candidate !== companion
    && candidate.name?.trim() === expectedName
  ))
  return collision
    ? `Cannot generate trace variable because name '${expectedName}' is already in use`
    : ''
}

function traceLifecycleError(variable) {
  return traceIdCollisionError(variable) || traceNameCollisionError(variable)
}

function setTraceLifecycleError(variable, message) {
  previewState(variable.id).error = message
}

function clearTraceLifecycleError(variable) {
  const state = previewState(variable.id)
  if (
    state.error.startsWith('Cannot generate trace variable')
    || state.error.startsWith('Unlink the generated trace variable')
  ) state.error = ''
}

function traceIsReferenced(variable) {
  const companion = traceVariable(variable)
  return !!companion && isReferenced(companion.id)
}

function previewState(variableId) {
  if (!previewStates[variableId]) {
    previewStates[variableId] = {
      busy: false,
      error: '',
      imageUrl: ''
    }
  }
  return previewStates[variableId]
}

function nextVariableName() {
  const existingNames = new Set(props.variables.map(variable => variable.name))
  let index = props.variables.length + 1
  let candidate = `state_${index}`
  while (existingNames.has(candidate)) {
    index += 1
    candidate = `state_${index}`
  }
  return candidate
}

function addStateVariable() {
  if (props.disabled || statesZooTypes.value.length === 0) return
  const type = statesZooTypes.value[0]
  const id = generateUUid('variable')
  emit(
    'designOperations',
    [{
      kind: 'states.create',
      id,
      value: {
        name: nextVariableName(),
        state_type: type.id,
        parameters: defaultParameters(type),
      },
    }],
    () => {
      const variable = props.variables.find(candidate => candidate.id === id)
      if (variable) schedulePreview(variable, 0)
    },
  )
}

function changeStateName(variable, rawName) {
  if (props.disabled) return
  const draft = stateDraft(variable)
  draft.name = rawName
  markStateDraftDirty(variable.id)
  if (!draft.name.trim() || variableNameError(variable)) return
  commitStateDraft(variable)
}

function deleteStateVariable(variable) {
  if (props.disabled || stateDeleteBlocked(variable)) return
  cleanupPreview(variable.id)
  emit('designOperations', [{
    kind: 'states.remove',
    variable_id: variable.id,
  }])
}

function changeStateType(variable, typeId) {
  if (props.disabled) return
  const type = stateType(typeId)
  if (!type) return
  if (!type.weighted && traceIsReferenced(variable)) {
    setTraceLifecycleError(
      variable,
      'Unlink the generated trace variable from protocol or background parameters before choosing an unweighted state',
    )
    return
  }
  const draft = stateDraft(variable)
  draft.value.state_type = type.id
  draft.value.parameters = defaultParameters(type)
  markStateDraftDirty(variable.id)
  schedulePreview(variable)
  const lifecycleError = traceLifecycleError(variable)
  if (type.weighted && lifecycleError) {
    setTraceLifecycleError(variable, lifecycleError)
    return
  }
  commitStateDraft(variable)
}

function changeParameter(variable, parameterName, rawValue) {
  if (props.disabled) return
  stateDraft(variable).value.parameters[parameterName] = rawValue === '' ? null : Number(rawValue)
  markStateDraftDirty(variable.id)
  schedulePreview(variable)
}

function parameterSourceId(variable, parameterName) {
  const value = stateDraft(variable).value.parameters[parameterName]
  return isVariableReference(value) ? value.id : ''
}

function parameterSourceVariable(variable, parameterName) {
  const sourceId = parameterSourceId(variable, parameterName)
  return compatibleParameterVariables.value.find(source => source.id === sourceId)
}

function parameterIsLinked(variable, parameterName) {
  return isVariableReference(stateDraft(variable).value.parameters[parameterName])
}

function parameterDisplayValue(variable, parameterName) {
  if (!parameterIsLinked(variable, parameterName)) {
    return stateDraft(variable).value.parameters[parameterName]
  }
  return parameterSourceVariable(variable, parameterName)?.value ?? ''
}

function changeParameterSource(variable, parameter, sourceId) {
  if (props.disabled) return
  const parameters = stateDraft(variable).value.parameters
  if (sourceId) {
    const source = compatibleParameterVariables.value.find(candidate => candidate.id === sourceId)
    if (!source) return
    parameters[parameter.name] = new VariableReference(source.id)
  } else {
    const displayed = Number(parameterDisplayValue(variable, parameter.name))
    parameters[parameter.name] = Number.isFinite(displayed) ? displayed : parameter.good
  }
  markStateDraftDirty(variable.id)
  schedulePreview(variable)
}

function markStateDraftDirty(variableId) {
  dirtyStateDrafts.add(variableId)
  stateDraftVersions.set(variableId, (stateDraftVersions.get(variableId) || 0) + 1)
}

function parameterValueInvalid(variable, parameter) {
  const rawValue = parameterDisplayValue(variable, parameter.name)
  if (rawValue == null || rawValue === '') return true
  const value = Number(rawValue)
  return !Number.isFinite(value)
    || value < Number(parameter.min)
    || value > Number(parameter.max)
}

function stateDraft(variable) {
  stateDrafts[variable.id] ||= stateDraftFromVariable(variable)
  return stateDrafts[variable.id]
}

function stateDraftFromVariable(variable) {
  return {
    id: variable.id,
    name: variable.name,
    value: {
      kind: variable.value.kind,
      state_type: variable.value.state_type,
      parameters: cloneParameters(variable.value.parameters),
    },
  }
}

function cloneParameters(parameters) {
  return structuredClone(toRaw(parameters || {}))
}

function commitStateDraft(variable) {
  const version = stateDraftVersions.get(variable.id) || 0
  const pending = pendingStateCommits.get(variable.id)
  if (pending?.version === version) return pending.promise

  const draft = stateDraft(variable)
  const value = {
    name: draft.name.trim(),
    state_type: draft.value.state_type,
    parameters: cloneParameters(draft.value.parameters),
  }
  const entry = { version, promise: null }
  entry.promise = new Promise(resolve => {
    emit(
      'designOperations',
      [{
        kind: 'states.update',
        variable_id: variable.id,
        value,
      }],
      () => {
        if ((stateDraftVersions.get(variable.id) || 0) === version) {
          dirtyStateDrafts.delete(variable.id)
          stateDrafts[variable.id] = stateDraftFromVariable(variable)
          clearTraceLifecycleError(variable)
        }
        resolve({ valid: true })
      },
      error => {
        if ((stateDraftVersions.get(variable.id) || 0) === version) {
          setTraceLifecycleError(variable, traceLifecycleError(variable) || error.message)
        }
        resolve({
          valid: false,
          details: {
            variable_id: variable.id,
            message: error?.message || 'The state draft could not be saved.',
          },
        })
        return true
      },
    )
  })
  pendingStateCommits.set(variable.id, entry)
  entry.promise.finally(() => {
    if (pendingStateCommits.get(variable.id) === entry) {
      pendingStateCommits.delete(variable.id)
    }
  })
  return entry.promise
}

function validateStateDraft(variable) {
  const type = stateType(stateDraft(variable).value.state_type)
  if (!type) {
    return {
      valid: false,
      details: { variable_id: variable.id, field: 'state_type' },
    }
  }
  const nameError = variableNameError(variable)
  if (nameError) {
    return {
      valid: false,
      details: { variable_id: variable.id, field: 'name', message: nameError },
    }
  }
  const invalidParameter = type.parameters.find(parameter => (
    parameterValueInvalid(variable, parameter)
  ))
  if (invalidParameter) {
    return {
      valid: false,
      details: {
        variable_id: variable.id,
        field: `parameters.${invalidParameter.name}`,
      },
    }
  }
  const lifecycleError = traceLifecycleError(variable)
  if (type.weighted && lifecycleError) {
    return {
      valid: false,
      details: { variable_id: variable.id, field: 'trace', message: lifecycleError },
    }
  }
  return { valid: true }
}

async function flushStateDrafts() {
  if (dirtyStateDrafts.size === 0) return { valid: true }
  if (typesLoading.value) {
    return { busy: true, details: { reason: 'catalog-loading' } }
  }

  for (const variableId of [...dirtyStateDrafts]) {
    const variable = props.variables.find(candidate => candidate.id === variableId)
    if (!variable) {
      dirtyStateDrafts.delete(variableId)
      continue
    }
    const validation = validateStateDraft(variable)
    if (validation.valid === false) return validation

    cancelPreviewWork(variableId)
    previewGenerations.set(variableId, (previewGenerations.get(variableId) || 0) + 1)
    previewState(variableId).busy = false
    const result = await commitStateDraft(variable)
    if (result?.valid === false) return result
  }
  return { valid: true }
}

const unregisterDraft = draftRegistry?.register({
  id: 'states-zoo',
  flush: flushStateDrafts,
})

function isReferenced(variableId) {
  return isVariableReferenced(props.projectData, variableId)
}

function stateDeleteBlocked(variable) {
  return isReferenced(variable.id) || traceIsReferenced(variable)
}

function deleteTitle(variable) {
  if (props.disabled) return 'Reset the simulation to edit state variables'
  if (isReferenced(variable.id)) {
    return 'Unlink this variable from constructor parameters before deleting it'
  }
  if (traceIsReferenced(variable)) {
    return 'Unlink the generated trace variable from protocol or background parameters before deleting this state'
  }
  return 'Delete state variable'
}

function unweightedTransitionBlocked(variable, type) {
  return !type.weighted && isWeighted(variable) && traceIsReferenced(variable)
}

function unweightedTransitionTitle(variable, type) {
  return unweightedTransitionBlocked(variable, type)
    ? 'Unlink the generated trace variable before choosing an unweighted state'
    : undefined
}

function variableNameError(variable) {
  const name = stateDraft(variable).name
  if (!name?.trim()) return 'Name is required'
  const duplicateCount = props.variables.filter(candidate => (
    (isStatesZooVariable(candidate)
      ? stateDraft(candidate).name
      : candidate.name)?.trim() === name.trim()
  )).length
  if (duplicateCount > 1) return 'Name must be unique'
  return isWeighted(variable) ? traceNameCollisionError(variable) : ''
}

function cancelPreviewWork(variableId) {
  const timer = previewTimers.get(variableId)
  if (timer !== undefined) {
    clearTimeout(timer)
    previewTimers.delete(variableId)
  }

  const controller = previewControllers.get(variableId)
  if (controller) {
    controller.abort()
    previewControllers.delete(variableId)
  }
}

function cleanupPreview(variableId) {
  cancelPreviewWork(variableId)
  previewGenerations.set(variableId, (previewGenerations.get(variableId) || 0) + 1)
  delete previewStates[variableId]
}

function schedulePreview(variable, delay = PREVIEW_DEBOUNCE_MS) {
  if (isUnmounted || !isStatesZooVariable(variable)) return

  const variableId = variable.id
  const generation = (previewGenerations.get(variableId) || 0) + 1
  previewGenerations.set(variableId, generation)
  cancelPreviewWork(variableId)
  previewState(variableId).busy = false

  const timer = setTimeout(() => {
    previewTimers.delete(variableId)
    renderPreview(variable, generation)
  }, delay)
  previewTimers.set(variableId, timer)
}

async function previewImageUrl(response, { signal } = {}) {
  const png = response?.png_base64
  if (typeof png !== 'string' || png.length === 0) {
    throw new Error('The server returned an invalid state preview')
  }
  return watermarkGeneratedPng(png, { signal })
}

async function renderPreview(variable, generation) {
  const variableId = variable.id
  if (isUnmounted || previewGenerations.get(variableId) !== generation) return
  const liveVariable = props.variables.find(candidate => candidate.id === variableId)
  if (!liveVariable) return

  const state = previewState(variableId)
  const controller = new AbortController()
  previewControllers.set(variableId, controller)
  state.busy = true
  state.error = ''

  try {
    const response = await api.fetchStatesZooPreview(
      stateDraft(liveVariable).value.state_type,
      { ...stateDraft(liveVariable).value.parameters },
      {
        signal: controller.signal,
        variables: referencedStatesZooParameterVariables(
          stateDraft(liveVariable).value,
          props.variables,
        ),
      }
    )
    if (response?.success === false) {
      throw new Error(response.error || response.message || 'State preview failed')
    }
    if (previewGenerations.get(variableId) !== generation || isUnmounted) return
    const lifecycleError = isWeighted(liveVariable)
      ? traceLifecycleError(liveVariable)
      : ''
    if (lifecycleError) throw new Error(lifecycleError)
    const imageUrl = await previewImageUrl(response, { signal: controller.signal })
    if (previewGenerations.get(variableId) !== generation || isUnmounted) return
    state.imageUrl = imageUrl
    const previewTrace = Number(response?.trace)
    const companion = traceVariable(liveVariable)
    const traceNeedsSync = isWeighted(liveVariable)
      ? Number.isFinite(previewTrace)
        && previewTrace > 0
        && (
          !companion
          || companion.name !== traceName(liveVariable)
          || companion.type !== 'Float64'
          || !Object.is(Number(companion.value), previewTrace)
        )
      : !!companion
    if (!props.disabled && traceNeedsSync && !dirtyStateDrafts.has(variableId)) {
      markStateDraftDirty(variableId)
    }
    if (dirtyStateDrafts.has(variableId)) commitStateDraft(liveVariable)
  } catch (error) {
    if (error?.name === 'AbortError') return
    if (previewGenerations.get(variableId) !== generation || isUnmounted) return
    state.error = error?.message || 'State preview failed'
  } finally {
    if (previewControllers.get(variableId) === controller) {
      previewControllers.delete(variableId)
    }
    if (previewGenerations.get(variableId) === generation && !isUnmounted) {
      state.busy = false
    }
  }
}

function retryPreview(variable) {
  schedulePreview(variable, 0)
}

async function loadStatesZooTypes() {
  catalogController?.abort()
  catalogController = new AbortController()
  const controller = catalogController
  typesLoading.value = true
  typesError.value = ''

  try {
    const types = await api.fetchStatesZooTypes({
      signal: controller.signal,
      force: true
    })
    if (isUnmounted || catalogController !== controller) return
    statesZooTypes.value = types.map(normalizeStateType)
    zooVariables.value.forEach(variable => schedulePreview(variable, 0))
  } catch (error) {
    if (error?.name === 'AbortError' || isUnmounted) return
    typesError.value = error?.message || 'Unable to load States Zoo types'
  } finally {
    if (catalogController === controller) {
      catalogController = null
      if (!isUnmounted) typesLoading.value = false
    }
  }
}

watch(
  () => zooVariables.value.map(variable => variable.id),
  (ids, oldIds = []) => {
    const currentIds = new Set(ids)
    oldIds.forEach(id => {
      if (!currentIds.has(id)) cleanupPreview(id)
    })

    if (statesZooTypes.value.length === 0) return
    const previousIds = new Set(oldIds)
    zooVariables.value.forEach(variable => {
      if (!previousIds.has(variable.id)) schedulePreview(variable, 0)
    })
  },
  { immediate: true }
)

watch(
  () => props.variables.filter(isStatesZooVariable).map(variable => ({
    id: variable.id,
    name: variable.name,
    value: variable.value,
  })),
  variables => {
    const retained = new Set(variables.map(variable => variable.id))
    Object.keys(stateDrafts).forEach(id => {
      if (!retained.has(id)) {
        delete stateDrafts[id]
        dirtyStateDrafts.delete(id)
        stateDraftVersions.delete(id)
      }
    })
    variables.forEach(variable => {
      if (!dirtyStateDrafts.has(variable.id)) {
        stateDrafts[variable.id] = stateDraftFromVariable(variable)
      }
      if (statesZooTypes.value.length > 0 && !dirtyStateDrafts.has(variable.id)) {
        const liveVariable = props.variables.find(candidate => candidate.id === variable.id)
        if (liveVariable) schedulePreview(liveVariable, 0)
      }
    })
  },
  { immediate: true, deep: true },
)

watch(
  () => props.variables
    .filter(variable => !isStatesZooVariable(variable) && !isStatesZooTraceVariable(variable))
    .map(variable => ({ id: variable.id, type: variable.type, value: variable.value })),
  (sources, previousSources = []) => {
    const previousById = new Map(previousSources.map(source => [source.id, source]))
    const changedIds = new Set(sources
      .filter(source => {
        const previous = previousById.get(source.id)
        return previous && (
          previous.type !== source.type || !Object.is(previous.value, source.value)
        )
      })
      .map(source => source.id))
    const currentIds = new Set(sources.map(source => source.id))
    previousSources.forEach(source => {
      if (!currentIds.has(source.id)) changedIds.add(source.id)
    })
    if (changedIds.size === 0) return

    zooVariables.value.forEach(variable => {
      const draftValue = stateDraft(variable).value
      if ([...changedIds].some(id => statesZooValueReferencesVariable(draftValue, id))) {
        schedulePreview(variable, 0)
      }
    })
  },
  { deep: true },
)

onMounted(loadStatesZooTypes)

onUnmounted(() => {
  isUnmounted = true
  unregisterDraft?.()
  catalogController?.abort()
  catalogController = null
  for (const variableId of new Set([
    ...previewTimers.keys(),
    ...previewControllers.keys(),
    ...Object.keys(previewStates)
  ])) {
    cleanupPreview(variableId)
  }
})
</script>

<style scoped>
.states-zoo-panel {
  padding: 0 6px 8px;
}

.states-zoo-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 8px;
}

.add-states-zoo-button {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 5px;
}

.states-zoo-weight-help {
  margin-bottom: var(--app-space-3);
}

.states-zoo-catalog-status,
.states-zoo-catalog-error,
.empty-states-zoo {
  padding: 14px;
  color: #777;
  text-align: center;
}

.states-zoo-catalog-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #b42318;
}

.states-zoo-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.states-zoo-row {
  padding: 8px;
  border: 1px solid #e2e2ea;
  border-radius: 5px;
  background: #fafafe;
}

.states-zoo-row-header {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) 32px;
  align-items: start;
  gap: 10px;
  margin-bottom: 9px;
}

.states-zoo-row-content {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) minmax(260px, 1.15fr);
  gap: 14px;
}

.states-zoo-controls,
.states-zoo-preview-column {
  min-width: 0;
}

.states-zoo-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
  color: #666;
  font-size: 0.75rem;
  font-weight: 600;
}

.states-zoo-field input,
.states-zoo-field select {
  width: 100%;
  min-width: 0;
  font-size: 0.9rem;
  font-weight: 400;
}

.states-zoo-type-field {
  margin-bottom: 7px;
}

.states-zoo-parameter-control {
  margin-top: 6px;
}

.states-zoo-parameter-label {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: #555;
  font-size: 0.78rem;
  font-weight: 600;
}

.states-zoo-parameter-range-text {
  color: #888;
  font-size: 0.72rem;
  font-weight: 400;
}

.states-zoo-parameter-inputs {
  display: grid;
  grid-template-columns: minmax(90px, 1fr) 92px;
  align-items: center;
  gap: 8px;
}

.states-zoo-parameter-source {
  width: 100%;
  min-width: 0;
  margin: 2px 0;
  font-size: 0.8rem;
}

.states-zoo-parameter-range,
.states-zoo-parameter-input {
  width: 100%;
  min-width: 0;
}

.states-zoo-parameter-input {
  padding: 0 6px;
}

.invalid-states-zoo-name {
  border-color: #d33;
}

.states-zoo-name-error,
.states-zoo-row-type-error,
.states-zoo-preview-error {
  color: #b42318;
  font-weight: 400;
}

.delete-states-zoo-button {
  width: 28px;
  height: 28px;
  margin-top: 17px;
  padding: 0;
  color: #666;
}

.delete-states-zoo-button:not(:disabled):hover {
  color: #b42318;
}

.states-zoo-preview {
  position: relative;
  display: flex;
  min-height: 150px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid #e2e2ea;
  border-radius: 4px;
  background: #fff;
}

.states-zoo-preview-image {
  display: block;
  width: 100%;
  height: auto;
  max-height: 230px;
  object-fit: contain;
}

.states-zoo-preview-placeholder {
  color: #999;
  font-size: 0.82rem;
}

.states-zoo-preview-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(255 255 255 / 64%);
}

.states-zoo-preview-spinner {
  color: #4345ac;
  animation: states-zoo-spin 0.75s linear infinite;
}

.states-zoo-preview-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 5px;
  font-size: 0.78rem;
}

.states-zoo-preview-error button {
  flex: 0 0 auto;
  height: 23px;
  padding: 2px 8px;
  font-size: 0.75rem;
}

.states-zoo-trace-note {
  margin-top: var(--app-space-2);
}

@keyframes states-zoo-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .states-zoo-preview-spinner {
    animation-duration: 1.8s;
  }
}

@media (max-width: 850px) {
  .states-zoo-row-content {
    grid-template-columns: 1fr;
  }
}
</style>
