export const SLOT_TYPE_CATALOG = Object.freeze([
  Object.freeze({ type: 'Qubit', doc: 'Qubit register.' }),
  Object.freeze({ type: 'Qumode', doc: 'Qumode register.' }),
])

/** Build the exact constructor-field shape served by the runtime catalog. */
export function constructorField({
  field,
  type,
  doc = '',
  required = false,
  min = null,
  max = null,
  kind,
  nullable,
}) {
  const metadata = { field, type, doc, required, min, max }
  if (kind !== undefined || nullable !== undefined) {
    metadata.kind = kind
    metadata.nullable = nullable
  }
  return metadata
}
