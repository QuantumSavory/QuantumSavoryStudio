<template>
  <NumericExpressionInput
    v-if="isNumericExpressionOptionId(type)"
    :parameter="parameter"
    :parameter-name="parameterName"
    :target-type="numericExpressionTargetType(type)"
    :placement="category"
    :context="numericExpressionContext"
    :template="template"
    :disabled="disabled"
    :minimum="numericMinimum"
    :maximum="numericMaximum"
    :aria-describedby="ariaDescribedby"
    @commit="emit('commit')"
  />
  <input
    v-else-if="parameterTypeIsNumber(type)"
    type="number"
    :value="parameter.value ?? ''"
    :min="effectiveNumericMinimum"
    :max="effectiveNumericMaximum"
    :step="numberInputStep"
    :placeholder="placeholder"
    :aria-label="valueInputLabel"
    :aria-describedby="ariaDescribedby"
    :aria-invalid="numericValueInvalid"
    :disabled="disabled"
    @input="updateNumericLiteralDraft"
    @change="commitNumericLiteral"
  />
  <input
    v-else-if="isNumericVectorType(type)"
    type="text"
    :value="numericVectorInputValue"
    placeholder="[]"
    :aria-label="valueInputLabel"
    :aria-describedby="ariaDescribedby"
    :aria-invalid="numericVectorValueInvalid"
    :disabled="disabled"
    @change="commitNumericVector"
  />
  <textarea
    v-else-if="type === 'Any'"
    class="opaque-json-input"
    :value="opaqueJsonDraft"
    placeholder="JSON value"
    :aria-label="valueInputLabel"
    :aria-describedby="ariaDescribedby"
    :aria-invalid="opaqueJsonDraftInvalid"
    :disabled="disabled"
    @input="updateOpaqueJsonDraft"
    @change="commitOpaqueJsonDraft"
  />
  <select
    v-else-if="type === 'Bool' && requiredInput"
    :value="requiredBooleanInputValue"
    :aria-label="valueInputLabel"
    :aria-describedby="ariaDescribedby"
    :disabled="disabled"
    @change="commitRequiredBoolean"
  >
    <option value="" disabled>Select true or false</option>
    <option value="true">True</option>
    <option value="false">False</option>
  </select>
  <Checkbox
    v-else-if="type === 'Bool'"
    v-model="parameter.value"
    binary
    :aria-label="valueInputLabel"
    :aria-describedby="ariaDescribedby"
    :disabled="disabled"
    @change="emit('commit')"
  >
    <template #icon="{ checked, class: iconClass }">
      <Check v-if="checked" :class="iconClass" :size="14" aria-hidden="true" />
    </template>
  </Checkbox>
  <fieldset
    v-else-if="isCodeType(type)"
    class="code-value-input"
    role="group"
    :aria-label="valueInputLabel"
    :aria-describedby="ariaDescribedby"
    :aria-invalid="codeDraftInvalid"
    :disabled="disabled"
  >
    <CodeEditorWithSymbols
      :modelValue="parameter.value || ''"
      :readOnly="disabled || !unsafeCodeEvaluationEnabled"
      :evaluationEnabled="unsafeCodeEvaluationEnabled"
      :errorMessage="parameter.error"
      :showLatex="isSymbolicType(type)"
      :latexExpression="parameter.latex"
      :paramType="type"
      collapsible
      :collapsed="!codeEditorOpen"
      @update:modelValue="onCodeEditorValueChanged"
      @validate="validateAndCommitCode"
      @edit="openCodeEditor"
    />
  </fieldset>
  <select
    v-else-if="type === 'Function'"
    v-model="parameter.value"
    class="functionSelector"
    :aria-label="valueInputLabel"
    :aria-describedby="ariaDescribedby"
    :disabled="disabled"
    @change="commitPredefinedFunction"
  >
    <option value="" disabled>Select a function</option>
    <option v-for="func in selectableFunctions" :key="func" :value="func">{{ func }}</option>
  </select>
  <span v-else-if="type === 'default'">Use constructor default</span>
  <span v-else-if="isWildcardType(type)">Wildcard</span>
  <span v-else-if="type === 'Nothing'">Nothing</span>
  <input
    v-else
    type="text"
    v-model="parameter.value"
    :placeholder="placeholder"
    :aria-label="valueInputLabel"
    :aria-describedby="ariaDescribedby"
    :disabled="disabled"
    @change="commitTextLiteral"
  />
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import Checkbox from 'primevue/checkbox'
import { Check } from '@lucide/vue'
import { api } from '../../utils/ApiConnector'
import { markdownCodeBlock } from '../../utils/markdown.js'
import {
  MAX_SAFE_JSON_INTEGER,
  cloneExactOpaqueJsonValue,
} from '../../utils/exactWireValues.js'
import {
  isNumericExpressionOptionId,
  isNumericVectorType,
  isCodeType,
  isSymbolicType,
  isWildcardType,
  numericExpressionTargetType,
  parameterTypeIsNumber,
  parseNumericParameterValue,
  parseNumericVectorParameterValue,
} from '../../utils/parameterTypes'
import CodeEditorWithSymbols from './CodeEditorWithSymbols.vue'
import NumericExpressionInput from './NumericExpressionInput.vue'

