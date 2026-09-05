<script setup>
import { reactive, ref, onMounted, onUnmounted, onBeforeUnmount, nextTick, watch } from 'vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import NodeMarker from './NodeMarker.vue'
import EdgeLine from './EdgeLine.vue'
import MapAnnotation from './MapAnnotation.vue'
import StateNode from './StateNode.vue'
import StateConnectionOverlay from './StateConnectionOverlay.vue'
import Edge from '../../models/Edge'
import { generateUUid, setEdgeCorrectNodeOrder } from '../../utils/Utils'
import {
  annotationBoundsFromScreenCenter,
  createAnnotation,
} from '../../utils/annotationGeometry'
import { assertNodeMoveGeometry } from '../../utils/edgeGeometry'
import { isEdgeLayerId } from '../../utils/mapLayers'
import {
  NODE_MARKER_DETAIL,
  isInteractiveMapMarkerTarget,
  nodeMarkerDetailLevels,
} from '../../utils/mapMarkers'
import { 
  findSlotElements, 
  calculateStateNodePosition, 
  getSlotMapPosition, 
  generateConnectionId 
} from '../../utils/SlotConnectionUtils'

// Main references to map management
const mapContainer = ref(null)
const map = ref(null)
const isMapLoaded = ref(false)
const shiftDown = ref(false);

// Connection state
const sourceNode = ref(null)
const targetNode = ref(null)
const temporaryEndpoint = ref(null)
const nodePositionPreviews = reactive(new Map())

// SlotConnectionState visualization
const activeSlotConnectionState = ref(null)
const stateNodePosition = ref(null)
const slotConnections = ref([])
const isStateVisible = ref(false)
const connectionOverlayRefs = ref(new Map()) // Store refs to overlay components

// Default map settings
const props = defineProps({
  center:       {    type: Array,   default: () => [-74.5, 40]  },
  zoom:         {    type: Number,  default: 9 },
  style:        {    type: String,  default: 'https://demotiles.maplibre.org/style.json' },
  nodes:        {    type: Array,   default: () => [] },
  edges:        {    type: Array,   default: () => [] },
  annotations:  {    type: Array,   default: () => [] },
  selectedItem: {    type: Object,  default: null },
  selectedType: {    type: String,  default: null },
  annotationCreationEnabled: { type: Boolean, default: false },
  editingLocked: {   type: Boolean, default: false },
  curveEditingEnabled: { type: Boolean, default: false },
  showPhysicalBadges: { type: Boolean, default: true },
  physicalConfig: { type: Object, default: () => ({}) }
})

const emit = defineEmits([
  'select',
  'map-click',
  'edge-created',
  'annotation-created',
  'map-state-change',
  'delete',
  'map-ready',
  'map-initialization-error',
  'design-operations',
  'interaction-busy',
  'node-position-changed',
])

const markerDetailLevels = ref(new Map())
let markerDetailFrame = null

function updateNodeMarkerDetails() {
  markerDetailFrame = null
  if (!map.value || !isMapLoaded.value || !mapContainer.value) return
  const displayedCenters = new Map(
    [...mapContainer.value.querySelectorAll('.node-marker')].map(element => {
      const bounds = element.getBoundingClientRect()
      return [element.dataset.nodeId, {
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2,
      }]
    }),
  )
  markerDetailLevels.value = nodeMarkerDetailLevels(
    props.nodes,
    node => displayedCenters.get(node.id),
  )
}

function scheduleNodeMarkerDetails() {
  if (markerDetailFrame === null) {
    markerDetailFrame = requestAnimationFrame(updateNodeMarkerDetails)
  }
}

function markerDetail(node) {
  return markerDetailLevels.value.get(node.id) ?? NODE_MARKER_DETAIL.FULL
}

