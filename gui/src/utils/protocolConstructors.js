import {
  buildParameterInputOptions,
  isNumericExpressionValue,
} from './parameterTypes.js'
import { isVariableReference } from '../models/Variable.js'

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function deepClone(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return seen.get(value)

  if (value instanceof Date) return new Date(value.getTime())
  if (value instanceof RegExp) return new RegExp(value.source, value.flags)

  if (value instanceof Map) {
    const clone = new Map()
    seen.set(value, clone)
    value.forEach((item, key) => clone.set(deepClone(key, seen), deepClone(item, seen)))
    return clone
  }

  if (value instanceof Set) {
    const clone = new Set()
    seen.set(value, clone)
    value.forEach(item => clone.add(deepClone(item, seen)))
    return clone
  }

  const clone = Array.isArray(value)
    ? []
    : Object.create(Object.getPrototypeOf(value))
  seen.set(value, clone)

  Reflect.ownKeys(value).forEach(key => {
    if (Array.isArray(value) && key === 'length') return

    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if ('value' in descriptor) descriptor.value = deepClone(value[key], seen)
    Object.defineProperty(clone, key, descriptor)
  })

  return clone
}

export function protocolSimpleName(protocolOrType) {
  const type = typeof protocolOrType === 'string'
    ? protocolOrType
    : protocolOrType?.type
  if (typeof type !== 'string' || !type.trim()) return ''
  return type.split('.').pop()
}

function definitionParameters(definition) {
  if (!isRecord(definition) || typeof definition.type !== 'string' || !definition.type) {
    throw new Error('A runtime protocol definition is required.')
  }
  if (!Array.isArray(definition.parameters)) throw new Error(
    `Runtime metadata for ${protocolSimpleName(definition)} has no parameter list.`,
  )
  return definition.parameters
}

function initialParameterInputOption(options) {
  return options.find(option => option.enabled) || options[0] || null
}

function parameterFromDefinition(parameter) {
  const name = parameter?.field
  if (typeof name !== 'string' || !name) throw new Error(
    'Runtime protocol metadata contains a parameter without a field name.',
  )
  const option = initialParameterInputOption(
    buildParameterInputOptions(parameter.type, parameter),
  )
  if (!option) throw new Error(`Runtime protocol field ${name} has no input option.`)

  return {
    name,
    type: deepClone(parameter.type),
    selectedType: option.id,
    value: null
  }
}

function normalizeSeededParameter(parameter, definition) {
  const normalized = deepClone(parameter)
  const options = buildParameterInputOptions(definition.type, definition)
  if (options.some(option => option.id === normalized.selectedType)) return normalized

  if (normalized.value == null || normalized.value === '' || normalized.value === 'default') {
    normalized.selectedType = initialParameterInputOption(options)?.id
    normalized.value = null
    return normalized
  }
  const option = isNumericExpressionValue(normalized.value)
    ? options.find(candidate => (
        candidate.inputKind === 'numeric-expression'
        && candidate.wireType === normalized.type
      ))
    : options.find(candidate => (
        candidate.enabled
        && candidate.inputKind !== 'default'
        && candidate.inputKind !== 'numeric-expression'
        && (candidate.id === normalized.type || candidate.wireType === normalized.type)
      ))
  normalized.selectedType = option?.id || initialParameterInputOption(options)?.id
  return normalized
}

function isStrictVariableReference(value) {
  if (!isVariableReference(value)) return false
  const keys = Object.keys(value).sort()
  return value.id.trim()
    && keys.length === 2 && keys[0] === 'id' && keys[1] === 'kind'
}

/** Validate only draft shape before layout generation. */
export function validateProtocolConstructorDraft(definition, protocol = null) {
  definitionParameters(definition)
  const parameters = protocol == null ? [] : protocol.parameters
  if (!Array.isArray(parameters)) {
    throw new Error(`The ${protocolSimpleName(definition)} constructor has no parameter list.`)
  }

  const supplied = new Set()
  for (const parameter of parameters) {
    const field = parameter?.name
    if (typeof field !== 'string' || !field) throw new Error(
      'A constructor field is missing its name.',
    )
    if (supplied.has(field)) throw new Error(`Constructor field ${field} is duplicated.`)
    supplied.add(field)

    if (parameter.selectedType === 'default') continue
    if (isStrictVariableReference(parameter.value)) continue
    if (parameter.value === null || parameter.value === undefined || parameter.value === '') {
      throw new Error(`Constructor field ${field} requires a serializable value.`)
    }
  }
  return true
}

