<template>
  <BasePanel 
    panel_id="node_panel" 
    :collapsable="true"
    :collapsed="collapsed"
    :title="`Selected Node`" 
    @update:collapsed="emit('update:collapsed', $event)"
  >
    <template #indicator>
      <NodeIndex :index="props.nodeIndex" />
    </template>
    <template #content>
      <!-- Section 1: Name -->
      <section class="panel-section">
        <div class="node-name" style="display: flex; justify-content: space-between; align-items: center;">
          <template v-if="editingName">
            <input
              id="node-name-input"
              v-model="nameInput"
              @blur="saveName"
              @keydown="handleNameKey"
              class="node-name-input"
            />
          </template>
          <template v-else>
            <span 
              @click="startEditName" 
              class="node-name-display" 
              :class="{ 'node-name-display--disabled': isNodeEditingLocked }"
              :title="isNodeEditingLocked ? 'Reset the simulation to edit node names' : 'Click to edit'"
            >
              {{ props.node.name }}
            </span>
          </template>
          <div class="" >
            <button type="button" class="options-btn noborder" @mouseover="showOptionsMenu" aria-label="Menu" style="font-weight: bold; color: #000;">
              <EllipsisVertical :size="18" aria-hidden="true" />
            </button>
            <Menu @mouseleave="hideOptionsMenu" ref="optionsMenuElement"  :model="mainMenuItems" :popup="true" style="transform: translate(10px, -30px);">
              <template #itemicon="{ item }">
                <LucideMenuIcon :item="item" />
              </template>
            </Menu>
          </div>
        </div>
      </section>

      <!-- Section 2: Slots Table -->
      <section class="panel-section">
        <div class="panel-section-title">SLOTS ({{ props.node.data.slots.length }})</div>
        <SlotsEditor
          :slots="props.node.data.slots"
          :node="props.node"
          :project-data="props.projectData"
          :variables="props.variables"
          :disabled="editingLocked"
          :selection-enabled="batchEditMode"
          :selected-slot-ids="selectedSlots"
          @add-slot="addSlot"
          @remove-slot="deleteSlot"
          @reorder-slot="moveSlot"
          @toggle-selection="toggleSlotSelection"
          @update-slot="updateSlot"
        />
        
        <!-- Add N Slots Mini Form -->
        <div v-if="showAddNSlotsForm" class="add-n-slots-form">
          <div class="form-header">Add Multiple Slots</div>
          
          <div class="form-row">
            <label>Number of slots to add:</label>
            <input 
              type="number" 
              v-model.number="numberOfSlotsToAdd" 
              min="1" 
              max="50" 
              class="number-input"
            />
          </div>
          
          <div class="form-row">
            <label>Slot template:</label>
          </div>
          
          <!-- Slot Template Row (same structure as regular slots) -->
          <div class="add-slots-template">
            <!-- Header -->
            <div class="add-slots-header">
              <div class="slot-cell type-header"></div>
              <div class="slot-cell bg-noise-header">BG Noise</div>
            </div>
            
            <!-- Template Row -->
            <div class="add-slots-row">
              <div class="slot-cell type-cell">
                <span
                  class="type-icon"
                  :class="{ 'type-icon--disabled': slotTypes.length === 0 }"
                  @click="switchSlotTemplateType"
                  v-html="typeIcon(slotTemplate.type)"
                ></span>
              </div>
              <div class="slot-cell bg-noise-cell">
                <select
                  :value="slotTemplate.backgroundNoise.type"
                  :disabled="bgNoiseOptions.length === 0"
                  @change="updateSlotTemplate('backgroundNoise', slotTemplate.backgroundNoise, $event)"
                  class="bg-noise-select"
                >
                  <option v-for="opt in bgNoiseOptions" :key="opt.type" :value="opt.type">{{ opt.type == 'default' ? 'No background noise' : opt.type }}</option>
                </select>
              </div>
            </div>
            <div
              v-if="slotTemplate.backgroundNoise.parameters?.length"
              class="slot-template-parameters"
            >
              <BackgroundNoiseConstructorForm
                :background-noise="slotTemplate.backgroundNoise"
                :variables="variables"
                :numeric-expression-context="numericExpressionContext"
                empty-text=""
              />
            </div>
          </div>
          
          <div class="form-buttons">
            <button type="button" class="cancel-btn" @click="cancelAddNSlots">Cancel</button>
            <button
              type="button"
              class=""
              :disabled="!slotTemplateIsAdmissible"
              @click="executeAddNSlots"
            >
              Add {{ numberOfSlotsToAdd }} Slot{{ numberOfSlotsToAdd !== 1 ? 's' : '' }}
            </button>
          </div>
        </div>
        
        <!-- Batch Edit Mini Form -->
        <div v-if="showBatchEditForm" class="batch-edit-form">
          <div class="form-header">
            {{ selectedSlots.size > 0 ? `Batch Edit ${selectedSlots.size} Slot${selectedSlots.size !== 1 ? 's' : ''}` : 'Batch Edit (No slots selected)' }}
          </div>
          
          <!-- Batch Edit Template Row -->
          <div class="batch-edit-template">
            <!-- Header -->
            <div class="batch-edit-header">
              <div class="slot-cell type-header"></div>
              <div class="slot-cell bg-noise-header">BG Noise</div>
            </div>
            
            <!-- Template Row -->
            <div class="batch-edit-row">
              <div class="slot-cell type-cell">
                <span 
                  @click="switchBatchEditTemplateType" 
                  class="type-icon" 
                  :class="{
                    'changed-property': changedProperties.has('type'),
                    'type-icon--disabled': slotTypes.length === 0,
                  }"
                  v-html="typeIcon(batchEditTemplate.type)"
                ></span>
              </div>
              <div class="slot-cell bg-noise-cell">
                <select 
                  :value="batchEditTemplate.backgroundNoise.type" 
                  @change="updateBatchEditTemplate('backgroundNoise', batchEditTemplate.backgroundNoise, $event)"
                  class="bg-noise-select"
                  :class="{ 'changed-property': changedProperties.has('backgroundNoise') }"
                  :disabled="bgNoiseOptions.length === 0"
                >
                  <option v-for="opt in bgNoiseOptions" :key="opt.type" :value="opt.type">{{ opt.type == 'default' ? 'No background noise' : opt.type }}</option>
                </select>
              </div>
            </div>
            <div
              v-if="batchEditTemplate.backgroundNoise.parameters?.length"
              class="slot-template-parameters"
            >
              <BackgroundNoiseConstructorForm
                :background-noise="batchEditTemplate.backgroundNoise"
                :variables="variables"
                :numeric-expression-context="numericExpressionContext"
                empty-text=""
                @commit="changedProperties.add('backgroundNoise')"
              />
            </div>
          </div>
          
          <div v-if="changedProperties.size > 0" class="changed-summary">
            <strong>Properties to change:</strong> {{ Array.from(changedProperties).join(', ') }}
          </div>
          
          <div class="form-buttons">
            <button type="button" class="cancel-btn" @click="cancelBatchEdit">Cancel</button>
            <button
              type="button"
              class="" 
              @click="executeBatchEdit"
              :disabled="!batchEditCanApply"
            >
              {{ selectedSlots.size > 0 ? `Apply to ${selectedSlots.size} Slot${selectedSlots.size !== 1 ? 's' : ''}` : 'Apply' }}
            </button>
          </div>
        </div>
        <br/>

        <div class="panel-section-title">PROTOCOLS ({{ props.node.data.protocols.length }})</div>
        <ProtocolsManager 
          ref="protocolsManager"
          :protocols="props.node.data.protocols" 
          protocolGroupName="node" 
          :protocolClass="FloatingProtocol"
          :contextInfo="{
            nodeName: props.node.name
          }"
          :editingLocked="editingLocked"
          :variables="props.variables"
          :owner-id="props.node.id"
          :numeric-expression-context="numericExpressionContext"
          @design-operations="(...args) => emit('design-operations', ...args)"
        />
      </section>
    </template>
  </BasePanel>
