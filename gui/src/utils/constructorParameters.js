import { isVariableReference } from '../models/Variable.js'
import {
  buildConstructorParameterInputOptions,
  inferParameterInputOption,
  parameterInputIsComplete,
  parameterInputOptionForVariable,
  parameterTypeSupportsVariableType,
  resolveParameterInputOption,
} from './parameterTypes.js'

function strictVariableReference(value) {
  if (!isVariableReference(value)) return false
  const keys = Object.keys(value).sort()
  return Boolean(value.id.trim()
    && keys.length === 2 && keys[0] === 'id' && keys[1] === 'kind'
  )
}

function constructorOptionForVariable(options, definition, variable) {
  if (!variable) return null
  const semanticType = variable.type
  if (!Object.hasOwn(variable, 'selectedType')) {
    const inferred = inferParameterInputOption(options, variable)
    if (
      inferred?.enabled
      && inferred.inputKind !== 'default'
      && parameterTypeSupportsVariableType(inferred.wireType, semanticType)
    ) return inferred
  }
  return parameterInputOptionForVariable(
    definition.type,
    definition,
    variable,
  )
}

function rejectConstructor(code, message, field = null) {
  const error = new Error(message)
  error.code = code
  error.field = field
  throw error
}

/** Validate one metadata-backed authoring or simulation constructor. */
export function validateConstructorDraft(
  definition,
  constructor = null,
  { identity = 'name', resolveVariable = null } = {},
) {
  if (
    definition == null
    || typeof definition !== 'object'
    || typeof definition.type !== 'string'
    || !definition.type
  ) {
    rejectConstructor(
      'CONSTRUCTOR_CATALOG_INVALID',
      'A runtime constructor definition is required.',
    )
  }
  if (!Array.isArray(definition.parameters)) {
    rejectConstructor(
      'CONSTRUCTOR_CATALOG_INVALID',
      `Runtime metadata for ${definition.type} has no parameter list.`,
    )
  }
  for (const parameter of definition.parameters) {
    if (typeof parameter?.required !== 'boolean') {
      rejectConstructor(
        'CONSTRUCTOR_CATALOG_INVALID',
        'Runtime constructor metadata requires Boolean required fields.',
        parameter?.field || null,
      )
    }
  }

  const parameters = constructor == null ? [] : constructor.parameters
  if (!Array.isArray(parameters)) {
    rejectConstructor(
      'CONSTRUCTOR_PARAMETERS_INVALID',
      `The ${definition.type} constructor has no parameter list.`,
    )
  }

  const definitionsByName = new Map(
    definition.parameters.map(parameter => [parameter?.field, parameter]),
  )
  const supplied = new Set()
  for (const parameter of parameters) {
    const field = parameter?.[identity]
    if (typeof field !== 'string' || !field) {
      rejectConstructor(
        'CONSTRUCTOR_FIELD_NAME_INVALID',
        'A constructor field is missing its name.',
      )
    }
    if (supplied.has(field)) {
      rejectConstructor(
        'CONSTRUCTOR_FIELD_DUPLICATE',
        `Constructor field ${field} is duplicated.`,
        field,
      )
    }
    supplied.add(field)

    const parameterDefinition = definitionsByName.get(field)
    if (!parameterDefinition) {
      rejectConstructor(
        'CONSTRUCTOR_FIELD_UNKNOWN',
        `Constructor field ${field} is unknown.`,
        field,
      )
    }
    if (parameter.error) {
      rejectConstructor(
        'CONSTRUCTOR_FIELD_INVALID',
        `Constructor field ${field} has a validation error.`,
        field,
      )
    }

    const options = buildConstructorParameterInputOptions(
      parameterDefinition.type,
      parameterDefinition,
    )

    if (strictVariableReference(parameter.value)) {
      if (typeof resolveVariable !== 'function') continue
      const variable = resolveVariable(parameter.value.id)
      const option = constructorOptionForVariable(options, parameterDefinition, variable)
      if (!variable || !option) {
        rejectConstructor(
          parameterDefinition.required
            ? 'CONSTRUCTOR_REQUIRED_PARAMETER_MISSING'
            : 'CONSTRUCTOR_FIELD_INVALID',
          parameterDefinition.required
            ? `Constructor field ${field} is required.`
            : `Constructor field ${field} uses an unavailable Variable.`,
          field,
        )
      }
      if (!parameterInputIsComplete(option, {
        ...variable,
        selectedType: option.id,
        min: parameterDefinition.min,
        max: parameterDefinition.max,
      })) {
        rejectConstructor(
          parameterDefinition.required
            ? 'CONSTRUCTOR_REQUIRED_PARAMETER_MISSING'
            : 'CONSTRUCTOR_FIELD_INVALID',
          `Constructor field ${field} uses an incomplete Variable.`,
          field,
        )
      }
      continue
    }

    const selection = resolveParameterInputOption(options, parameter)
    const option = selection.option
    if (!option || !option.enabled) {
      const status = option ? 'disabled' : 'unknown'
      rejectConstructor(
        'CONSTRUCTOR_FIELD_INVALID',
        `Constructor field ${field} uses a ${status} input option.`,
        field,
      )
    }
    if (selection.contradictory) {
      rejectConstructor(
        'CONSTRUCTOR_FIELD_INVALID',
        `Constructor field ${field} selects ${option.id}, which does not match intrinsic value ${parameter.value}.`,
        field,
      )
    }
    if (!parameterInputIsComplete(option, parameter)) {
      rejectConstructor(
        parameterDefinition.required
          ? 'CONSTRUCTOR_REQUIRED_PARAMETER_MISSING'
          : 'CONSTRUCTOR_FIELD_INVALID',
        `Constructor field ${field} requires a complete ${option.label} value.`,
        field,
      )
    }
  }

  for (const parameterDefinition of definition.parameters) {
    if (parameterDefinition.required && !supplied.has(parameterDefinition.field)) {
      rejectConstructor(
        'CONSTRUCTOR_REQUIRED_PARAMETER_MISSING',
        `Constructor field ${parameterDefinition.field} is required.`,
        parameterDefinition.field,
      )
    }
  }
  return true
}

/**
 * Create the durable authoring draft for one runtime constructor field.
 * Runtime-only documentation, bounds, and requiredness stay in the catalog.
 */
export function createConstructorParameterDraft(
  definition,
  { identity = 'name' } = {},
) {
  const field = definition?.field
  if (typeof field !== 'string' || !field) {
    throw new Error('Runtime constructor metadata contains a field without a name.')
  }
  const options = buildConstructorParameterInputOptions(definition.type, definition)
  return {
    [identity]: field,
    type: Array.isArray(definition.type) ? [...definition.type] : definition.type,
    selectedType: definition.required ? options[0]?.id || '' : 'default',
    value: null,
  }
}

export function createConstructorParameterDrafts(
  definition,
  options = {},
) {
  if (!Array.isArray(definition?.parameters)) {
    throw new Error('Runtime constructor metadata has no parameter list.')
  }
  return definition.parameters.map(parameter => (
    createConstructorParameterDraft(parameter, options)
  ))
}