// MapLibre moves each marker element outside Vue's normal DOM tree. Keep the
// component render order stable when simulator IDs change so Vue updates the
// existing marker instances instead of trying to move MapLibre-owned elements.
const renderedNodes = ref([])
watch(
  () => props.nodes.map(node => node),
  (nodes) => {
    const nodesById = new Map(nodes.map(node => [node.id, node]))
    for (const nodeId of nodePositionPreviews.keys()) {
      if (!nodesById.has(nodeId)) nodePositionPreviews.delete(nodeId)
    }
    const renderedIds = renderedNodes.value
      .map(node => node.id)
      .filter(id => nodesById.has(id))
    const renderedIdSet = new Set(renderedIds)

    nodes.forEach(node => {
      if (!renderedIdSet.has(node.id)) {
        renderedIds.push(node.id)
        renderedIdSet.add(node.id)
      }
    })

    renderedNodes.value = renderedIds.map(id => nodesById.get(id))
  },
  { immediate: true }
)

watch(
  () => props.nodes.map(node => [node.id, ...node.position]),
  scheduleNodeMarkerDetails,
)

// SlotConnectionState management functions
function showSlotConnectionState(slotConnectionState) {
  if (!map.value || !isMapLoaded.value) {
    console.warn('Map not ready for slot connection state visualization')
    return false
  }

  // Hide any existing state first
  hideSlotConnectionState()

  // Find all slot elements
  const slotElements = findSlotElements(slotConnectionState)
  if (slotElements.length === 0) {
    console.warn('No slot elements found for the provided SlotConnectionState')
    return false
  }

  // Calculate position for the state node
  const position = calculateStateNodePosition(slotElements, map.value)
  
  // Store state data
  activeSlotConnectionState.value = slotConnectionState
  stateNodePosition.value = position
  
  // Create connections for each slot
  const connections = []
  for (const slotEl of slotElements) {
    const slotPosition = getSlotMapPosition(slotEl.slotElement, map.value)
    if (slotPosition) {
      const connectionId = generateConnectionId(slotConnectionState.id, slotEl.slotId)
      connections.push({
        id: connectionId,
        startPosition: slotPosition,
        endPosition: position,
        slotElement: slotEl
      })
    }
  }
  
  slotConnections.value = connections
  isStateVisible.value = true
  
  return true
}

function hideSlotConnectionState() {
  isStateVisible.value = false
  activeSlotConnectionState.value = null
  stateNodePosition.value = null
  slotConnections.value = []
  connectionOverlayRefs.value.clear() // Clear component refs
}

function updateSlotConnectionPositions() {
  if (!activeSlotConnectionState.value || !isStateVisible.value) return
  
  // Recalculate positions (useful when map is resized or nodes are moved)
  const slotElements = findSlotElements(activeSlotConnectionState.value)
  const newStatePosition = calculateStateNodePosition(slotElements, map.value)
  
  // Update state node position
  stateNodePosition.value = newStatePosition
  
  // Update connection positions
  const updatedConnections = []
  for (const slotEl of slotElements) {
    const slotPosition = getSlotMapPosition(slotEl.slotElement, map.value)
    if (slotPosition) {
      const existingConnection = slotConnections.value.find(conn => 
        conn.slotElement.slotId === slotEl.slotId
      )
      
      if (existingConnection) {
        updatedConnections.push({
          ...existingConnection,
          startPosition: slotPosition,
          endPosition: newStatePosition
        })
      }
    }
  }
  
  slotConnections.value = updatedConnections
  
  // Force overlay components to update their positions
  nextTick(() => {
    // Call updatePositions on each overlay component
    connectionOverlayRefs.value.forEach((overlayRef) => {
      if (overlayRef && overlayRef.updatePositions) {
        overlayRef.updatePositions()
      }
    })
  })
}

// Handle connection events
function handleStartConnection(node) {
  sourceNode.value = node
}


