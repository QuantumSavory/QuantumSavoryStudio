<template>
<div>
    <div v-if="!computedProtocols.length" class="empty-list">No protocols</div>
    <div v-else style="">
        <ProtocolEditor 
        v-for="protocol in computedProtocols" 
        :key="protocol.id" 
        :protocol="protocol" 
        :isSelected="selectedProtocol?.id === protocol.id" 
        @select="handleSelect" 
        @delete="deleteProtocol"
        @update="updateProtocol"
        :category="protocolGroupName"
        :contextInfo="contextInfo"
        :editingLocked="editingLocked"
        :variables="props.variables"
        :numeric-expression-context="numericExpressionContext"
        />
    </div>
    <section
      v-if="pendingProtocol && pendingDefinition"
      class="add-protocol-draft"
      data-testid="add-protocol-draft"
    >
      <h4>Add {{ protocolSimpleName(pendingDefinition.type) }}</h4>
      <ProtocolConstructorForm
        :protocol="pendingProtocol"
        :category="protocolGroupName"
        :variables="props.variables"
        :editing-locked="editingLocked"
        :numeric-expression-context="numericExpressionContext"
        @commit="pendingError = ''"
      />
      <p v-if="pendingError" class="draft-error" role="alert">{{ pendingError }}</p>
      <p v-else-if="!pendingComplete" class="draft-guidance">
        Complete every required constructor field before adding this protocol.
      </p>
      <div class="draft-actions">
        <button type="button" class="noborder" @click="cancelPendingProtocol">Cancel</button>
        <button
          type="button"
          class="add-pending-protocol"
          :disabled="!pendingComplete"
          @click="commitPendingProtocol"
        >
          Add Protocol
        </button>
      </div>
    </section>
    <div class="action-buttons" style="margin-top: 10px;">
        <button @click="toggleAddProtocolMenu" class="noborder add-protocol-btn">
          <Plus :size="14" aria-hidden="true" />
          Add Protocol
        </button>
        <Menu ref="addProtocolMenu" id="overlay_menu" :model="items" :popup="true" />
    </div>
</div>
</template>



<script setup>

import { computed, ref } from 'vue'
import ProtocolEditor from './ProtocolEditor.vue'
import ProtocolConstructorForm from './ProtocolConstructorForm.vue'
import Menu from 'primevue/menu';
import { api } from '../../utils/ApiConnector'
import { generateUUid } from '../../utils/Utils'
import {
  createProtocolFromDefinition,
  protocolSimpleName,
  validateProtocolConstructorDraft,
} from '../../utils/protocolConstructors'
import { Plus } from '@lucide/vue'
import { SIMULATION_EDITING_LOCK_MESSAGE, useUiServices } from '../../composables/uiServices'
const { showAlert } = useUiServices()

