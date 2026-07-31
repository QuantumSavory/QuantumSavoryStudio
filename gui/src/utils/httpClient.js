function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function errorCause(cause) {
  if (cause === undefined || cause === null) return null
  if (cause instanceof Error) {
    return {
      name: cause.name,
      message: cause.message,
    }
  }
  return String(cause)
}

export class ApiClientError extends Error {
  constructor(message, {
    code,
    status = null,
    details = {},
    method,
    url,
    cause,
  }) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'ApiClientError'
    this.code = code
    this.status = status
    this.details = isRecord(details) ? details : {}
    this.method = method
    this.url = url
    this.cause = cause
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      status: this.status,
      details: this.details,
      method: this.method,
      url: this.url,
      cause: errorCause(this.cause),
    }
  }
}

function responseStatus(response) {
  return Number.isInteger(response?.status) ? response.status : null
}

function exactKeys(value, expected) {
  if (!isRecord(value)) return false
  const keys = Object.keys(value).sort()
  return keys.length === expected.length
    && expected.every((key, index) => keys[index] === key)
}

function canonicalError(body) {
  if (!exactKeys(body, ['error'])) return null
  const error = body.error
  if (!exactKeys(error, ['code', 'details', 'message'])) return null
  if (
    typeof error.code !== 'string'
    || error.code.length === 0
    || typeof error.message !== 'string'
    || !isRecord(error.details)
  ) {
    return null
  }
  return error
}

async function parseJsonResponse(response, requestContext) {
  if (responseStatus(response) === 204) return null

  try {
    if (typeof response.text === 'function') {
      const text = await response.text()
      if (text.trim().length === 0) {
        throw new SyntaxError('Response body is empty')
      }
      return JSON.parse(text)
    }
    return await response.json()
  } catch (cause) {
    throw new ApiClientError('The server returned invalid JSON', {
      ...requestContext,
      code: 'INVALID_JSON_RESPONSE',
      status: responseStatus(response),
      details: {},
      cause,
    })
  }
}

function serializedBody(body, requestContext) {
  if (body === undefined || typeof body === 'string') return body
  try {
    return JSON.stringify(body)
  } catch (cause) {
    throw new ApiClientError('The request body could not be serialized', {
      ...requestContext,
      code: 'REQUEST_SERIALIZATION_ERROR',
      details: {},
      cause,
    })
  }
}

export async function requestJson(url, {
  method = 'GET',
  headers = {},
  body,
  signal,
  fetchImpl = globalThis.fetch,
} = {}) {
  const requestContext = {
    method: String(method).toUpperCase(),
    url: String(url),
  }

  let response
  try {
    response = await fetchImpl(requestContext.url, {
      method: requestContext.method,
      headers,
      ...(body === undefined ? {} : { body: serializedBody(body, requestContext) }),
      signal,
    })
  } catch (cause) {
    if (cause?.name === 'AbortError') throw cause
    if (cause instanceof ApiClientError) throw cause
    throw new ApiClientError('The server could not be reached', {
      ...requestContext,
      code: 'NETWORK_ERROR',
      details: {},
      cause,
    })
  }

  const result = await parseJsonResponse(response, requestContext)
  if (response.ok) return result

  const error = canonicalError(result)
  if (!error) {
    throw new ApiClientError('The server returned a malformed error response', {
      ...requestContext,
      code: 'MALFORMED_ERROR_RESPONSE',
      status: responseStatus(response),
      details: isRecord(result) ? { body: result } : {},
    })
  }

  throw new ApiClientError(error.message, {
    ...requestContext,
    code: error.code,
    status: responseStatus(response),
    details: error.details,
  })
}
