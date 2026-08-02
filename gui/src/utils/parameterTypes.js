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
  'SymbolicUtils.Symbolic',
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
  if (type === 'Bool') return 'boolean'
  if (type === 'Function') return 'predefined-function'
  if (isCodeType(type)) return 'code'
  if (type === 'Nothing' || isWildcardType(type)) return 'intrinsic'
  if (type === 'String' || String(type).startsWith('Vector{')) return 'text'
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
 * contract. Optional fields begin with Default; required fields expose only
 * concrete choices.
 */
export function buildParameterInputOptions(
  inputType,
  metadata = {},
  { numericExpressions = true } = {},
) {
  const declaredTypes = Array.isArray(inputType) ? inputType : [inputType]
  const options = []
  if (metadata?.required !== true) {
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
 * Variable semantic aliases such as `Symbolic` can be accepted by a more
 * specific authoritative Julia type such as `SymbolicUtils.Symbolic{Real}`.
 * Prefer the Variable's exact editor branch when the constructor exposes it
 * (especially numeric expressions), then fall back to semantic compatibility.
 */
export function parameterInputOptionForVariable(inputType, metadata, variable) {
  const options = buildParameterInputOptions(inputType, metadata)
  const selectedType = variable?.selectedType || variable?.type
  const exact = options.find(option => option.id === selectedType && option.enabled)
  if (exact) return exact

  const semanticType = variable?.selectedType === 'default'
    ? 'default'
    : variable?.type
  if (semanticType === 'default') {
    return options.find(option => option.inputKind === 'default') || null
  }
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
  return typeof type === 'string' && (type === 'Symbolic'
    || type === 'SymbolicUtils.Symbolic'
    || type.startsWith('SymbolicUtils.Symbolic{')
    || type === 'QuantumSymbolics.SymQObj'
    || type.startsWith('QuantumSymbolics.SymQObj{'))
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
  if (value === 'nothing') {
    return options.find(option => option.id === 'Nothing') || options[0]
  }
  if (value === 'Wildcard') {
    return options.find(option => isWildcardType(option.id)) || options[0]
  }
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
    if (String(option.wireType).startsWith('Vector{')) {
      return Array.isArray(value) && value.length > 0 && value.every(item => (
        typeof item === 'number' && Number.isFinite(item)
          && (option.wireType !== 'Vector{Int64}' || Number.isInteger(item))
      ))
    }
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
    if (isSymbolicType(declaredType)) return isSymbolicType(variableType)
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

export function resetValueForType(parameter, type) {
  delete parameter.error
  delete parameter.latex

  if (type === 'default') {
    parameter.value = null
  } else if (isNumericExpressionOptionId(type)) {
    parameter.value = null
  } else if (isWildcardType(type)) {
    parameter.value = 'Wildcard'
  } else if (type === 'Bool') {
    parameter.value = false
  } else if (type === 'Nothing') {
    parameter.value = 'nothing'
  } else {
    parameter.value = null
  }
}
