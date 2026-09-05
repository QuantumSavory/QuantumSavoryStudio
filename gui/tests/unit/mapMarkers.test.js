import { describe, expect, it } from 'vitest'
import {
  NODE_MARKER_DETAIL,
  nodeMarkerDetailLevels,
} from '../../src/utils/mapMarkers'

describe('map marker detail', () => {
  it('preserves only the detail that nearby screen positions can display', () => {
    const nodes = ['dot-a', 'dot-b', 'slots-a', 'slots-b', 'full'].map(id => ({ id }))
    const screenPositions = new Map([
      ['dot-a', { x: 0, y: 0 }],
      ['dot-b', { x: 30, y: 0 }],
      ['slots-a', { x: 220, y: 0 }],
      ['slots-b', { x: 300, y: 0 }],
      ['full', { x: 500, y: 0 }],
    ])

    const details = nodeMarkerDetailLevels(
      nodes,
      node => screenPositions.get(node.id),
    )

    expect(Object.fromEntries(details)).toEqual({
      'dot-a': NODE_MARKER_DETAIL.DOT,
      'dot-b': NODE_MARKER_DETAIL.DOT,
      'slots-a': NODE_MARKER_DETAIL.SLOTS,
      'slots-b': NODE_MARKER_DETAIL.SLOTS,
      full: NODE_MARKER_DETAIL.FULL,
    })
  })
})
