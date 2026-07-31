import { generateUUid } from './Utils'

export const DEFAULT_ANNOTATION_WIDTH_PIXELS = 240
export const DEFAULT_ANNOTATION_HEIGHT_PIXELS = 140
export const MIN_ANNOTATION_WIDTH_PIXELS = 80
export const MIN_ANNOTATION_HEIGHT_PIXELS = 60
export const DEFAULT_ANNOTATION_BACKGROUND_COLOR = '#ffffff'
export const DEFAULT_ANNOTATION_BORDER_COLOR = '#334155'
export const ANNOTATION_CORNERS = Object.freeze([
  'northwest',
  'northeast',
  'southeast',
  'southwest',
])

const CORNER_ALIASES = Object.freeze({
  nw: 'northwest',
  ne: 'northeast',
  se: 'southeast',
  sw: 'southwest',
})
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
const LONGITUDE_MIN = -180
const LONGITUDE_MAX = 180
const LATITUDE_MIN = -90
const LATITUDE_MAX = 90

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function finiteMapPosition(value) {
  const position = Array.isArray(value)
    ? value
    : [value?.lng ?? value?.longitude, value?.lat ?? value?.latitude]
  return position.length === 2 && position.every(Number.isFinite)
    ? position
    : null
}

function geographicPosition(value) {
  const position = finiteMapPosition(value)
  return position !== null
    && position[0] >= LONGITUDE_MIN
    && position[0] <= LONGITUDE_MAX
    && position[1] >= LATITUDE_MIN
    && position[1] <= LATITUDE_MAX
}

function clonePosition(value) {
  return [value[0], value[1]]
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value))
}

function wrapLongitude(longitude) {
  const wrapped = (
    ((longitude - LONGITUDE_MIN) % 360 + 360) % 360
  ) + LONGITUDE_MIN
  return wrapped === LONGITUDE_MIN && longitude > 0 ? LONGITUDE_MAX : wrapped
}

function interactiveMapPosition(value, referenceLongitude = null) {
  const position = finiteMapPosition(value)
  if (!position) return null
  const longitude = Number.isFinite(referenceLongitude)
    ? clamp(
      longitudeNearReference(position[0], referenceLongitude),
      LONGITUDE_MIN,
      LONGITUDE_MAX,
    )
    : wrapLongitude(position[0])
  return [
    longitude,
    clamp(position[1], LATITUDE_MIN, LATITUDE_MAX),
  ]
}

function longitudeNearReference(longitude, referenceLongitude) {
  return longitude + Math.round((referenceLongitude - longitude) / 360) * 360
}

function fitInterval(minimum, maximum, lowerLimit, upperLimit, period = null) {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum >= maximum) {
    return null
  }
  const width = maximum - minimum
  const extent = upperLimit - lowerLimit
  if (width > extent) return null
  if (width === extent) return [lowerLimit, upperLimit]

  let fittedMinimum = minimum
  let fittedMaximum = maximum
  if (period) {
    const periodsFromRange = Math.floor((fittedMinimum - lowerLimit) / period)
    fittedMinimum -= periodsFromRange * period
    fittedMaximum -= periodsFromRange * period
  }
  if (fittedMinimum < lowerLimit) {
    const shift = lowerLimit - fittedMinimum
    fittedMinimum += shift
    fittedMaximum += shift
  }
  if (fittedMaximum > upperLimit) {
    const shift = fittedMaximum - upperLimit
    fittedMinimum -= shift
    fittedMaximum -= shift
  }
  if (fittedMinimum < lowerLimit || fittedMaximum > upperLimit) return null
  return [fittedMinimum, fittedMaximum]
}

function interactiveAnnotationBounds(value) {
  if (!isRecord(value)) return null
  const longitude = fitInterval(
    value.west,
    value.east,
    LONGITUDE_MIN,
    LONGITUDE_MAX,
    360,
  )
  const latitude = fitInterval(
    value.south,
    value.north,
    LATITUDE_MIN,
    LATITUDE_MAX,
  )
  if (!longitude || !latitude) return null
  return {
    west: longitude[0],
    south: latitude[0],
    east: longitude[1],
    north: latitude[1],
  }
}

