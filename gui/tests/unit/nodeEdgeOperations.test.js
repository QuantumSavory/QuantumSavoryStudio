import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useNodeEdgeOperations } from '../../src/composables/useNodeEdgeOperations'
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  createEmptyProject,
} from '../../src/utils/projectDocument'
import Edge from '../../src/models/Edge'
import Node from '../../src/models/Node'
import {
  DUPLICATE_PHYSICAL_EDGE_REASON,
  DesignCommandService,
} from '../../src/domain/design/DesignCommandService'

function sharedExecutor(projectData) {
  const service = new DesignCommandService({
    getProject: () => projectData.value,
    defaultBackgroundNoise: () => ({ type: 'default', parameters: [] }),
  })
  return operations => service.execute({ operations, origin: 'gui' })
}

function canonicalProject({ annotations = [], nodes = [], edges = [] } = {}) {
  const project = createEmptyProject('Operations')
  project.annotations.push(...annotations)
  project.net.nodes.push(...nodes)
  project.net.edges.push(...edges)
  return project
}

describe('node and edge operation map state', () => {
  it('initializes reactive map state from copied codec defaults', () => {
    const operations = useNodeEdgeOperations(
      ref({ net: { nodes: [], edges: [] } }),
      ref(false),
      vi.fn()
    )

    expect(operations.mapCenter.value).toEqual(DEFAULT_MAP_CENTER)
    expect(operations.mapCenter.value).not.toBe(DEFAULT_MAP_CENTER)
    expect(operations.mapZoom.value).toBe(DEFAULT_MAP_ZOOM)

    operations.mapCenter.value[0] = 0
    expect(DEFAULT_MAP_CENTER[0]).toBe(-98.5795)
  })

  it('rejects duplicate physical endpoint pairs but permits virtual pairs', async () => {
    const nodeA = new Node({ id: 'a', name: 'A', position: [-72, 42] })
    const nodeB = new Node({ id: 'b', name: 'B', position: [-71, 42] })
    const physical = new Edge({ id: 'physical', source: nodeA, target: nodeB })
    const projectData = ref(canonicalProject({ nodes: [nodeA, nodeB], edges: [physical] }))
    const alert = vi.fn()
    const operations = useNodeEdgeOperations(projectData, ref(false), vi.fn(), {
      showAlert: alert,
      executeDesignOperations: sharedExecutor(projectData),
    })

    await operations.handleEdgeCreated(new Edge({
      id: 'duplicate',
      source: nodeB,
      target: nodeA,
    }))
    expect(projectData.value.net.edges).toHaveLength(1)
    expect(alert).toHaveBeenCalledWith(
      'Duplicate physical edge',
      'Only one physical edge may connect a pair of nodes.',
    )

    await operations.handleEdgeCreated(new Edge({
      id: 'virtual',
      source: nodeB,
      target: nodeA,
      isLogic: true,
    }))
    expect(projectData.value.net.edges).toHaveLength(2)
  })

  it('recognizes duplicate edges by structured reason rather than message text', async () => {
    const nodeA = new Node({ id: 'a', name: 'A', position: [-72, 42] })
    const nodeB = new Node({ id: 'b', name: 'B', position: [-71, 42] })
    const projectData = ref({ net: { nodes: [nodeA, nodeB], edges: [] } })
    const alert = vi.fn()
    const error = Object.assign(new Error('Localized duplicate-edge message'), {
      code: 'VALIDATION_FAILED',
      details: { reason: DUPLICATE_PHYSICAL_EDGE_REASON },
    })
    const operations = useNodeEdgeOperations(projectData, ref(false), vi.fn(), {
      showAlert: alert,
      executeDesignOperations: vi.fn(async () => {
        throw error
      }),
    })

    await operations.handleEdgeCreated(new Edge({
      id: 'duplicate',
      source: nodeA,
      target: nodeB,
    }))

    expect(alert).toHaveBeenCalledWith(
      'Duplicate physical edge',
      'Localized duplicate-edge message',
    )
  })

  it('reports failed fire-and-forget node creation without logging success', async () => {
    const projectData = ref({ net: { nodes: [], edges: [] } })
    const alert = vi.fn()
    const addLog = vi.fn()
    const operations = useNodeEdgeOperations(projectData, ref(false), addLog, {
      showAlert: alert,
      executeDesignOperations: vi.fn(async () => {
        throw new Error('Creation failed')
      }),
    })

    operations.handleMapClick({
      lngLat: { lng: -72, lat: 42 },
      originalEvent: { altKey: true },
    })

    await vi.waitFor(() => {
      expect(alert).toHaveBeenCalledWith('Unable to create node', 'Creation failed')
    })
    expect(addLog).not.toHaveBeenCalled()
  })

  it('reports failed fire-and-forget node reordering without logging success', async () => {
    const nodeA = new Node({ id: 'a', name: 'A', position: [-72, 42] })
    const nodeB = new Node({ id: 'b', name: 'B', position: [-71, 42] })
    const projectData = ref({ net: { nodes: [nodeA, nodeB], edges: [] } })
    const alert = vi.fn()
    const addLog = vi.fn()
    const operations = useNodeEdgeOperations(projectData, ref(false), addLog, {
      showAlert: alert,
      executeDesignOperations: vi.fn(async () => {
        throw new Error('Reorder failed')
      }),
    })

    expect(operations.moveNode(0, 1)).toBe(true)

    await vi.waitFor(() => {
      expect(alert).toHaveBeenCalledWith('Unable to reorder node', 'Reorder failed')
    })
    expect(addLog).not.toHaveBeenCalled()
  })

  it('deletes annotations while simulation editing is locked and preserves object identity until removal', async () => {
    const annotation = {
      id: 'annotation-1',
      markdown: 'First note',
      bounds: { west: -2, south: -1, east: 2, north: 1 },
      backgroundColor: '#ffffff',
      borderColor: '#334155',
      area: null,
    }
    const otherAnnotation = {
      ...annotation,
      id: 'annotation-2',
      markdown: 'Second note',
    }
    const projectData = ref(canonicalProject({ annotations: [annotation, otherAnnotation] }))
    const addLog = vi.fn()
    const alert = vi.fn()
    const operations = useNodeEdgeOperations(projectData, ref(true), addLog, {
      showAlert: alert,
      executeDesignOperations: sharedExecutor(projectData),
    })
    const retainedIdentity = projectData.value.annotations[1]
    operations.handleSelect(annotation, 'annotation')

    await operations.deleteSelected(annotation, 'annotation')

    expect(projectData.value.annotations).toEqual([otherAnnotation])
    expect(projectData.value.annotations[0]).toBe(retainedIdentity)
    expect(operations.selectedItem.value).toBeNull()
    expect(operations.selectedType.value).toBeNull()
    expect(alert).not.toHaveBeenCalled()
    expect(addLog).toHaveBeenCalledWith(
      'warning',
      'Deleted annotation: annotation-1',
      'Map',
    )
  })

  it('keeps node deletion locked after adding the annotation deletion path', () => {
    const node = new Node({ id: 'a', name: 'A', position: [-72, 42] })
    const projectData = ref({
      annotations: [],
      net: { nodes: [node], edges: [] },
    })
    const alert = vi.fn()
    const operations = useNodeEdgeOperations(projectData, ref(true), vi.fn(), {
      showAlert: alert,
    })

    operations.deleteSelected(node, 'node')

    expect(projectData.value.net.nodes).toEqual([node])
    expect(alert).toHaveBeenCalledOnce()
  })
})
