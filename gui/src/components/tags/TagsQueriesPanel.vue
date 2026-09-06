<template>
  <div class="tags-queries-panel">
    <HelpCallout>
      Inspect and edit live simulator tags, or run non-consuming tag queries against a selected
      target.
    </HelpCallout>
    <p v-if="!enabled" class="tag-explorer-disabled" role="status">
      Parse a network to explore its live tags and queries.
    </p>

    <template v-else>
      <div class="tag-explorer-tabs" role="tablist" aria-label="Tags and queries">
        <button
          id="tag-explorer-tags-tab"
          type="button"
          role="tab"
          :class="{ active: innerTab === 'tags' }"
          :aria-selected="innerTab === 'tags'"
          aria-controls="tag-explorer-tags-panel"
          :tabindex="innerTab === 'tags' ? 0 : -1"
          @click="innerTab = 'tags'"
          @keydown="handleInnerTabKeydown($event, 0)"
        >
          Tags
        </button>
        <button
          id="tag-explorer-queries-tab"
          type="button"
          role="tab"
          :class="{ active: innerTab === 'queries' }"
          :aria-selected="innerTab === 'queries'"
          aria-controls="tag-explorer-queries-panel"
          :tabindex="innerTab === 'queries' ? 0 : -1"
          @click="innerTab = 'queries'"
          @keydown="handleInnerTabKeydown($event, 1)"
        >
          Queries
        </button>
      </div>

      <section
        v-show="innerTab === 'tags'"
        id="tag-explorer-tags-panel"
        class="tag-explorer-panel"
        role="tabpanel"
        aria-labelledby="tag-explorer-tags-tab"
        tabindex="0"
      >
        <div class="tag-explorer-toolbar">
          <TagTargetSelector
            v-model="tagTarget"
            :nodes="nodes"
            allow-messages
            :disabled="busy"
          />
          <button
            type="button"
            class="tag-refresh-button"
            :disabled="busy || !targetReady(tagTarget)"
            @click="refreshTags"
          >
            <RefreshCw :size="15" aria-hidden="true" />
            Refresh
          </button>
        </div>

        <div class="tag-explorer-columns">
          <section
            v-if="showTagConstructor"
            class="tag-constructor-column"
            aria-labelledby="tag-add-heading"
          >
            <h3 id="tag-add-heading">
              {{ tagTarget.kind === 'message_buffer' ? 'Insert message tag' : 'Attach tag' }}
            </h3>
            <TagConstructor
              :key="`tag-${constructorGeneration}`"
              :catalog="catalog"
              :busy="busy"
              :disabled="!catalogLoaded || !targetReady(tagTarget)"
              :unsafe-evaluation-enabled="catalog.unsafeEvaluation"
              :action-label="tagTarget.kind === 'message_buffer' ? 'Insert tag' : 'Add tag'"
              @submit="attachTag"
            />
          </section>

          <section class="tag-results-column" aria-labelledby="tag-list-heading">
            <h3 id="tag-list-heading">Attached tags</h3>
            <TagResultsList
              :entries="tags"
              :catalog="catalog"
              :busy="busy"
              :deletable="tagTarget.kind !== 'message_buffer'"
              @delete="deleteEntry"
            />
            <p v-if="tagTarget.kind === 'message_buffer'" class="tag-message-note">
              Message-buffer entries can be inserted and listed, but not deleted.
            </p>
          </section>
        </div>
      </section>

      <section
        v-show="innerTab === 'queries'"
        id="tag-explorer-queries-panel"
        class="tag-explorer-panel"
        role="tabpanel"
        aria-labelledby="tag-explorer-queries-tab"
        tabindex="0"
      >
        <div class="tag-explorer-toolbar">
          <TagTargetSelector
            v-model="queryTarget"
            :nodes="nodes"
            :allow-messages="false"
            :disabled="busy"
          />
          <button
            type="button"
            class="tag-refresh-button"
            :disabled="busy || !lastQuery || !targetReady(queryTarget)"
            title="Run the last query again"
            @click="refreshQuery"
          >
            <RefreshCw :size="15" aria-hidden="true" />
            Refresh
          </button>
        </div>

        <div class="tag-explorer-columns">
          <section class="tag-constructor-column" aria-labelledby="query-build-heading">
            <h3 id="query-build-heading">Build query</h3>
            <TagConstructor
              :key="`query-${constructorGeneration}`"
              :catalog="catalog"
              query
              action-label="Run query"
              :busy="busy"
              :disabled="!catalogLoaded || !targetReady(queryTarget)"
              :unsafe-evaluation-enabled="catalog.unsafeEvaluation"
              @submit="runQuery"
            />
          </section>

          <section class="tag-results-column" aria-labelledby="query-results-heading">
            <h3 id="query-results-heading">Query results</h3>
            <TagResultsList
              :entries="queryResults"
              :catalog="catalog"
              :busy="busy"
              :deletable="false"
              empty-text="Run a query to find matching tags."
            />
            <p class="tag-message-note">Queries return all matches without consuming them.</p>
          </section>
        </div>
      </section>

      <div v-if="catalogLoading" class="tag-explorer-status" role="status">
        <LoaderCircle :size="15" aria-hidden="true" />
        Loading tag metadata…
      </div>
      <p v-if="error" class="tag-explorer-error" role="alert">{{ error }}</p>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { LoaderCircle, RefreshCw } from '@lucide/vue'