function cloneInteractiveAnnotation(annotation, updates = {}) {
  const bounds = updates.bounds ?? annotation.bounds
  const area = Object.hasOwn(updates, 'area') ? updates.area : annotation.area
  return {
    ...annotation,
    ...updates,
    bounds: { ...bounds },
    area: area == null ? null : { freeCorner: clonePosition(area.freeCorner) },
  }
}

function normalizeCorner(value) {
  const corner = CORNER_ALIASES[value] || value
  if (!ANNOTATION_CORNERS.includes(corner)) {
    throw new Error(`Annotation resize corner must be one of: ${ANNOTATION_CORNERS.join(', ')}`)
  }
  return corner
}

function finiteScreenDimension(value, fallback) {
  const resolved = value ?? fallback
  if (typeof resolved !== 'number' || !Number.isFinite(resolved) || resolved <= 0) {
    return null
  }
  return resolved
}

function projectedPoint(value) {
  const point = Array.isArray(value) ? value : [value?.x, value?.y]
  return point.length === 2 && point.every(Number.isFinite) ? point : null
}

function projectionAdapter(projection) {
  if (typeof projection?.project !== 'function' || typeof projection?.unproject !== 'function') {
    return null
  }
  return {
    project(position) {
      return projectedPoint(projection.project(position))
    },
    unproject(point) {
      return finiteMapPosition(projection.unproject(point))
    },
  }
}

function rectangleFeature(bounds, properties) {
  return {
    type: 'Feature',
    properties: { ...properties },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [bounds.west, bounds.south],
        [bounds.east, bounds.south],
        [bounds.east, bounds.north],
        [bounds.west, bounds.north],
        [bounds.west, bounds.south],
      ]],
    },
  }
}

/** Return a cloned, canonical annotation bounds object. */
export function normalizeAnnotationBounds(value, label = 'Annotation bounds') {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  const bounds = {
    west: value.west,
    south: value.south,
    east: value.east,
    north: value.north,
  }
  if (!Object.values(bounds).every(Number.isFinite)) {
    throw new Error(`${label} must contain finite west, south, east, and north values`)
  }
  if (bounds.west < -180 || bounds.east > 180
    || bounds.south < -90 || bounds.north > 90) {
    throw new Error(`${label} must be within valid longitude and latitude ranges`)
  }
  if (bounds.west >= bounds.east || bounds.south >= bounds.north) {
    throw new Error(`${label} must be canonical and non-empty`)
  }
  return bounds
}

/** Validate and clone one persisted annotation. */
export function normalizeAnnotation(value, label = 'Project annotation') {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  if (typeof value.id !== 'string' || !value.id.trim()) {
    throw new Error(`${label} requires a durable ID`)
  }
  if (typeof value.markdown !== 'string') {
    throw new Error(`${label} markdown must be a string`)
  }
  if (!HEX_COLOR.test(value.backgroundColor)) {
    throw new Error(`${label} backgroundColor must be a six-digit hex color`)
  }
  if (!HEX_COLOR.test(value.borderColor)) {
    throw new Error(`${label} borderColor must be a six-digit hex color`)
  }

  let area = null
  if (value.area != null) {
    if (!isRecord(value.area) || !geographicPosition(value.area.freeCorner)) {
      throw new Error(`${label} area must contain a valid freeCorner map position`)
    }
    area = { freeCorner: clonePosition(value.area.freeCorner) }
  }

  return {
    id: value.id,
    markdown: value.markdown,
    bounds: normalizeAnnotationBounds(value.bounds, `${label} bounds`),
    backgroundColor: value.backgroundColor.toLowerCase(),
    borderColor: value.borderColor.toLowerCase(),
    area,
  }
}