</template>



<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted, toRaw } from 'vue'
import { api } from '../../utils/ApiConnector'
import BasePanel from './BasePanel.vue'
import FloatingProtocol from '../../models/FloatingProtocol'
import ProtocolsManager from './ProtocolsManager.vue'
import SlotsEditor from './SlotsEditor.vue'
import BackgroundNoiseConstructorForm from './BackgroundNoiseConstructorForm.vue'
import Menu from 'primevue/menu'
import NodeIndex from './NodeIndex.vue'
import {
  EllipsisVertical,
  ListChecks,
  ListPlus,
  Trash2,
} from '@lucide/vue'
import LucideMenuIcon from '../LucideMenuIcon.vue'
import { SIMULATION_EDITING_LOCK_MESSAGE, useUiServices } from '../../composables/uiServices'
import { buildNumericExpressionContext } from '../../utils/numericExpressionContext.js'
import { createConstructorParameterDrafts } from '../../utils/constructorParameters.js'

// Props: node (Node instance), justCreated (bool: true if node was just created and selected)
const props = defineProps({
  node: {
    type: Object,
    required: true
  },
  nodeIndex: {
    type: Number,
    default: null
  },
  justCreated: {
    type: Boolean,
    default: false
  },
  editingLocked: {
    type: Boolean,
    default: false
  },
  variables: {
    type: Array,
    default: () => []
  },
  collapsed: {
    type: Boolean,
    default: false
  },
  projectData: {
    type: Object,
    required: true
  }
})