function handleUpdateConnection(target) {
  if (!sourceNode.value) return

  if (Array.isArray(target)) {
    // Mouse position update
    temporaryEndpoint.value = target
    targetNode.value = null
  } else if (target === null) {
    // Mouse left potential target
    targetNode.value = null
  } else {
    // Hovering over a potential target node
    const node = props.nodes.find(n => n.id === target.id)
    if (node) {
      targetNode.value = node
      temporaryEndpoint.value = null
    }
  }
}

function handleEndConnection(target) {
  if (sourceNode.value && target) {
    const node = props.nodes.find(n => n.id === target.id)
    if (node && node !== sourceNode.value) {
      const edgeOptions = {
        id: generateUUid('edge'),
        source: sourceNode.value,
        target: node,
        data: {
          type: 'connection',
          protocols: [],
          curvePoints: [],
          physicalOverrides: null,
        },
      }
      // If shift key is pressed, set logic to true
      if (shiftDown.value) {
        edgeOptions.isLogic = true
        delete edgeOptions.data.curvePoints
        delete edgeOptions.data.physicalOverrides
      }
      // Create new edge
      const newEdge = new Edge(edgeOptions)
      setEdgeCorrectNodeOrder(newEdge, props.nodes);
      emit('edge-created', newEdge)
    }
  }

  // Reset connection state
  sourceNode.value = null
  targetNode.value = null
  temporaryEndpoint.value = null
}




function onKeydown(e) {
  if (e.key === 'Shift' || (e.code && e.code.startsWith('Shift'))){
    shiftDown.value = true;
  }else if (
   (e.key === 'Delete'
      || e.code === 'Delete'
      || e.key === 'Backspace'
      || (e.code && e.code.startsWith('Backspace'))) &&
   // selected item and type are set
   (props.selectedItem && props.selectedType) &&
   // Never turn a text-editing keystroke into a map deletion.
   !['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(e.target.nodeName)
   && !e.target.isContentEditable
  ){
    emit('delete', props.selectedItem, props.selectedType)
  }
}

function isEdgeAtPoint(point) {
  return map.value.queryRenderedFeatures(point).some(feature => (
    feature.layer && isEdgeLayerId(feature.layer.id)
  ))
}

function createMapAnnotation(event) {
  const center = [event.lngLat.lng, event.lngLat.lat]
  const bounds = annotationBoundsFromScreenCenter(center, map.value)
  if (!bounds) return
  const annotation = createAnnotation({
    bounds,
    existingAnnotations: props.annotations,
  })
  emit('annotation-created', annotation)
}

function handleMapMousedown(event) {
  const markerClick = isInteractiveMapMarkerTarget(event.originalEvent.target)
  const edgeClick = isEdgeAtPoint(event.point)
  if (markerClick || edgeClick) return

  if (props.annotationCreationEnabled) {
    createMapAnnotation(event)
    return
  }

  emit('map-click', event)
  emit('select', null, null)
}

function onKeyup(e) {
  if (e.key === 'Shift' || (e.code && e.code.startsWith('Shift'))) shiftDown.value = false;
}

function onBlur() {
  // If the window loses focus while Shift is down, clear the flag
  shiftDown.value = false;
}

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') shiftDown.value = false;
}



onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('keyup', onKeyup);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibilityChange);
  if (mapContainer.value) {
    const handleInitializationError = (event) => {
      emit('map-initialization-error', event?.error)
    }

    try {
      map.value = new maplibregl.Map({
        container: mapContainer.value,
        style: props.style,
        center: props.center,
        zoom: props.zoom,
      })

      // Register initialization failures before another MapLibre operation can throw.
      map.value.on('error', handleInitializationError)

      // Add navigation controls
      map.value.addControl(new maplibregl.NavigationControl(), 'bottom-left')
    } catch (error) {
      emit('map-initialization-error', error)
      try {
        map.value?.remove()
      } catch (cleanupError) {
        console.warn('Failed to clean up map after initialization error:', cleanupError)
      }
      map.value = null
      return
    }

    // Wait for map to load before allowing markers and edges
    map.value.on('load', () => {
      isMapLoaded.value = true
      // Once initialization succeeds, remove our listener so MapLibre retains
      // its default reporting for later tile and style errors.
      map.value.off('error', handleInitializationError)
      // Apply any pending prop updates that may have occurred before map was loaded
      applyMapStateFromProps()
      nextTick(scheduleNodeMarkerDetails)
      emit('map-ready')
    })

    // Clear selection when clicking the map background
    map.value.on('mousedown', handleMapMousedown)

    // Track map state changes (pan and zoom)
    map.value.on('moveend', () => {
      const center = map.value.getCenter()
      const zoom = map.value.getZoom()
      emit('map-state-change', {
        center: [center.lng, center.lat],
        zoom: zoom
      })
    })

    map.value.on('zoomend', () => {
      const center = map.value.getCenter()
      const zoom = map.value.getZoom()
      emit('map-state-change', {
        center: [center.lng, center.lat],
        zoom: zoom
      })
    })

    map.value.on('move', scheduleNodeMarkerDetails)
  }
})

// Function to apply map state from props
function applyMapStateFromProps() {
  if (!map.value || !isMapLoaded.value) return
  
  // Apply center if different
  if (props.center) {
    const currentCenter = map.value.getCenter()
    if (Math.abs(currentCenter.lng - props.center[0]) > 0.001 || 
        Math.abs(currentCenter.lat - props.center[1]) > 0.001) {
      map.value.setCenter(props.center)
    }
  }
  
  // Apply zoom if different
  if (props.zoom != null) {
    const currentZoom = map.value.getZoom()
    if (Math.abs(currentZoom - props.zoom) > 0.01) {
      map.value.setZoom(props.zoom)
    }
  }
}

// Watch for center prop changes and update map
watch(() => props.center, () => {
  applyMapStateFromProps()
}, { deep: true })

// Watch for zoom prop changes and update map
watch(() => props.zoom, () => {
  applyMapStateFromProps()
})


onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('keyup', onKeyup);
  window.removeEventListener('blur', onBlur);
  document.removeEventListener('visibilitychange', onVisibilityChange);
  map.value?.off('mousedown', handleMapMousedown)
  map.value?.off('move', scheduleNodeMarkerDetails)
  if (markerDetailFrame !== null) cancelAnimationFrame(markerDetailFrame)
});


onUnmounted(() => {
  if (map.value) {
    map.value.remove()
  }
})

// Handle selection from child components
function handleSelect(item, type) {
  emit('select', item, type)
}

// Handle node position changes to update slot connections
function handleNodePositionPreview(change) {
  if (change?.node && Array.isArray(change.position)) {
    try {
      assertNodeMoveGeometry(change.node, change.position, props.edges)
      nodePositionPreviews.set(change.node.id, [...change.position])
    } catch {
      // Leave the last renderable preview in place. The durable command will
      // reject an invalid final position and surface the standard alert.
    }
  }
  scheduleNodeMarkerDetails()
  if (isStateVisible.value && activeSlotConnectionState.value) {
    // Update slot connection positions when a node moves
    updateSlotConnectionPositions()
  }
}

function handleNodePositionChanged(change) {
  handleNodePositionPreview(change)
  const finishMarkerDrag = change.finish
  emit('node-position-changed', {
    ...change,
    finish: () => {
      nodePositionPreviews.delete(change.node.id)
      finishMarkerDrag?.()
      scheduleNodeMarkerDetails()
      updateSlotConnectionPositions()
    },
  })
}

// Function to set refs for connection overlay components
function setConnectionOverlayRef(el, connectionId) {
  if (el) {
    connectionOverlayRefs.value.set(connectionId, el)
  } else {
    connectionOverlayRefs.value.delete(connectionId)
  }
}

