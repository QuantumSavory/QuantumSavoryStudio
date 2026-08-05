<template>
  <div class="protocol-editor protocol-list-item"
        :class="{ 'selected':isSelected }" 
      >
    <div class="protocol-list-type" @click="toggleDetails">
        <div>{{ protocolSimpleName(protocol.type) }}</div>
        <div class="protocol-header-actions">
          <button
            type="button"
            class="protocol-header-action noborder"
            aria-label="Show results"
            v-tooltip.top="'Show results'"
            @click.stop="showResults"
          >
            <ChartNoAxesCombined :size="15" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="protocol-header-action noborder"
            aria-label="Delete protocol"
            v-tooltip.top="'Delete protocol'"
            @click.stop="deleteProtocol"
          >
            <Trash2 :size="15" aria-hidden="true" />
          </button>
        </div>
    </div>
    <div class="protocol-container" v-if="isSelected">
      <ProtocolConstructorForm
        :protocol="draftProtocol"
        :category="category"
        :variables="variables"
        :editing-locked="editingLocked"
        :numeric-expression-context="numericExpressionContext"
        empty-text=""
        @commit="commitDraft"
      />
    </div>
  </div>
</template>



<script setup>
import { ref, watch } from 'vue'
import { ChartNoAxesCombined, Trash2 } from '@lucide/vue'
import ProtocolConstructorForm from './ProtocolConstructorForm.vue'
import { useUiServices } from '../../composables/uiServices'
import { api } from '../../utils/ApiConnector.js'
import {
  deepClone,
  protocolSimpleName,
  seedProtocolConstructor,
} from '../../utils/protocolConstructors.js'

const props = defineProps({
  protocol: {
    type: Object,
    required: true
  }, 
  isSelected: {
    type: Boolean,
    default: false
  }, 
  category: {
    type: String,
    default: 'floating'
  },
  contextInfo: {
    type: Object,
    required: false,
    default: () => ({})
  },
  editingLocked: {
    type: Boolean,
    default: false
  },
  variables: {
    type: Array,
    default: () => []
  },
  numericExpressionContext: {
    type: Object,
    default: undefined
  }
})
const emit = defineEmits(['select', 'delete', 'update'])
const { showResultsView } = useUiServices()
function editorDraft(protocol) {
  const definition = api.getProtocolDefinition(props.category, protocol.type)
  return definition
    ? seedProtocolConstructor(definition, protocol)
    : deepClone(protocol)
}

const draftProtocol = ref(editorDraft(props.protocol))

watch(
  () => props.protocol,
  protocol => {
    draftProtocol.value = editorDraft(protocol)
  },
  { deep: true },
)

function commitDraft() {
  emit('update', {
    id: props.protocol.id,
    parameters: deepClone(draftProtocol.value.parameters || []),
  })
}

function toggleDetails(){
  emit('select', props.protocol)
}

function showResults(){
  const context = {
    ...props.contextInfo,
    protocolType: protocolSimpleName(props.protocol.type)
  }
  showResultsView('protocol', props.protocol, context)
}

function deleteProtocol(  ){
  emit('delete', props.protocol)
}

</script>



<style scoped>
.protocol-list-item {
  display: flex;
  flex-direction: column;
  text-align: left;
  justify-content: space-between;
  align-items: left;
  margin: 2px 0px;
  border-radius: 6px;
  border: solid 1px transparent;
  font-size: 1rem;
  transition: background 0.13s, color 0.13s;
}

.protocol-list-item.selected{
  border:solid 1px #4345ac30;
  margin: 0px 0px 10px;
}

.protocol-list-item > .protocol-list-type{
  background: #f6f6fd;
  font-weight: 400;
  padding: 3px 9px 3px 10px;
  border-radius: 4px;
  color: #5c5b61;
  display: flex;
  justify-content: space-between;
  align-items: center;
  user-select: none;
  cursor: pointer;
}

.protocol-header-actions{
  display: flex;
  align-items: center;
  gap: 4px;
}

button.protocol-header-action{
  width: 24px;
  min-width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 4px;
  color: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
}

button.protocol-header-action:hover{
  background: #eeeeee;
  color: #4345ac;
}

.protocol-list-item.selected > .protocol-list-type{
  background:#dfe0fc;
  color: #26286b;
  font-weight: 600;
  border-radius: 4px 4px 0px 0px;
  transition: background 0.5s, color 0.25s;
}

.protocol-container{
  padding: 6px 9px 6px 10px;
  position: relative;
}

</style>
