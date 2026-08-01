<template>
  <div
    class="constructor-form"
    :data-testid="template ? templateTestId : testId"
    :data-template="String(template)"
  >
    <div v-if="filteredParameters.length" class="params-container">
      <div v-for="param in filteredParameters" :key="parameterName(param)" class="param-item">
        <div
          class="param-item-row"
          :class="{
            'grayed-parameter': isGrayedParameter(param),
            'columnParamRow': !isVariableAssigned(param) && optionUsesWideEditor(param),
            'controlled-parameter': isControlledParameter(param),
          }"
        >
          <div
            v-tooltip.top="{
              value: parameterDefinitionText(param),
              pt: { arrow: { style: { borderTopColor: 'var(--app-color-surface)' } } },
            }"
            class="param-name"
          >
            {{ parameterName(param) }}
            <span v-if="paramUnknownTypes(param).length" class="unknown-type-indicator">
              <TriangleAlert :size="13" aria-hidden="true" />
            </span>
            <br>
            <select
              v-model="param.selectedType"
              class="complexTypeSelector"
              data-testid="parameter-option-selector"
              :disabled="parameterDisabled(param) || isVariableAssigned(param)"
              :aria-label="`Input option for ${parameterName(param)}`"
              :aria-describedby="controlledDescriptionId(param)"
              @change="onSelectedTypeChanged(param)"
            >
              <option v-if="!param.selectedType" value="" disabled>Select input</option>
              <option
                v-for="option in parameterInputOptions(param)"
                :key="option.id"
                :value="option.id"
                :disabled="!option.enabled"
              >
                {{ option.label }}
              </option>
            </select>
          </div>

          <div
            class="param-value"
            :class="{
              noInteraction: isGrayedParameter(param)
                && !isVariableAssigned(param)
                && !isVariablePickerOpen(param),
            }"
          >
            <div
              v-if="isVariableAssigned(param) || isVariablePickerOpen(param)"
              class="variable-assignment"
            >
              <div class="variable-assignment-control">
                <div class="variable-assignment-selector">
                  <Link2 :size="14" aria-hidden="true" />
                  <select
                    class="variable-selector"
                    :value="isVariableAssigned(param) ? param.value.id : ''"
                    :disabled="parameterDisabled(param)"
                    :aria-label="`Variable for ${parameterName(param)}`"
                    :aria-describedby="controlledDescriptionId(param)"
                    @change="assignVariable(param, $event.target.value)"
                  >
                    <option v-if="!isVariableAssigned(param)" value="" disabled>
                      Select a variable
                    </option>
                    <option
                      v-else-if="!assignedVariable(param)"
                      :value="param.value.id"
                      disabled
                    >
                      Missing variable ({{ param.value.id }})
                    </option>
                    <option
                      v-else-if="!variableIsCompatible(param, assignedVariable(param))"
                      :value="param.value.id"
                      disabled
                    >
                      Incompatible variable: {{ assignedVariable(param).name }}
                      ({{ variableDisplayType(assignedVariable(param)) }})
                    </option>
                    <option
                      v-for="variable in compatibleVariables(param)"
                      :key="variable.id"
                      :value="variable.id"
                    >
                      {{ variable.name }} ({{ variableDisplayType(variable) }})
                    </option>
                  </select>
                </div>
                <NumericExpressionInput
                  v-if="assignedVariableIsNumericExpression(param)"
                  :parameter="assignedVariable(param)"
                  :validation-target="param"
                  :parameter-name="parameterName(param)"
                  :target-type="assignedVariable(param).type"
                  :placement="category"
                  :context="numericExpressionContext"
                  :template="template"
                  :minimum="runtimeParameterDefinition(param)?.min"
                  :maximum="runtimeParameterDefinition(param)?.max"
                  linked
                />
              </div>
            </div>

            <template v-else-if="effectiveOption(param).inputKind === 'default'" />
            <span v-else-if="effectiveOption(param).inputKind === 'intrinsic'">
              {{ effectiveOption(param).id === 'Nothing' ? 'Nothing' : 'Wildcard' }}
            </span>
            <NamedTagTypeAutocomplete
              v-else-if="effectiveOption(param).inputKind === 'named-tag'"
              :model-value="param.value"
              :include-default="false"
              :disabled="parameterDisabled(param)"
              :parameter-name="parameterName(param)"
              :aria-describedby="controlledDescriptionId(param)"
              @update:model-value="updateNamedTagTypeValue(param, $event)"
            />
            <span
              v-else-if="effectiveOption(param).inputKind === 'unsupported'"
              class="unsupported-parameter-value"
            >
              Unsupported input type
            </span>
            <TypedValueInput
              v-else
              :parameter="param"
              :parameter-name="parameterName(param)"
              :type="effectiveOption(param).id"
              :disabled="parameterDisabled(param)"
              :category="category"
              :numeric-expression-context="numericExpressionContext"
              :numeric-minimum="runtimeParameterDefinition(param)?.min"
              :numeric-maximum="runtimeParameterDefinition(param)?.max"
              :required-input="runtimeParameterDefinition(param)?.required === true"
              :template="template"
              :initially-open="effectiveOption(param).inputKind === 'code'
                && !(typeof param.value === 'string' && param.value.trim())"
              :aria-describedby="controlledDescriptionId(param)"
              @commit="emit('commit')"
            />
          </div>

          <span class="variable-binding-control" v-tooltip.top="variableButtonTitle(param)">
            <button
              type="button"
              class="variable-binding-button noborder"
              :class="{ active: isVariableAssigned(param) || isVariablePickerOpen(param) }"
              :disabled="variableButtonDisabled(param)"
              :aria-label="variableButtonLabel(param)"
              :aria-describedby="controlledDescriptionId(param)"
              @click="toggleVariableAssignment(param)"
            >
              <Unlink2 v-if="isVariableAssigned(param)" :size="14" aria-hidden="true" />
              <Link2 v-else :size="14" aria-hidden="true" />
            </button>
          </span>
        </div>

        <p
          v-if="controlledReason(param)"
          :id="controlledDescriptionId(param)"
          class="controlled-parameter-note"
          role="status"
        >
          Strategy-controlled: {{ controlledReason(param) }}
        </p>
      </div>
    </div>

    <p v-else-if="emptyText" class="empty-constructor-parameters empty-protocol-parameters">
      {{ emptyText }}
    </p>
  </div>
