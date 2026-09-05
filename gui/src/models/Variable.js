import { generateUUid } from '../utils/Utils'

export const VARIABLE_REFERENCE_KIND = 'variable'
export const STATES_ZOO_VALUE_KIND = 'states_zoo'
export const NUMERIC_EXPRESSION_VALUE_KIND = 'numeric_expression'

export default class Variable {
  constructor({
    id = generateUUid('variable'),
    name = '',
    type = 'Float64',
    value = 0,
    statesZooTraceSourceId = null
  } = {}) {
    this.id = id
    this.name = name
    this.type = type
    this.value = value
    if (typeof statesZooTraceSourceId === 'string' && statesZooTraceSourceId) {
      this.statesZooTraceSourceId = statesZooTraceSourceId
    }
  }

  toJSON() {
    const serialized = {
      id: this.id,
      name: this.name,
      type: this.type,
      value: this.value
    }
    if (typeof this.statesZooTraceSourceId === 'string' && this.statesZooTraceSourceId) {
      serialized.statesZooTraceSourceId = this.statesZooTraceSourceId
    }
    return serialized
  }
}

export class VariableReference {
  constructor(id) {
    this.kind = VARIABLE_REFERENCE_KIND
    this.id = id
  }

  toJSON() {
    return {
      kind: this.kind,
      id: this.id
    }
  }
}

export function isVariableReference(value) {
  return value !== null
    && typeof value === 'object'
    && value.kind === VARIABLE_REFERENCE_KIND
    && typeof value.id === 'string'
}

/**
 * Return whether a value is the complete, durable numeric-expression tag.
 *
 * This intentionally rejects extra keys. Evaluation results and assignment
 * context are transient UI state and must never cross a project or simulator
 * codec boundary.
 */
export function isNumericExpressionValue(value) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || value.kind !== NUMERIC_EXPRESSION_VALUE_KIND
    || typeof value.source !== 'string'
    || !value.source.trim()
  ) {
    return false
  }
  const keys = Object.keys(value).sort()
  return keys.length === 2 && keys[0] === 'kind' && keys[1] === 'source'
}

export function createNumericExpressionValue(source) {
  return {
    kind: NUMERIC_EXPRESSION_VALUE_KIND,
    source: String(source ?? ''),
  }
}

export function isStatesZooValue(value) {
  return value !== null
    && typeof value === 'object'
    && value.kind === STATES_ZOO_VALUE_KIND
    && typeof value.state_type === 'string'
    && value.parameters !== null
    && typeof value.parameters === 'object'
    && !Array.isArray(value.parameters)
}

export function isStatesZooVariable(variable) {
  return isStatesZooValue(variable?.value)
}

export function isStatesZooTraceVariable(variable) {
  const sourceId = variable?.statesZooTraceSourceId
  return typeof sourceId === 'string'
    && sourceId.length > 0
    && variable?.id === `${sourceId}_tr`
}

export function isStatesZooParameterSourceVariable(variable) {
  const value = variable?.value
  if (
    isStatesZooVariable(variable)
    || isStatesZooTraceVariable(variable)
    || !['Float64', 'Int64'].includes(variable?.type)
    || typeof value !== 'number'
    || !Number.isFinite(value)
    || (Number.isInteger(value) && Math.abs(value) > Number.MAX_SAFE_INTEGER)
  ) {
    return false
  }
  return variable.type !== 'Int64' || Number.isInteger(value)
}

export function statesZooValueReferencesVariable(value, variableId) {
  return isStatesZooValue(value) && Object.values(value.parameters).some(parameter => (
    isVariableReference(parameter) && parameter.id === variableId
  ))
}

export function referencedStatesZooParameterVariables(value, variables = []) {
  if (!isStatesZooValue(value)) return []
  const referencedIds = new Set(Object.values(value.parameters)
    .filter(isVariableReference)
    .map(parameter => parameter.id))
  return variables.filter(variable => referencedIds.has(variable.id))
}

export function isVariableReferenced(projectData, variableId) {
  if ((projectData?.variables || []).some(variable => (
    statesZooValueReferencesVariable(variable?.value, variableId)
  ))) return true

  const net = projectData?.net
  if (!net) return false

  const protocols = [
    ...(net.protocols || []),
    ...(net.nodes || []).flatMap(node => node.data?.protocols || []),
    ...(net.edges || []).flatMap(edge => edge.data?.protocols || [])
  ]

  if (protocols.some(protocol => (
    (protocol.parameters || []).some(parameter => (
      (isVariableReference(parameter.value) && parameter.value.id === variableId)
      || statesZooValueReferencesVariable(parameter.value, variableId)
    ))
  ))) return true

  const slots = [
    ...(net.nodes || []).flatMap(node => node.data?.slots || []),
    ...(net.physicalConfig?.nodeTemplate?.slots || []),
  ]
  return slots.some(slot => (
    (slot.backgroundNoise?.parameters || []).some(parameter => (
      (isVariableReference(parameter.value) && parameter.value.id === variableId)
      || statesZooValueReferencesVariable(parameter.value, variableId)
    ))
  ))
}
