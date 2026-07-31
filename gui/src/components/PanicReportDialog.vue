<template>
  <AppDialog
    :show="show"
    title="Simulator panic"
    width="min(760px, calc(100vw - 32px))"
    class="panic-report-dialog"
    closable
    dismissable-mask
    @close="emit('close')"
  >
    <div class="panic-report-content">
      <section class="panic-explanation" aria-labelledby="panic-explanation-title">
        <TriangleAlert :size="22" aria-hidden="true" />
        <div>
          <h3 id="panic-explanation-title">The simulator backend crashed</h3>
          <p>
            An unexpected exception stopped this simulation run. Your project remains in the
            browser, and the diagnostic details below can help the maintainers reproduce the crash.
          </p>
        </div>
      </section>

      <dl class="panic-summary">
        <div>
          <dt>Exception</dt>
          <dd>{{ normalizedPanic.exceptionType || 'Unknown' }}</dd>
        </div>
        <div>
          <dt>Message</dt>
          <dd>{{ normalizedPanic.message }}</dd>
        </div>
        <div v-if="normalizedPanic.timestamp">
          <dt>Time</dt>
          <dd><time :datetime="normalizedPanic.timestamp">{{ normalizedPanic.timestamp }}</time></dd>
        </div>
        <div v-if="normalizedPanic.id">
          <dt>Panic ID</dt>
          <dd>{{ normalizedPanic.id }}</dd>
        </div>
      </dl>

      <details :key="panicKey" class="panic-stacktrace">
        <summary>
          <ChevronRight :size="16" aria-hidden="true" />
          Complete stacktrace
        </summary>
        <pre data-testid="panic-stacktrace">{{ normalizedPanic.stacktrace || '(not provided)' }}</pre>
      </details>

      <section class="panic-report-help" aria-labelledby="panic-report-help-title">
        <h3 id="panic-report-help-title">Report this crash</h3>
        <p>
          Report copies a complete Markdown diagnostic report, downloads the current full project
          as JSON, and opens a prepared GitHub issue. The project is not uploaded automatically;
          review it, then attach it to the issue yourself.
        </p>
      </section>

      <p
        v-if="statusMessage"
        class="panic-report-status"
        :class="{ 'panic-report-status--error': reportErrors.length }"
        :role="reportErrors.length ? 'alert' : 'status'"
      >
        {{ statusMessage }}
      </p>

      <section v-if="clipboardFailed" class="panic-clipboard-fallback" aria-labelledby="panic-copy-title">
        <h3 id="panic-copy-title">Copy the report manually</h3>
        <p>Clipboard access failed. Select and copy this report, then paste it into the GitHub issue.</p>
        <textarea
          ref="fallbackTextarea"
          :value="generatedReport"
          aria-label="Panic report Markdown"
          readonly
          rows="12"
          @focus="$event.currentTarget.select()"
        />
      </section>
    </div>

    <template #footer>
      <AppButton @click="emit('close')">Close</AppButton>
      <AppButton variant="primary" :disabled="reporting" @click="handleReport">
        <template #icon>
          <LoaderCircle v-if="reporting" class="panic-report-spinner" :size="15" />
          <Bug v-else :size="15" />
        </template>
        {{ reporting ? 'Preparing report' : 'Report' }}
      </AppButton>
    </template>
  </AppDialog>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { Bug, ChevronRight, LoaderCircle, TriangleAlert } from '@lucide/vue'
import AppButton from './ui/AppButton.vue'
import AppDialog from './ui/AppDialog.vue'
import {
  buildPanicIssueUrl,
  buildPanicReport,
  createPanicProjectDownload,
  downloadTextFile,
  normalizePanic,
  openPanicIssue,
  writeReportToClipboard,
} from '../utils/panicReport'

const props = defineProps({
  show: {
    type: Boolean,
    default: false,
  },
  panic: {
    type: Object,
    default: null,
  },
  serializeProject: {
    type: Function,
    required: true,
  },
  projectName: {
    type: String,
    default: '',
  },
  platformInfo: {
    type: Object,
    default: null,
  },
  browserActions: {
    type: Object,
    default: () => ({}),
  },
})

const emit = defineEmits(['close', 'reported'])
const reporting = ref(false)
const generatedReport = ref('')
const clipboardFailed = ref(false)
const reportErrors = ref([])
const statusMessage = ref('')
const fallbackTextarea = ref(null)

const EMPTY_PANIC_VIEW = Object.freeze({
  id: '',
  timestamp: '',
  source: '',
  summary: '',
  exceptionType: '',
  message: '',
  stacktrace: '',
})
const normalizedPanic = computed(() => (
  props.show ? normalizePanic(props.panic) : EMPTY_PANIC_VIEW
))
const panicKey = computed(() => normalizedPanic.value.id || JSON.stringify(normalizedPanic.value))

watch(
  () => [props.show, panicKey.value],
  ([show, key], [wasShown, previousKey] = []) => {
    if (!show || !wasShown || key !== previousKey) resetReportState()
  },
)

function resetReportState() {
  reporting.value = false
  generatedReport.value = ''
  clipboardFailed.value = false
  reportErrors.value = []
  statusMessage.value = ''
}

function browserAction(name, fallback) {
  return typeof props.browserActions?.[name] === 'function'
    ? props.browserActions[name]
    : fallback
}

