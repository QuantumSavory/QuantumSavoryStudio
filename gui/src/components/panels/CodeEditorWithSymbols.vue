<template>
  <div
    ref="editorRootRef"
    class="code-editor-with-symbols expression-editor"
    :class="`expression-editor-${effectiveEditorKind}`"
  >
    <component
      ref="summaryRef"
      :is="summaryEditable ? 'button' : 'div'"
      v-if="collapsible && collapsed"
      class="code-collapsed-view expression-editor-summary"
      :class="{ 'expression-editor-summary-static': !summaryEditable }"
      :type="summaryEditable ? 'button' : undefined"
      :role="summaryEditable ? undefined : 'group'"
      :data-testid="summaryTestId"
      :aria-label="collapsedAriaLabel"
      :aria-live="summaryEditable ? 'polite' : undefined"
      @click="handleEdit"
    >
      <template v-if="effectiveEditorKind === 'numeric'">
        <span class="expression-editor-summary-section expression-editor-summary-source">
          <span class="visually-hidden">Source:</span>
          <code
            class="expression-editor-source-value"
            data-testid="numeric-expression-source"
          >{{ modelValue }}</code>
        </span>
        <span
          v-if="summaryResult != null"
          class="expression-editor-summary-section expression-editor-summary-result"
          data-testid="numeric-expression-result"
          :role="summaryEditable ? undefined : 'status'"
          :aria-label="summaryResultAriaLabel"
        >
          <span class="expression-editor-summary-label">{{ summaryResultLabel }}:</span>
          {{ summaryResult }}
        </span>
        <span
          v-if="summaryDeferredMessage && !hasError"
          class="expression-editor-summary-status"
          data-testid="numeric-expression-deferred"
          :role="summaryEditable ? undefined : 'status'"
        >
          {{ summaryDeferredMessage }}
        </span>
        <span
          v-if="validationPending"
          class="expression-editor-summary-status"
          data-testid="numeric-expression-pending"
          :role="summaryEditable ? undefined : 'status'"
        >
          Validating…
        </span>
        <span
          v-if="hasError"
          class="expression-editor-summary-error"
          data-testid="numeric-expression-error"
          :role="summaryEditable ? undefined : 'alert'"
        >
          {{ errorMessage }}
        </span>
      </template>

      <span
        v-else-if="showLatex && latexExpression"
        class="latex-wrap expression-editor-summary-rendered"
        v-html="renderedLatex"
      />
      <span
        v-else
        class="expression-editor-source-value"
        :class="{
          'code-rendered-value': effectiveEditorKind === 'function',
          'editor-placeholder': !modelValue,
        }"
      >
        {{ modelValue || 'default' }}
      </span>
      <span
        v-if="!evaluationEnabled"
        class="evaluation-disabled-notice expression-editor-disabled-notice"
        role="status"
        :data-testid="disabledNoticeTestId"
      >
        {{ evaluationDisabledMessage }}
      </span>
    </component>

    <template v-else>
      <CustomFunctionContextHelp
        v-if="shouldShowContextHelp"
        :label="contextHelpLabel"
        :subject="contextHelpSubject"
      />

      <div
        v-if="!evaluationEnabled"
        class="evaluation-disabled-notice expression-editor-disabled-notice"
        role="status"
        :data-testid="disabledNoticeTestId"
      >
        {{ evaluationDisabledMessage }}
      </div>

      <div
        v-if="hasError"
        class="function-error-badge expression-editor-error"
        role="alert"
        v-tooltip.top="{
          value: errorMessage,
          autoHide: false,
          class: 'reduce-y-tooltip'
        }"
      >
        <TriangleAlert :size="14" aria-hidden="true" />
        <span>{{ errorLabel }}</span>
        <span
          v-if="showErrorMessage"
          class="expression-editor-error-message"
          :data-testid="errorTestId"
        >
          {{ errorMessage }}
        </span>
      </div>

      <div
        v-if="showLatex && latexExpression && !collapsible"
        class="latex-wrap-container expression-editor-rendered"
      >
        <div class="latex-wrap" v-html="renderedLatex" />
      </div>

      <div ref="editorContainerRef" class="expression-editor-source">
        <HighCode
          ref="codeEditorRef"
          :codeValue="modelValue"
          @getCodeValue="handleValueChange"
          :textEditor="true"
          lang="julia"
          width="100%"
          :height="editorHeight"
          theme="light"
          fontSize="12px"
          :copy="false"
          borderRadius="4px"
          :readOnly="interactionDisabled"
          :class="{
            'function-container': true,
            'function-syntax-error': hasError,
            'noInteraction': interactionDisabled
          }"
          @click="captureCursorPosition"
          @mousedown="captureCursorPosition"
          @keyup="captureCursorPosition"
        />
      </div>

      <div class="buttons-row expression-editor-actions">
        <div class="symbol-buttons-container">
          <button
            v-for="symbol in unicodeSymbols"
            :key="symbol"
            type="button"
            class="symbol-button"
            :class="{ 'subscript-char': isSubscriptChar(symbol) }"
            @mousedown="handleSymbolClick($event, symbol)"
            :disabled="interactionDisabled"
            :title="'Insert ' + symbol"
          >
            <span class="symbol-content">{{ symbol }}</span>
          </button>
        </div>

        <button
          type="button"
          @click="handleValidate"
          :disabled="interactionDisabled || validationPending || (
            disableValidationWhenEmpty && !modelValue.trim()
          )"
          :title="evaluationEnabled ? validateTitle : 'Server-side Julia evaluation is disabled'"
          :aria-label="validateAriaLabel"
          class="validate-button expression-editor-validate"
        >
          {{ validationPending ? 'Validating…' : validateLabel }}
        </button>
      </div>

      <p
        v-if="summaryResult != null"
        class="expression-editor-open-result"
        data-testid="numeric-expression-result"
        role="status"
        :aria-label="summaryResultAriaLabel"
      >
        <span class="expression-editor-summary-label">{{ summaryResultLabel }}:</span>
        {{ summaryResult }}
      </p>
      <p
        v-if="summaryDeferredMessage && !hasError"
        class="expression-editor-open-status"
        data-testid="numeric-expression-deferred"
        role="status"
      >
        {{ summaryDeferredMessage }}
      </p>
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import katex from 'katex'
import { HighCode } from 'vue-highlight-code'
import 'vue-highlight-code/dist/style.css'
import { TriangleAlert } from '@lucide/vue'
import { SAFE_KATEX_OPTIONS } from '../../utils/katexOptions'
import CustomFunctionContextHelp from './CustomFunctionContextHelp.vue'

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  readOnly: {
    type: Boolean,
    default: false
  },
  evaluationEnabled: {
    type: Boolean,
    default: false
  },
  errorMessage: {
    type: String,
    default: ''
  },
  errorLabel: {
    type: String,
    default: 'Validation failed'
  },
  errorTestId: {
    type: String,
    default: undefined
  },
  showErrorMessage: {
    type: Boolean,
    default: false
  },
  showLatex: {
    type: Boolean,
    default: false
  },
  latexExpression: {
    type: String,
    default: null
  },
  paramType: {
    type: String,
    default: ''
  },
  editorKind: {
    type: String,
    default: ''
  },
  showContextHelp: {
    type: Boolean,
    default: undefined
  },
  contextHelpLabel: {
    type: String,
    default: 'Custom Function context'
  },
  contextHelpSubject: {
    type: String,
    default: 'custom functions'
  },
  collapsible: {
    type: Boolean,
    default: false
  },
  collapsed: {
    type: Boolean,
    default: false
  },
  summaryEditable: {
    type: Boolean,
    default: true
  },
  summaryResult: {
    type: String,
    default: null
  },
  summaryResultLabel: {
    type: String,
    default: 'Result'
  },
  summaryResultAriaLabel: {
    type: String,
    default: undefined
  },
  summaryDeferredMessage: {
    type: String,
    default: ''
  },
  sourceTestId: {
    type: String,
    default: undefined
  },
  sourceLabel: {
    type: String,
    default: undefined
  },
  ariaDescribedby: {
    type: String,
    default: undefined
  },
  sourcePlaceholder: {
    type: String,
    default: ''
  },
  editorHeight: {
    type: String,
    default: '150px'
  },
  validationPending: {
    type: Boolean,
    default: false
  },
  disableValidationWhenEmpty: {
    type: Boolean,
    default: false
  },
  validateLabel: {
    type: String,
    default: 'Validate'
  },
  validateAriaLabel: {
    type: String,
    default: undefined
  },
  validateTitle: {
    type: String,
    default: 'Validate'
  },
  evaluationDisabledMessage: {
    type: String,
    default: 'Server-side Julia evaluation is disabled. Raw lambda and symbolic validation are unavailable; choose a listed function when supported.'
  },
  disabledNoticeTestId: {
    type: String,
    default: 'evaluation-disabled-notice'
  }
})