</template>

<script setup>
import { computed, shallowRef, watch, watchEffect } from 'vue'
import { Link2, TriangleAlert, Unlink2 } from '@lucide/vue'
import { useDomId } from '../../composables/useDomId'
import { VariableReference, isVariableReference } from '../../models/Variable'
import {
  buildConstructorParameterInputOptions,
  getTypeOptionLabel,
  isNumericExpressionOptionId,
  isNumericExpressionValue,
  parameterInputOptionForVariable,
  parameterTypeSupportsVariableType,
  resolveParameterInputOption,
  resetValueForType,
  unknownParameterTypes,
} from '../../utils/parameterTypes'
import NamedTagTypeAutocomplete from './NamedTagTypeAutocomplete.vue'
import NumericExpressionInput from './NumericExpressionInput.vue'
import TypedValueInput from './TypedValueInput.vue'

const props = defineProps({
  constructor: { type: Object, required: true },
  parameterIdentity: { type: String, default: 'name' },
  getParameterDefinition: { type: Function, required: true },
  excludedParameters: { type: Array, default: () => [] },
  subject: { type: String, default: 'constructor' },
  testId: { type: String, default: 'constructor' },
  templateTestId: { type: String, default: 'template-constructor' },
  category: { type: String, default: 'floating' },
  variables: { type: Array, default: () => [] },
  editingLocked: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  controlledParameters: { type: Object, default: () => ({}) },
  emptyText: { type: String, default: 'No configurable parameters.' },
  numericExpressionContext: { type: Object, default: undefined },
  template: { type: Boolean, default: false },
})
const emit = defineEmits(['commit'])

