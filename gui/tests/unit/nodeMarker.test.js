import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const markerInstances = vi.hoisted(() => [])

vi.mock('maplibre-gl', () => {
  class Marker {
    constructor(options) {
      this.options = options
      this.handlers = new Map()
      markerInstances.push(this)
    }

    setLngLat(position) {
      this.position = Array.isArray(position)
        ? { lng: position[0], lat: position[1] }
        : position
      return this
    }

    getLngLat() { return this.position }
    addTo(map) { this.map = map; return this }
    on(event, handler) { this.handlers.set(event, handler); return this }
    setDraggable(value) { this.draggable = value; return this }
    remove() { this.removed = true }
  }

  return { default: { Marker } }
})

import NodeMarker from '../../src/components/map/NodeMarker.vue'
import { UI_SERVICES_KEY } from '../../src/composables/uiServices'
import Node from '../../src/models/Node'
import { NODE_MARKER_DETAIL } from '../../src/utils/mapMarkers'

beforeEach(() => markerInstances.splice(0))

describe('NodeMarker', () => {
  it('previews without mutating project state and restores an invalid wrapped move', async () => {
    const node = new Node({
      id: 'node-a',
      name: 'A',
      position: [-71, 42],
      data: { slots: [], protocols: [] },
    })
    const wrapper = mount(NodeMarker, {
      props: { node, map: {} },
      global: {
        provide: {
          [UI_SERVICES_KEY]: { showEntangledSlots: vi.fn() },
        },
      },
    })
    const marker = markerInstances.at(-1)

    // MapLibre may display the canonical -71° marker in the +360° world.
    marker.position = { lng: 289, lat: 42 }
    await wrapper.get('.node-marker').trigger('pointerdown')
    marker.handlers.get('dragstart')()
    marker.position = { lng: 290, lat: 43 }
    marker.handlers.get('drag')()

    expect(wrapper.emitted('nodePositionPreview').at(-1)[0]).toMatchObject({
      node,
      position: [-70, 43],
      previousPosition: [-71, 42],
    })
    expect(node.position).toEqual([-71, 42])

    marker.position = { lng: 541, lat: 43 }
    marker.handlers.get('dragend')()
    const change = wrapper.emitted('nodePositionChanged').at(-1)[0]
    expect(change).toMatchObject({
      node,
      position: [181, 43],
      previousPosition: [-71, 42],
    })
    expect(node.position).toEqual([-71, 42])

    change.finish()
    expect(marker.position).toEqual({ lng: -71, lat: 42 })
    expect(wrapper.emitted('interactionBusy')).toEqual([[true], [false]])
    wrapper.unmount()
  })

  it('retains hidden register details and reveals them only while hovered', async () => {
    const node = new Node({
      id: 'node-a',
      name: 'Alice',
      position: [-71, 42],
      data: {
        slots: [
          { id: 'qubit', type: 'Qubit', assignment: true, isLocked: false },
          { id: 'qumode', type: 'Qumode', assignment: false, isLocked: true },
        ],
        protocols: [],
      },
    })
    const wrapper = mount(NodeMarker, {
      props: {
        node,
        map: {},
        detailLevel: NODE_MARKER_DETAIL.DOT,
      },
      global: {
        provide: {
          [UI_SERVICES_KEY]: { showEntangledSlots: vi.fn() },
        },
      },
    })
    const marker = wrapper.get('.node-marker')

    expect(marker.attributes('data-detail-level')).toBe(NODE_MARKER_DETAIL.DOT)
    expect(wrapper.get('.node-name').attributes('aria-hidden')).toBe('true')
    expect(wrapper.get('.node-slots').attributes('aria-hidden')).toBe('true')
    expect(wrapper.findAll('.slot-icon')).toHaveLength(2)

    await marker.trigger('mouseenter')
    expect(marker.classes()).toContain('is-hovered')
    expect(wrapper.get('.node-name').attributes('aria-hidden')).toBe('false')
    expect(wrapper.get('.node-slots').attributes('aria-hidden')).toBe('false')

    await marker.trigger('mouseleave')
    expect(marker.classes()).not.toContain('is-hovered')
    expect(wrapper.get('.node-name').attributes('aria-hidden')).toBe('true')
    expect(wrapper.get('.node-slots').attributes('aria-hidden')).toBe('true')

    await wrapper.setProps({ detailLevel: NODE_MARKER_DETAIL.SLOTS })
    expect(wrapper.get('.node-name').attributes('aria-hidden')).toBe('true')
    expect(wrapper.get('.node-slots').attributes('aria-hidden')).toBe('false')
    expect(wrapper.findAll('.slot-icon')).toHaveLength(2)
    wrapper.unmount()
  })
})
