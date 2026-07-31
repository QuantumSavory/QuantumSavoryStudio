import {
  createNumericExpressionValue,
  isNumericExpressionValue,
} from '../models/Variable.js'

export { createNumericExpressionValue, isNumericExpressionValue }

export const KNOWN_PARAMETER_TYPES = [
  'Float64',
  'Int',
  'Int64',
  'Bool',
  'String',
  'Function',
  'Nothing',
  'Symbolic',
  'Vector{Int64}',
  'Vector{Float64}',
  'Lambda',
  'default'
]

export const VARIABLE_PARAMETER_TYPES = [
  'default',
  'Int64',
  'Float64',
  'Bool',
  'String',
  'Function',
  'Lambda',
  'Symbolic',
  'QuantumSavory.Wildcard',
  'Vector{Int64}',
  'Vector{Float64}',
  'Nothing'
]

export const NUMERIC_EXPRESSION_PREFIX = 'expression:'

const TYPE_OPTION_LABELS = {
  default: 'Default',
  Function: 'Predefined Function',
  Lambda: 'Custom Function',
}

function descriptor({
  id,
  label = getTypeOptionLabel(id),
  inputKind,
  wireType = id,
  enabled = true,
}) {
  return Object.freeze({
    id,
    label,
    inputKind,
    wireType,
    enabled,
  })
}

function inputKindForType(type) {
  if (parameterTypeIsNumber(type)) return 'number'
  if (isNumericVectorType(type)) return 'numeric-vector'
  if (type === 'Bool') return 'boolean'
  if (type === 'Function') return 'predefined-function'
  if (isCodeType(type)) return 'code'
  if (type === 'Nothing' || isWildcardType(type)) return 'intrinsic'
  if (type === 'String') return 'text'
  return parameterTypeIsKnown(type) ? 'text' : 'unsupported'
}

function uniqueDescriptors(options) {
  const seen = new Set()
  return options.filter(option => {
    if (seen.has(option.id)) return false
    seen.add(option.id)
    return true
  })
}

/**
 * Convert authoritative Julia constructor metadata to the frontend input
 * contract. Generic editors remain Default-first; constructor editors wrap
 * this builder with their simulator-owned omission policy.
 */
export function buildParameterInputOptions(
  inputType,
  metadata = {},
  { numericExpressions = true, includeDefault = true } = {},
) {
  const declaredTypes = Array.isArray(inputType) ? inputType : [inputType]
  const options = []
  if (includeDefault) {
    options.push(descriptor({
      id: 'default',
      label: 'Default',
      inputKind: 'default',
      wireType: null,
    }))
  }

  if (metadata?.kind === 'named_tag_type') {
    if (metadata.nullable === true) {
      options.push(descriptor({
        id: 'Nothing',
        inputKind: 'intrinsic',
        wireType: 'Nothing',
      }))
    }
    options.push(descriptor({
      id: 'DataType',
      label: 'Tag',
      inputKind: 'named-tag',
      wireType: 'DataType',
    }))
    return options
  }

  for (const declaredType of declaredTypes) {
    if (declaredType === 'default') continue
    if (declaredType === 'Function') {
      options.push(
        descriptor({
          id: 'Function',
          label: 'Predefined Function',
          inputKind: 'predefined-function',
          wireType: 'Function',
        }),
        descriptor({
          id: 'Lambda',
          label: 'Custom Function',
          inputKind: 'code',
          wireType: 'Lambda',
        }),
      )
      continue
    }

    const enabled = parameterTypeIsKnown(declaredType)
    options.push(descriptor({
      id: declaredType,
      inputKind: inputKindForType(declaredType),
      wireType: declaredType,
      enabled,
    }))
    if (
      numericExpressions
      && (declaredType === 'Float64' || declaredType === 'Int64')
    ) {
      options.push(descriptor({
        id: numericExpressionOptionId(declaredType),
        label: `${declaredType} Expression`,
        inputKind: 'numeric-expression',
        wireType: declaredType,
      }))
    }
  }

  return uniqueDescriptors(options)
}

/** Build options for one simulator constructor field from its exact omission contract. */
export function buildConstructorParameterInputOptions(
  inputType,
  metadata,
  options = {},
) {
  if (typeof metadata?.required !== 'boolean') {
    throw new TypeError('Constructor parameter metadata requires a Boolean required field')
  }
  return buildParameterInputOptions(inputType, metadata, {
    ...options,
    includeDefault: !metadata.required,
  })
}

export function buildVariableInputOptions() {
  return buildParameterInputOptions(VARIABLE_PARAMETER_TYPES)
}

export function findParameterInputOption(inputType, metadata, id) {
  return buildParameterInputOptions(inputType, metadata)
    .find(option => option.id === id) || null
}

/**
 * Resolve a protocol-field descriptor for a compatible Variable.
 *
 * Prefer the Variable's exact editor branch when the constructor exposes it
 * (especially numeric expressions), then fall back to semantic compatibility.
 */