const props = defineProps({
  parameter: {
    type: Object,
    required: true
  },
  parameterName: {
    type: String,
    default: ''
  },
  type: {
    type: String,
    default: ''
  },
  disabled: {
    type: Boolean,
    default: false
  },
  category: {
    type: String,
    default: 'floating'
  },
  placeholder: {
    type: String,
    default: 'default'
  },
  initiallyOpen: {
    type: Boolean,
    default: false
  },
  ariaDescribedby: {
    type: String,
    default: undefined
  },
  numericExpressionContext: {
    type: Object,
    default: undefined
  },
  template: {
    type: Boolean,
    default: false
  },
  numericMinimum: {
    type: Number,
    default: undefined
  },
  numericMaximum: {
    type: Number,
    default: undefined
  },
  requiredInput: {
    type: Boolean,
    default: false
  }
})
const emit = defineEmits(['commit'])

const unsafeCodeEvaluationEnabled = computed(() => api.isUnsafeCodeEvaluationEnabled())
const valueInputLabel = computed(() => (
  `${props.parameterName || props.parameter.name || props.parameter.field || 'Parameter'} value`
))
const numberInputStep = computed(() => {
  return props.type === 'Int64' ? 1 : 'any'
})
const integerInput = computed(() => props.type === 'Int64')
const declaredNumericMinimum = computed(() => props.numericMinimum ?? props.parameter.min)
const declaredNumericMaximum = computed(() => props.numericMaximum ?? props.parameter.max)
const finiteNumericBound = (value, fallback) => (
  value != null && Number.isFinite(Number(value)) ? Number(value) : fallback
)
const effectiveNumericMinimum = computed(() => (
  integerInput.value
    ? Math.max(
        finiteNumericBound(declaredNumericMinimum.value, -MAX_SAFE_JSON_INTEGER),
        -MAX_SAFE_JSON_INTEGER,
      )
    : declaredNumericMinimum.value
))
const effectiveNumericMaximum = computed(() => (
  integerInput.value
    ? Math.min(
        finiteNumericBound(declaredNumericMaximum.value, MAX_SAFE_JSON_INTEGER),
        MAX_SAFE_JSON_INTEGER,
      )
    : declaredNumericMaximum.value
))
const selectableFunctions = computed(() => api.getKnownFunctions().filter(func => (
  ['node', 'variable'].includes(props.category) || !func.endsWith('(self)')
)))
const codeEditorOpen = ref(false)
const opaqueJsonDraft = ref('')
const opaqueJsonDirty = ref(false)
let codeValidationGeneration = 0
const numericValueInvalid = computed(() => !parseNumericParameterValue(
  props.type,
  props.parameter.value,
  {
    ...props.parameter,
    min: effectiveNumericMinimum.value,
    max: effectiveNumericMaximum.value,
  },
).valid)
const numericVectorInputValue = computed(() => (
  Array.isArray(props.parameter.value)
    ? JSON.stringify(props.parameter.value)
    : (typeof props.parameter.value === 'string' ? props.parameter.value : '')
))
const numericVectorValueInvalid = computed(() => !parseNumericVectorParameterValue(
  props.type,
  props.parameter.value,
).valid)
const requiredBooleanInputValue = computed(() => {
  if (props.parameter.value === true) return 'true'
  if (props.parameter.value === false) return 'false'
  return ''
})
const codeDraftInvalid = computed(() => Boolean(props.parameter.error))
const parseOpaqueJsonDraft = rawValue => {
  if (typeof rawValue !== 'string' || !rawValue.trim()) return null
  try {
    const parsed = JSON.parse(rawValue)
    if (parsed === null) return null
    return cloneExactOpaqueJsonValue(parsed)
  } catch {
    return null
  }
}
const opaqueJsonDraftInvalid = computed(() => (
  parseOpaqueJsonDraft(opaqueJsonDraft.value) === null
))

function formatOpaqueJsonDraft(value) {
  try {
    return JSON.stringify(cloneExactOpaqueJsonValue(value)) ?? ''
  } catch {
    return ''
  }
}

watch(
  () => props.type,
  (type, previousType) => {
    if (type === 'default') {
      props.parameter.value = null
    } else if (isWildcardType(type)) {
      props.parameter.value = 'Wildcard'
    } else if (type === 'Nothing') {
      props.parameter.value = 'nothing'
    } else if (type === 'Any') {
      opaqueJsonDraft.value = formatOpaqueJsonDraft(props.parameter.value)
      opaqueJsonDirty.value = false
    } else if (
      (isWildcardType(previousType) && props.parameter.value === 'Wildcard')
      || (previousType === 'Nothing' && props.parameter.value === 'nothing')
    ) {
      props.parameter.value = null
    }

    codeEditorOpen.value = isCodeType(type)
      ? props.initiallyOpen && !(isSymbolicType(type) && props.parameter.latex)
      : false
    if (
      isCodeType(type)
      && (typeof props.parameter.value !== 'string' || !props.parameter.value.trim())
    ) {
      props.parameter.error = markdownCodeBlock('Validate this code before continuing.')
    }
  },
  { immediate: true }
)

