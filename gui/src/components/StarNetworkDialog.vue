<template>
  <LayoutGeneratorDialog
    :show="show"
    title="Star Network Generator"
    form-id="star-network-form"
    description="Replace one peripheral template with evenly spaced copies around a center node."
    :valid="validation.valid"
    :validation-message="validationMessage"
    submit-label="Generate Star"
    @submit="handleConfirm"
    @cancel="handleCancel"
  >
    <div class="form-grid">
        <label for="star-center-node">Center node</label>
        <select id="star-center-node" v-model="form.centerNodeId" autofocus>
          <option value="" disabled>Select a center node</option>
          <option v-for="node in nodes" :key="node.id" :value="node.id">
            {{ node.name }}
          </option>
        </select>

        <label for="star-peripheral-node">Peripheral template</label>
        <select id="star-peripheral-node" v-model="form.peripheralNodeId">
          <option value="" disabled>Select a peripheral node</option>
          <option v-for="node in nodes" :key="node.id" :value="node.id">
            {{ node.name }}
          </option>
        </select>

        <label for="star-template-edge">Edge template</label>
        <select
          id="star-template-edge"
          v-model="form.templateEdgeId"
          :disabled="!form.centerNodeId || !form.peripheralNodeId || candidateEdges.length === 0"
        >
          <option value="" disabled>
            {{ form.centerNodeId && form.peripheralNodeId
              ? 'Select an edge template'
              : 'Select both nodes first' }}
          </option>
          <option v-for="edge in candidateEdges" :key="edge.id" :value="edge.id">
            {{ edgeLabel(edge) }}
          </option>
        </select>

        <label for="star-peripheral-count">Number of peripheral nodes</label>
        <input
          id="star-peripheral-count"
          v-model.number="form.peripheralCount"
          type="number"
          min="1"
          max="12"
          step="1"
        >
    </div>

    <template #help>
      <HelpCallout title="Template behavior" variant="detailed">
        <p>
          The peripheral template and its edge are removed. The first generated node keeps the
          template position; the remaining nodes rotate counterclockwise around the center.
        </p>
      </HelpCallout>
    </template>
  </LayoutGeneratorDialog>
</template>

<script setup>
import { computed, reactive, watch } from 'vue'
import { endpointId } from '../utils/layoutTemplates'
import { validateStarNetwork } from '../utils/starNetwork'
import HelpCallout from './ui/HelpCallout.vue'
import LayoutGeneratorDialog from './ui/LayoutGeneratorDialog.vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  nodes: { type: Array, default: () => [] },
  edges: { type: Array, default: () => [] }
})

const emit = defineEmits(['confirm', 'cancel'])
const form = reactive({
  centerNodeId: '',
  peripheralNodeId: '',
  templateEdgeId: '',
  peripheralCount: 4
})

const net = computed(() => ({ nodes: props.nodes, edges: props.edges }))
const candidateEdges = computed(() => {
  if (!form.centerNodeId || !form.peripheralNodeId) return []
  return props.edges.filter(edge => {
    const endpoints = new Set([endpointId(edge.source), endpointId(edge.target)])
    return endpoints.has(form.centerNodeId) && endpoints.has(form.peripheralNodeId)
  })
})
const validation = computed(() => validateStarNetwork(net.value, { ...form }))
const validationMessage = computed(() => {
  const started = form.centerNodeId || form.peripheralNodeId || form.templateEdgeId
  return started && !validation.value.valid ? validation.value.error : ''
})

watch(
  () => [form.centerNodeId, form.peripheralNodeId],
  () => {
    if (!candidateEdges.value.some(edge => edge.id === form.templateEdgeId)) {
      form.templateEdgeId = ''
    }
  }
)

watch(() => props.show, isShown => {
  if (isShown) {
    resetForm()
  }
})

function resetForm() {
  form.centerNodeId = ''
  form.peripheralNodeId = ''
  form.templateEdgeId = ''
  form.peripheralCount = 4
}

function edgeLabel(edge) {
  return `${edge.source?.name || endpointId(edge.source)} to ${edge.target?.name || endpointId(edge.target)}`
}

function handleConfirm() {
  if (!validation.value.valid) return
  emit('confirm', { ...form })
}

function handleCancel() {
  emit('cancel')
}

</script>