const numericExpressionContext = computed(() => (
  buildNumericExpressionContext(props.projectData, 'node', props.node)
))

const emit = defineEmits([
  'delete',
  'design-operations',
  'name-edit-complete',
  'update:collapsed',
])
const { showAlert } = useUiServices()

const bgNoiseOptions = computed(() => {
  const configured = api.config.value.bgNoiseOptions
  return Array.isArray(configured)
    ? configured.filter(option => typeof option?.type === 'string' && option.type)
    : []
})
const slotTypes = computed(() => {
  const configured = Array.isArray(api.config.value.slotTypes)
    ? api.config.value.slotTypes
    : []
  return configured
    .map(type => typeof type === 'string' ? type : type?.type)
    .filter(type => typeof type === 'string' && type)
})

function newBackgroundNoise(definition) {
  if (!definition) return { type: '', parameters: [] }
  const backgroundNoise = structuredClone(toRaw(definition))
  backgroundNoise.parameters = createConstructorParameterDrafts(
    definition,
    { identity: 'field' },
  )
  return backgroundNoise
}

function newSlotTemplate() {
  const backgroundDefinition = bgNoiseOptions.value.find(option => option.type === 'default')
    ?? bgNoiseOptions.value[0]
  return {
    type: slotTypes.value[0] ?? '',
    backgroundNoise: newBackgroundNoise(backgroundDefinition),
    lastOperationTime: 0,
    assignment: false,
    isLocked: false,
  }
}

// Helper: get icon for the add-many and batch-edit slot templates.
function typeIcon(type) {
  if (!type) return '•'
  const t = type; //.trim().toLowerCase()
  if (t == "Qubit") return '<span style="color: var(--app-color-qubit);">Q</span>' // Qubit/Qudit
  if (t == "Qumode") return '<span style="color: var(--app-color-qmode);">M</span>' // Mode
  return t.charAt(0).toUpperCase()
}


// Handler: add new slot
function addSlot(value) {
  // Prevent adding slots if simulation has run
  if (props.editingLocked) {
    showAlert('Editing unavailable', SIMULATION_EDITING_LOCK_MESSAGE)
    return
  }

  emit('design-operations', [{
    kind: 'slots.create',
    node_id: props.node.id,
    value,
  }])
}

function deleteSlot(slot) {
  // Prevent deleting slots if simulation has run
  if (props.editingLocked) {
    showAlert('Editing unavailable', SIMULATION_EDITING_LOCK_MESSAGE)
    return
  }

  emit('design-operations', [{
    kind: 'slots.remove',
    node_id: props.node.id,
    slot_id: slot.id
  }])
}