/** Validate and clone the persisted annotation collection. */
export function normalizeAnnotations(value) {
  if (!Array.isArray(value)) throw new Error('Project annotations must be an array')

  const ids = new Set()
  return value.map((annotation, index) => {
    const normalized = normalizeAnnotation(annotation, `Project annotation ${index + 1}`)
    if (ids.has(normalized.id)) {
      throw new Error(`Project contains duplicate annotation ID: ${normalized.id}`)
    }
    ids.add(normalized.id)
    return normalized
  })
}

/** Allocate an annotation ID which does not collide with the current project collection. */
export function generateAnnotationId(annotations = []) {
  const usedIds = new Set(
    Array.isArray(annotations)
      ? annotations.map(annotation => annotation?.id).filter(id => typeof id === 'string')
      : [],
  )
  const generatedId = generateUUid('annotation')
  let candidate = generatedId
  let suffix = 2
  while (usedIds.has(candidate)) {
    candidate = `${generatedId}_${suffix}`
    suffix += 1
  }
  return candidate
}

/** Construct one canonical annotation without retaining caller-owned nested objects. */
export function createAnnotation({
  id,
  markdown = '',
  bounds,
  backgroundColor = DEFAULT_ANNOTATION_BACKGROUND_COLOR,
  borderColor = DEFAULT_ANNOTATION_BORDER_COLOR,
  area = null,
  existingAnnotations = [],
} = {}) {
  return normalizeAnnotation({
    id: id || generateAnnotationId(existingAnnotations),
    markdown,
    bounds,
    backgroundColor,
    borderColor,
    area,
  })
}

export function annotationCenter(bounds) {
  const normalized = normalizeAnnotationBounds(bounds)
  return [
    (normalized.west + normalized.east) / 2,
    (normalized.south + normalized.north) / 2,
  ]
}

function areaAttachmentCorner(bounds, freeCorner) {
  const center = [
    (bounds.west + bounds.east) / 2,
    (bounds.south + bounds.north) / 2,
  ]
  const horizontalDisplacement = Math.abs(freeCorner[0] - center[0])
    / (bounds.east - bounds.west)
  const verticalDisplacement = Math.abs(freeCorner[1] - center[1])
    / (bounds.north - bounds.south)

  if (horizontalDisplacement >= verticalDisplacement) {
    return [
      freeCorner[0] < center[0] ? bounds.west : bounds.east,
      freeCorner[1] < center[1] ? bounds.north : bounds.south,
    ]
  }
  return [
    freeCorner[0] < center[0] ? bounds.east : bounds.west,
    freeCorner[1] < center[1] ? bounds.south : bounds.north,
  ]
}

export function annotationAreaBounds(annotation) {
  const bounds = interactiveAnnotationBounds(annotation?.bounds)
  if (!bounds) return null
  const center = [
    (bounds.west + bounds.east) / 2,
    (bounds.south + bounds.north) / 2,
  ]
  const freeCorner = interactiveMapPosition(annotation?.area?.freeCorner, center[0])
  if (!freeCorner) return null
  const sharedCorner = areaAttachmentCorner(bounds, freeCorner)
  const areaBounds = {
    west: Math.min(sharedCorner[0], freeCorner[0]),
    south: Math.min(sharedCorner[1], freeCorner[1]),
    east: Math.max(sharedCorner[0], freeCorner[0]),
    north: Math.max(sharedCorner[1], freeCorner[1]),
  }
  return areaBounds.west === areaBounds.east || areaBounds.south === areaBounds.north
    ? null
    : areaBounds
}

/** Choose a non-degenerate free corner, preferring an area outside the annotation. */
export function defaultAnnotationAreaFreeCorner(bounds) {
  const normalized = normalizeAnnotationBounds(bounds)
  const center = annotationCenter(normalized)
  const width = normalized.east - normalized.west
  const height = normalized.north - normalized.south
  const longitude = normalized.east < 180
    ? Math.min(180, normalized.east + width)
    : normalized.west > -180
      ? Math.max(-180, normalized.west - width)
      : center[0]
  const latitude = normalized.north < 90
    ? Math.min(90, normalized.north + height)
    : normalized.south > -90
      ? Math.max(-90, normalized.south - height)
      : center[1]
  return [longitude, latitude]
}

