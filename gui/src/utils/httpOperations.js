import { HTTP_OPERATIONS } from '../generated/httpOperations.js'

export function httpOperation(operationId) {
  const operation = HTTP_OPERATIONS[operationId]
  if (!operation) throw new Error(`Unknown HTTP operationId: ${operationId}`)
  return operation
}

export function httpOperationPath(operationId, {
  pathParams = {},
  query,
} = {}) {
  const operation = httpOperation(operationId)
  const pathname = operation.path.replace(/\{([^{}]+)\}/g, (_placeholder, name) => {
    const value = pathParams[name]
    if (value === undefined || value === null || value === '') {
      throw new Error(`Missing path parameter '${name}' for ${operationId}`)
    }
    return encodeURIComponent(String(value))
  })
  if (pathname.includes('{')) {
    throw new Error(`Unresolved path parameter for ${operationId}`)
  }
  if (query === undefined || query === null) return pathname
  const parameters = query instanceof URLSearchParams
    ? query
    : new URLSearchParams(Object.entries(query).filter(([, value]) => (
      value !== undefined && value !== null
    )))
  const queryString = parameters.toString()
  return queryString.length === 0 ? pathname : `${pathname}?${queryString}`
}
