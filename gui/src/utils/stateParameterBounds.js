function requireBoolean(value, context) {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${context} must be a Boolean`)
  }
  return value
}

export function normalizeStateParameter(parameter, context = 'States Zoo parameter') {
  if (parameter === null || typeof parameter !== 'object' || Array.isArray(parameter)) {
    throw new TypeError(`${context} must be an object`)
  }
  if (typeof parameter.name !== 'string' || !parameter.name.trim()) {
    throw new TypeError(`${context}.name must be a nonempty string`)
  }
  if (typeof parameter.type !== 'string' || !parameter.type.trim()) {
    throw new TypeError(`${context}.type must be a nonempty string`)
  }
  const integer = requireBoolean(parameter.integer, `${context}.integer`)
  if (typeof parameter.doc !== 'string') {
    throw new TypeError(`${context}.doc must be a string`)
  }

  const numericMetadata = Object.fromEntries(['min', 'max', 'good'].map(field => {
    const value = parameter[field]
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError(`${context}.${field} must be a finite number`)
    }
    if (integer && !Number.isInteger(value)) {
      throw new TypeError(`${context}.${field} must be an integer`)
    }
    return [field, value]
  }))
  if (numericMetadata.min > numericMetadata.max) {
    throw new TypeError(`${context}.min must not exceed ${context}.max`)
  }

  return {
    name: parameter.name,
    type: parameter.type,
    integer,
    doc: parameter.doc,
    ...numericMetadata,
    minInclusive: requireBoolean(
      parameter.min_inclusive,
      `${context}.min_inclusive`,
    ),
    maxInclusive: requireBoolean(
      parameter.max_inclusive,
      `${context}.max_inclusive`,
    ),
  }
}

export function stateParameterValueIsValid(rawValue, parameter) {
  if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) return false
  if (parameter.integer && !Number.isInteger(rawValue)) return false

  const minimumValid = parameter.minInclusive
    ? rawValue >= parameter.min
    : rawValue > parameter.min
  const maximumValid = parameter.maxInclusive
    ? rawValue <= parameter.max
    : rawValue < parameter.max
  return minimumValid && maximumValid
}

export function formatStateParameterRange(parameter) {
  const left = parameter.minInclusive ? '[' : '('
  const right = parameter.maxInclusive ? ']' : ')'
  return `${left}${parameter.min}, ${parameter.max}${right}`
}
