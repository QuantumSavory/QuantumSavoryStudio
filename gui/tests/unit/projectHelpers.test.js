import { describe, expect, it } from 'vitest'

import { validatePayload } from '../../src/utils/projectHelpers.js'

describe('simulation payload validation', () => {
  it('returns every actionable topology issue in deterministic order', () => {
    expect(validatePayload({
      net: {
        nodes: [{ id: 'alice', name: 'Alice', data: { slots: [] } }],
        edges: [],
      },
    })).toEqual({
      success: false,
      error: [
        'At least 2 nodes are required',
        'At least 1 edge is required',
        'Alice requires at least one slot',
      ].join('\n'),
      issues: [
        {
          code: 'NETWORK_MINIMUM_NODES',
          message: 'At least 2 nodes are required',
          details: { minimum: 2, actual: 1 },
        },
        {
          code: 'NETWORK_MINIMUM_EDGES',
          message: 'At least 1 edge is required',
          details: { minimum: 1, actual: 0 },
        },
        {
          code: 'NODE_MISSING_SLOT',
          message: 'Alice requires at least one slot',
          details: { node_id: 'alice', node_name: 'Alice' },
        },
      ],
    })
  })

  it('accepts a connected design whose nodes each own a slot', () => {
    expect(validatePayload({
      net: {
        nodes: [
          { id: 'alice', data: { slots: [{ id: 'alice-slot' }] } },
          { id: 'bob', data: { slots: [{ id: 'bob-slot' }] } },
        ],
        edges: [{ id: 'edge-1', source: 'alice', target: 'bob' }],
      },
    })).toEqual({ success: true, error: null, issues: [] })
  })
})
