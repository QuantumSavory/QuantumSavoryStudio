/** Project the exact slot metadata catalog to the IDs stored in designs. */
export function slotTypeIds(catalog) {
  if (!Array.isArray(catalog)) return []
  return catalog
    .map(entry => entry?.type)
    .filter(type => typeof type === 'string' && type)
}