function moveSlot({ slot, toIndex }) {
  if (props.editingLocked) {
    showAlert('Editing unavailable', SIMULATION_EDITING_LOCK_MESSAGE)
    return
  }
  emit('design-operations', [{
    kind: 'slots.reorder',
    node_id: props.node.id,
    slot_id: slot.id,
    to_index: toIndex,
  }])
}

function updateSlot({ slot, value }) {
  if (props.editingLocked) {
    showAlert('Editing unavailable', SIMULATION_EDITING_LOCK_MESSAGE)
    return
  }
  emit('design-operations', [{
    kind: 'slots.update',
    node_id: props.node.id,
    slot_id: slot.id,
    value,
  }])
}

const optionsMenuElement = ref(null)
const mainMenuItems = computed(() => {
  let result = [
    { label: 'Delete', lucideIcon: Trash2, command: () => handleOptionsMenu('delete') },
    { label: 'Add N Slots', lucideIcon: ListPlus, command: () => addNSlots() },
    { label: 'Batch Edit', lucideIcon: ListChecks, command: () => toggleBatchEdit() },
  ];
  return result;
}) 


function handleOptionsMenu(action){
  if( action == "delete" ){
    emit('delete', props.node, 'node')
  }
}

function showOptionsMenu(event){
  console.log( 'showOptionsMenu', event, optionsMenuElement.value );
  optionsMenuElement.value.show(event)
}
function hideOptionsMenu(event){
  optionsMenuElement.value.hide(event)
}


// Editable node name logic
const isNodeEditingLocked = computed(() => props.editingLocked)
const editingName = ref(false)
const nameInput = ref('')

watch(isNodeEditingLocked, (locked) => {
  if (locked && editingName.value) {
    editingName.value = false
    nameInput.value = props.node.name
  }
})
// Options dropdown logic
const showOptionsDropdown = ref(false)

// Add N Slots form logic
const showAddNSlotsForm = ref(false)
const numberOfSlotsToAdd = ref(1)
const slotTemplate = ref(newSlotTemplate())

// Batch Edit logic
const batchEditMode = ref(false)
const selectedSlots = ref(new Set())
const showBatchEditForm = ref(false)
const batchEditTemplate = ref(newSlotTemplate())
const changedProperties = ref(new Set())
const slotTemplateIsAdmissible = computed(() => (
  slotTypes.value.includes(slotTemplate.value.type)
  && bgNoiseOptions.value.some(option => (
    option.type === slotTemplate.value.backgroundNoise.type
  ))
))
const batchEditCanApply = computed(() => (
  changedProperties.value.size > 0
  && selectedSlots.value.size > 0
  && (
    !changedProperties.value.has('type')
    || slotTypes.value.includes(batchEditTemplate.value.type)
  )
  && (
    !changedProperties.value.has('backgroundNoise')
    || bgNoiseOptions.value.some(option => (
      option.type === batchEditTemplate.value.backgroundNoise.type
    ))
  )
))

function hideOptionsDropdown() {
  showOptionsDropdown.value = false
}

function addNSlots() {
  console.log( 'addNSlots' );
  slotTemplate.value = newSlotTemplate()
  showAddNSlotsForm.value = true
  hideOptionsDropdown()
}

function cancelAddNSlots() {
  showAddNSlotsForm.value = false
  // Reset form values
  numberOfSlotsToAdd.value = 1
  slotTemplate.value = newSlotTemplate()
}

function executeAddNSlots() {
  // Prevent adding slots if simulation has run
  if (props.editingLocked) {
    showAlert('Editing unavailable', SIMULATION_EDITING_LOCK_MESSAGE)
    return
  }

  if (numberOfSlotsToAdd.value > 0 && slotTemplateIsAdmissible.value) {
    emit(
      'design-operations',
      Array.from({ length: numberOfSlotsToAdd.value }, () => ({
        kind: 'slots.create',
        node_id: props.node.id,
        value: {
          type: slotTemplate.value.type,
          backgroundNoise: structuredClone(toRaw(slotTemplate.value.backgroundNoise))
        }
      }))
    )
  }
  showAddNSlotsForm.value = false
}

function updateSlotTemplate(key, value, event) {
  const bgType = event.target.value;
  const bgTypeDefinition = bgNoiseOptions.value.find(opt => opt.type === bgType);
  if (!bgTypeDefinition) return
  slotTemplate.value.backgroundNoise = newBackgroundNoise(bgTypeDefinition)
}

