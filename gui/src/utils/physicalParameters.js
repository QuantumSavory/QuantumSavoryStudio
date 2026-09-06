export const SPEED_OF_LIGHT_METERS_PER_SECOND = 299_792_458
export const DEFAULT_REFRACTIVE_INDEX = 1.468
export const DEFAULT_LOSS_DB_PER_KM = 0.2

export const PHYSICAL_UNITS = Object.freeze({
  dimensionless: Object.freeze({
    id: 'dimensionless',
    symbol: '',
    label: 'dimensionless',
  }),
  meters: Object.freeze({
    id: 'meters',
    symbol: 'm',
    label: 'meters',
  }),
  seconds: Object.freeze({
    id: 'seconds',
    symbol: 's',
    label: 'seconds',
  }),
  decibelsPerKilometer: Object.freeze({
    id: 'decibels-per-kilometer',
    symbol: 'dB/km',
    label: 'decibels per kilometer',
  }),
})

function descriptor(definition) {
  return Object.freeze(definition)
}

/**
 * Physical authoring metadata. Persisted override names intentionally differ
 * from resolved payload names where the override represents a manual value.
 */
export const PHYSICAL_PARAMETER_DESCRIPTORS = Object.freeze({
  distanceMeters: descriptor({
    id: 'distanceMeters',
    label: 'Distance',
    controlId: 'edge-distance-meters',
    overrideField: 'distanceMeters',
    resolvedField: 'distanceMeters',
    contextBinding: 'distance',
    unit: PHYSICAL_UNITS.meters,
    minimum: 0,
    dormantWhen: 'manualDelay',
    automaticDescription: 'the route-derived value',
  }),
  refractiveIndex: descriptor({
    id: 'refractiveIndex',
    label: 'Refractive index',
    controlId: 'edge-refractive-index',
    globalControlId: 'default-refractive-index',
    configField: 'refractiveIndex',
    overrideField: 'refractiveIndex',
    resolvedField: 'refractiveIndex',
    contextBinding: 'refractive_index',
    unit: PHYSICAL_UNITS.dimensionless,
    minimum: 0,
    exclusiveMinimum: true,
    defaultValue: DEFAULT_REFRACTIVE_INDEX,
    dormantWhen: 'manualDelay',
    automaticDescription: 'the project refractive index',
  }),
  propagationDelaySeconds: descriptor({
    id: 'propagationDelaySeconds',
    label: 'Propagation delay',
    controlId: 'edge-delay-seconds',
    overrideField: 'delaySeconds',
    resolvedField: 'propagationDelaySeconds',
    contextBinding: 'delay',
    unit: PHYSICAL_UNITS.seconds,
    minimum: 0,
    manualFlag: 'manualDelay',
    automaticDescription: 'automatic propagation',
  }),
  lossDbPerKm: descriptor({
    id: 'lossDbPerKm',
    label: 'Fiber loss',
    controlId: 'edge-loss-db-per-km',
    globalControlId: 'default-loss-db-per-km',
    configField: 'lossDbPerKm',
    overrideField: 'lossDbPerKm',
    resolvedField: 'lossDbPerKm',
    contextBinding: 'loss',
    unit: PHYSICAL_UNITS.decibelsPerKilometer,
    minimum: 0,
    defaultValue: DEFAULT_LOSS_DB_PER_KM,
    dormantWhen: 'manualTransmissivity',
    automaticDescription: 'the project fiber loss',
  }),
  transmissivity: descriptor({
    id: 'transmissivity',
    label: 'Transmissivity',
    controlId: 'edge-transmissivity',
    overrideField: 'transmissivity',
    resolvedField: 'transmissivity',
    contextBinding: 'transmissivity',
    unit: PHYSICAL_UNITS.dimensionless,
    minimum: 0,
    maximum: 1,
    manualFlag: 'manualTransmissivity',
    automaticDescription: 'automatic fiber transmission',
  }),
})

export const GLOBAL_PHYSICAL_PARAMETER_DESCRIPTORS = Object.freeze([
  PHYSICAL_PARAMETER_DESCRIPTORS.refractiveIndex,
  PHYSICAL_PARAMETER_DESCRIPTORS.lossDbPerKm,
])

export const EDGE_PHYSICAL_PARAMETER_DESCRIPTORS = Object.freeze([
  PHYSICAL_PARAMETER_DESCRIPTORS.distanceMeters,
  PHYSICAL_PARAMETER_DESCRIPTORS.refractiveIndex,
  PHYSICAL_PARAMETER_DESCRIPTORS.propagationDelaySeconds,
  PHYSICAL_PARAMETER_DESCRIPTORS.lossDbPerKm,
  PHYSICAL_PARAMETER_DESCRIPTORS.transmissivity,
])

export const PERSISTED_PHYSICAL_OVERRIDE_FIELDS = Object.freeze(
  EDGE_PHYSICAL_PARAMETER_DESCRIPTORS.map(parameter => parameter.overrideField),
)

export const RESOLVED_PHYSICAL_EDGE_FIELDS = Object.freeze(
  EDGE_PHYSICAL_PARAMETER_DESCRIPTORS.map(parameter => parameter.resolvedField),
)

export const MATERIAL_PHYSICAL_OVERRIDE_FIELDS = Object.freeze([
  PHYSICAL_PARAMETER_DESCRIPTORS.refractiveIndex.overrideField,
  PHYSICAL_PARAMETER_DESCRIPTORS.lossDbPerKm.overrideField,
])

export const DEFAULT_PHYSICAL_CONFIG_VALUES = Object.freeze(
  Object.fromEntries(GLOBAL_PHYSICAL_PARAMETER_DESCRIPTORS.map(parameter => [
    parameter.configField,
    parameter.defaultValue,
  ])),
)

