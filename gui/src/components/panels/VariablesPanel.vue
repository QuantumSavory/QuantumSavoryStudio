<template>
  <div class="variables-panel" data-testid="variables-panel">
    <div class="variables-header">
      <p class="variables-description">
        Define values once and link them to constructor parameters.
      </p>
      <button
        type="button"
        class="add-variable-button"
        :disabled="disabled"
        @click="addVariable"
      >
        <Plus :size="15" aria-hidden="true" />
        Add Variable
      </button>
    </div>

    <div v-if="ordinaryVariables.length === 0" class="empty-variables">
      No variables
    </div>

    <div v-else class="variables-list">
      <div
        v-for="variable in ordinaryVariables"
        :key="variable.id"
        class="variable-row"
        :data-variable-id="variable.id"
      >
        <label class="variable-field variable-name-field">
          <span>Name</span>
          <input
            :value="draftFor(variable).name"
            type="text"
            class="variable-name-input"
            :class="{ 'invalid-variable-name': !!variableNameError(variable) }"
            :aria-invalid="!!variableNameError(variable)"
            :aria-describedby="variableNameError(variable) ? `variable-name-error-${variable.id}` : undefined"
            :aria-label="`Variable name for ${variable.id}`"
            :disabled="disabled"
            @input="onNameInput(variable, $event.target.value)"
          />
          <small
            v-if="variableNameError(variable)"
            :id="`variable-name-error-${variable.id}`"
            class="variable-error"
            role="alert"
          >
            {{ variableNameError(variable) }}
          </small>
        </label>

        <label class="variable-field variable-type-field">
          <span>Type</span>
          <select
            :value="draftFor(variable).selectedType"
            class="variable-type-select"
            data-testid="variable-option-selector"
            :aria-label="`Input option for variable ${variable.name || variable.id}`"
            :disabled="disabled"
            @change="onOptionChanged(variable, $event.target.value)"
          >
            <option
              v-for="option in variableInputOptions"
              :key="option.id"
              :value="option.id"
              :disabled="!option.enabled"
            >
              {{ option.label }}
            </option>
          </select>
        </label>

        <div class="variable-field variable-value-field">
          <span>Value</span>
          <div class="variable-value-input">
            <TypedValueInput
              :parameter="draftFor(variable)"
              :type="draftFor(variable).selectedType"
              :disabled="disabled"
              category="variable"
              placeholder="value"
              initially-open
              @commit="commitDraftValue(variable)"
            />
          </div>
        </div>

        <button
          type="button"
          class="delete-variable-button noborder"
          :disabled="disabled || isReferenced(variable.id)"
          :title="deleteTitle(variable.id)"
          :aria-label="`Delete variable ${variable.name || variable.id}`"
          @click="deleteVariable(variable)"
        >
          <Trash2 :size="15" aria-hidden="true" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, toRaw, watch } from 'vue'
import { Plus, Trash2 } from '@lucide/vue'
import {
  isStatesZooTraceVariable,
  isStatesZooVariable,
  isVariableReferenced
} from '../../models/Variable'
import {
  buildVariableInputOptions,
  isNumericExpressionValue,
  parameterInputIsComplete,
  resetValueForType
} from '../../utils/parameterTypes'
import TypedValueInput from './TypedValueInput.vue'

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
const drafts = reactive({})

const variableInputOptions = buildVariableInputOptions()
const ordinaryVariables = computed(() => props.variables.filter(variable => (
  !isStatesZooVariable(variable) && !isStatesZooTraceVariable(variable)
)))

function nextVariableName() {
  const existingNames = new Set(props.variables.map(variable => variable.name))
  let index = props.variables.length + 1
  let candidate = `variable_${index}`
  while (existingNames.has(candidate)) {
    index += 1
    candidate = `variable_${index}`
  }
  return candidate
}

function addVariable() {
  if (props.disabled) return
  emit('designOperations', [{
    kind: 'variables.create',
    value: {
      name: nextVariableName(),
      type: 'Float64',
      selectedType: 'Float64',
      value: 0,
    },
  }])
}

function deleteVariable(variable) {
  if (props.disabled || isReferenced(variable.id)) return
  emit('designOperations', [{
    kind: 'variables.remove',
    variable_id: variable.id,
  }])
}

function optionById(id) {
  return variableInputOptions.find(option => option.id === id)
    || variableInputOptions[0]
}

function onOptionChanged(variable, selectedType) {
  if (props.disabled) return
  const draft = draftFor(variable)
  const option = optionById(selectedType)
  draft.selectedType = option.id
  draft.type = option.wireType
  draft._inputDirty = true
  resetValueForType(draft, option.id)
  if (['boolean', 'intrinsic'].includes(option.inputKind)) {
    commitDraftValue(variable)
  }
}

function draftFor(variable) {
  drafts[variable.id] ||= {
    id: variable.id,
    name: variable.name,
    type: variable.type,
    selectedType: initialSelectedType(variable),
    value: cloneValue(variable.value),
    _inputDirty: false,
  }
  return drafts[variable.id]
}

