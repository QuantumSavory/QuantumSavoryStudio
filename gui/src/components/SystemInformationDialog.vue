<template>
  <AppDialog
    :show="show"
    title="System Information"
    width="min(760px, calc(100vw - 32px))"
    class="system-information-dialog"
    closable
    dismissable-mask
    @close="emit('close')"
  >
    <div class="system-information-content">
      <section aria-labelledby="system-runtime-heading">
        <h3 id="system-runtime-heading">Application runtime</h3>
        <dl class="system-information-list">
          <div>
            <dt>QuantumSavory Studio</dt>
            <dd data-testid="system-webquantumsavory-version">{{ information.webQuantumSavory }}</dd>
          </div>
          <div>
            <dt>Julia</dt>
            <dd data-testid="system-julia-version">{{ information.julia }}</dd>
          </div>
          <div>
            <dt>Genie</dt>
            <dd data-testid="system-genie-version">{{ information.genie }}</dd>
          </div>
          <div>
            <dt>QuantumSavory</dt>
            <dd data-testid="system-quantumsavory-version">{{ information.quantumSavory.version }}</dd>
          </div>
          <div v-if="information.quantumSavory.trackedSource">
            <dt>Tracked source</dt>
            <dd data-testid="system-quantumsavory-source">{{ information.quantumSavory.trackedSource }}</dd>
          </div>
          <div v-if="information.quantumSavory.trackedRevision">
            <dt>Tracked revision</dt>
            <dd data-testid="system-quantumsavory-revision">{{ information.quantumSavory.trackedRevision }}</dd>
          </div>
          <div v-if="information.quantumSavory.treeHash">
            <dt>Pkg tree hash</dt>
            <dd data-testid="system-quantumsavory-tree-hash">{{ information.quantumSavory.treeHash }}</dd>
          </div>
          <div v-if="information.quantumSavory.commit">
            <dt>Commit</dt>
            <dd data-testid="system-quantumsavory-commit">{{ information.quantumSavory.commit }}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="system-frontend-heading">
        <h3 id="system-frontend-heading">Frontend dependencies</h3>
        <details class="system-dependency-group">
          <summary>
            Runtime dependencies ({{ information.frontend.runtime.length }})
          </summary>
          <dl
            v-if="information.frontend.runtime.length"
            class="system-dependency-list"
            data-testid="system-runtime-dependencies"
          >
            <div
              v-for="dependency in information.frontend.runtime"
              :key="dependency.name"
              class="system-dependency-row"
              :data-dependency-name="dependency.name"
            >
              <dt>{{ dependency.name }}</dt>
              <dd>{{ dependency.version }}</dd>
            </div>
          </dl>
          <p v-else>Dependency information is unavailable.</p>
        </details>

        <details class="system-dependency-group">
          <summary>
            Development dependencies ({{ information.frontend.development.length }})
          </summary>
          <dl
            v-if="information.frontend.development.length"
            class="system-dependency-list"
            data-testid="system-development-dependencies"
          >
            <div
              v-for="dependency in information.frontend.development"
              :key="dependency.name"
              class="system-dependency-row"
              :data-dependency-name="dependency.name"
            >
              <dt>{{ dependency.name }}</dt>
              <dd>{{ dependency.version }}</dd>
            </div>
          </dl>
          <p v-else>Dependency information is unavailable.</p>
        </details>
      </section>

      <section
        class="system-changelog"
        aria-label="Changelog"
        data-testid="system-changelog"
      >
        <MarkdownContent :content="changelogMarkdown" />
      </section>
    </div>

    <template #footer>
      <AppButton variant="primary" @click="emit('close')">Close</AppButton>
    </template>
  </AppDialog>
</template>

<script setup>
import { computed } from 'vue'
import AppButton from './ui/AppButton.vue'
import AppDialog from './ui/AppDialog.vue'
import MarkdownContent from './ui/MarkdownContent.vue'
import { changelogMarkdown as embeddedChangelogMarkdown } from '../utils/changelogContent.js'
import { normalizeSystemInformation } from '../utils/systemInformation.js'

const props = defineProps({
  show: {
    type: Boolean,
    default: false,
  },
  platformInfo: {
    type: Object,
    default: () => ({}),
  },
  changelogMarkdown: {
    type: String,
    default: embeddedChangelogMarkdown,
  },
})

const emit = defineEmits(['close'])
const information = computed(() => normalizeSystemInformation(props.platformInfo))
</script>

<style scoped>
.system-information-content {
  display: grid;
  gap: var(--app-space-6);
  color: var(--app-color-text);
}

.system-information-content h3 {
  margin: 0 0 var(--app-space-3);
  color: var(--app-color-primary);
  font-size: 1rem;
}

.system-information-list,
.system-dependency-list {
  display: grid;
  gap: var(--app-space-2);
  margin: 0;
}

.system-information-list > div,
.system-dependency-row {
  display: grid;
  grid-template-columns: minmax(145px, 0.45fr) minmax(0, 1fr);
  gap: var(--app-space-4);
}

.system-information-list dt,
.system-dependency-list dt {
  color: var(--app-color-text-muted);
  font-weight: 600;
}

.system-information-list dd,
.system-dependency-list dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}

.system-dependency-group {
  border: 1px solid var(--app-color-border);
  border-radius: var(--app-radius-control);
  background: var(--app-color-surface-subtle);
}

.system-dependency-group + .system-dependency-group {
  margin-top: var(--app-space-3);
}

.system-dependency-group summary {
  padding: var(--app-space-3) var(--app-space-4);
  color: var(--app-color-primary);
  font-weight: 600;
  cursor: pointer;
}

.system-dependency-list,
.system-dependency-group p {
  margin: 0;
  padding: 0 var(--app-space-4) var(--app-space-4);
}

.system-dependency-group p {
  color: var(--app-color-text-muted);
}

.system-changelog {
  min-width: 0;
  padding-top: var(--app-space-5);
  border-top: 1px solid var(--app-color-border);
}

@media (max-width: 520px) {
  .system-information-list > div,
  .system-dependency-row {
    grid-template-columns: 1fr;
    gap: 0;
  }
}
</style>
