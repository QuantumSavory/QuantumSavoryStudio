function inclusiveFlag(parameter, normalizedName, wireName) {
  return (parameter?.[normalizedName] ?? parameter?.[wireName]) !== false
}

export function normalizeStateParameter(parameter) {
  return {
    name: String(parameter.name),
    min: Number(parameter.min),
    max: Number(parameter.max),
    minInclusive: inclusiveFlag(parameter, 'minInclusive', 'min_inclusive'),
    maxInclusive: inclusiveFlag(parameter, 'maxInclusive', 'max_inclusive'),
    good: Number(parameter.good),
  }
}

export function stateParameterValueIsValid(rawValue, parameter) {
  if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) return false

  const normalized = normalizeStateParameter(parameter)
  const minimumValid = !Number.isFinite(normalized.min)
    || (
      normalized.minInclusive
        ? rawValue >= normalized.min
        : rawValue > normalized.min
    )
  const maximumValid = !Number.isFinite(normalized.max)
    || (
      normalized.maxInclusive
        ? rawValue <= normalized.max
        : rawValue < normalized.max
    )
  return minimumValid && maximumValid
}

export function formatStateParameterRange(parameter) {
  const normalized = normalizeStateParameter(parameter)
  const left = normalized.minInclusive ? '[' : '('
  const right = normalized.maxInclusive ? ']' : ')'
  return `${left}${normalized.min}, ${normalized.max}${right}`
}