function initialSelectedType(variable) {
  if (isNumericExpressionValue(variable.value)) {
    const expression = variableInputOptions.find(option => (
      option.inputKind === 'numeric-expression' && option.wireType === variable.type
    ))
    if (expression) return expression.id
  }
  const semantic = variableInputOptions.find(option => option.id === variable.type)
  return semantic?.id || variableInputOptions[0].id
}

function cloneValue(value) {
  return value && typeof value === 'object'
    ? structuredClone(toRaw(value))
    : value
}

function valuesEqual(left, right) {
  if (Object.is(left, right)) return true
  if (
    !left
    || !right
    || typeof left !== 'object'
    || typeof right !== 'object'
  ) return false
  return JSON.stringify(toRaw(left)) === JSON.stringify(toRaw(right))
}

function onNameInput(variable, rawName) {
  const draft = draftFor(variable)
  draft.name = rawName.trim()
  if (!variableNameError(variable)) {
    commitVariable(variable, { name: draft.name })
  }
}

function commitVariable(variable, value) {
  if (props.disabled) return
  emit('designOperations', [{
    kind: 'variables.update',
    variable_id: variable.id,
    value: Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]),
    ),
  }])
}

function commitDraftValue(variable) {
  const draft = draftFor(variable)
  if (!parameterInputIsComplete(optionById(draft.selectedType), draft)) return
  draft._inputDirty = false
  commitVariable(variable, {
    type: draft.type,
    selectedType: draft.selectedType,
    value: draft.value,
  })
}

watch(
  () => props.variables.map(variable => ({
    id: variable.id,
    name: variable.name,
    type: variable.type,
    value: variable.value,
  })),
  variables => {
    const retained = new Set(variables.map(variable => variable.id))
    Object.keys(drafts).forEach(id => {
      if (!retained.has(id)) delete drafts[id]
    })
    variables.forEach(variable => {
      const currentDraft = drafts[variable.id]
      if (currentDraft?._inputDirty) {
        currentDraft.name = variable.name
        return
      }
      const preserveCodePresentation = currentDraft
        && currentDraft.type === variable.type
        && valuesEqual(currentDraft.value, variable.value)
      drafts[variable.id] = {
        ...variable,
        selectedType: initialSelectedType(variable),
        value: cloneValue(variable.value),
        _inputDirty: false,
        ...(preserveCodePresentation && Object.hasOwn(currentDraft, 'latex')
          ? { latex: currentDraft.latex }
          : {}),
        ...(preserveCodePresentation && Object.hasOwn(currentDraft, 'error')
          ? { error: currentDraft.error }
          : {}),
      }
    })
  },
  { immediate: true, deep: true },
)

function isReferenced(variableId) {
  return isVariableReferenced(props.projectData, variableId)
}

function deleteTitle(variableId) {
  if (props.disabled) return 'Reset the simulation to edit variables'
  if (isReferenced(variableId)) {
    return 'Unlink this variable from constructor parameters before deleting it'
  }
  return 'Delete variable'
}

function variableNameError(variable) {
  const name = draftFor(variable).name
  if (!name?.trim()) return 'Name is required'
  const duplicateCount = props.variables.filter(candidate => (
    draftFor(candidate).name?.trim() === name.trim()
  )).length
  return duplicateCount > 1 ? 'Name must be unique' : ''
}
</script>

<style scoped>
.variables-panel {
  padding: 0 6px 8px;
}

.variables-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 8px;
}

.add-variable-button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.variables-description {
  margin: 0;
  color: #666;
  font-size: 0.85rem;
}

.add-variable-button {
  flex: 0 0 auto;
}

.empty-variables {
  padding: 14px;
  color: #999;
  text-align: center;
}

.variables-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.variable-row {
  display: grid;
  grid-template-columns: minmax(130px, 0.8fr) minmax(150px, 0.7fr) minmax(220px, 1.5fr) 32px;
  align-items: start;
  gap: 10px;
  padding: 8px;
  border: 1px solid #e2e2ea;
  border-radius: 5px;
  background: #fafafe;
}

.variable-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
  color: #666;
  font-size: 0.75rem;
  font-weight: 600;
}

.variable-field input,
.variable-field select {
  width: 100%;
  min-width: 0;
  font-size: 0.9rem;
  font-weight: 400;
}

.variable-value-input {
  min-height: 25px;
  color: #111;
  font-size: 0.9rem;
  font-weight: 400;
}

.variable-value-input :deep(input),
.variable-value-input :deep(select) {
  width: 100%;
}

.invalid-variable-name {
  border-color: #d33;
}

.variable-error {
  color: #b42318;
  font-weight: 400;
}

.delete-variable-button {
  width: 25px;
  margin-top: 17px;
  color: #666;
}

.delete-variable-button:not(:disabled):hover {
  color: #b42318;
}

@media (max-width: 850px) {
  .variable-row {
    grid-template-columns: 1fr 1fr 32px;
  }

  .variable-value-field {
    grid-column: 1 / 3;
    grid-row: 2;
  }
}
</style>