// Draft parameter objects are replaced after each authoritative Design Command
// commit. Key the transient direct-value backup by constructor field so a
// link/unlink round trip survives that reconciliation without persisting UI
// state in the project.
const directParameterValues = new Map()
const initializedParameters = new WeakSet()
const variablePickerParameter = shallowRef(null)
const formId = useDomId('constructor')

function directParameterKey(param) {
  return `${props.subject}\u0000${props.constructor?.type ?? ''}\u0000${parameterName(param)}`
}

const isEditingDisabled = computed(() => props.disabled || props.editingLocked)
const filteredParameters = computed(() => {
  const parameters = props.constructor?.parameters
  if (!Array.isArray(parameters)) {
    console.warn('Constructor parameters is not an array:', parameters)
    return []
  }
  const excluded = new Set(props.excludedParameters)
  return parameters.filter(param => !excluded.has(parameterName(param)))
})

function parameterName(param) {
  return String(param?.[props.parameterIdentity] ?? '')
}

function runtimeParameterDefinition(param) {
  return props.getParameterDefinition(param) || null
}

function declaredParameterType(param) {
  return runtimeParameterDefinition(param)?.type ?? param.type
}

function parameterInputOptions(param) {
  return buildConstructorParameterInputOptions(
    declaredParameterType(param),
    runtimeParameterDefinition(param),
  )
}

function initializeParameter(param) {
  if (isVariableAssigned(param)) {
    const linkedOption = inputOptionForVariable(param, assignedVariable(param))
    if (linkedOption) {
      param.selectedType = linkedOption.id
    } else {
      const selection = resolveParameterInputOption(parameterInputOptions(param), param)
      if (!selection.explicit && selection.option) param.selectedType = selection.option.id
    }
    initializedParameters.add(param)
    return
  }
  if (initializedParameters.has(param)) return
  const options = parameterInputOptions(param)
  const selection = resolveParameterInputOption(options, param)
  if (!selection.explicit && selection.option) param.selectedType = selection.option.id
  initializedParameters.add(param)
}

function effectiveOption(param) {
  return parameterInputOptions(param).find(option => option.id === param.selectedType)
    || parameterInputOptions(param)[0]
}

function optionUsesWideEditor(param) {
  return ['code', 'numeric-expression'].includes(effectiveOption(param).inputKind)
}

function isGrayedParameter(param) {
  return effectiveOption(param).inputKind === 'unsupported'
}

function hasControlledParameter(param) {
  return Object.prototype.hasOwnProperty.call(
    props.controlledParameters || {},
    parameterName(param),
  )
}

function isControlledParameter(param) {
  return hasControlledParameter(param)
}

function controlledReason(param) {
  if (!hasControlledParameter(param)) return ''
  const reason = props.controlledParameters[parameterName(param)]
  return typeof reason === 'string' && reason.trim()
    ? reason.trim()
    : 'This value is set by the selected strategy.'
}

function controlledDescriptionId(param) {
  if (!controlledReason(param)) return undefined
  const name = String(parameterName(param) || 'parameter').replace(/[^a-zA-Z0-9_-]/g, '-')
  return `${formId}-${name}-controlled`
}

function parameterDisabled(param) {
  return isEditingDisabled.value || isControlledParameter(param)
}

function parameterDefinitionText(param) {
  let result = runtimeParameterDefinition(param)?.doc || 'NO DOC'
  const unsupported = paramUnknownTypes(param)
  if (unsupported.length) {
    result += '\n\n**Unsupported:** '
      + unsupported.map(type => `\`${type}\``).join(', ')
  }
  return result
}

function paramUnknownTypes(param) {
  return runtimeParameterDefinition(param)?.kind === 'named_tag_type'
    ? []
    : unknownParameterTypes(declaredParameterType(param))
}

