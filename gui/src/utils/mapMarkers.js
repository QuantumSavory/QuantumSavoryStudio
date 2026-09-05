export const INTERACTIVE_MAP_MARKER_SELECTOR = [
  '.node-marker',
  '.annotation-overlay',
  '.annotation-resize-handle',
].join(', ')

export const NODE_MARKER_DETAIL = Object.freeze({
  FULL: 'full',
  SLOTS: 'slots',
  DOT: 'dot',
})

const NAME_VISIBILITY_DISTANCE_SQUARED = 120 ** 2
const REGISTER_VISIBILITY_DISTANCE_SQUARED = 48 ** 2

export function isInteractiveMapMarkerTarget(target) {
  return Boolean(target?.closest?.(INTERACTIVE_MAP_MARKER_SELECTOR))
}

/** Assign marker detail from the nearest node in projected screen pixels. */
export function nodeMarkerDetailLevels(nodes, projectNode) {
  const labelsHidden = new Set()
  const registersCollapsed = new Set()
  const projectedNodes = nodes.flatMap(node => {
    const point = projectNode(node)
    return point ? [{ id: node.id, point }] : []
  })

  for (let index = 0; index < projectedNodes.length; index += 1) {
    const first = projectedNodes[index]
    for (let otherIndex = index + 1; otherIndex < projectedNodes.length; otherIndex += 1) {
      const second = projectedNodes[otherIndex]
      const xDistance = first.point.x - second.point.x
      const yDistance = first.point.y - second.point.y
      const distanceSquared = xDistance ** 2 + yDistance ** 2
      if (distanceSquared < NAME_VISIBILITY_DISTANCE_SQUARED) {
        labelsHidden.add(first.id)
        labelsHidden.add(second.id)
      }
      if (distanceSquared < REGISTER_VISIBILITY_DISTANCE_SQUARED) {
        registersCollapsed.add(first.id)
        registersCollapsed.add(second.id)
      }
    }
  }

  return new Map(nodes.map(node => [
    node.id,
    registersCollapsed.has(node.id)
      ? NODE_MARKER_DETAIL.DOT
      : labelsHidden.has(node.id)
        ? NODE_MARKER_DETAIL.SLOTS
        : NODE_MARKER_DETAIL.FULL,
  ]))
}
