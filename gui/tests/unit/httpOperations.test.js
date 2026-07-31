import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { HTTP_OPERATIONS } from '../../src/generated/httpOperations.js'
import {
  httpOperation,
  httpOperationPath,
} from '../../src/utils/httpOperations.js'

const guiRoot = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))))
const repositoryRoot = path.dirname(guiRoot)
const contract = JSON.parse(
  fs.readFileSync(path.join(repositoryRoot, 'contracts', 'http', 'openapi.json'), 'utf8'),
)

function contractOperations() {
  const operations = {}
  for (const [operationPath, pathItem] of Object.entries(contract.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!operation.operationId) continue
      operations[operation.operationId] = {
        method: method.toUpperCase(),
        path: operationPath,
        exposure: operation['x-wqs-exposure'],
      }
    }
  }
  return operations
}

describe('generated HTTP operations', () => {
  it('has exact operation parity with the canonical OpenAPI document', () => {
    expect(HTTP_OPERATIONS).toEqual(contractOperations())
    expect(Object.keys(HTTP_OPERATIONS)).toHaveLength(46)
  })

  it('keeps every static frontend operation reference in the generated map', () => {
    for (const relativePath of [
      'src/utils/ApiConnector.js',
      'src/features/mcp/McpControlClient.js',
      'src/features/mcp/McpEditorBridge.js',
    ]) {
      const source = fs.readFileSync(path.join(guiRoot, relativePath), 'utf8')
      const referenced = [
        ...source.matchAll(/requestOperation\('([^']+)'/g),
        ...source.matchAll(/this\.request\('([^']+)'/g),
        ...source.matchAll(/operationUrl\('([^']+)'/g),
      ].map(match => match[1])
      expect(referenced.length).toBeGreaterThan(0)
      expect(referenced.every(operationId => HTTP_OPERATIONS[operationId])).toBe(true)
    }
  })

  it('encodes path parameters and appends query parameters once', () => {
    expect(httpOperationPath('getProtocolState', {
      pathParams: {
        name: 'user_A/B?',
        protocol_id: 'protocol/#1',
      },
      query: { format: 'png' },
    })).toBe('/protocols/user_A%2FB%3F/protocol%2F%231?format=png')
  })

  it('rejects unknown operations and missing path parameters', () => {
    expect(() => httpOperation('notAnOperation')).toThrow('Unknown HTTP operationId')
    expect(() => httpOperationPath('getSlotState', {
      pathParams: { name: 'simulation' },
    })).toThrow("Missing path parameter 'slot_id'")
  })
})