/** Attach an area with an independently persisted free corner. */
export function attachAnnotationArea(annotation, freeCorner = null) {
  const bounds = interactiveAnnotationBounds(annotation?.bounds)
  if (!bounds) return cloneInteractiveAnnotation(annotation)
  const centerLongitude = (bounds.west + bounds.east) / 2
  const resolvedFreeCorner = interactiveMapPosition(
    freeCorner ?? defaultAnnotationAreaFreeCorner(bounds),
    centerLongitude,
  )
  if (!resolvedFreeCorner) return cloneInteractiveAnnotation(annotation)
  return cloneInteractiveAnnotation(annotation, {
    bounds,
    area: { freeCorner: resolvedFreeCorner },
  })
}

/** Update only the attached area's free corner. */
export function setAnnotationAreaFreeCorner(annotation, freeCorner) {
  if (annotation?.area == null) {
    throw new Error('Annotation must have an attached area before its freeCorner can be updated')
  }
  return attachAnnotationArea(annotation, freeCorner)
}

/** Remove an attached area while retaining the annotation rectangle and content. */
export function detachAnnotationArea(annotation) {
  return cloneInteractiveAnnotation(annotation, { area: null })
}

/** Convert the annotation rectangle to a GeoJSON feature. */
export function annotationToGeoJSON(annotation) {
  const bounds = interactiveAnnotationBounds(annotation?.bounds)
  if (!bounds || typeof annotation?.id !== 'string' || !annotation.id) return null
  return rectangleFeature(bounds, {
    annotationId: annotation.id,
    kind: 'annotation',
  })
}

/** Convert an attached area to a GeoJSON feature, or null when none is attached. */
export function annotationAreaToGeoJSON(annotation) {
  const bounds = annotationAreaBounds(annotation)
  if (!bounds || typeof annotation?.id !== 'string' || !annotation.id) return null
  return rectangleFeature(bounds, {
    annotationId: annotation.id,
    kind: 'annotation-area',
  })
}

/** Translate geographic bounds while preserving size and clamping to the world extent. */
export function moveAnnotationBounds(bounds, delta) {
  const normalized = interactiveAnnotationBounds(bounds)
  if (!Array.isArray(delta) || delta.length !== 2 || !delta.every(Number.isFinite)) {
    return normalized ?? { ...bounds }
  }
  if (!normalized) return { ...bounds }
  const longitudeDelta = Math.max(
    LONGITUDE_MIN - normalized.west,
    Math.min(LONGITUDE_MAX - normalized.east, delta[0]),
  )
  const latitudeDelta = Math.max(
    LATITUDE_MIN - normalized.south,
    Math.min(LATITUDE_MAX - normalized.north, delta[1]),
  )
  return {
    west: normalized.west + longitudeDelta,
    south: normalized.south + latitudeDelta,
    east: normalized.east + longitudeDelta,
    north: normalized.north + latitudeDelta,
  }
}

/** Move an annotation while intentionally retaining an attached area's independent free corner. */
export function moveAnnotation(annotation, delta) {
  return cloneInteractiveAnnotation(annotation, {
    bounds: moveAnnotationBounds(annotation.bounds, delta),
  })
}

/**
 * Move an annotation body to a marker position, accepting MapLibre world-copy
 * longitudes and retaining the attached area's independent free corner.
 */
export function moveAnnotationToNorthwest(annotation, requestedPosition) {
  const bounds = interactiveAnnotationBounds(annotation?.bounds)
  const position = finiteMapPosition(requestedPosition)
  if (!bounds || !position) return cloneInteractiveAnnotation(annotation)
  const requestedWest = longitudeNearReference(position[0], bounds.west)
  return moveAnnotation(annotation, [
    requestedWest - bounds.west,
    clamp(position[1], LATITUDE_MIN, LATITUDE_MAX) - bounds.north,
  ])
}