const emit = defineEmits(['update:modelValue', 'validate', 'edit'])

const editorRootRef = ref(null)
const summaryRef = ref(null)
const codeEditorRef = ref(null)
const editorContainerRef = ref(null)
const cursorPosition = ref(0)
let focusEditorOnOpen = false
let focusSummaryOnCollapse = false
const unicodeSymbols = ['₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉', '₀', '⊗', '√']

const effectiveEditorKind = computed(() => {
  if (props.editorKind) return props.editorKind
  return props.showLatex ? 'symbolic' : 'function'
})
const hasError = computed(() => !!props.errorMessage)
const interactionDisabled = computed(() => props.readOnly || !props.evaluationEnabled)
const shouldShowContextHelp = computed(() => (
  props.showContextHelp ?? effectiveEditorKind.value !== 'symbolic'
))
const summaryTestId = computed(() => {
  if (effectiveEditorKind.value === 'numeric') return 'numeric-expression-summary'
  return props.showLatex ? 'symbolic-collapsed-view' : 'code-collapsed-view'
})
const collapsedAriaLabel = computed(() => {
  if (effectiveEditorKind.value === 'numeric') {
    const description = [
      props.summaryEditable
        ? `Edit ${props.sourceLabel || 'numeric expression'}`
        : (props.sourceLabel || 'Numeric expression'),
    ]
    if (props.modelValue) description.push(props.modelValue)
    if (props.summaryResult != null) {
      description.push(`${props.summaryResultLabel}: ${props.summaryResult}`)
    }
    if (props.summaryDeferredMessage && !hasError.value) {
      description.push(props.summaryDeferredMessage)
    }
    if (props.validationPending) description.push('Validating')
    if (hasError.value) description.push(`Validation failed: ${props.errorMessage}`)
    return description.join('; ')
  }
  if (!props.showLatex) {
    if (!props.summaryEditable) return 'View custom function'
    return props.modelValue ? 'Edit custom function' : 'Enter custom function'
  }
  if (!props.summaryEditable) return 'View symbolic expression'
  return props.latexExpression ? 'Edit symbolic expression' : 'Enter symbolic expression'
})
const renderedLatex = computed(() => {
  if (!props.latexExpression) return ''

  try {
    return katex.renderToString(props.latexExpression, {
      ...SAFE_KATEX_OPTIONS,
      displayMode: true
    })
  } catch (error) {
    console.warn('Unable to render symbolic expression:', error)
    return ''
  }
})

