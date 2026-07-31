import { describe, expect, it, vi } from 'vitest'
import { ApiClientError, requestJson } from '../../src/utils/httpClient.js'

function response(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    text: vi.fn(async () => typeof body === 'string' ? body : JSON.stringify(body)),
  }
}

describe('JSON HTTP client', () => {
  it.each([
    ['VALIDATION_ERROR', 400],
    ['POLICY_DENIED', 403],
    ['NOT_FOUND', 404],
    ['SERVER_ERROR', 500],
  ])('preserves a canonical %s error', async (code, status) => {
    const details = { field: 'name' }
    const fetchImpl = vi.fn(async () => response({
      error: {
        code,
        message: 'Request rejected',
        details,
      },
    }, { ok: false, status }))

    const caught = await requestJson('https://api.test/resource', {
      method: 'post',
      body: { name: '' },
      fetchImpl,
    }).catch(error => error)

    expect(caught).toBeInstanceOf(ApiClientError)
    expect(caught).toMatchObject({
      name: 'ApiClientError',
      code,
      message: 'Request rejected',
      status,
      details,
      method: 'POST',
      url: 'https://api.test/resource',
    })
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ name: '' })
    expect(caught.toJSON()).toMatchObject({ code, status, details })
  })

  it('wraps network failures and retains their cause', async () => {
    const cause = new TypeError('connection refused')
    const caught = await requestJson('https://api.test/status', {
      fetchImpl: vi.fn(async () => { throw cause }),
    }).catch(error => error)

    expect(caught).toMatchObject({
      code: 'NETWORK_ERROR',
      status: null,
      details: {},
      method: 'GET',
      url: 'https://api.test/status',
      cause,
    })
  })

  it('rejects malformed error envelopes without guessing legacy fields', async () => {
    const caught = await requestJson('https://api.test/status', {
      fetchImpl: vi.fn(async () => response({
        error: 'legacy error',
        error_code: 'NOT_FOUND',
      }, { ok: false, status: 404 })),
    }).catch(error => error)

    expect(caught).toMatchObject({
      code: 'MALFORMED_ERROR_RESPONSE',
      status: 404,
      details: {
        body: {
          error: 'legacy error',
          error_code: 'NOT_FOUND',
        },
      },
    })
  })

  it('rejects invalid JSON on success and error responses', async () => {
    for (const [ok, status] of [[true, 200], [false, 502]]) {
      const caught = await requestJson('https://api.test/status', {
        fetchImpl: vi.fn(async () => response('<html>bad gateway</html>', { ok, status })),
      }).catch(error => error)

      expect(caught).toMatchObject({
        code: 'INVALID_JSON_RESPONSE',
        status,
        method: 'GET',
      })
      expect(caught.cause).toBeInstanceOf(SyntaxError)
    }
  })

  it('passes AbortError through unchanged', async () => {
    const aborted = new DOMException('aborted', 'AbortError')
    const caught = await requestJson('https://api.test/status', {
      fetchImpl: vi.fn(async () => { throw aborted }),
    }).catch(error => error)

    expect(caught).toBe(aborted)
  })
})