const props = defineProps({
  protocols: {
    type: Array,
    required: true
  },
  protocolGroupName: {
    type: String,
    required: true
  }, 
  protocolClass: {
    type: Function,
    required: true
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
  isVirtualEdge: {
    type: Boolean,
    required: false,
    default: false
  },
  ownerId: {
    type: String,
    default: ''
  },
  numericExpressionContext: {
    type: Object,
    default: undefined
  }
})

const protocolTypes = computed(() => api.config.value.protocolTypes?.[props.protocolGroupName] || [])
const addProtocolMenu = ref(null)
const selectedProtocol = ref(null)
const pendingDefinition = ref(null)
const pendingProtocol = ref(null)
const pendingError = ref('')
const resolveVariable = id => props.variables.find(variable => variable.id === id)
const pendingComplete = computed(() => {
  if (!pendingDefinition.value || !pendingProtocol.value) return false
  try {
    return validateProtocolConstructorDraft(
      pendingDefinition.value,
      pendingProtocol.value,
      { resolveVariable },
    )
  } catch {
    return false
  }
})

// Computed property for menu items that filters based on virtual edge status
const items = computed(() => {
  if (!protocolTypes.value || !protocolTypes.value.length) {
    return []
  }
  
  let filteredTypes = protocolTypes.value
  
  // If this is a virtual edge, only show protocols with virtual: true
  if (props.isVirtualEdge) {
    filteredTypes = protocolTypes.value.filter(type => type.virtual === true)
  }
  
  return filteredTypes.map(type => ({
    label: protocolSimpleName(type.type),
    value: type.type, 
    command: () => {
      handleAddProtocol(type.type)
    }
  }))
})


function deleteProtocol( protocol ){
  // Prevent deleting protocols if simulation has run
  if (props.editingLocked) {
    showAlert('Editing unavailable', SIMULATION_EDITING_LOCK_MESSAGE)
    return
  }

  emit('designOperations', [{
    kind: 'protocols.remove',
    placement: props.protocolGroupName,
    owner_id: props.ownerId,
    protocol_id: protocol.id,
  }])
}

const computedProtocols = computed(() => {
  if (!props.protocols) return []
  return props.protocols
})

function toggleAddProtocolMenu(event) {
  // Prevent adding protocols if simulation has run
  if (props.editingLocked) {
    showAlert('Editing unavailable', SIMULATION_EDITING_LOCK_MESSAGE)
    return
  }
  addProtocolMenu.value.toggle(event)
}

function handleSelect(protocol) {
  if(selectedProtocol.value?.id === protocol.id) {
    selectedProtocol.value = null
  } else {
    selectedProtocol.value = protocol
  }
}

function handleAddProtocol( protocolTypeId) {
  // Prevent adding protocols if simulation has run
  if (props.editingLocked) {
    showAlert('Editing unavailable', SIMULATION_EDITING_LOCK_MESSAGE)
    return
  }

  if( !protocolTypeId ){
    showAlert('Protocol required', 'Select a protocol type before adding it.')
    return;
  }
  const protocolTypeDefinitions = api.config.value.protocolTypes?.[props.protocolGroupName] || []
  const defaultType = protocolTypeDefinitions.find(type => type.type === protocolTypeId)
  if (!defaultType) {
    showAlert('Protocol unavailable', 'The selected protocol is not available in the runtime metadata.')
    return
  }
  if (defaultType.parameters.some(parameter => parameter.required)) {
    pendingDefinition.value = defaultType
    pendingProtocol.value = createProtocolFromDefinition(defaultType)
    pendingError.value = ''
    return
  }
  submitProtocol({ type: defaultType.type })
}

function cancelPendingProtocol() {
  pendingDefinition.value = null
  pendingProtocol.value = null
  pendingError.value = ''
}

function commitPendingProtocol() {
  if (!pendingDefinition.value || !pendingProtocol.value) return
  try {
    validateProtocolConstructorDraft(
      pendingDefinition.value,
      pendingProtocol.value,
      { resolveVariable },
    )
  } catch (error) {
    pendingError.value = error?.message || 'Complete every required constructor field.'
    return
  }
  submitProtocol(pendingProtocol.value, { clearPending: true })
}

function submitProtocol(value, { clearPending = false } = {}) {
  const protocolId = generateUUid('protocol')
  emit(
    'designOperations',
    [{
      kind: 'protocols.create',
      id: protocolId,
      placement: props.protocolGroupName,
      owner_id: props.ownerId,
      value,
    }],
    () => {
      if (clearPending) cancelPendingProtocol()
      const created = props.protocols.find(protocol => protocol.id === protocolId)
      if (created) handleSelect(created)
    },
  )
}

function updateProtocol(update) {
  emit('designOperations', [{
    kind: 'protocols.update',
    placement: props.protocolGroupName,
    owner_id: props.ownerId,
    protocol_id: update.id,
    value: { parameters: update.parameters },
  }])
}

const emit = defineEmits(['select', 'designOperations'])

defineExpose({
  handleSelect
})
</script>

<style scoped>
.add-protocol-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.add-protocol-draft {
  margin-top: var(--app-space-2);
  padding: var(--app-space-2);
  border: 1px solid var(--app-color-border);
  border-radius: var(--app-radius-control);
}

.add-protocol-draft h4 {
  margin: 0 0 var(--app-space-2);
}

.draft-guidance,
.draft-error {
  margin: var(--app-space-2) 0;
  color: var(--app-color-text-muted);
  font-size: 0.85rem;
}

.draft-error {
  color: var(--app-color-danger);
}

.draft-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--app-space-2);
}
</style>
