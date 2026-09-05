<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import maplibregl from 'maplibre-gl'
import SlotIcon from './SlotIcon.vue';
import { useUiServices } from '../../composables/uiServices'
import { positionInProjectWorld } from '../../utils/mapCoordinates'
import { NODE_MARKER_DETAIL } from '../../utils/mapMarkers'

const props = defineProps({
  node: {       type: Object,   required: true },
  map: {        type: Object,   required: true },
  isSelected: { type: Boolean,  default: false },
  editingLocked: { type: Boolean, default: false },
  detailLevel: {
    type: String,
    default: NODE_MARKER_DETAIL.FULL,
    validator: value => Object.values(NODE_MARKER_DETAIL).includes(value),
  },
})

const emit = defineEmits([
  'select',
  'startConnection',
  'updateConnection',
  'endConnection',
  'nodePositionPreview',
  'nodePositionChanged',
  'interactionBusy',
])
const marker = ref(null)
const markerEl = ref(null)
const isDraggingMarker = ref(false)
const isDraggingConnector = ref(false)
const { showEntangledSlots } = useUiServices()
let dragStartPosition = null
let displayedDragStartPosition = null

function markerPosition() {
  const position = marker.value?.getLngLat()
  return position ? [position.lng, position.lat] : null
}

function captureDragStartPosition() {
  dragStartPosition = [...props.node.position]
  displayedDragStartPosition = markerPosition()
}

function currentProjectWorldPosition() {
  return positionInProjectWorld(
    markerPosition(),
    displayedDragStartPosition,
    dragStartPosition,
  )
}

function setMarkerDragging(isDragging) {
  isDraggingMarker.value = isDragging
  markerEl.value?.classList.toggle('is-dragging', isDragging)
}

onMounted(() => {
  // Create and initialize marker
  marker.value = new maplibregl.Marker({
    element: markerEl.value,
    draggable: !props.editingLocked
  })

  // Set marker position and add to map
  marker.value.setLngLat(props.node.position)
    .addTo(props.map)
  // MapLibre assigns its generic marker label in addTo(). Restore the node's
  // identity after that assignment so compact markers remain accessible.
  markerEl.value.setAttribute('aria-label', props.node.name)

  // Handle drag events
  marker.value.on('dragstart', () => {
    if (props.editingLocked) return
    setMarkerDragging(true)
    if (!dragStartPosition || !displayedDragStartPosition) {
      captureDragStartPosition()
    }
    emit('interactionBusy', true)
  })

  marker.value.on('drag', () => {
    if (props.editingLocked) return
    emit('nodePositionPreview', {
      node: props.node,
      position: currentProjectWorldPosition(),
      previousPosition: [...dragStartPosition],
    })
  })

  marker.value.on('dragend', () => {
    if (props.editingLocked) return
    emit('nodePositionChanged', {
      node: props.node,
      position: currentProjectWorldPosition(),
      previousPosition: [...dragStartPosition],
      finish: () => marker.value?.setLngLat(props.node.position),
    })
    setMarkerDragging(false)
    dragStartPosition = null
    displayedDragStartPosition = null
    emit('interactionBusy', false)
  })
})

watch(
  () => props.editingLocked,
  locked => marker.value?.setDraggable(!locked),
)

watch(
  () => props.node.position,
  position => marker.value?.setLngLat(position),
  { deep: true },
)

onUnmounted(() => {
  if (marker.value) {
    marker.value.remove()
  }
})

// Handle click
function handleClick(e) {
  if (!isDraggingConnector.value) {
    e.preventDefault()
    e.stopPropagation()
    emit('select', props.node, 'node')
  }
}

// Handle connector drag events
function handleConnectorMousedown(e) {
  e.preventDefault()
  e.stopPropagation()
  
  isDraggingConnector.value = true
  emit('startConnection', props.node)

  // Add global mouse move and up handlers
  const handleMousemove = (e) => {
    if (!isDraggingConnector.value) return
    const rect = props.map.getContainer().getBoundingClientRect()
    const point = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    }
    const lngLat = props.map.unproject([point.x, point.y])

    // Check if we're over any markers
    const markerElements = document.querySelectorAll('.node-marker')
    let targetNode = null

    // Find if we're hovering over a marker
    markerElements.forEach(markerEl => {
      const markerRect = markerEl.getBoundingClientRect()
      if (e.clientX >= markerRect.left && e.clientX <= markerRect.right &&
          e.clientY >= markerRect.top && e.clientY <= markerRect.bottom) {
        // Get the node instance from the marker element
        const nodeId = markerEl.getAttribute('data-node-id')
        if (nodeId && nodeId !== props.node.id) {
          targetNode = { id: nodeId }
        }
      }
    })

    if (targetNode) {
      emit('updateConnection', targetNode)
    } else {
      emit('updateConnection', [lngLat.lng, lngLat.lat])
    }
  }

  const handleMouseup = (e) => {
    isDraggingConnector.value = false
    
    const markerElements = document.querySelectorAll('.node-marker')
    let targetNode = null

    markerElements.forEach(markerEl => {
      const markerRect = markerEl.getBoundingClientRect()
      if (e.clientX >= markerRect.left && e.clientX <= markerRect.right &&
          e.clientY >= markerRect.top && e.clientY <= markerRect.bottom) {
        const nodeId = markerEl.getAttribute('data-node-id')
        if (nodeId && nodeId !== props.node.id) {
          targetNode = { id: nodeId }
        }
      }
    })

    emit('endConnection', targetNode)
    window.removeEventListener('mousemove', handleMousemove)
    window.removeEventListener('mouseup', handleMouseup)
  }

  window.addEventListener('mousemove', handleMousemove)
  window.addEventListener('mouseup', handleMouseup)
}