/**
 * Resize one corner in screen space and enforce the shared minimum visible size.
 * The projection object may be a MapLibre map or a focused project/unproject adapter.
 */
export function resizeAnnotationBounds(bounds, cornerValue, requestedPosition, projection, options = {}) {
  const normalized = interactiveAnnotationBounds(bounds)
  const requestedMapPosition = finiteMapPosition(requestedPosition)
  if (!normalized || !requestedMapPosition) return normalized ?? { ...bounds }
  const corner = normalizeCorner(cornerValue)
  const adapter = projectionAdapter(projection)
  const minimumWidth = finiteScreenDimension(
    options.minimumWidthPixels,
    MIN_ANNOTATION_WIDTH_PIXELS,
  )
  const minimumHeight = finiteScreenDimension(
    options.minimumHeightPixels,
    MIN_ANNOTATION_HEIGHT_PIXELS,
  )
  if (!adapter || minimumWidth == null || minimumHeight == null) return { ...normalized }
  const isWest = corner.endsWith('west')
  const isNorth = corner.startsWith('north')
  const fixedPosition = [
    isWest ? normalized.east : normalized.west,
    isNorth ? normalized.south : normalized.north,
  ]
  const requested = [
    requestedMapPosition[0],
    clamp(requestedMapPosition[1], LATITUDE_MIN, LATITUDE_MAX),
  ]
  const fixedWorldPosition = [
    longitudeNearReference(fixedPosition[0], requested[0]),
    fixedPosition[1],
  ]
  const fixed = adapter.project(fixedWorldPosition)
  const requestedPoint = adapter.project(requested)
  if (!fixed || !requestedPoint) return { ...normalized }
  const moving = [
    isWest
      ? Math.min(requestedPoint[0], fixed[0] - minimumWidth)
      : Math.max(requestedPoint[0], fixed[0] + minimumWidth),
    isNorth
      ? Math.min(requestedPoint[1], fixed[1] - minimumHeight)
      : Math.max(requestedPoint[1], fixed[1] + minimumHeight),
  ]
  const resizedPosition = adapter.unproject(moving)
  if (!resizedPosition) return { ...normalized }
  return interactiveAnnotationBounds({
    west: isWest ? resizedPosition[0] : fixedWorldPosition[0],
    south: isNorth ? fixedPosition[1] : resizedPosition[1],
    east: isWest ? fixedWorldPosition[0] : resizedPosition[0],
    north: isNorth ? resizedPosition[1] : fixedPosition[1],
  }) ?? { ...normalized }
}

/** Resize an annotation while retaining all persisted content and its area's free corner. */
export function resizeAnnotation(annotation, corner, requestedPosition, projection, options = {}) {
  return cloneInteractiveAnnotation(annotation, {
    bounds: resizeAnnotationBounds(
      annotation.bounds,
      corner,
      requestedPosition,
      projection,
      options,
    ),
  })
}

/** Build geographic bounds for the standard screen-pixel annotation centered at a map point. */
export function annotationBoundsFromScreenCenter(centerPosition, projection, options = {}) {
  const centerMapPosition = finiteMapPosition(centerPosition)
  const adapter = projectionAdapter(projection)
  const width = finiteScreenDimension(
    options.widthPixels,
    DEFAULT_ANNOTATION_WIDTH_PIXELS,
  )
  const height = finiteScreenDimension(
    options.heightPixels,
    DEFAULT_ANNOTATION_HEIGHT_PIXELS,
  )
  if (!centerMapPosition || !adapter || width == null || height == null) return null
  const center = adapter.project(centerMapPosition)
  if (!center) return null
  const northwest = adapter.unproject([center[0] - width / 2, center[1] - height / 2])
  const southeast = adapter.unproject([center[0] + width / 2, center[1] + height / 2])
  if (!northwest || !southeast) return null
  return interactiveAnnotationBounds({
    west: northwest[0],
    south: southeast[1],
    east: southeast[0],
    north: northwest[1],
  })
}
