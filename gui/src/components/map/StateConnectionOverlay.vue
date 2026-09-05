<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'

const props = defineProps({
  startPosition: {
    type: Array,
    required: true
  },
  endPosition: {
    type: Array,
    required: true
  },
  map: {
    type: Object,
    required: true
  },
  connectionId: {
    type: String,
    required: true
  },
  isVisible: {
    type: Boolean,
    default: true
  },
  slotElement: {
    type: Object,
    required: true
  }
})

const overlayEl = ref(null)
const forceUpdate = ref(0) // Used to force reactivity

// Function to get current slot position dynamically
function getCurrentSlotPosition() {
  if (!props.slotElement?.slotElement || !props.map) {
    // Fallback: convert map coordinates to screen coordinates
    try {
      const point = props.map.project(props.startPosition)
      return [point.x, point.y]
    } catch (error) {
      return [0, 0]
    }
  }
  
  try {
    const rect = props.slotElement.slotElement.getBoundingClientRect()
    const mapContainer = props.map.getContainer()
    const mapRect = mapContainer.getBoundingClientRect()
    
    const point = {
      x: rect.left + rect.width / 2 - mapRect.left,
      y: rect.top + rect.height / 2 - mapRect.top
    }
    
    return [point.x, point.y] // Return screen coordinates
  } catch (error) {
    console.warn('Error getting current slot position:', error)
    // Fallback: convert map coordinates to screen coordinates
    try {
      const point = props.map.project(props.startPosition)
      return [point.x, point.y]
    } catch (error) {
      return [0, 0]
    }
  }
}

function getStateNodeScreenPosition() {
  if (!props.map || !props.endPosition) {
    return [0, 0]
  }
  
  try {
    const point = props.map.project(props.endPosition)
    return [point.x, point.y]
  } catch (error) {
    console.warn('Error getting state node screen position:', error)
    return [0, 0]
  }
}

// Computed properties for screen coordinates that include forceUpdate for reactivity
const slotScreenPos = computed(() => {
  forceUpdate.value // Access to make reactive
  return getCurrentSlotPosition()
})

const stateScreenPos = computed(() => {
  forceUpdate.value // Access to make reactive
  return getStateNodeScreenPosition()
})

const lineData = computed(() => {
  const [x1, y1] = slotScreenPos.value
  const [x2, y2] = stateScreenPos.value
  return { x1, y1, x2, y2 }
})

// Update function to force reactivity
function updatePositions() {
  forceUpdate.value++ // Increment to trigger computed property updates
}

// Map event handlers
let mapMoveHandler = null
let mapZoomHandler = null
let markerResizeObserver = null

onMounted(() => {
  if (props.map && props.isVisible) {
    // Listen to map move and zoom events
    mapMoveHandler = () => updatePositions()
    mapZoomHandler = () => updatePositions()
    
    props.map.on('move', mapMoveHandler)
    props.map.on('zoom', mapZoomHandler)
    props.map.on('rotate', mapMoveHandler)
  }

  const nodeElement = props.slotElement?.nodeElement
  if (nodeElement && typeof ResizeObserver !== 'undefined') {
    markerResizeObserver = new ResizeObserver(updatePositions)
    markerResizeObserver.observe(nodeElement)
  }
})

onUnmounted(() => {
  if (props.map && mapMoveHandler) {
    props.map.off('move', mapMoveHandler)
    props.map.off('zoom', mapZoomHandler)
    props.map.off('rotate', mapMoveHandler)
  }
  markerResizeObserver?.disconnect()
})

// Watch for position changes
watch([() => props.startPosition, () => props.endPosition], updatePositions, { deep: true })

// Watch for visibility changes
watch(() => props.isVisible, (newVisible) => {
  if (newVisible && props.map) {
    // Re-attach listeners
    if (!mapMoveHandler) {
      mapMoveHandler = () => updatePositions()
      mapZoomHandler = () => updatePositions()
      
      props.map.on('move', mapMoveHandler)
      props.map.on('zoom', mapZoomHandler)
      props.map.on('rotate', mapMoveHandler)
    }
    updatePositions()
  } else if (props.map && mapMoveHandler) {
    // Remove listeners
    props.map.off('move', mapMoveHandler)
    props.map.off('zoom', mapZoomHandler)
    props.map.off('rotate', mapMoveHandler)
    mapMoveHandler = null
    mapZoomHandler = null
  }
})

// Expose update method to parent
defineExpose({ updatePositions })
</script>

<template>
  <div 
    v-if="isVisible"
    ref="overlayEl"
    class="connection-overlay"
  >
    <svg class="connection-svg">
      <line
        :x1="lineData.x1"
        :y1="lineData.y1"
        :x2="lineData.x2"
        :y2="lineData.y2"
        stroke="#31ccff"
        stroke-width="2"
        stroke-opacity="0.9"
        stroke-dasharray="4,2"
        class="connection-line"
      />

      <!-- Circle at slot end (start of line) -->
      <circle
        :cx="lineData.x1"
        :cy="lineData.y1"
        r="8"
        fill="#ff660000"
        stroke="#61ecff"
        stroke-width="2"
        class="endpoint-circle"
      />
    </svg>
  </div>
</template>

<style scoped>
.endpoint-circle {
  animation: blink 2s infinite;
}

@keyframes blink {
  0%, 50%, 100% {
    opacity: 0;
    r: 20;
  }
  25%, 75% {
    opacity: 1;
    r: 1;
  }
}

.connection-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none; /* Allow clicks to pass through */
  z-index: var(--app-z-map-state-connection);
}

.connection-svg {
  width: 100%;
  height: 100%;
}

.connection-line {
  filter: drop-shadow(1px 1px 2px rgba(0, 0, 0, 0.3));
}
</style>
