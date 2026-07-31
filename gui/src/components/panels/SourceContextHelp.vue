<template>
  <div class="custom-function-context-help">
    <button
      ref="trigger"
      type="button"
      class="custom-function-context-trigger noborder"
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
      <section class="custom-function-context-popup">
        <header class="custom-function-context-header">
          <h2 class="custom-function-context-heading">
            Context available to {{ subject }}
          </h2>
          <button
            type="button"
            class="custom-function-context-close noborder"
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
const popoverId = `custom-function-context-${useId()}`
const popoverPassThrough = {
  root: {
    id: popoverId,
    'aria-label': props.label,
    'data-testid': props.label === 'Custom function context'
      ? 'custom-function-context-help'
      : 'numeric-expression-context-help',
    class: 'custom-function-context-overlay',
  },
  content: {
    class: 'custom-function-context-overlay-content',
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
.custom-function-context-help {
  display: flex;
  justify-content: flex-end;
  margin-bottom: var(--app-space-1);
}

.custom-function-context-trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--app-space-1);
  padding: var(--app-space-1) var(--app-space-2);
  border-radius: var(--app-radius-control);
  color: var(--app-color-text-muted);
  font-size: 0.78rem;
}

.custom-function-context-trigger:hover,
.custom-function-context-trigger:focus-visible {
  background: var(--app-color-surface-hover);
  color: var(--app-color-primary);
}

.custom-function-context-popup {
  color: var(--app-color-text-muted);
  font-size: 0.78rem;
}

.custom-function-context-header {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
  margin-bottom: var(--app-space-1);
}

.custom-function-context-heading {
  flex: 1;
  margin: 0;
  color: var(--app-color-text);
  font-size: inherit;
  font-weight: 600;
}

.custom-function-context-close {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  padding: var(--app-space-1);
  border-radius: var(--app-radius-control);
  color: var(--app-color-text-muted);
}

.custom-function-context-close:hover,
.custom-function-context-close:focus-visible {
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
.custom-function-context-overlay {
  box-sizing: border-box;
  inline-size: min(38rem, calc(100vw - (2 * var(--app-space-4))));
  inline-size: min(38rem, calc(100dvw - (2 * var(--app-space-4))));
  max-inline-size: calc(100vw - (2 * var(--app-space-4)));
  max-inline-size: calc(100dvw - (2 * var(--app-space-4)));
  max-block-size: calc(100vh - (2 * var(--app-space-4)));
  max-block-size: calc(100dvh - (2 * var(--app-space-4)));
}

.custom-function-context-overlay-content {
  box-sizing: border-box;
  max-inline-size: 100%;
  max-block-size: calc(100vh - (2 * var(--app-space-4)) - 2px);
  max-block-size: calc(100dvh - (2 * var(--app-space-4)) - 2px);
  overflow: auto;
  overscroll-behavior: contain;
}

@media (max-width: 900px), (max-height: 600px) {
  .p-popover.custom-function-context-overlay {
    margin-block-start: 0;
    margin-block-end: 0;
  }
}
</style>