/**
 * Build a protocol-constructor draft from runtime metadata. IDs are assigned only
 * when the draft is installed at a concrete node or edge.
 */
export function createProtocolFromDefinition(definition) {
  const parameters = definitionParameters(definition)
  return {
    type: definition.type,
    parameters: parameters.map(parameterFromDefinition)
  }
}

/**
 * Seed a metadata-backed protocol draft from a configured template protocol.
 * Metadata supplies newly introduced fields while the template wins for every
 * field it already configures. Unknown saved fields are retained for lossless
 * cloning and can still be diagnosed by the normal constructor editor.
 */
export function seedProtocolConstructor(definition, templateProtocol = null) {
  const fallback = createProtocolFromDefinition(definition)
  if (!isRecord(templateProtocol)) return fallback

  const expectedName = protocolSimpleName(definition)
  if (protocolSimpleName(templateProtocol) !== expectedName) return fallback

  const source = deepClone(templateProtocol)
  const sourceParameters = Array.isArray(source.parameters) ? source.parameters : []
  const definitionsByName = new Map(
    definition.parameters.map(parameter => [parameter?.field, parameter]),
  )
  const sourceByName = new Map(sourceParameters.map(parameter => [parameter?.name, parameter]))
  const metadataNames = new Set(fallback.parameters.map(parameter => parameter.name))
  const parameters = fallback.parameters.map(parameter => (
    sourceByName.has(parameter.name)
      ? normalizeSeededParameter(
          sourceByName.get(parameter.name),
          definitionsByName.get(parameter.name),
        )
      : parameter
  ))

  sourceParameters.forEach(parameter => {
    if (!metadataNames.has(parameter?.name)) parameters.push(deepClone(parameter))
  })

  delete source.id
  return {
    ...source,
    type: definition.type,
    parameters
  }
}

/** Build transient editor state for one canonical background-noise value. */
export function seedBackgroundNoiseConstructor(definition, backgroundNoise = null) {
  if (!isRecord(definition) || !Array.isArray(definition.parameters)) {
    throw new Error('A runtime background-noise definition is required.')
  }
  const source = isRecord(backgroundNoise) ? deepClone(backgroundNoise) : {}
  const sourceParameters = Array.isArray(source.parameters) ? source.parameters : []
  const sourceByName = new Map(sourceParameters.map(parameter => [
    parameter?.name ?? parameter?.field,
    parameter,
  ]))
  const metadataNames = new Set(definition.parameters.map(parameter => parameter?.field))
  const parameters = definition.parameters.map(parameter => {
    const fallback = {
      ...deepClone(parameter),
      field: parameter.field,
      selectedType: initialParameterInputOption(
        buildParameterInputOptions(parameter.type, parameter),
      )?.id,
      value: null,
    }
    const configured = sourceByName.get(parameter.field)
    return configured
      ? {
          ...fallback,
          ...normalizeSeededParameter(configured, parameter),
          field: parameter.field,
        }
      : fallback
  })
  sourceParameters.forEach(parameter => {
    const name = parameter?.name ?? parameter?.field
    if (!metadataNames.has(name)) {
      parameters.push({ ...deepClone(parameter), field: name })
    }
  })
  return { type: definition.type, parameters }
}

/** Create a fresh, deeply independent installed protocol from a constructor draft. */
export function instantiateProtocolConstructor(constructor, nextId) {
  if (!isRecord(constructor) || typeof constructor.type !== 'string' || !constructor.type) {
    throw new Error('A valid protocol constructor is required.')
  }
  if (!Array.isArray(constructor.parameters)) {
    throw new Error(`The ${protocolSimpleName(constructor)} constructor has no parameter list.`)
  }
  if (typeof nextId !== 'function') throw new Error('A protocol ID generator is required.')

  const protocol = deepClone(constructor)
  protocol.id = nextId('protocol')
  return protocol
}
