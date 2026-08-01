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
    const payload = {
      net: {
        nodes: [
          { id: 'alice', data: { slots: [{ id: 'alice-slot' }] } },
          { id: 'bob', data: { slots: [{ id: 'bob-slot' }] } },
        ],
        edges: [{ id: 'edge-1', source: 'alice', target: 'bob' }],
      },
    }
    expect(validatePayload(payload)).toEqual({ success: true, error: null, issues: [] })
    expect(validatePayload(payload, {
      protocolTypes: null,
      backgroundTypes: undefined,
    })).toEqual({
      success: false,
      error: 'Constructor metadata is unavailable',
      issues: [{
        code: 'CONSTRUCTOR_CATALOG_UNAVAILABLE',
        message: 'Constructor metadata is unavailable',
        details: { unavailable_catalogs: ['protocolTypes', 'backgroundTypes'] },
      }],
    })
  })

  it('blocks omitted required catalog inputs before simulation transport', () => {
    const protocol = {
      type: 'SimpleSwitchDiscreteProt',
      parameters: [],
    }
    const payload = {
      variables: [],
      net: {
        protocols: [],
        nodes: [{
          id: 'alice',
          data: { slots: [{ id: 'alice-slot' }], protocols: [protocol] },
        }, {
          id: 'bob',
          data: { slots: [{ id: 'bob-slot' }], protocols: [] },
        }],
        edges: [{ id: 'edge-1', source: 'alice', target: 'bob', data: { protocols: [] } }],
      },
    }
    const catalogs = {
      protocolTypes: {
        node: [{
          type: 'SimpleSwitchDiscreteProt',
          parameters: [{
            field: 'clientnodes',
            type: 'Vector{Int64}',
            required: true,
          }, {
            field: 'success_probs',
            type: 'Vector{Float64}',
            required: true,
          }],
        }],
        edge: [],
        floating: [],
      },
      backgroundTypes: [],
    }

    const missing = validatePayload(payload, catalogs)
    expect(missing.success).toBe(false)
    expect(missing.issues.map(issue => issue.code)).toEqual([
      'CONSTRUCTOR_REQUIRED_PARAMETER_MISSING',
    ])

    protocol.parameters = [{
      name: 'clientnodes',
      value: [],
    }, {
      name: 'success_probs',
      value: [],
    }]
    expect(validatePayload(payload, catalogs)).toEqual({
      success: true,
      error: null,
      issues: [],
    })

    payload.variables = [{
      id: 'incompatible-rate',
      type: 'Float64',
      value: 0.5,
    }]
    protocol.parameters[0].value = {
      kind: 'variable',
      id: 'incompatible-rate',
    }
    expect(validatePayload(payload, catalogs).issues[0]).toMatchObject({
      code: 'CONSTRUCTOR_REQUIRED_PARAMETER_MISSING',
      details: { parameter_name: 'clientnodes' },
    })
  })
})