function isSubscriptChar(symbol) {
  const code = symbol.charCodeAt(0)
  return (code >= 0x2080 && code <= 0x2089) || (code >= 0x2090 && code <= 0x209C)
}

function editorTextarea() {
  return editorContainerRef.value?.querySelector('textarea') || null
}

function syncEditorAttributes() {
  const textarea = editorTextarea()
  if (!textarea) return

  if (props.sourceTestId) textarea.dataset.testid = props.sourceTestId
  else delete textarea.dataset.testid
  if (props.sourceLabel) textarea.setAttribute('aria-label', props.sourceLabel)
  else textarea.removeAttribute('aria-label')
  if (props.ariaDescribedby) {
    textarea.setAttribute('aria-describedby', props.ariaDescribedby)
  } else {
    textarea.removeAttribute('aria-describedby')
  }
  textarea.setAttribute('aria-invalid', String(hasError.value))
  if (interactionDisabled.value) textarea.setAttribute('readonly', '')
  else textarea.removeAttribute('readonly')
  if (props.sourcePlaceholder) textarea.setAttribute('placeholder', props.sourcePlaceholder)
  else textarea.removeAttribute('placeholder')
}

function syncEditorValue(value) {
  const editor = codeEditorRef.value
  if (editor && editor.modelValue !== value) editor.modelValue = value
}