async function handleReport() {
  if (reporting.value) return
  reporting.value = true
  clipboardFailed.value = false
  reportErrors.value = []
  statusMessage.value = ''

  const report = buildPanicReport(props.panic, props.platformInfo)
  const issueUrl = buildPanicIssueUrl(props.panic, props.projectName)
  generatedReport.value = report

  let filename = null
  let copyPromise
  try {
    copyPromise = Promise.resolve(
      browserAction('writeClipboard', writeReportToClipboard)(report),
    )
  } catch (error) {
    copyPromise = Promise.reject(error)
  }

  try {
    const download = createPanicProjectDownload(props.serializeProject, props.projectName)
    filename = download.filename
    browserAction('downloadText', downloadTextFile)(
      download.content,
      download.filename,
      download.mimeType,
    )
  } catch (error) {
    reportErrors.value.push(`Project download failed: ${error.message}`)
  }

  try {
    browserAction('openIssue', openPanicIssue)(issueUrl)
  } catch (error) {
    reportErrors.value.push(`GitHub issue could not be opened: ${error.message}`)
  }

  try {
    await copyPromise
  } catch (error) {
    clipboardFailed.value = true
    reportErrors.value.push(`Clipboard copy failed: ${error.message}`)
    await nextTick()
    fallbackTextarea.value?.focus()
  }

  const errors = [...reportErrors.value]
  if (errors.length) {
    statusMessage.value = clipboardFailed.value
      ? `${errors.join(' ')} Copy the report below manually.`
      : `${errors.join(' ')} The diagnostic report was still copied to the clipboard.`
  } else {
    statusMessage.value = `Report copied and ${filename} downloaded. Paste the report into GitHub and attach the JSON file.`
  }
  reporting.value = false
  emit('reported', {
    report,
    filename,
    issueUrl,
    clipboardCopied: !clipboardFailed.value,
    errors,
  })
}
</script>

<style scoped>
.panic-report-content {
  display: grid;
  gap: var(--app-space-5);
  color: var(--app-color-text);
}

.panic-explanation {
  display: flex;
  align-items: flex-start;
  gap: var(--app-space-4);
  padding: var(--app-space-5);
  border: 1px solid var(--app-color-danger);
  border-radius: var(--app-radius-surface);
  background: var(--app-color-danger-soft);
}

.panic-explanation > .lucide {
  margin-top: 1px;
  color: var(--app-color-danger);
}

.panic-explanation h3,
.panic-report-help h3,
.panic-clipboard-fallback h3 {
  margin: 0 0 var(--app-space-2);
  font-size: 1rem;
}

.panic-explanation p,
.panic-report-help p,
.panic-clipboard-fallback p {
  margin: 0;
  color: var(--app-color-text-muted);
  line-height: 1.5;
}

.panic-summary {
  display: grid;
  gap: var(--app-space-3);
  margin: 0;
}

.panic-summary > div {
  display: grid;
  grid-template-columns: 105px minmax(0, 1fr);
  gap: var(--app-space-4);
}

.panic-summary dt {
  color: var(--app-color-text-muted);
  font-weight: 600;
}

.panic-summary dd {
  min-width: 0;
  overflow-wrap: anywhere;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}

.panic-stacktrace {
  border: 1px solid var(--app-color-border);
  border-radius: var(--app-radius-control);
  background: var(--app-color-surface-subtle);
}

.panic-stacktrace summary {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
  padding: var(--app-space-4);
  color: var(--app-color-primary);
  font-weight: 600;
  cursor: pointer;
  list-style: none;
}

.panic-stacktrace summary::-webkit-details-marker {
  display: none;
}

.panic-stacktrace summary .lucide {
  transition: transform 0.15s ease;
}

.panic-stacktrace[open] summary .lucide {
  transform: rotate(90deg);
}

.panic-stacktrace pre {
  max-height: 260px;
  overflow: auto;
  margin: 0;
  padding: var(--app-space-4);
  border-top: 1px solid var(--app-color-border);
  color: var(--app-color-text);
  font: 0.86rem/1.5 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.panic-report-status {
  margin: 0;
  padding: var(--app-space-4);
  border-radius: var(--app-radius-control);
  background: var(--app-color-surface-subtle);
  color: var(--app-color-text-muted);
}

.panic-report-status--error {
  border-left: 3px solid var(--app-color-danger);
}

.panic-clipboard-fallback {
  display: grid;
  gap: var(--app-space-3);
}

.panic-clipboard-fallback h3 {
  margin-bottom: 0;
}

.panic-clipboard-fallback textarea {
  width: 100%;
  min-height: 180px;
  resize: vertical;
  padding: var(--app-space-4);
  border: 1px solid var(--app-color-border);
  border-radius: var(--app-radius-control);
  color: var(--app-color-text);
  background: var(--app-color-surface);
  font: 0.84rem/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}

.panic-clipboard-fallback textarea:focus-visible {
  outline: var(--app-focus-ring-width) solid var(--app-color-focus);
  outline-offset: var(--app-focus-ring-offset);
}

.panic-report-spinner {
  animation: panic-report-spin 0.8s linear infinite;
}

@keyframes panic-report-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 520px) {
  .panic-summary > div {
    grid-template-columns: 1fr;
    gap: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .panic-stacktrace summary .lucide {
    transition: none;
  }
}
</style>