function updateNamedTagTypeValue(param, value) {
  if (parameterDisabled(param) || isVariableAssigned(param)) return
  param.value = value
  delete param.error
  delete param.latex
  if (typeof value === 'string' && value.trim()) emit('commit')
}

function onSelectedTypeChanged(param) {
  if (parameterDisabled(param)) return
  resetValueForType(param, param.selectedType, {
    required: runtimeParameterDefinition(param)?.required === true,
  })
  const option = effectiveOption(param)
  if (['default', 'boolean', 'intrinsic'].includes(option.inputKind)) emit('commit')
}

function isVariableAssigned(param) {
  return isVariableReference(param.value)
}

function assignedVariable(param) {
  if (!isVariableAssigned(param)) return null
  return props.variables.find(variable => variable.id === param.value.id) || null
}

function variableIsCompatible(param, variable) {
  if (
    runtimeParameterDefinition(param)?.required === true
    && (variable?.selectedType === 'default' || variable?.type?.toLowerCase() === 'default')
  ) return false
  return runtimeParameterDefinition(param)?.kind !== 'named_tag_type'
    && !!variable
    && parameterTypeSupportsVariableType(
      declaredParameterType(param),
      variable.selectedType === 'default' ? 'default' : variable.type,
    )
}

function compatibleVariables(param) {
  return props.variables.filter(variable => variableIsCompatible(param, variable))
}

function variableDisplayType(variable) {
  return getTypeOptionLabel(variable?.selectedType || variable?.type)
}

function inputOptionForVariable(param, variable) {
  return parameterInputOptionForVariable(
    declaredParameterType(param),
    runtimeParameterDefinition(param),
    variable,
  )
}

function assignedVariableIsNumericExpression(param) {
  const variable = assignedVariable(param)
  return !!variable && (
    isNumericExpressionOptionId(variable.selectedType)
    || isNumericExpressionValue(variable.value)
  )
}

function isVariablePickerOpen(param) {
  return variablePickerParameter.value === param
}

function assignVariable(param, variableId) {
  if (parameterDisabled(param)) return
  if (!compatibleVariables(param).some(variable => variable.id === variableId)) return
  if (!isVariableAssigned(param)) {
    directParameterValues.set(directParameterKey(param), {
      selectedType: param.selectedType,
      value: param.value,
    })
  }
  const variable = props.variables.find(candidate => candidate.id === variableId)
  const linkedOption = inputOptionForVariable(param, variable)
  if (linkedOption) param.selectedType = linkedOption.id
  param.value = new VariableReference(variableId)
  variablePickerParameter.value = null
  delete param.error
  delete param.latex
  emit('commit')
}

function clearVariableAssignment(param) {
  if (parameterDisabled(param)) return
  const key = directParameterKey(param)
  const direct = directParameterValues.get(key)
  if (direct) {
    param.selectedType = direct.selectedType
    param.value = direct.value
  } else if (runtimeParameterDefinition(param)?.required === true) {
    param.selectedType = parameterInputOptions(param)[0]?.id || ''
    param.value = null
  } else {
    param.selectedType = 'default'
    param.value = null
  }
  directParameterValues.delete(key)
  variablePickerParameter.value = null
  emit('commit')
}

function toggleVariableAssignment(param) {
  if (parameterDisabled(param)) return
  if (isVariableAssigned(param)) clearVariableAssignment(param)
  else if (isVariablePickerOpen(param)) variablePickerParameter.value = null
  else if (compatibleVariables(param).length) variablePickerParameter.value = param
}

function variableButtonDisabled(param) {
  if (parameterDisabled(param)) return true
  if (isVariableAssigned(param)) return false
  if (runtimeParameterDefinition(param)?.kind === 'named_tag_type') return true
  return compatibleVariables(param).length === 0
}