function handleValueChange(value) {
  emit('update:modelValue', value)
}

function handleEdit() {
  if (!props.summaryEditable) return
  focusEditorOnOpen = true
  emit('edit')
}

function captureCursorPosition() {
  try {
    const textarea = editorTextarea()
    if (textarea && typeof textarea.selectionStart === 'number') {
      cursorPosition.value = textarea.selectionStart
    }
  } catch (error) {
    console.warn('Could not capture cursor position:', error)
  }
}

async function handleSymbolClick(event, symbol) {
  event.preventDefault()
  captureCursorPosition()
  await nextTick()

  const currentValue = props.modelValue || ''
  const cursorPos = cursorPosition.value
  const newValue = currentValue.slice(0, cursorPos) + symbol + currentValue.slice(cursorPos)
  emit('update:modelValue', newValue)

  nextTick(() => {
    try {
      const textarea = editorTextarea()
      if (!textarea) return
      textarea.value = newValue
      const newCursorPos = cursorPos + symbol.length
      textarea.setSelectionRange(newCursorPos, newCursorPos)
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      textarea.focus()
    } catch (error) {
      console.warn('Could not update textarea:', error)
    }
  })
}

function handleValidate() {
  focusSummaryOnCollapse = true
  emit('validate')
}

function handleDocumentFocusIn(event) {
  if (
    focusSummaryOnCollapse
    && editorRootRef.value
    && !editorRootRef.value.contains(event.target)
  ) {
    focusSummaryOnCollapse = false
  }
}

watch(
  () => props.modelValue,
  value => {
    focusSummaryOnCollapse = false
    nextTick(() => syncEditorValue(value))
  },
)
watch(
  () => props.collapsed,
  (collapsed, wasCollapsed) => {
    if (!collapsed && wasCollapsed) {
      const shouldFocusEditor = focusEditorOnOpen
      focusEditorOnOpen = false
      if (shouldFocusEditor) nextTick(() => editorTextarea()?.focus())
      return
    }
    if (collapsed && !wasCollapsed) {
      const shouldFocusSummary = focusSummaryOnCollapse
      focusSummaryOnCollapse = false
      if (shouldFocusSummary) nextTick(() => summaryRef.value?.focus())
    }
  },
)
watch(
  () => [
    props.sourceTestId,
    props.sourceLabel,
    props.ariaDescribedby,
    props.sourcePlaceholder,
    props.errorMessage,
    props.readOnly,
    props.evaluationEnabled,
    props.collapsed,
  ],
  () => nextTick(syncEditorAttributes),
)

onMounted(() => {
  syncEditorAttributes()
  nextTick(syncEditorAttributes)
  const textarea = editorTextarea()
  textarea?.addEventListener('keyup', captureCursorPosition)
  textarea?.addEventListener('click', captureCursorPosition)
  textarea?.addEventListener('focus', captureCursorPosition)
  document.addEventListener('focusin', handleDocumentFocusIn)
})

onBeforeUnmount(() => {
  const textarea = editorTextarea()
  textarea?.removeEventListener('keyup', captureCursorPosition)
  textarea?.removeEventListener('click', captureCursorPosition)
  textarea?.removeEventListener('focus', captureCursorPosition)
  document.removeEventListener('focusin', handleDocumentFocusIn)
})
</script>

<style scoped>
.expression-editor {
  width: 100%;
  min-width: 0;
  text-align: left;
}

.expression-editor-summary {
  display: flex;
  width: 100%;
  min-width: 0;
  height: auto;
  min-height: 32px;
  flex-direction: column;
  align-items: stretch;
  gap: var(--app-space-1);
  padding: var(--app-space-2) var(--app-space-3);
  border: 1px solid var(--app-color-border);
  border-radius: var(--app-radius-control);
  background: var(--app-color-surface-subtle);
  color: var(--app-color-text);
  text-align: left;
}