export function parameterInputOptionForVariable(inputType, metadata, variable) {
  const options = buildConstructorParameterInputOptions(inputType, metadata)
  const selectedType = variable?.selectedType || variable?.type
  const exact = options.find(option => option.id === selectedType && option.enabled)
  if (exact) return exact

  const semanticType = variable?.selectedType === 'default'
    ? 'default'
    : variable?.type
  return options.find(option => (
    option.enabled
    && option.inputKind !== 'default'
    && parameterTypeSupportsVariableType(option.wireType, semanticType)
  )) || null
}

export function getTypeOptionLabel(type) {
  if (isNumericExpressionOptionId(type)) {
    return `${numericExpressionTargetType(type)} Expression`
  }
  return TYPE_OPTION_LABELS[type] || type
}

export function isWildcardType(type) {
  return type === 'Wildcard' || type === 'QuantumSavory.Wildcard'
}

export function isSymbolicType(type) {
  return type === 'Symbolic'
}

export function isCodeType(type) {
  return type === 'Lambda' || isSymbolicType(type)
}

export function parameterTypeIsNumber(typeOrParameter) {
  if (typeOrParameter == null) return false

  const originalType = typeof typeOrParameter === 'object'
    ? typeOrParameter.type
    : typeOrParameter
  if (typeof originalType !== 'string') return false

  const lower = originalType.toLowerCase()
  return lower === 'int' || lower === 'int64' || lower.startsWith('float')
}

export function numericExpressionOptionId(targetType) {
  return `${NUMERIC_EXPRESSION_PREFIX}${targetType}`
}

export function isNumericExpressionOptionId(id) {
  return id === 'expression:Float64' || id === 'expression:Int64'
}

export function numericExpressionTargetType(id) {
  return isNumericExpressionOptionId(id) ? id.slice(NUMERIC_EXPRESSION_PREFIX.length) : null
}

export function intrinsicParameterInputOption(options, value) {
  if (value === 'nothing') {
    return options.find(option => option.id === 'Nothing') || null
  }
  if (value === 'Wildcard') {
    return options.find(option => isWildcardType(option.id)) || null
  }
  return null
}

export function inferParameterInputOption(options, parameter = {}) {
  const selected = options.find(option => option.id === parameter.selectedType)
  if (selected) return selected

  const value = parameter.value
  if (isNumericExpressionValue(value)) {
    const expressionOption = options.find(option => (
      option.inputKind === 'numeric-expression'
    ))
    if (expressionOption) return expressionOption
  }
  if (value == null || value === '' || value === 'default') return options[0]
  const intrinsic = intrinsicParameterInputOption(options, value)
  if (intrinsic) return intrinsic
  if (typeof value === 'boolean') {
    return options.find(option => option.id === 'Bool') || options[0]
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      const integer = options.find(option => ['Int', 'Int64'].includes(option.id))
      if (integer) return integer
    }
    return options.find(option => (
      option.inputKind === 'number' && parameterTypeIsNumber(option.wireType)
    )) || options[0]
  }
  if (Array.isArray(value)) {
    return options.find(option => String(option.id).startsWith('Vector{')) || options[0]
  }
  if (typeof value === 'string') {
    const numeric = options.find(option => {
      if (option.inputKind !== 'number') return false
      const parsed = parseNumericParameterValue(option.wireType, value, parameter)
      return parsed.valid && !parsed.empty
    })
    if (numeric) return numeric
    const namedTag = options.find(option => option.inputKind === 'named-tag')
    if (namedTag && value.trim()) return namedTag
    const predefined = options.find(option => option.id === 'Function')
    if (predefined && value !== 'default') return predefined
    return options.find(option => option.id === 'String')
      || options.find(option => option.id === 'Lambda')
      || options.find(option => isSymbolicType(option.id))
      || options.find(option => option.inputKind === 'named-tag')
      || options[0]
  }
  return options.find(option => option.inputKind !== 'default') || options[0]
}

/**
 * Resolve one constructor input branch without rewriting an explicit selection.
 *
 * `expectedOption` supplies the branch selected by a linked Variable. Otherwise,
 * reserved intrinsic wire values select their corresponding intrinsic branch.
 * Only a parameter that omits `selectedType` may infer either branch.
 */
export function resolveParameterInputOption(
  options,
  parameter = {},
  { expectedOption = null } = {},
) {
  const explicit = Object.hasOwn(parameter, 'selectedType')
  if (!explicit) {
    return {
      explicit: false,
      option: expectedOption || inferParameterInputOption(options, parameter),
      expectedOption,
      contradictory: false,
    }
  }

  const option = options.find(candidate => candidate.id === parameter.selectedType) || null
  const requiredOption = expectedOption
    || intrinsicParameterInputOption(options, parameter.value)
  return {
    explicit: true,
    option,
    expectedOption: requiredOption,
    contradictory: !!option && !!requiredOption && option.id !== requiredOption.id,
  }
}

