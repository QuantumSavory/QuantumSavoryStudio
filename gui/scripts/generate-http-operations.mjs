import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const guiRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repositoryRoot = path.dirname(guiRoot)
const contractFile = path.join(repositoryRoot, 'contracts', 'http', 'openapi.json')
const outputFile = path.join(guiRoot, 'src', 'generated', 'httpOperations.js')
const methods = new Set(['delete', 'get', 'head', 'options', 'patch', 'post', 'put', 'trace'])
const exposures = new Set(['ordinary', 'local-mcp', 'test-only'])

function operationsFrom(document) {
  if (document.openapi !== '3.1.0') throw new Error('HTTP contract must use OpenAPI 3.1.0')
  const operations = []
  const seen = new Set()
  for (const [operationPath, pathItem] of Object.entries(document.paths || {})) {
    if (!operationPath.startsWith('/')) throw new Error(`Invalid operation path: ${operationPath}`)
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!methods.has(method.toLowerCase())) continue
      const operationId = operation?.operationId
      if (typeof operationId !== 'string' || operationId.length === 0) {
        throw new Error(`Missing operationId for ${method.toUpperCase()} ${operationPath}`)
      }
      if (seen.has(operationId)) throw new Error(`Duplicate operationId: ${operationId}`)
      seen.add(operationId)
      const exposure = operation['x-wqs-exposure']
      if (!exposures.has(exposure)) {
        throw new Error(`Invalid x-wqs-exposure for ${operationId}: ${exposure}`)
      }
      operations.push({
        operationId,
        method: method.toUpperCase(),
        path: operationPath,
        exposure,
      })
    }
  }
  return operations.sort((left, right) => left.operationId.localeCompare(right.operationId))
}

function render(operations) {
  const entries = operations.map(operation => (
    `  ${JSON.stringify(operation.operationId)}: Object.freeze(${JSON.stringify({
      method: operation.method,
      path: operation.path,
      exposure: operation.exposure,
    })}),`
  ))
  return [
    '// Generated from contracts/http/openapi.json. Do not edit by hand.',
    'export const HTTP_OPERATIONS = Object.freeze({',
    ...entries,
    '})',
    '',
  ].join('\n')
}

const expected = render(operationsFrom(JSON.parse(fs.readFileSync(contractFile, 'utf8'))))
if (process.argv.includes('--check')) {
  const actual = fs.existsSync(outputFile) ? fs.readFileSync(outputFile, 'utf8') : ''
  if (actual !== expected) {
    console.error('Generated HTTP operation map is stale. Run npm run generate:http-operations.')
    process.exitCode = 1
  }
} else {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true })
  fs.writeFileSync(outputFile, expected)
  console.log(`Generated ${path.relative(repositoryRoot, outputFile)}`)
}
