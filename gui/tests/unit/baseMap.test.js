import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BaseMap from '../../src/components/map/BaseMap.vue'
import Edge from '../../src/models/Edge'
import Node from '../../src/models/Node'

const mapConstructor = vi.hoisted(() => vi.fn())
const slotConnectionUtils = vi.hoisted(() => ({
  findSlotElements: vi.fn(() => []),
  calculateStateNodePosition: vi.fn(() => [0, 0]),
  getSlotMapPosition: vi.fn(() => [0, 0]),
  generateConnectionId: vi.fn((stateId, slotId) => `${stateId}-${slotId}`),
}))

vi.mock('maplibre-gl', async importOriginal => {
  const actual = await importOriginal()
  return {
    ...actual,
    MercatorCoordinate: actual.MercatorCoordinate ?? actual.default.MercatorCoordinate,
    default: {
      ...actual.default,
      Map: mapConstructor,
      NavigationControl: vi.fn(),
    },
  }
})

vi.mock('../../src/utils/SlotConnectionUtils', () => slotConnectionUtils)

let wrapper

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  mapConstructor.mockReset()
  slotConnectionUtils.findSlotElements.mockReset().mockReturnValue([])
  slotConnectionUtils.calculateStateNodePosition.mockReset().mockReturnValue([0, 0])
  slotConnectionUtils.getSlotMapPosition.mockReset().mockReturnValue([0, 0])
  slotConnectionUtils.generateConnectionId.mockReset()
    .mockImplementation((stateId, slotId) => `${stateId}-${slotId}`)
})