import { useTagExplorer } from '../../composables/useTagExplorer.js'
import { targetKey } from '../../utils/tagExplorer.js'
import HelpCallout from '../ui/HelpCallout.vue'
import TagConstructor from './TagConstructor.vue'
import TagResultsList from './TagResultsList.vue'
import TagTargetSelector from './TagTargetSelector.vue'

const props = defineProps({
  active: {
    type: Boolean,
    default: false
  },
  enabled: {
    type: Boolean,
    default: false
  },
  projectName: {
    type: String,
    default: ''
  },
  projectData: {
    type: Object,
    required: true
  }
})

const innerTab = ref('tags')
const tagTarget = ref({ kind: 'register', node_id: '' })
const queryTarget = ref({ kind: 'register', node_id: '' })
const lastQuery = ref(null)
const constructorGeneration = ref(0)
const nodes = computed(() => props.projectData?.net?.nodes || [])
const showTagConstructor = computed(() => (
  tagTarget.value.kind === 'slot' || tagTarget.value.kind === 'message_buffer'
))
const activeRef = computed(() => props.active)
const enabledRef = computed(() => props.enabled)
const projectNameRef = computed(() => props.projectName)

const {
  catalog,
  catalogLoaded,
  catalogLoading,
  tags,
  queryResults,
  busy,
  error,
  ensureCatalog,
  list,
  attach,
  remove,
  query,
  clearTransient
} = useTagExplorer({
  projectName: projectNameRef,
  active: activeRef,
  enabled: enabledRef
})

watch(
  () => [
    props.active,
    props.enabled,
    innerTab.value,
    targetKey(tagTarget.value),
    props.projectName
  ],
  async ([active, enabled, tab, key, projectName], previous = []) => {
    if (!active || !enabled || tab !== 'tags' || !targetReady(tagTarget.value)) return
    await ensureCatalog()
    if (
      active !== previous[0]
      || enabled !== previous[1]
      || tab !== previous[2]
      || key !== previous[3]
      || projectName !== previous[4]
    ) {
      await list(tagTarget.value)
    }
  },
  { immediate: true }
)

watch(
  () => targetKey(queryTarget.value),
  (key, previousKey) => {
    if (key === previousKey) return
    queryResults.value = []
    lastQuery.value = null
  }
)

watch(
  () => [props.projectName, props.enabled],
  ([name, enabled], previous = []) => {
    if (name === previous[0] && enabled === previous[1]) return
    resetPanel()
  },
  { flush: 'sync' }
)

