import { afterEach, describe, expect, it, vi } from 'vitest'
import { McpControlClient } from '../../src/features/mcp/McpControlClient.js'

describe('MCP control HTTP client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('derives best-effort beacon URLs from the generated operation registry', () => {
    const client = new McpControlClient('http://api.test/')

    expect(client.operationUrl('unbindMcpEditor')).toBe(
      'http://api.test/_mcp/editor/unbind',
    )
  })

  it('uses the shared structured error contract', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 409,
      json: async () => ({
        error: {
          code: 'PROJECT_CHANGED',
          message: 'The bound project changed.',
          details: { retryable: true },
        },
      }),
    })))
    const client = new McpControlClient('http://api.test')

    await expect(client.heartbeat({
      binding_id: 'binding',
      generation: 1,
    })).rejects.toMatchObject({
      code: 'PROJECT_CHANGED',
      status: 409,
      details: { retryable: true },
      method: 'POST',
      url: 'http://api.test/_mcp/editor/heartbeat',
    })
  })
})