function switchSlotTemplateType() {
  if (slotTypes.value.length === 0) return
  const slot = slotTemplate.value
  const index = slotTypes.value.indexOf(slot.type)
  slot.type = slotTypes.value[(index + 1) % slotTypes.value.length]
}

// Batch Edit Functions
function toggleBatchEdit() {
  batchEditMode.value = !batchEditMode.value
  if (batchEditMode.value) {
    // Entering batch edit mode - show form immediately
    showBatchEditForm.value = true
    resetBatchEditTemplate()
  } else {
    // Exit batch edit mode
    selectedSlots.value.clear()
    showBatchEditForm.value = false
    changedProperties.value.clear()
  }
  hideOptionsDropdown()
}

function toggleSlotSelection(slotId) {
  if (selectedSlots.value.has(slotId)) {
    selectedSlots.value.delete(slotId)
  } else {
    selectedSlots.value.add(slotId)
  }
}

function resetBatchEditTemplate() {
  batchEditTemplate.value = newSlotTemplate()
  changedProperties.value.clear()
}

function updateBatchEditTemplate(key, value, event) {
  const bgType = event.target.value;
  const bgTypeDefinition = bgNoiseOptions.value.find(opt => opt.type === bgType);
  if (!bgTypeDefinition) return
  batchEditTemplate.value.backgroundNoise = newBackgroundNoise(bgTypeDefinition)
  changedProperties.value.add(key);
}

function switchBatchEditTemplateType() {
  if (slotTypes.value.length === 0) return
  const index = slotTypes.value.indexOf(batchEditTemplate.value.type)
  batchEditTemplate.value.type = slotTypes.value[
    (index + 1) % slotTypes.value.length
  ]
  changedProperties.value.add('type')
}

function cancelBatchEdit() {
  selectedSlots.value.clear()
  showBatchEditForm.value = false
  changedProperties.value.clear()
  batchEditMode.value = false
}

function executeBatchEdit() {
  if (props.editingLocked || !batchEditCanApply.value) return
  const slotsToUpdate = props.node.data.slots.filter(slot => selectedSlots.value.has(slot.id))
  const value = Object.fromEntries(
    [...changedProperties.value].map(property => [
      property,
      structuredClone(toRaw(batchEditTemplate.value[property]))
    ])
  )
  emit(
    'design-operations',
    slotsToUpdate.map(slot => ({
      kind: 'slots.update',
      node_id: props.node.id,
      slot_id: slot.id,
      value: structuredClone(value)
    }))
  )
  
  // Clean up and exit batch edit mode
  selectedSlots.value.clear()
  showBatchEditForm.value = false
  changedProperties.value.clear()
  batchEditMode.value = false
}