function variableButtonTitle(param) {
  if (isControlledParameter(param)) return controlledReason(param)
  if (isEditingDisabled.value) return `Reset the simulation to edit ${props.subject} parameters`
  if (isVariableAssigned(param)) return 'Use a direct value'
  if (runtimeParameterDefinition(param)?.kind === 'named_tag_type') {
    return 'Named tag type parameters cannot use Variables yet'
  }
  if (isVariablePickerOpen(param)) return 'Cancel choosing a variable'
  if (!compatibleVariables(param).length) {
    return props.variables.length === 0
      ? 'Create a compatible variable in the Variables tab first'
      : 'No variables have a type supported by this parameter'
  }
  return 'Choose a compatible variable for this parameter'
}

function variableButtonLabel(param) {
  if (isVariableAssigned(param)) return `Use a direct value for ${parameterName(param)}`
  if (isVariablePickerOpen(param)) {
    return `Cancel choosing a variable for ${parameterName(param)}`
  }
  return `Set ${parameterName(param)} from a variable`
}

watch(() => props.constructor, () => {
  variablePickerParameter.value = null
})

watchEffect(() => {
  filteredParameters.value.forEach(initializeParameter)
  const param = variablePickerParameter.value
  if (param && (parameterDisabled(param) || !compatibleVariables(param).length)) {
    variablePickerParameter.value = null
  }
})
</script>

<style scoped>
.params-container {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-1);
}

.param-item:not(:last-child) {
  border-bottom: solid 1px var(--app-color-border);
}

.param-item-row {
  display: flex;
  gap: var(--app-space-4);
  padding: 0 0 var(--app-space-1);
}

.param-name {
  width: 50%;
  color: var(--app-color-text-muted);
  font-weight: 600;
  cursor: default;
}

.param-value {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  color: var(--app-color-text);
  font-weight: 400;
  text-align: right;
}

.param-value :deep(input[type="text"]),
.param-value :deep(input[type="number"]) {
  width: 60%;
  text-align: right;
}

.param-value :deep(.code-value-input) {
  width: 100%;
}

.complexTypeSelector {
  max-width: 125px;
  height: 18px;
  padding: 0 1px;
  border-color: var(--app-color-border);
  border-radius: var(--app-radius-control);
  background: var(--app-color-primary-soft);
  font-size: 0.8rem;
}

.grayed-parameter {
  opacity: 0.6;
}

.columnParamRow {
  position: relative;
  flex-direction: column;
}

.columnParamRow .param-value {
  width: 100%;
}

.columnParamRow .variable-binding-control {
  position: absolute;
  top: 0;
  right: 0;
}

.noInteraction {
  opacity: 0.6;
  pointer-events: none;
}

.unknown-type-indicator {
  display: inline-block;
  margin-left: calc(var(--app-space-1) / 2);
  color: var(--app-color-danger);
}

.variable-assignment,
.variable-assignment-control {
  display: flex;
  width: 100%;
  min-width: 0;
  flex-direction: column;
  gap: var(--app-space-2);
}

.variable-assignment-selector {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  gap: var(--app-space-2);
  color: var(--app-color-primary);
}

.variable-selector {
  min-width: 0;
  max-width: 100%;
}

.variable-binding-control {
  display: inline-flex;
  width: 25px;
  height: 25px;
  flex: 0 0 25px;
}

.variable-binding-button {
  width: 100%;
  height: 100%;
  padding: 0;
  border-radius: var(--app-radius-control);
  color: var(--app-color-text-muted);
}

.variable-binding-button:not(:disabled):hover,
.variable-binding-button.active {
  background: var(--app-color-primary-soft);
  color: var(--app-color-primary);
}

.controlled-parameter {
  border-radius: var(--app-radius-control);
  background: var(--app-color-surface-subtle);
}

.controlled-parameter-note {
  margin: 0 0 var(--app-space-2);
  color: var(--app-color-text-muted);
  font-size: 0.78rem;
  line-height: 1.35;
}

.empty-protocol-parameters {
  margin: 0;
  color: var(--app-color-text-muted);
  font-size: 0.85rem;
}

.unsupported-parameter-value {
  color: var(--app-color-text-muted);
  font-size: 0.8rem;
}
</style>
