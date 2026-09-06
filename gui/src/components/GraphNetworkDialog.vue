<template>
  <LayoutGeneratorDialog
    :show="show"
    title="Graph Network Generator"
    form-id="graph-network-form"
    description="Replace an isolated template edge and its endpoints with a grid or all-to-all network."
    :valid="validation.valid"
    :validation-message="validationMessage"
    submit-label="Generate Graph"
    @submit="handleConfirm"
    @cancel="handleCancel"
  >
    <div class="form-grid">
        <label for="graph-template-node">Node template</label>
        <select id="graph-template-node" v-model="form.templateNodeId" autofocus>
          <option value="" disabled>Select a node template</option>
          <option v-for="node in nodes" :key="node.id" :value="node.id">
            {{ node.name }}
          </option>
        </select>

        <label for="graph-template-edge">Edge template</label>
        <select
          id="graph-template-edge"
          v-model="form.templateEdgeId"
          :disabled="!form.templateNodeId || incidentEdges.length === 0"
        >
          <option value="" disabled>
            {{ form.templateNodeId ? 'Select an edge template' : 'Select a node first' }}
          </option>
          <option v-for="edge in incidentEdges" :key="edge.id" :value="edge.id">
            {{ edgeLabel(edge) }}
          </option>
        </select>

        <label for="graph-topology">Graph type</label>
        <select id="graph-topology" v-model="form.topology">
          <option :value="GRAPH_TOPOLOGIES.GRID">2D grid</option>
          <option :value="GRAPH_TOPOLOGIES.ALL_TO_ALL">All-to-all</option>
        </select>

        <template v-if="form.topology === GRAPH_TOPOLOGIES.GRID">
          <label for="graph-grid-x-count">Nodes along x</label>
          <input
            id="graph-grid-x-count"
            v-model.number="form.xCount"
            type="number"
            min="1"
            max="6"
            step="1"
          >

          <label for="graph-grid-y-count">Nodes along y</label>
          <input
            id="graph-grid-y-count"
            v-model.number="form.yCount"
            type="number"
            min="1"
            max="6"
            step="1"
          >
        </template>

        <template v-else>
          <label for="graph-complete-node-count">Number of nodes</label>
          <input
            id="graph-complete-node-count"
            v-model.number="form.nodeCount"
            type="number"
            min="2"
            max="12"
            step="1"
          >
        </template>
    </div>

    <template #help>
      <HelpCallout title="Template behavior" variant="detailed">
        <p>
          Both edge endpoints and the selected edge are removed. Every generated node copies the
          selected node's configuration, while the edge endpoints define the first two positions.
        </p>
      </HelpCallout>
    </template>
  </LayoutGeneratorDialog>
</template>

<script setup>
import { computed, reactive, watch } from 'vue'
import {
  GRAPH_TOPOLOGIES,
  validateGraphNetwork
} from '../utils/graphNetwork'
import { edgeHasNode, endpointId } from '../utils/layoutTemplates'
import HelpCallout from './ui/HelpCallout.vue'
import LayoutGeneratorDialog from './ui/LayoutGeneratorDialog.vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  nodes: { type: Array, default: () => [] },
  edges: { type: Array, default: () => [] }
})

const emit = defineEmits(['confirm', 'cancel'])
const form = reactive({
  templateNodeId: '',
  templateEdgeId: '',
  topology: GRAPH_TOPOLOGIES.GRID,
  xCount: 3,
  yCount: 2,
  nodeCount: 4
})

const net = computed(() => ({ nodes: props.nodes, edges: props.edges }))
const incidentEdges = computed(() => {
  if (!form.templateNodeId) return []
  return props.edges.filter(edge => edgeHasNode(edge, form.templateNodeId))
})
const validation = computed(() => validateGraphNetwork(net.value, { ...form }))
const validationMessage = computed(() => {
  const started = form.templateNodeId || form.templateEdgeId
  return started && !validation.value.valid ? validation.value.error : ''
})

watch(() => form.templateNodeId, () => {
  if (!incidentEdges.value.some(edge => edge.id === form.templateEdgeId)) {
    form.templateEdgeId = ''
  }
})

watch(() => props.show, isShown => {
  if (isShown) {
    resetForm()
  }
})

function resetForm() {
  form.templateNodeId = ''
  form.templateEdgeId = ''
  form.topology = GRAPH_TOPOLOGIES.GRID
  form.xCount = 3
  form.yCount = 2
  form.nodeCount = 4
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