function handleSlotClick(slot, e){
  e.stopPropagation()
  showEntangledSlots(slot.id)
}

</script>

<template>
  <div 
    ref="markerEl"
    class="node-marker"
    :class="[
      `node-marker--${detailLevel}`,
      { 'is-selected': isSelected, 'is-dragging': isDraggingMarker },
    ]"
    :data-node-id="node.id"
    :data-detail-level="detailLevel"
    :aria-label="node.name"
    role="button"
    tabindex="0"
    @pointerdown="captureDragStartPosition"
    @click="handleClick"
    @keydown.enter="handleClick"
    @keydown.space="handleClick"
    
  >
    <div 
      class="connector output" 
      aria-hidden="true"
      @mousedown.stop="handleConnectorMousedown"
    ></div>
    <div class="node-name">{{ node.name }}</div>
    <div
      v-if="node.data.slots.length > 0"
      class="node-slots"
    >
      <SlotIcon
        v-for="slot in node.data.slots"
        :key="slot.id"
        :registerSlot="slot"
        @click="handleSlotClick(slot, $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.node-marker {
  --node-marker-transition-duration: 0.15s;

  padding: 4px 8px;
  background-color: var(--app-color-map-node);
  border-radius: 6px;
  border: 2px solid transparent;
  box-shadow: var(--app-shadow-marker);
  cursor: pointer;
  color: var(--app-color-on-primary);
  font-size: 1rem;
  font-weight: 500;
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 60px;
  width: max-content;
  min-height: 30px;
  position: absolute;
  transform: translate(-50%, -50%);
  transition:
    background-color var(--node-marker-transition-duration) ease,
    border-radius var(--node-marker-transition-duration) ease,
    box-shadow var(--node-marker-transition-duration) ease,
    min-height var(--node-marker-transition-duration) ease,
    min-width var(--node-marker-transition-duration) ease,
    padding var(--node-marker-transition-duration) ease;
  z-index: var(--app-z-map-node);
}

.node-marker.is-selected {
  background-color: var(--app-color-map-node-selected);
  box-shadow: 0 0 10px 3px var(--app-color-map-node-selected-glow);
  font-weight: 600;
  z-index: var(--app-z-map-node-selected);
}

.node-marker:hover,
.node-marker:focus-visible,
.node-marker.is-dragging {
  background-color: var(--app-color-map-node-hover);
  box-shadow: 0 0 8px 2px var(--app-color-map-node-glow);
  z-index: var(--app-z-map-node-hover);
}

.node-marker:focus-visible {
  outline: 2px solid var(--app-color-on-primary);
  outline-offset: 2px;
}

.node-marker--slots:not(:hover):not(:focus-visible):not(.is-dragging) {
  min-width: 24px;
  min-height: 24px;
  padding: 3px 5px;
  border-radius: 12px;
}

.node-marker--dot:not(:hover):not(:focus-visible):not(.is-dragging) {
  width: 16px;
  min-width: 16px;
  height: 16px;
  min-height: 16px;
  padding: 0;
  border-radius: 50%;
  background-color: var(--app-color-map-node);
  box-shadow: var(--app-shadow-marker);
  font-weight: 500;
  z-index: var(--app-z-map-node);
}

.node-name {
  max-width: 100vw;
  overflow: hidden;
  margin: 0;
  padding: 0;
  line-height: 1.2;
}

.node-slots {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  max-width: 120px;
  margin-left: 10px;
  overflow: hidden;
}

.node-name,
.node-slots {
  opacity: 1;
  transform: scale(1);
  visibility: visible;
  transition:
    max-width var(--node-marker-transition-duration) ease,
    opacity var(--node-marker-transition-duration) ease,
    transform var(--node-marker-transition-duration) ease,
    visibility 0s linear;
}

:is(.node-marker--slots, .node-marker--dot):not(:hover):not(:focus-visible):not(.is-dragging) .node-name,
.node-marker--dot:not(:hover):not(:focus-visible):not(.is-dragging) .node-slots {
  max-width: 0;
  opacity: 0;
  pointer-events: none;
  transform: scale(0.75);
  visibility: hidden;
  transition-delay: 0s, 0s, 0s, var(--node-marker-transition-duration);
}

:is(.node-marker--slots, .node-marker--dot):not(:hover):not(:focus-visible):not(.is-dragging) .node-slots {
  margin-left: 0;
}

.connector {
  position: absolute;
  width: 24px;
  height: 24px;
  background: #40418700;
  border-radius: 50%;
  top: 50%;
  transform: translateY(-50%);
  cursor: crosshair;
  z-index: 1;
  pointer-events: none;
  visibility: hidden;
}

.node-marker:hover .connector,
.node-marker:focus-visible .connector,
.node-marker.is-dragging .connector {
  pointer-events: auto;
  visibility: visible;
  transition: visibility 0s linear var(--node-marker-transition-duration);
}

.node-marker.is-dragging,
.node-marker.is-dragging .node-name,
.node-marker.is-dragging .node-slots {
  transition-duration: 0s;
}

.connector:hover {
  background: #40418740;
}

.connector:before {
  content: " ";
  position: absolute;
  z-index: -10;
  top: 7px;
  left: 7px;
  right: 7px;
  bottom: 7px;
  border: 2px solid #404187;
  background: #fff;
  border-radius: 50%;
}

.connector.output {
  right: -15px;
}

.is-selected .connector {
  border-color: #4345ac;
}

@media (prefers-reduced-motion: reduce) {
  .node-marker {
    --node-marker-transition-duration: 0.01ms;
  }
}
</style>