function parameterRangeDescription(parameter) {
  if (parameter.minimum != null && parameter.maximum != null) {
    return `number from ${parameter.minimum} through ${parameter.maximum}`
  }
  if (parameter.minimum != null) {
    if (parameter.minimum === 0) {
      return parameter.exclusiveMinimum ? 'positive number' : 'nonnegative number'
    }
    return parameter.exclusiveMinimum
      ? `number greater than ${parameter.minimum}`
      : `number ${parameter.minimum} or greater`
  }
  if (parameter.maximum != null) return `number at most ${parameter.maximum}`
  return 'number within its supported range'
}

/** Validate one descriptor-backed physical quantity and return it unchanged. */
export function validatePhysicalParameterValue(parameter, value, label = parameter.label) {
  const validNumber = typeof value === 'number' && Number.isFinite(value)
  const validMinimum = parameter.minimum == null || (
    parameter.exclusiveMinimum ? value > parameter.minimum : value >= parameter.minimum
  )
  const validMaximum = parameter.maximum == null || value <= parameter.maximum
  if (!validNumber || !validMinimum || !validMaximum) {
    throw new Error(
      `${label} must be a finite ${parameterRangeDescription(parameter)}.`,
    )
  }
  return value
}

export function isValidPhysicalParameterValue(parameter, value) {
  try {
    validatePhysicalParameterValue(parameter, value)
    return true
  } catch {
    return false
  }
}

export function emptyPhysicalOverrides() {
  return Object.fromEntries(PERSISTED_PHYSICAL_OVERRIDE_FIELDS.map(field => [field, null]))
}

/** Explicit vacuum/light-in-material propagation formula, with SI inputs. */
export function calculatePropagationDelaySeconds(distanceMeters, refractiveIndex) {
  return distanceMeters * refractiveIndex / SPEED_OF_LIGHT_METERS_PER_SECOND
}

/** Explicit dB/km attenuation formula, returning a dimensionless probability. */
export function calculateTransmissivity(distanceMeters, lossDbPerKm) {
  return 10 ** (-(lossDbPerKm * distanceMeters / 1000) / 10)
}

function resolvedGlobalValue(parameter, physicalConfig) {
  const value = physicalConfig?.[parameter.configField] ?? parameter.defaultValue
  return validatePhysicalParameterValue(parameter, value, parameter.label)
}

function resolvedOverrideValue(parameter, overrides, fallback) {
  const value = overrides?.[parameter.overrideField]
  return value == null
    ? fallback
    : validatePhysicalParameterValue(parameter, value, parameter.label)
}

/** Resolve persisted configuration and overrides from one sampled distance. */
export function resolvePhysicalParameters(
  sampledDistanceMeters,
  physicalConfig = {},
  physicalOverrides = null,
) {
  const parameters = PHYSICAL_PARAMETER_DESCRIPTORS
  const distanceMeters = resolvedOverrideValue(
    parameters.distanceMeters,
    physicalOverrides,
    validatePhysicalParameterValue(
      parameters.distanceMeters,
      sampledDistanceMeters,
      'Physical distance',
    ),
  )
  const refractiveIndex = resolvedOverrideValue(
    parameters.refractiveIndex,
    physicalOverrides,
    resolvedGlobalValue(parameters.refractiveIndex, physicalConfig),
  )
  const lossDbPerKm = resolvedOverrideValue(
    parameters.lossDbPerKm,
    physicalOverrides,
    resolvedGlobalValue(parameters.lossDbPerKm, physicalConfig),
  )
  const manualDelay = physicalOverrides?.delaySeconds != null
  const propagationDelaySeconds = manualDelay
    ? validatePhysicalParameterValue(
        parameters.propagationDelaySeconds,
        physicalOverrides.delaySeconds,
      )
    : calculatePropagationDelaySeconds(distanceMeters, refractiveIndex)
  const manualTransmissivity = physicalOverrides?.transmissivity != null
  const transmissivity = manualTransmissivity
    ? validatePhysicalParameterValue(
        parameters.transmissivity,
        physicalOverrides.transmissivity,
      )
    : calculateTransmissivity(distanceMeters, lossDbPerKm)

  return {
    manualDelay,
    manualTransmissivity,
    distanceMeters,
    refractiveIndex,
    propagationDelaySeconds,
    lossDbPerKm,
    transmissivity,
  }
}

/** Preserve typed overrides while presenting automatic values at three digits. */
export function formatPhysicalInputValue(value, significantDigits = 3) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Number(value.toPrecision(significantDigits))
    : value
}

const SI_PREFIXES = new Map([
  [-12, 'p'],
  [-9, 'n'],
  [-6, 'µ'],
  [-3, 'm'],
  [0, ''],
  [3, 'k'],
  [6, 'M'],
  [9, 'G'],
  [12, 'T'],
])

/** Format a finite value with three significant digits and an adaptive SI prefix. */
export function formatPhysicalValue(value, unit) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a'
  if (value === 0) return `0.00 ${unit}`

  const rawExponent = Math.floor(Math.log10(Math.abs(value)) / 3) * 3
  let exponent = Math.max(-12, Math.min(12, rawExponent))
  let scaled = value / (10 ** exponent)
  if (Math.abs(Number(scaled.toPrecision(3))) >= 1000 && exponent < 12) {
    exponent += 3
    scaled /= 1000
  }
  const roundedMagnitude = Math.abs(Number(scaled.toPrecision(3)))
  const decimalPlaces = Math.max(0, 2 - Math.floor(Math.log10(roundedMagnitude)))
  return `${scaled.toFixed(decimalPlaces)} ${SI_PREFIXES.get(exponent)}${unit}`
}
