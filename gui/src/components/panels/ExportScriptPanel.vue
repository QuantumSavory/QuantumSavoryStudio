<template>
  <div class="export-script-panel">
    <aside class="export-script-warning" role="note" aria-labelledby="export-script-warning-title">
      <TriangleAlert class="export-script-warning-icon" :size="18" aria-hidden="true" />
      <div>
        <h3 id="export-script-warning-title">About this generated script</h3>
        <p>
          The GUI simulator does not use this script, and some GUI features might not be
          completely translated to it.
        </p>
        <p>
          To use the full power of QuantumSavory.jl, use its programmatic interface and write
          your own simulations. This script is intended as pedagogical onboarding for writing
          your own simulations.
        </p>
        <p>
          UI automation makes some parts boilerplate-heavy; bespoke simulations can be simpler.
        </p>
      </div>
    </aside>

    <div class="export-script-toolbar">
      <div class="export-script-heading">
        <strong>Generated Julia simulation</strong>
        <span v-if="filename && script">{{ safeFilename }}</span>
      </div>
      <div class="export-script-actions">
        <button
          type="button"
          class="export-script-refresh"
          :disabled="loading"
          @click="generateScript"
        >
          <RefreshCw :size="15" aria-hidden="true" />
          {{ loading ? 'Generating…' : script ? 'Refresh' : 'Retry' }}
        </button>
        <button
          type="button"
          class="export-script-download"
          :disabled="loading || !script"
          @click="downloadScript"
        >
          <Download :size="15" aria-hidden="true" />
          Download .jl
        </button>
      </div>
    </div>

    <div v-if="loading && !script" class="export-script-state" role="status" aria-live="polite">
      <LoaderCircle class="export-script-spinner" :size="16" aria-hidden="true" />
      Generating Julia script…
    </div>

    <div v-else-if="error && !script" class="export-script-error" role="alert">
      <strong>Could not generate the script.</strong>
      <span>{{ error }}</span>
    </div>

    <div v-else-if="script" class="export-script-code-wrapper" :aria-busy="loading">
      <div v-if="error" class="export-script-error export-script-refresh-error" role="alert">
        <strong>Refresh failed.</strong>
        <span>{{ error }}</span>
      </div>
      <pre class="export-script-code" tabindex="0" aria-label="Generated Julia script"><code
        class="hljs language-julia"
        v-html="highlightedScript"
      ></code></pre>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Download, LoaderCircle, RefreshCw, TriangleAlert } from '@lucide/vue'
import hljs from 'highlight.js/lib/core'
import julia from 'highlight.js/lib/languages/julia'
import 'highlight.js/styles/github.css'
import { api } from '../../utils/ApiConnector'

hljs.registerLanguage('julia', julia)

const props = defineProps({
  active: {
    type: Boolean,
    default: false
  },
  payload: {
    type: Object,
    required: true
  }
})

const script = ref('')
const filename = ref('')
const loading = ref(false)
const error = ref('')
let hasRequested = false
let requestController = null
let requestGeneration = 0

const highlightedScript = computed(() => {
  if (!script.value) return ''
  return hljs.highlight(script.value, {
    language: 'julia',
    ignoreIllegals: true
  }).value
})

const safeFilename = computed(() => sanitizeFilename(filename.value || props.payload?.name))

function sanitizeFilename(candidate) {
  const basename = String(candidate || 'quantum-savory-simulation')
    .split(/[\\/]/)
    .pop()
    .replace(/\.jl$/i, '')
    .replace(/[<>:"|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/^\.+|[. ]+$/g, '')
    .slice(0, 116)

  return `${basename || 'quantum-savory-simulation'}.jl`
}

async function generateScript() {
  const generation = ++requestGeneration
  requestController?.abort()
  requestController = new AbortController()
  loading.value = true
  error.value = ''

  try {
    const response = await api.exportScript(props.payload, { signal: requestController.signal })
    if (generation !== requestGeneration) return

    if (
      response?.success !== true
      || typeof response.script !== 'string'
      || response.script.trim().length === 0
    ) {
      throw new Error('The server returned an invalid export response.')
    }

    script.value = response.script
    filename.value = typeof response.filename === 'string' ? response.filename : ''
  } catch (requestError) {
    if (generation !== requestGeneration || requestError?.name === 'AbortError') return
    error.value = requestError instanceof Error
      ? requestError.message
      : 'The script could not be generated.'
  } finally {
    if (generation === requestGeneration) {
      loading.value = false
    }
  }
}

function downloadScript() {
  if (!script.value) return

  const url = URL.createObjectURL(new Blob([script.value], { type: 'text/x-julia;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = safeFilename.value
  link.hidden = true
  document.body.appendChild(link)

  try {
    link.click()
  } finally {
    link.remove()
    URL.revokeObjectURL(url)
  }
}

watch(() => props.active, isActive => {
  if (!isActive || hasRequested) return
  hasRequested = true
  generateScript()
}, { immediate: true })

onBeforeUnmount(() => {
  requestGeneration += 1
  requestController?.abort()
})
</script>

<style scoped>
.export-script-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 100%;
  padding: 0 4px 4px 0;
}

.export-script-warning {
  display: flex;
  flex: 0 0 auto;
  gap: 10px;
  padding: 9px 12px;
  border: 1px solid #e3bd59;
  border-radius: 5px;
  background: #fff8e6;
  color: #654b08;
}

.export-script-warning-icon {
  flex: 0 0 auto;
  color: #9a6b00;
}

.export-script-warning h3 {
  margin: 0 0 3px;
  font-size: 0.9rem;
}

.export-script-warning p {
  margin: 0;
  line-height: 1.35;
}

.export-script-warning p + p {
  margin-top: 3px;
}

.export-script-toolbar {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.export-script-heading {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.export-script-heading span {
  overflow: hidden;
  color: #666;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.78rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.export-script-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
}

.export-script-actions button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.export-script-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.export-script-state,
.export-script-error {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding: 10px 12px;
  border-radius: 4px;
}

.export-script-state {
  justify-content: center;
  color: #555;
  background: #f4f4f7;
}

.export-script-spinner {
  animation: export-script-spin 1s linear infinite;
}

.export-script-error {
  align-items: flex-start;
  flex-direction: column;
  border: 1px solid #e6aaa6;
  background: #fff0ef;
  color: #8c1d18;
}

.export-script-refresh-error {
  min-height: auto;
  margin-bottom: 8px;
  padding: 7px 10px;
}

.export-script-code-wrapper {
  min-height: 140px;
  flex: 1 1 auto;
}

.export-script-code {
  height: 100%;
  min-height: 140px;
  margin: 0;
  overflow: auto;
  border: 1px solid #d9d9df;
  border-radius: 4px;
  background: #f6f8fa;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.82rem;
  line-height: 1.45;
  tab-size: 4;
  text-align: left;
}

.export-script-code code {
  display: block;
  min-width: max-content;
  padding: 12px;
}

@keyframes export-script-spin {
  to { transform: rotate(360deg); }
}
</style>
