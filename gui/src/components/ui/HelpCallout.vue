<template>
  <section
    :class="['help-callout', `help-callout--${variant}`]"
    role="note"
    :aria-labelledby="title ? resolvedHeadingId : undefined"
  >
    <div v-if="title" class="help-callout-heading">
      <CircleHelp :size="17" aria-hidden="true" />
      <h3 :id="resolvedHeadingId">{{ title }}</h3>
    </div>
    <div class="help-callout-content">
      <slot />
    </div>
  </section>
</template>

<script setup>
import { computed, useId } from 'vue'
import { CircleHelp } from '@lucide/vue'

const props = defineProps({
  title: { type: String, default: '' },
  headingId: { type: String, default: '' },
  variant: {
    type: String,
    default: 'brief',
    validator: value => ['brief', 'detailed'].includes(value),
  },
})

const generatedHeadingId = `help-callout-${useId()}`
const resolvedHeadingId = computed(() => props.headingId || generatedHeadingId)
</script>

<style scoped>
.help-callout {
  min-width: 0;
  color: var(--app-color-text-muted);
  font-size: 0.85rem;
  line-height: 1.4;
}

.help-callout--brief {
  padding: var(--app-space-2) var(--app-space-3);
  border-left: 3px solid var(--app-color-primary);
  border-radius: var(--app-radius-control);
  background: var(--app-color-surface-subtle);
  font-size: 0.8rem;
}

.help-callout--detailed {
  padding: var(--app-space-4);
  border: 1px solid var(--app-color-border);
  border-radius: var(--app-radius-surface);
  background: var(--app-color-surface-subtle);
}

.help-callout-heading {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
  margin-bottom: var(--app-space-2);
  color: var(--app-color-primary);
}

.help-callout-heading h3 {
  margin: 0;
  color: inherit;
  font-size: 0.92rem;
  font-weight: 600;
}

.help-callout-content :deep(> :first-child) {
  margin-top: 0;
}

.help-callout-content :deep(> :last-child) {
  margin-bottom: 0;
}

.help-callout-content :deep(p + p) {
  margin-top: var(--app-space-2);
}

.help-callout-content :deep(ul),
.help-callout-content :deep(ol) {
  padding-left: var(--app-space-6);
}

.help-callout-content :deep(p + ul),
.help-callout-content :deep(p + ol),
.help-callout-content :deep(ul + p),
.help-callout-content :deep(ol + p) {
  margin-top: var(--app-space-2);
}

.help-callout-content :deep(code),
.help-callout-content :deep(strong) {
  color: var(--app-color-text);
}
</style>
