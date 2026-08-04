import { ref } from 'vue'
import { generateUUid } from '../utils/Utils'
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from '../utils/projectDocument.js'
import { DUPLICATE_PHYSICAL_EDGE_REASON } from '../domain/design/DesignCommandService'
import { SIMULATION_EDITING_LOCK_MESSAGE } from './uiServices'

/**
 * useNodeEdgeOperations - Composable for node and edge operations
 */
export function useNodeEdgeOperations(projectData, editingLocked, addLog, {
  hideSlotState = () => {},
  showAlert = (_title, message) => window.alert(message),
  executeDesignOperations = null
} = {}) {
  const mapCenter = ref([...DEFAULT_MAP_CENTER])
  const mapZoom = ref(DEFAULT_MAP_ZOOM)
  
  const selectedItem = ref(null)
  const selectedType = ref(null)
  const justCreatedNode = ref(false)

  function showDesignOperationFailure(title, fallbackMessage, error) {
    showAlert(title, error?.message || fallbackMessage)
  }

  function handleSelectLocal(item, type) {
    selectedItem.value = item
    selectedType.value = type
    if (!item && !type) {
      hideSlotState()
    }
    if (type === 'node' && item) {
      item.expanded = true
    }
  }

  async function addNewNode(name, type, position){
    if (editingLocked.value) {
      showAlert('Editing unavailable', SIMULATION_EDITING_LOCK_MESSAGE)
      return
    }

    const nodeId = generateUUid('node')
    const nodeName = `Node ${projectData.value.net.nodes.length + 1}`

    await executeDesignOperations([{
      kind: 'topology.create_node',
      id: nodeId,
      value: { name: nodeName, type, position },
    }])
    const newNode = projectData.value.net.nodes.find(node => node.id === nodeId)
    addLog('info', `Created new node: ${nodeName}`, 'Map')
    setTimeout(() => handleSelectLocal(newNode, 'node'), 100)
    justCreatedNode.value = true
    return newNode
  }

  function handleMapClick( event ) {
    let coords = [event.lngLat.lng, event.lngLat.lat]
    if( event.originalEvent.altKey ){
      void addNewNode(null, 'City', coords).catch(error => {
        showDesignOperationFailure(
          'Unable to create node',
          'The node could not be created.',
          error,
        )
      })
    }
  }

  async function deleteSelected(item, type) {
    if (!item) return

    if (type === 'annotation') {
      await executeDesignOperations([{
        kind: 'annotations.remove',
        id: item.id,
      }])
      addLog('warning', `Deleted annotation: ${item.id}`, 'Map')
      handleSelectLocal(null, null)
      return
    }

    if (editingLocked.value) {
      showAlert('Editing unavailable', SIMULATION_EDITING_LOCK_MESSAGE)
      return
    }

    if (type === 'node') {
      const nodeName = item.name
      const connectedEdges = projectData.value.net.edges.filter(edge => 
        edge.source === item || edge.target === item
      )
      await executeDesignOperations([{ kind: 'topology.remove_node', id: item.id }])
      addLog('warning', `Deleted node: ${nodeName} (${connectedEdges.length} edges removed)`, 'Map')
    } else if (type === 'edge') {
      const edgeName = `${item.source.name} to ${item.target.name}`
      await executeDesignOperations([{ kind: 'topology.remove_edge', id: item.id }])
      addLog('warning', `Deleted edge: ${edgeName}`, 'Map')
    }

    // Clear the current selection so the UI reflects that nothing is selected anymore
    handleSelectLocal(null, null)
  }

  async function handleEdgeCreated(edge) {
    if (editingLocked.value) {
      showAlert('Editing unavailable', SIMULATION_EDITING_LOCK_MESSAGE)
      return
    }

    try {
      await executeDesignOperations([{
        kind: 'topology.create_edge',
        id: edge.id,
        value: {
          source: edge.source.id,
          target: edge.target.id,
          isLogic: edge.isLogic,
          data: {
            type: edge.data?.type,
            ...(edge.isLogic === true
              ? {}
              : {
                  curvePoints: edge.data?.curvePoints || [],
                  physicalOverrides: edge.data?.physicalOverrides ?? null,
                }),
          },
        },
      }])
      addLog('info', `Created new edge: ${edge.source.name} to ${edge.target.name}`, 'Map')
    } catch (error) {
      const duplicatePhysicalEdge = error?.details?.reason
        === DUPLICATE_PHYSICAL_EDGE_REASON
      showAlert(
        duplicatePhysicalEdge ? 'Duplicate physical edge' : 'Unable to create edge',
        error?.message || 'The edge could not be created.',
      )
    }
  }

  function moveNode(fromIndex, toIndex) {
    if (editingLocked.value) return false

    const nodes = projectData.value.net.nodes
    if (
      !Number.isInteger(fromIndex)
      || !Number.isInteger(toIndex)
      || fromIndex < 0
      || toIndex < 0
      || fromIndex >= nodes.length
      || toIndex >= nodes.length
      || fromIndex === toIndex
    ) {
      return false
    }

    const node = nodes[fromIndex]
    executeDesignOperations([{
      kind: 'topology.reorder_node',
      id: node.id,
      to_index: toIndex,
    }]).then(() => {
      addLog('info', `Changed ${node.name} to node ID ${toIndex + 1}`, 'Map')
    }).catch(error => {
      showDesignOperationFailure(
        'Unable to reorder node',
        'The node order could not be changed.',
        error,
      )
    })
    return true
  }

  function handleMapStateChange(mapState) {
    mapCenter.value = [...mapState.center]
    mapZoom.value = mapState.zoom
  }

  return {
    // State
    mapCenter,
    mapZoom,
    selectedItem,
    selectedType,
    justCreatedNode,
    
    // Methods
    addNewNode,
    handleMapClick,
    deleteSelected,
    handleEdgeCreated,
    moveNode,
    handleMapStateChange,
    handleSelect: handleSelectLocal
  }
}
