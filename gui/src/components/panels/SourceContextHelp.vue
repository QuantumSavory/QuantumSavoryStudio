<template>
  <div class="source-context-help">
    <button
      ref="trigger"
      type="button"
      class="source-context-trigger noborder"
      aria-haspopup="dialog"
      :aria-controls="popoverId"
      :aria-expanded="popoverVisible"
      @click="togglePopover"
    >
      <CircleHelp :size="15" aria-hidden="true" />
      {{ label }}
    </button>

    <Popover
      ref="popover"
      :pt="popoverPassThrough"
      @show="popoverVisible = true"
      @hide="popoverVisible = false"
    >
      <section class="source-context-popup">
        <header class="source-context-header">
          <h2 class="source-context-heading">
            Context available to {{ subject }}
          </h2>
          <button
            type="button"
            class="source-context-close noborder"
            :aria-label="`Close ${label.toLowerCase()}`"
            autofocus
            @click="closePopover"
          >
            <X :size="15" aria-hidden="true" />
          </button>
        </header>
        <dl>
          <template v-for="keyword in SOURCE_CONTEXT_KEYWORDS" :key="keyword.id">
            <dt><code>{{ keyword.syntax }}</code></dt>
            <dd>
              {{ keyword.description }}
              {{ keyword.availability }}
              <span v-if="keyword.recommendation">{{ keyword.recommendation }}</span>
            </dd>
          </template>
        </dl>
      </section>
    </Popover>
  </div>
</template>

<script setup>
import { ref, useId } from 'vue'
import { CircleHelp, X } from '@lucide/vue'
import Popover from 'primevue/popover'
import { SOURCE_CONTEXT_KEYWORDS } from '../../utils/sourceContext'

const props = defineProps({
  label: {
    type: String,
    default: 'Custom function context',
  },
  subject: {
    type: String,
    default: 'custom functions',
  },
})

const popover = ref(null)
const trigger = ref(null)
const popoverVisible = ref(false)
const popoverId = `source-context-${useId()}`
const popoverPassThrough = {
  root: {
    id: popoverId,
    'aria-label': props.label,
    'data-testid': props.label === 'Custom function context'
      ? 'source-context-help'
      : 'numeric-expression-context-help',
    class: 'source-context-overlay',
  },
  content: {
    class: 'source-context-overlay-content',
  },
}

function togglePopover(event) {
  popoverVisible.value = !popoverVisible.value
  popover.value.toggle(event)
}

function closePopover() {
  popoverVisible.value = false
  popover.value.hide()
  trigger.value?.focus()
}
</script>

<style scoped>
.source-context-help {
  display: flex;
  justify-content: flex-end;
  margin-bottom: var(--app-space-1);
}

.source-context-trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--app-space-1);
  padding: var(--app-space-1) var(--app-space-2);
  border-radius: var(--app-radius-control);
  color: var(--app-color-text-muted);
  font-size: 0.78rem;
}

.source-context-trigger:hover,
.source-context-trigger:focus-visible {
  background: var(--app-color-surface-hover);
  color: var(--app-color-primary);
}

.source-context-popup {
  color: var(--app-color-text-muted);
  font-size: 0.78rem;
}

.source-context-header {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
  margin-bottom: var(--app-space-1);
}

.source-context-heading {
  flex: 1;
  margin: 0;
  color: var(--app-color-text);
  font-size: inherit;
  font-weight: 600;
}

.source-context-close {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  padding: var(--app-space-1);
  border-radius: var(--app-radius-control);
  color: var(--app-color-text-muted);
}

.source-context-close:hover,
.source-context-close:focus-visible {
  background: var(--app-color-surface-hover);
  color: var(--app-color-primary);
}

dl {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: var(--app-space-1) var(--app-space-2);
  margin: 0;
}

dt,
dd {
  margin: 0;
}

code {
  color: var(--app-color-text);
  font-size: inherit;
}
</style>

<style>
.source-context-overlay {
  box-sizing: border-box;
  inline-size: min(38rem, calc(100vw - (2 * var(--app-space-4))));
  inline-size: min(38rem, calc(100dvw - (2 * var(--app-space-4))));
  max-inline-size: calc(100vw - (2 * var(--app-space-4)));
  max-inline-size: calc(100dvw - (2 * var(--app-space-4)));
  max-block-size: calc(100vh - (2 * var(--app-space-4)));
  max-block-size: calc(100dvh - (2 * var(--app-space-4)));
}

.source-context-overlay-content {
  box-sizing: border-box;
  max-inline-size: 100%;
  max-block-size: calc(100vh - (2 * var(--app-space-4)) - 2px);
  max-block-size: calc(100dvh - (2 * var(--app-space-4)) - 2px);
  overflow: auto;
  overscroll-behavior: contain;
}

@media (max-width: 900px), (max-height: 600px) {
  .p-popover.source-context-overlay {
    margin-block-start: 0;
    margin-block-end: 0;
  }
}
</style>