function targetReady(target) {
  if (!target) return false
  if (target.kind === 'slot') return Boolean(target.slot_id)
  return Boolean(target.node_id)
}

function resetPanel() {
  clearTransient()
  innerTab.value = 'tags'
  tagTarget.value = { kind: 'register', node_id: '' }
  queryTarget.value = { kind: 'register', node_id: '' }
  lastQuery.value = null
  constructorGeneration.value += 1
}

async function refreshTags() {
  if (targetReady(tagTarget.value)) await list(tagTarget.value)
}

async function attachTag(tag) {
  const response = await attach(tagTarget.value, tag)
  if (response) constructorGeneration.value += 1
}

async function deleteEntry(entry) {
  if (tagTarget.value.kind === 'message_buffer') return
  await remove(tagTarget.value, entry.id)
}

async function runQuery(querySpec) {
  lastQuery.value = querySpec
  await query(queryTarget.value, querySpec)
}

async function refreshQuery() {
  if (lastQuery.value) await query(queryTarget.value, lastQuery.value)
}

function handleInnerTabKeydown(event, index) {
  const tabNames = ['tags', 'queries']
  let nextIndex = index
  if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabNames.length
  else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabNames.length) % tabNames.length
  else if (event.key === 'Home') nextIndex = 0
  else if (event.key === 'End') nextIndex = tabNames.length - 1
  else return

  event.preventDefault()
  innerTab.value = tabNames[nextIndex]
  event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')?.[nextIndex]?.focus()
}
</script>

<style scoped>
.tags-queries-panel {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: var(--app-space-2);
}

.tag-explorer-disabled {
  margin: auto;
  color: var(--app-color-text-muted);
}

.tag-explorer-tabs {
  display: flex;
  flex: 0 0 auto;
  gap: 2px;
  border-bottom: 1px solid var(--app-color-border);
}

.tag-explorer-tabs button {
  height: 28px;
  margin-bottom: -1px;
  border-color: transparent;
  border-bottom-color: var(--app-color-border);
  border-radius: var(--app-radius-control) var(--app-radius-control) 0 0;
  background: transparent;
  color: var(--app-color-text-muted);
  font-weight: 700;
}

.tag-explorer-tabs button.active {
  border-color: var(--app-color-border);
  border-bottom-color: var(--app-color-surface);
  background: var(--app-color-surface);
  color: var(--app-color-primary);
}

.tag-explorer-panel {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--app-space-3);
  outline: none;
}

.tag-explorer-toolbar {
  display: flex;
  flex: 0 0 auto;
  align-items: end;
  justify-content: space-between;
  gap: var(--app-space-4);
}

.tag-refresh-button {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--app-space-1);
}

.tag-explorer-columns {
  display: grid;
  min-height: 0;
  flex: 1 1 auto;
  grid-template-columns: minmax(0, 1fr);
  align-content: start;
  gap: var(--app-space-4);
}

.tag-results-column,
.tag-constructor-column {
  min-width: 0;
  border: 1px solid var(--app-color-border);
  border-radius: var(--app-radius-control);
  padding: var(--app-space-3);
  background: var(--app-color-surface-subtle);
}

.tag-results-column {
  min-height: 120px;
}

.tag-results-column h3,
.tag-constructor-column h3 {
  margin-bottom: var(--app-space-2);
  color: var(--app-color-text);
  font-size: 0.85rem;
}

.tag-message-note {
  margin-top: var(--app-space-2);
  color: var(--app-color-text-muted);
  font-size: 0.76rem;
}

.tag-explorer-status {
  display: inline-flex;
  align-items: center;
  gap: var(--app-space-1);
  color: var(--app-color-text-muted);
}

.tag-explorer-status .lucide {
  animation: tag-explorer-spin 0.8s linear infinite;
}

.tag-explorer-error {
  padding: var(--app-space-2);
  border-radius: var(--app-radius-control);
  background: var(--app-color-danger-soft);
  color: var(--app-color-danger);
}

@keyframes tag-explorer-spin {
  to { transform: rotate(360deg); }
}
</style>