describe('BaseMap initialization', () => {
  it('reports a synchronous MapLibre construction failure', () => {
    const error = new Error('WebGL is unavailable')
    mapConstructor.mockImplementation(() => { throw error })

    wrapper = mount(BaseMap)

    expect(wrapper.emitted('map-initialization-error')).toEqual([[error]])
  })

  it('registers error handling before controls and reports a synchronous setup failure', () => {
    const error = new Error('Navigation controls are unavailable')
    const map = {
      on: vi.fn(),
      addControl: vi.fn(() => { throw error }),
      remove: vi.fn()
    }
    mapConstructor.mockImplementation(() => map)

    wrapper = mount(BaseMap)

    expect(map.on).toHaveBeenCalledWith('error', expect.any(Function))
    expect(map.on.mock.invocationCallOrder[0]).toBeLessThan(map.addControl.mock.invocationCallOrder[0])
    expect(wrapper.emitted('map-initialization-error')).toEqual([[error]])
    expect(map.remove).toHaveBeenCalledOnce()
  })

  it('removes its initialization listener after load so MapLibre reports later errors', () => {
    const handlers = new Map()
    const map = {
      on: vi.fn((event, handler) => handlers.set(event, handler)),
      off: vi.fn(),
      addControl: vi.fn(),
      getCenter: vi.fn(() => ({ lng: -74.5, lat: 40 })),
      getZoom: vi.fn(() => 9),
      remove: vi.fn()
    }
    mapConstructor.mockImplementation(() => map)

    wrapper = mount(BaseMap)
    const initializationErrorHandler = handlers.get('error')
    handlers.get('load')()

    expect(wrapper.emitted('map-ready')).toHaveLength(1)
    expect(map.off).toHaveBeenCalledWith('error', initializationErrorHandler)
  })

  function makeInteractiveMap() {
    const handlers = new Map()
    const map = {
      handlers,
      on: vi.fn((event, handler) => handlers.set(event, handler)),
      off: vi.fn((event, handler) => {
        if (handlers.get(event) === handler) handlers.delete(event)
      }),
      addControl: vi.fn(),
      getCenter: vi.fn(() => ({ lng: -74.5, lat: 40 })),
      getZoom: vi.fn(() => 9),
      queryRenderedFeatures: vi.fn(() => []),
      project: vi.fn(position => ({ x: position[0] * 10, y: position[1] * -10 })),
      unproject: vi.fn(point => {
        const [x, y] = Array.isArray(point) ? point : [point.x, point.y]
        return { lng: x / 10, lat: y / -10 }
      }),
      remove: vi.fn(),
    }
    return map
  }

  async function nextFrame() {
    await new Promise(resolve => requestAnimationFrame(resolve))
    await nextTick()
  }

  it('recomputes node detail from displayed marker distance', async () => {
    const map = makeInteractiveMap()
    const nodeA = new Node({ id: 'a', name: 'A', position: [0, 0] })
    const nodeB = new Node({ id: 'b', name: 'B', position: [20, 0] })
    let screenScale = 10
    const markerBounds = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function () {
        const node = this.dataset.nodeId === nodeA.id
          ? nodeA
          : this.dataset.nodeId === nodeB.id
            ? nodeB
            : null
        const left = (node?.position[0] ?? 0) * screenScale
        return { left, top: 0, width: 0, height: 0 }
      })
    const NodeMarkerStub = {
      name: 'NodeMarker',
      props: ['node', 'detailLevel'],
      template: '<div class="node-marker" :data-node-id="node.id" />',
    }
    mapConstructor.mockImplementation(() => map)
    wrapper = mount(BaseMap, {
      props: { nodes: [nodeA, nodeB] },
      global: {
        stubs: {
          NodeMarker: NodeMarkerStub,
          StateNode: true,
          StateConnectionOverlay: true,
        },
      },
    })
    map.handlers.get('load')()
    await nextTick()
    await nextFrame()

    const detailLevels = () => wrapper.findAllComponents(NodeMarkerStub)
      .map(marker => marker.props('detailLevel'))
    expect(detailLevels()).toEqual(['full', 'full'])

    screenScale = 4
    map.handlers.get('move')()
    await nextFrame()
    expect(detailLevels()).toEqual(['slots', 'slots'])

    screenScale = 2
    map.handlers.get('move')()
    await nextFrame()
    expect(detailLevels()).toEqual(['dot', 'dot'])

    nodeB.position = [80, 0]
    await wrapper.setProps({ nodes: [nodeA, nodeB] })
    await nextFrame()
    expect(detailLevels()).toEqual(['full', 'full'])

    const moveHandler = map.handlers.get('move')
    wrapper.unmount()
    wrapper = undefined
    expect(map.off).toHaveBeenCalledWith('move', moveHandler)
    markerBounds.mockRestore()
  })

  it('creates one canonical annotation on a wrapped world copy without background deselection', async () => {
    const map = makeInteractiveMap()
    mapConstructor.mockImplementation(() => map)
    wrapper = mount(BaseMap, {
      props: {
        annotations: [],
        annotationCreationEnabled: true,
      },
    })
    map.handlers.get('load')()
    await nextTick()

    const canvas = document.createElement('canvas')
    map.handlers.get('mousedown')({
      lngLat: { lng: 290, lat: 40 },
      point: { x: 0, y: 0 },
      originalEvent: { target: canvas },
    })

    const annotation = wrapper.emitted('annotation-created')[0][0]
    expect(annotation.id).toMatch(/^annotation_/)
    expect(annotation.bounds).toEqual({ west: -82, south: 33, east: -58, north: 47 })
    expect(annotation.markdown).toBe('')
    expect(wrapper.emitted('map-click')).toBeUndefined()
    expect(wrapper.emitted('select')).toBeUndefined()
  })

  it('does not treat annotation markers as map-background clicks', async () => {
    const map = makeInteractiveMap()
    mapConstructor.mockImplementation(() => map)
    wrapper = mount(BaseMap)
    map.handlers.get('load')()
    await nextTick()

    const overlay = document.createElement('div')
    overlay.className = 'annotation-overlay'
    const overlayChild = document.createElement('strong')
    overlay.appendChild(overlayChild)
    map.handlers.get('mousedown')({
      point: { x: 0, y: 0 },
      originalEvent: { target: overlayChild },
    })

    expect(wrapper.emitted('map-click')).toBeUndefined()
    expect(wrapper.emitted('select')).toBeUndefined()
  })

  it('keeps node drags in ephemeral route previews until the caller finishes', async () => {
    const map = makeInteractiveMap()
    const nodeA = new Node({ id: 'a', name: 'A', position: [-72, 42] })
    const nodeB = new Node({ id: 'b', name: 'B', position: [-70, 42] })
    const edge = new Edge({
      id: 'edge',
      source: nodeA,
      target: nodeB,
      data: {
        protocols: [],
        curvePoints: [{ id: 'curve', position: [-71, 44], type: 'smooth' }],
        physicalOverrides: null,
      },
    })
    const NodeMarkerStub = {
      name: 'NodeMarker',
      props: ['node'],
      emits: ['nodePositionPreview', 'nodePositionChanged'],
      template: '<button class="node-marker-stub" />',
    }
    const EdgeLineStub = {
      name: 'EdgeLine',
      props: ['edge', 'positionOverrides'],
      template: '<div class="edge-line-stub" />',
    }
    mapConstructor.mockImplementation(() => map)
    wrapper = mount(BaseMap, {
      props: { nodes: [nodeA, nodeB], edges: [edge] },
      global: {
        stubs: {
          NodeMarker: NodeMarkerStub,
          EdgeLine: EdgeLineStub,
          StateNode: true,
          StateConnectionOverlay: true,
        },
      },
    })
    map.handlers.get('load')()
    await nextTick()

    const nodeMarker = wrapper.findAllComponents(NodeMarkerStub)[1]
    const edgeLine = wrapper.getComponent(EdgeLineStub)
    const markerListeners = nodeMarker.vm.$.vnode.props
    markerListeners.onNodePositionPreview({
      node: nodeB,
      position: [-69, 43],
      previousPosition: [-70, 42],
    })
    await nextTick()

    expect(edgeLine.props('positionOverrides').get(nodeB.id)).toEqual([-69, 43])
    expect(nodeB.position).toEqual([-70, 42])

    markerListeners.onNodePositionPreview({
      node: nodeB,
      position: [181, 42],
      previousPosition: [-70, 42],
    })
    await nextTick()
    expect(edgeLine.props('positionOverrides').get(nodeB.id)).toEqual([-69, 43])

    const slotElement = document.createElement('span')
    const slotReference = { nodeId: nodeB.id, slotId: 'slot-b' }
    slotConnectionUtils.findSlotElements.mockReturnValue([{
      ...slotReference,
      slotElement,
      slotRef: slotReference,
    }])
    slotConnectionUtils.calculateStateNodePosition.mockReturnValue([-70, 42])
    slotConnectionUtils.getSlotMapPosition.mockReturnValue([-70, 42])
    expect(wrapper.vm.showSlotConnectionState({
      id: 'state',
      slots: [slotReference],
    })).toBe(true)

    const finishMarker = vi.fn()
    markerListeners.onNodePositionChanged({
      node: nodeB,
      position: [181, 42],
      previousPosition: [-70, 42],
      finish: finishMarker,
    })
    const change = wrapper.emitted('node-position-changed').at(-1)[0]
    slotConnectionUtils.calculateStateNodePosition.mockClear()
    change.finish()
    expect(edgeLine.props('positionOverrides').has(nodeB.id)).toBe(false)
    expect(finishMarker).toHaveBeenCalledOnce()
    expect(slotConnectionUtils.calculateStateNodePosition).toHaveBeenCalledOnce()
    expect(finishMarker.mock.invocationCallOrder[0])
      .toBeLessThan(slotConnectionUtils.calculateStateNodePosition.mock.invocationCallOrder[0])
  })

  it.each(['Delete', 'Backspace'])('deletes the selected annotation with %s', async key => {
    const map = makeInteractiveMap()
    const annotation = { id: 'annotation-1' }
    mapConstructor.mockImplementation(() => map)
    wrapper = mount(BaseMap, {
      attachTo: document.body,
      props: {
        selectedItem: annotation,
        selectedType: 'annotation',
      },
    })

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    expect(wrapper.emitted('delete')).toEqual([[annotation, 'annotation']])
  })

  it('deletes from a focused annotation overlay but not from an editor', () => {
    const map = makeInteractiveMap()
    const annotation = { id: 'annotation-1' }
    mapConstructor.mockImplementation(() => map)
    wrapper = mount(BaseMap, {
      attachTo: document.body,
      props: {
        selectedItem: annotation,
        selectedType: 'annotation',
      },
    })

    const overlay = document.createElement('div')
    overlay.className = 'annotation-overlay'
    document.body.appendChild(overlay)
    overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))

    const editor = document.createElement('textarea')
    document.body.appendChild(editor)
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }))

    expect(wrapper.emitted('delete')).toEqual([[annotation, 'annotation']])
    overlay.remove()
    editor.remove()
  })
})