watch(
  () => props.parameter.value,
  value => {
    if (props.type === 'Any' && !opaqueJsonDirty.value) {
      opaqueJsonDraft.value = formatOpaqueJsonDraft(value)
    }
  },
  { deep: true },
)

function onCodeEditorValueChanged(value) {
  if (props.disabled) return
  props.parameter.value = value
  codeValidationGeneration += 1
  props.parameter.error = markdownCodeBlock('Validate this code before continuing.')
}

function openCodeEditor() {
  if (!props.disabled && isCodeType(props.type)) codeEditorOpen.value = true
}

function parseNumericLiteral(rawValue) {
  return parseNumericParameterValue(props.type, rawValue, {
    ...props.parameter,
    min: effectiveNumericMinimum.value,
    max: effectiveNumericMaximum.value,
  })
}

function updateNumericLiteralDraft(event) {
  const rawValue = event.target.value
  const parsed = parseNumericLiteral(rawValue)
  props.parameter.value = parsed.valid && !parsed.empty
    ? parsed.value
    : (parsed.empty ? null : rawValue)
}

function commitNumericLiteral(event) {
  const rawValue = event.target.value
  const parsed = parseNumericLiteral(rawValue)
  if (parsed.valid && !parsed.empty) {
    props.parameter.value = parsed.value
    delete props.parameter.error
    emit('commit')
    return
  }
  props.parameter.value = parsed.empty ? null : rawValue
}

function commitNumericVector(event) {
  const rawValue = event.target.value
  const parsed = parseNumericVectorParameterValue(props.type, rawValue)
  if (parsed.valid && !parsed.empty) {
    props.parameter.value = parsed.value
    delete props.parameter.error
    emit('commit')
    return
  }
  props.parameter.value = parsed.empty ? null : rawValue
  props.parameter.error = `Enter a JSON array of ${props.type === 'Vector{Int64}'
    ? 'JavaScript-safe integers'
    : 'finite numbers'}.`
}

function updateOpaqueJsonDraft(event) {
  opaqueJsonDraft.value = event.target.value
  opaqueJsonDirty.value = true
  props.parameter.error = 'Commit a valid recursively untagged JSON value.'
}

function commitOpaqueJsonDraft() {
  const parsed = parseOpaqueJsonDraft(opaqueJsonDraft.value)
  if (parsed === null) {
    props.parameter.error = 'Enter a non-null recursively untagged exact JSON value.'
    return
  }
  props.parameter.value = parsed
  opaqueJsonDirty.value = false
  delete props.parameter.error
  emit('commit')
}

function commitRequiredBoolean(event) {
  props.parameter.value = event.target.value === 'true'
  delete props.parameter.error
  emit('commit')
}

function commitPredefinedFunction() {
  if (typeof props.parameter.value === 'string' && props.parameter.value.trim()) {
    emit('commit')
  }
}

function commitTextLiteral() {
  if (
    (typeof props.parameter.value === 'string' && props.parameter.value.trim())
    || (Array.isArray(props.parameter.value) && props.parameter.value.length)
  ) {
    emit('commit')
  }
}

async function validateCode() {
  if (props.disabled) return false
  if (typeof props.parameter.value !== 'string' || !props.parameter.value.trim()) {
    props.parameter.error = markdownCodeBlock('Validate this code before continuing.')
    return false
  }
  if (!unsafeCodeEvaluationEnabled.value) {
    props.parameter.error = markdownCodeBlock('Server-side Julia evaluation is disabled.')
    return false
  }

  const generation = ++codeValidationGeneration
  props.parameter.error = markdownCodeBlock('Code validation is in progress.')
  let response
  try {
    response = isSymbolicType(props.type)
      ? await api.validateSymbolicFunction(props.parameter.value)
      : await api.validateFunction(props.parameter.value, props.category)
  } catch (error) {
    if (generation !== codeValidationGeneration) return false
    codeEditorOpen.value = true
    delete props.parameter.latex
    props.parameter.error = markdownCodeBlock(error?.message || 'Validation failed')
    return false
  }

  if (generation !== codeValidationGeneration) return false

  if (response.success) {
    delete props.parameter.error
    if (isSymbolicType(props.type)) {
      props.parameter.latex = response.results.latex.replace(/^\$+|\$+$/g, '')
    }
    codeEditorOpen.value = false
    return true
  }

  codeEditorOpen.value = true
  delete props.parameter.latex
  props.parameter.error = markdownCodeBlock(response.error)
  return false
}

async function validateAndCommitCode() {
  if (await validateCode()) emit('commit')
}
</script>

<style scoped>
.code-value-input {
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

input[type="text"],
input[type="number"],
select {
  max-width: 100%;
}
</style>
