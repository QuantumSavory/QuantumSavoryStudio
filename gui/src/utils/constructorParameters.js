import { buildConstructorParameterInputOptions } from './parameterTypes.js'

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