/** Return whether one descriptor-backed draft contains a committed value. */
export function parameterInputIsComplete(option, parameter = {}) {
  if (!option?.enabled || parameter.error) return false
  const value = parameter.value

  if (option.inputKind === 'default') return value === null
  if (option.inputKind === 'numeric-expression') {
    return isNumericExpressionOptionId(option.id)
      && numericExpressionTargetType(option.id) === option.wireType
      && isNumericExpressionValue(value)
  }
  if (option.inputKind === 'number') {
    const parsed = parseNumericParameterValue(option.wireType, value, parameter)
    return parsed.valid && !parsed.empty
  }
  if (option.inputKind === 'numeric-vector') {
    const parsed = parseNumericVectorParameterValue(option.wireType, value)
    return parsed.valid && !parsed.empty
  }
  if (option.inputKind === 'boolean') return typeof value === 'boolean'
  if (option.inputKind === 'intrinsic') {
    return option.id === 'Nothing'
      ? value === 'nothing'
      : isWildcardType(option.id) && value === 'Wildcard'
  }
  if (['named-tag', 'predefined-function', 'code'].includes(option.inputKind)) {
    return typeof value === 'string' && value.trim().length > 0
  }
  if (option.inputKind === 'text') {
    return typeof value === 'string' && value.trim().length > 0
  }
  return false
}

export function parseNumericParameterValue(type, rawValue, parameter = {}) {
  if (rawValue == null || rawValue === '') {
    return { valid: true, empty: true, value: null }
  }

  const value = Number(rawValue)
  const normalizedType = String(type || '').toLowerCase()
  const minimum = Number(parameter.min)
  const maximum = Number(parameter.max)
  const valid = Number.isFinite(value)
    && (
      (normalizedType !== 'int' && normalizedType !== 'int64')
      || Number.isInteger(value)
    )
    && (!Number.isFinite(minimum) || value >= minimum)
    && (!Number.isFinite(maximum) || value <= maximum)

  return {
    valid,
    empty: false,
    value: valid ? value : null,
  }
}

export function isNumericVectorType(type) {
  return type === 'Vector{Int64}' || type === 'Vector{Float64}'
}

/** Parse the explicit JSON-array editor shared by authoring and admission. */
export function parseNumericVectorParameterValue(type, rawValue) {
  if (!isNumericVectorType(type)) {
    return { valid: false, empty: false, value: null }
  }
  if (rawValue == null || rawValue === '') {
    return { valid: true, empty: true, value: null }
  }

  let value = rawValue
  if (typeof rawValue === 'string') {
    if (!rawValue.trim()) return { valid: true, empty: true, value: null }
    try {
      value = JSON.parse(rawValue)
    } catch {
      return { valid: false, empty: false, value: null }
    }
  }
  const valid = Array.isArray(value) && value.every(item => (
    typeof item === 'number'
    && Number.isFinite(item)
    && (type !== 'Vector{Int64}' || Number.isInteger(item))
  ))
  return {
    valid,
    empty: false,
    value: valid ? [...value] : null,
  }
}

export function parameterTypeIsKnown(type) {
  return KNOWN_PARAMETER_TYPES.includes(type) || isWildcardType(type) || isSymbolicType(type)
}

/**
 * Whether a variable's concrete semantic type is accepted by a protocol field.
 */
export function parameterTypeSupportsVariableType(parameterType, variableType) {
  if (typeof variableType !== 'string' || variableType.length === 0) return false
  if (variableType.toLowerCase() === 'default') return true

  const declaredTypes = Array.isArray(parameterType) ? parameterType : [parameterType]
  return declaredTypes.some(declaredType => {
    if (typeof declaredType !== 'string') return false
    if (declaredType === 'Any') return true
    if (declaredType === 'Function') {
      return variableType === 'Function' || variableType === 'Lambda'
    }
    if (isWildcardType(declaredType)) return isWildcardType(variableType)
    if (declaredType === 'Int') return variableType === 'Int' || variableType === 'Int64'
    if (declaredType === 'Int64') return variableType === 'Int' || variableType === 'Int64'
    return declaredType === variableType
  })
}

export function unknownParameterTypes(type) {
  if (type == null) return []
  if (Array.isArray(type)) {
    return type.filter(entry => !parameterTypeIsKnown(entry))
  }
  return parameterTypeIsKnown(type) ? [] : [type]
}

export function resetValueForType(parameter, type, { required = false } = {}) {
  delete parameter.error
  delete parameter.latex

  if (type === 'default') {
    parameter.value = null
  } else if (isNumericExpressionOptionId(type)) {
    parameter.value = null
  } else if (isWildcardType(type)) {
    parameter.value = 'Wildcard'
  } else if (type === 'Bool') {
    parameter.value = required ? null : false
  } else if (type === 'Nothing') {
    parameter.value = 'nothing'
  } else {
    parameter.value = null
  }
}