// Close dropdown when clicking outside
function handleClickOutside(event) {
  if (showOptionsDropdown.value && !event.target.closest('.options-dropdown-container')) {
    hideOptionsDropdown()
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

function startEditName() {
  if (isNodeEditingLocked.value) {
    showAlert('Editing unavailable', SIMULATION_EDITING_LOCK_MESSAGE)
    return
  }
  nameInput.value = props.node.name
  editingName.value = true
  setTimeout(() => {
    const el = document.getElementById('node-name-input')
    if (el) {
      el.focus()
      el.select()
    }
  }, 0)
}
function saveName() {
  if (nameInput.value.trim() && nameInput.value !== props.node.name) {
    emit('design-operations', [{
      kind: 'topology.update_node',
      node_id: props.node.id,
      value: { name: nameInput.value.trim() }
    }])
  }
  editingName.value = false
}
function handleNameKey(e) {
  if (e.key === 'Enter') saveName()
  if (e.key === 'Escape') editingName.value = false
}

// Watch for justCreated to trigger name editing
watch(
  () => props.justCreated,
  (val) => {
    if (val) {
      nextTick(() => {
        startEditName()
        emit('name-edit-complete')
      })
    }
  }
)

// Also handle the case where justCreated is true on mount
if (props.justCreated) {
  nextTick(() => {
    startEditName()
    emit('name-edit-complete')
  })
}
</script>




<style scoped>
.node-name {
  font-size: 1.15rem;
  font-weight: 500;
  color: #222;
  margin-bottom: 2px;
  min-height: 28px;
}

.node-name-display {
  border-radius: 0px;
  padding: 0px;
  transition: background 0.15s;
  overflow: hidden;
}

.node-name-display:hover {
  border-bottom: solid 1px #000;
}

.node-name-display--disabled {
  cursor: not-allowed;
  color: #777;
}

.node-name-display--disabled:hover {
  border-bottom: none;
}

.node-name-input {
  font-size: 1.08rem;
  font-weight: 500;
  color: #222;
  border: 1.5px solid #2196f3;
  border-radius: 3px;
  padding: 2px 6px;
  outline: none;
  width: 90%;
  background: #fff;
}
.slot-cell {
  display: flex;
  align-items: center;
  padding: 2px 3px;
  box-sizing: border-box;
  min-height: 25px;
}

.type-header, .type-cell {
  width: 20px;
  min-width: 20px;
  max-width: 20px;
  justify-content: center;
}

.bg-noise-header, .bg-noise-cell {
  flex: 1;
  min-width: 0;
}

.type-icon {
  cursor: pointer;
  font-size: 1rem;
  font-weight: 600;
  width: 1.23rem;
  height: 1.23rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.type-icon--disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
 

 
.bg-noise-select {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  font-size: 1rem;
  padding: 0.15rem 0.25rem;
  box-sizing: border-box;
  border: 1px solid #ccc;
  border-radius: 3px;
}

 
 
 

.options-btn {
  border-radius: 4px;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: bold;
  color: #666;
  min-width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.15s, border-color 0.15s;
}

.options-btn:hover {
  background: #eeeeee;
  color: #444;
}

 

 

/* Add N Slots Form */
.add-n-slots-form {
  margin-top: 12px;
  padding: 12px;
  background: #f9f9f9;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
}

.add-slots-template {
  margin: 8px 0;
  border: 1px solid #ddd;
  border-radius: 4px;
  overflow: hidden;
  background: white;
}

.add-slots-header {
  display: flex;
  align-items: center;
  background: #f5f5f5;
  border-bottom: 1px solid #ddd;
  font-size: 0.85rem;
  font-weight: 600;
  color: #666;
  height: 28px;
}

.add-slots-row {
  display: flex;
  align-items: center;
  height: 32px;
  font-size: 0.9rem;
}

.slot-template-parameters {
  padding: var(--app-space-3);
  border-top: 1px solid var(--app-color-border);
}

.form-header {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin-bottom: 12px;
  text-align: center;
}

.form-row {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  gap: 8px;
}

.form-row label {
  font-size: 13px;
  color: #555;
  font-weight: 500;
  min-width: fit-content;
}

.number-input {
  width: 60px;
  padding: 4px 6px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 13px;
  text-align: center;
}



.form-buttons {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 12px;
}

 

.cancel-btn {
  background: #f5f5f5;
  border: 1px solid #ddd;
  color: #666;
}

.cancel-btn:hover {
  background: #eeeeee;
  border-color: #ccc;
}


.batch-edit-form {
  margin-top: 12px;
  padding: 12px 0px;
  border-top: 1px solid #00000040;
}

.batch-edit-template {
  margin: 8px 0;
  border: 1px solid #ddd;
  border-radius: 4px;
  overflow: hidden;
  background: white;
}

.batch-edit-header {
  display: flex;
  align-items: center;
  background: #f5f5f5;
  border-bottom: 1px solid #ddd;
  font-size: 0.85rem;
  font-weight: 600;
  color: #666;
  height: 28px;
}

.batch-edit-row {
  display: flex;
  align-items: center;
  height: 32px;
  font-size: 0.9rem;
}

.changed-property {
}

.changed-summary {
  margin: 8px 0;
  padding: 6px 8px;
  background: #e3f2fd;
  border: 1px solid #90caf9;
  border-radius: 4px;
  font-size: 12px;
  color: #1565c0;
}

</style>