// Computed property for temporary connection coordinates
function getTemporaryConnectionCoords() {
  if (!sourceNode.value) return null
  
  const start = sourceNode.value.position
  const end = targetNode.value ? targetNode.value.position : temporaryEndpoint.value
  
  return end ? [start, end] : null
}

// Expose map instance and SlotConnectionState functions to parent components
defineExpose({ 
  map, 
  showSlotConnectionState, 
  hideSlotConnectionState,
  updateSlotConnectionPositions,
  getActiveSlotConnectionState: () => activeSlotConnectionState.value
})
</script>

<template>
  <div ref="mapContainer" class="map-container">
    <!-- Render edges and markers only after map is loaded -->
    <template v-if="isMapLoaded && map">
      <!-- Annotation geometry is inserted before every edge layer. -->
      <MapAnnotation
        v-for="(annotation, annotationIndex) in annotations"
        :key="annotation.id"
        :annotation="annotation"
        :map="map"
        :is-selected="selectedItem === annotation"
        :next-annotation-id="annotations[annotationIndex + 1]?.id"
        @select="handleSelect"
        @update="annotation => emit('design-operations', [{
          kind: 'annotations.update',
          annotation_id: annotation.id,
          value: annotation,
        }])"
        @interaction-busy="busy => emit('interaction-busy', busy)"
      />
      <!-- Render edges above annotation geometry and below HTML markers. -->
      <EdgeLine
        v-for="edge in edges"
        :key="edge.id"
        :edge="edge"
        :map="map"
        :is-selected="selectedItem === edge"
        :editing-locked="editingLocked"
        :curve-editing-enabled="curveEditingEnabled"
        :show-physical-badges="showPhysicalBadges"
        :physical-config="physicalConfig"
        :position-overrides="nodePositionPreviews"
        @select="handleSelect"
        @design-operations="(...args) => emit('design-operations', ...args)"
        @interaction-busy="busy => emit('interaction-busy', busy)"
      />
      <!-- Render temporary connection line -->
      <EdgeLine
        v-if="sourceNode && (temporaryEndpoint || targetNode)"
        key="temp-connection"
        :edge="{
          id: 'temp',
          source: sourceNode.getPosition(),
          target: targetNode ? targetNode.getPosition() : temporaryEndpoint
        }"
        :map="map"
        :is-temporary="true"
      />
      <!-- Render markers on top -->
      <NodeMarker
        v-for="node in renderedNodes"
        :key="node.id"
        :node="node"
        :map="map"
        :is-selected="selectedItem === node"
        :editing-locked="editingLocked"
        :detail-level="markerDetail(node)"
        @select="handleSelect"
        @startConnection="handleStartConnection"
        @updateConnection="handleUpdateConnection"
        @endConnection="handleEndConnection"
        @nodePositionPreview="handleNodePositionPreview"
        @nodePositionChanged="handleNodePositionChanged"
        @interactionBusy="busy => emit('interaction-busy', busy)"
      />
      
      <!-- Render SlotConnectionState visualization -->
      <template v-if="isStateVisible && activeSlotConnectionState && stateNodePosition">
        <!-- Render connection overlays first (above NodeMarkers, below StateNode) -->
        <StateConnectionOverlay
          v-for="connection in slotConnections"
          :key="connection.id"
          :ref="(el) => setConnectionOverlayRef(el, connection.id)"
          :connection-id="connection.id"
          :start-position="connection.startPosition"
          :end-position="connection.endPosition"
          :map="map"
          :is-visible="isStateVisible"
          :slot-element="connection.slotElement"
        />
        
        <!-- Render state node on top (above everything else) -->
        <StateNode
          :state-object="activeSlotConnectionState"
          :state-id="activeSlotConnectionState.id"
          :position="stateNodePosition"
          :map="map"
          :is-visible="isStateVisible"
          @select="handleSelect"
        />
      </template>
    </template>
  </div>
</template>

<style scoped>
.map-container {
  width: 100%;
  height: 100%;
  position: relative;
}

</style>
