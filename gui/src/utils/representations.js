const DETAILS = Object.freeze({
  QuantumOpticsRepr: Object.freeze({
    value: 'QuantumOpticsRepr',
    label: 'QuantumOpticsRepr',
    tooltip: [
      '**QuantumOpticsRepr** supports general qubit and bosonic-mode states and operations.',
      'It is the most flexible choice, but dense states grow exponentially with subsystem count.',
    ].join(' '),
  }),
  QuantumMCRepr: Object.freeze({
    value: 'QuantumMCRepr',
    label: 'QuantumMCRepr',
    tooltip: [
      '**QuantumMCRepr** uses stochastic pure-state trajectories for supported noise instead',
      'of evolving a full density operator. Repeat trajectories for ensemble statistics.',
    ].join(' '),
  }),
  CliffordRepr: Object.freeze({
    value: 'CliffordRepr',
    label: 'CliffordRepr',
    tooltip: [
      '**CliffordRepr** efficiently simulates large qubit stabilizer states with Clifford',
      'operations and Pauli-like noise. It does not support general non-Clifford dynamics.',
    ].join(' '),
  }),
  GabsRepr: Object.freeze({
    value: 'GabsRepr',
    label: 'GabsRepr',
    tooltip: [
      '**GabsRepr** efficiently simulates bosonic modes in Gaussian phase space using a',
      'quadrature-block basis, including Gaussian states, operations, channels, and homodyne',
      'measurements. It does not support general non-Gaussian dynamics.',
    ].join(' '),
  }),
})

function options(...values) {
  return Object.freeze(values.map(value => DETAILS[value]))
}

export const DEFAULT_QUBIT_REPRESENTATION = 'QuantumOpticsRepr'
export const DEFAULT_QUMODE_REPRESENTATION = 'QuantumOpticsRepr'

export const QUBIT_REPRESENTATION_OPTIONS = options(
  'QuantumOpticsRepr',
  'QuantumMCRepr',
  'CliffordRepr',
)

export const QUMODE_REPRESENTATION_OPTIONS = options(
  'QuantumOpticsRepr',
  'QuantumMCRepr',
  'GabsRepr',
)

function normalizedChoice(value, allowedOptions, fallback) {
  return allowedOptions.some(option => option.value === value) ? value : fallback
}

function requiredChoice(config, field, allowedOptions) {
  const value = config?.[field]
  if (!allowedOptions.some(option => option.value === value)) {
    throw new Error(`Simulation configuration requires a supported ${field}`)
  }
  return value
}

/**
 * Read the explicit representation selections required by API payloads.
 */
export function requireRepresentationConfig(config) {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Simulation configuration must be an object')
  }
  return {
    qubitRepresentation: requiredChoice(
      config,
      'qubitRepresentation',
      QUBIT_REPRESENTATION_OPTIONS,
    ),
    qumodeRepresentation: requiredChoice(
      config,
      'qumodeRepresentation',
      QUMODE_REPRESENTATION_OPTIONS,
    ),
  }
}

/**
 * Return canonical representation selections for editable project state.
 *
 * Incomplete live editor state falls back to the general QuantumOptics
 * representation while it remains inside the project codec. API projection
 * uses `requireRepresentationConfig` and never supplies backend defaults.
 */
export function normalizeRepresentationConfig(config = {}) {
  return {
    qubitRepresentation: normalizedChoice(
      config?.qubitRepresentation,
      QUBIT_REPRESENTATION_OPTIONS,
      DEFAULT_QUBIT_REPRESENTATION,
    ),
    qumodeRepresentation: normalizedChoice(
      config?.qumodeRepresentation,
      QUMODE_REPRESENTATION_OPTIONS,
      DEFAULT_QUMODE_REPRESENTATION,
    ),
  }
}