button.expression-editor-summary:hover {
  border-color: var(--app-color-focus);
  background: var(--app-color-primary-soft);
  color: var(--app-color-text);
}

.expression-editor-summary-static {
  cursor: default;
}

.expression-editor-summary-section {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: var(--app-space-2);
}

.expression-editor-summary-source {
  padding-bottom: var(--app-space-1);
  border-bottom: 1px solid var(--app-color-border);
}

.expression-editor-source-value {
  display: block;
  width: 100%;
  min-width: 0;
  overflow: auto;
  color: var(--app-color-text);
  font-family: var(--app-font-monospace);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.expression-editor-summary-result {
  justify-content: flex-end;
  font-size: 0.82rem;
  text-align: right;
}

.expression-editor-summary-label {
  color: var(--app-color-text-muted);
  font-weight: 600;
}

.expression-editor-summary-status,
.expression-editor-open-status {
  color: var(--app-color-text-muted);
  font-size: 0.78rem;
}

.expression-editor-summary-error {
  color: var(--app-color-danger);
  font-size: 0.78rem;
}

.editor-placeholder {
  color: var(--app-color-text-muted);
}

.evaluation-disabled-notice {
  margin-bottom: var(--app-space-2);
  color: var(--app-color-warning-text);
  font-size: 0.8rem;
}

.expression-editor-error {
  display: flex;
  width: 100%;
  align-items: flex-start;
  justify-content: flex-start;
  gap: var(--app-space-1);
  padding: 0 0 var(--app-space-1);
  color: var(--app-color-danger);
  font-size: 0.8rem;
  font-weight: 600;
}

.expression-editor-error-message {
  min-width: 0;
  font-weight: 400;
  overflow-wrap: anywhere;
}

.function-syntax-error {
  border: solid 1px var(--app-color-danger);
}

.noInteraction {
  cursor: not-allowed;
  opacity: 0.6;
  pointer-events: none;
}

.latex-wrap-container {
  margin: var(--app-space-1) 0;
}

.latex-wrap {
  width: 100%;
  overflow: auto;
  white-space: normal;
  overflow-wrap: break-word;
  word-break: break-word;
}

.latex-wrap :deep(.katex) {
  font-size: 10px;
}

:deep(.katex-display) {
  margin: 1px 0;
}

.expression-editor-source {
  width: 100%;
  min-width: 0;
}

.buttons-row {
  display: flex;
  align-items: flex-start;
  gap: var(--app-space-1);
  margin: var(--app-space-1) 0;
}

.symbol-buttons-container {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  border-radius: var(--app-radius-control);
}

.symbol-button {
  display: flex;
  width: 15px;
  height: 16px;
  align-items: center;
  justify-content: center;
  padding: 1px 4px;
  border: 1px solid transparent;
  border-radius: var(--app-radius-control);
  background: var(--app-color-primary-soft);
  color: var(--app-color-text);
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  transition: all 0.15s ease;
}

.symbol-content {
  display: inline-block;
  font-family: sans-serif;
}

.symbol-button.subscript-char .symbol-content {
  transform: translateY(-3.5px);
}

.symbol-button:hover:not(:disabled) {
  background: var(--app-color-focus);
}

.symbol-button:not(.subscript-char):hover:not(:disabled) {
  transform: translateY(-1px);
}

.symbol-button:not(.subscript-char):active:not(:disabled) {
  transform: translateY(0);
}

.symbol-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.validate-button {
  padding: 6px 16px;
  border: none;
  border-radius: var(--app-radius-control);
  background: var(--app-color-primary);
  color: var(--app-color-on-primary);
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.validate-button:hover:not(:disabled) {
  background: var(--app-color-primary-hover);
}

.validate-button:active:not(:disabled) {
  transform: translateY(1px);
}

.validate-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.expression-editor-open-result,
.expression-editor-open-status {
  margin: 0;
  font-size: 0.78rem;
}

.expression-editor-open-result {
  text-align: right;
}
</style>
