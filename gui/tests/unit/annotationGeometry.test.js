// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_ANNOTATION_HEIGHT_PIXELS,
  DEFAULT_ANNOTATION_WIDTH_PIXELS,
  MIN_ANNOTATION_HEIGHT_PIXELS,
  MIN_ANNOTATION_WIDTH_PIXELS,
  annotationAreaBounds,
  annotationAreaToGeoJSON,
  annotationBoundsFromScreenCenter,
  annotationToGeoJSON,
  attachAnnotationArea,
  createAnnotation,
  defaultAnnotationAreaFreeCorner,
  detachAnnotationArea,
  generateAnnotationId,
  moveAnnotation,
  moveAnnotationToNorthwest,
  normalizeAnnotation,
  normalizeAnnotations,
  resizeAnnotation,
  setAnnotationAreaFreeCorner,
} from '../../src/utils/annotationGeometry'

const projection = {
  project: ([longitude, latitude]) => [longitude * 10, -latitude * 10],
  unproject: ([x, y]) => [x / 10, -y / 10],
}

function annotation(overrides = {}) {
  return {
    id: 'annotation_1',
    markdown: '**Network note**',
    bounds: { west: -2, south: -1, east: 2, north: 1 },
    backgroundColor: '#FFFFFF',
    borderColor: '#123AbC',
    area: null,
    ...overrides,
  }
}

function sharedBoundaryLengths(annotationBounds, areaBounds) {
  if (!areaBounds) return []
  const latitudeOverlap = Math.max(0, Math.min(annotationBounds.north, areaBounds.north)
    - Math.max(annotationBounds.south, areaBounds.south))
  const longitudeOverlap = Math.max(0, Math.min(annotationBounds.east, areaBounds.east)
    - Math.max(annotationBounds.west, areaBounds.west))
  const sharedLengths = []
  const sharesVerticalBoundary = [areaBounds.west, areaBounds.east]
    .some(longitude => (
      longitude === annotationBounds.west || longitude === annotationBounds.east
    ))
  if (latitudeOverlap > 0 && sharesVerticalBoundary) {
    sharedLengths.push(latitudeOverlap)
  }
  if (longitudeOverlap > 0 && [areaBounds.south, areaBounds.north]
    .some(latitude => latitude === annotationBounds.south || latitude === annotationBounds.north)) {
    sharedLengths.push(longitudeOverlap)
  }
  return sharedLengths
}

afterEach(() => vi.restoreAllMocks())

describe('annotation persistence contract', () => {
  it('normalizes a strict cloned schema without mutating its input', () => {
    const raw = annotation({
      area: { freeCorner: [4, 3] },
      transient: true,
    })
    const original = structuredClone(raw)

    const normalized = normalizeAnnotation(raw)

    expect(normalized).toEqual({
      id: 'annotation_1',
      markdown: '**Network note**',
      bounds: { west: -2, south: -1, east: 2, north: 1 },
      backgroundColor: '#ffffff',
      borderColor: '#123abc',
      area: { freeCorner: [4, 3] },
    })
    expect(normalized.bounds).not.toBe(raw.bounds)
    expect(normalized.area).not.toBe(raw.area)
    expect(raw).toEqual(original)
  })

  it('requires a collection and rejects duplicate durable IDs', () => {
    expect(() => normalizeAnnotations()).toThrow(/must be an array/)
    expect(() => normalizeAnnotations(null)).toThrow(/must be an array/)
    expect(() => normalizeAnnotations({})).toThrow(/must be an array/)
    expect(() => normalizeAnnotations([annotation(), annotation()]))
      .toThrow(/duplicate annotation ID/)
  })

  it.each([
    [{ id: '' }, /durable ID/],
    [{ markdown: null }, /markdown must be a string/],
    [{ bounds: { west: 2, south: -1, east: -2, north: 1 } }, /canonical and non-empty/],
    [{ bounds: { west: -181, south: -1, east: 2, north: 1 } }, /longitude and latitude/],
    [{ backgroundColor: '#fff' }, /six-digit hex color/],
    [{ borderColor: '123abc' }, /six-digit hex color/],
    [{ area: {} }, /valid freeCorner/],
    [{ area: { freeCorner: [181, 0] } }, /valid freeCorner/],
  ])('rejects malformed annotation data %#', (override, message) => {
    expect(() => normalizeAnnotation(annotation(override))).toThrow(message)
  })

  it('constructs independent annotations and allocates collision-free IDs', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(generateAnnotationId([{ id: 'annotation_000000' }])).toBe('annotation_000000_2')

    const bounds = { west: -1, south: -1, east: 1, north: 1 }
    const created = createAnnotation({ bounds })
    expect(created).toMatchObject({
      id: 'annotation_000000',
      markdown: '',
      backgroundColor: '#ffffff',
      borderColor: '#334155',
      area: null,
    })
    expect(created.bounds).not.toBe(bounds)
  })
})

describe('annotation geometry', () => {
  it('converts annotation and attached-area rectangles to GeoJSON', () => {
    const value = annotation({ area: { freeCorner: [4, 3] } })

    expect(annotationToGeoJSON(value)).toMatchObject({
      type: 'Feature',
      properties: { annotationId: 'annotation_1', kind: 'annotation' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-2, -1],
          [2, -1],
          [2, 1],
          [-2, 1],
          [-2, -1],
        ]],
      },
    })
    expect(annotationAreaBounds(value)).toEqual({ west: -2, south: 1, east: 4, north: 3 })
    expect(annotationAreaToGeoJSON(value)?.properties.kind).toBe('annotation-area')
    expect(annotationAreaToGeoJSON(annotation())).toBeNull()
    expect(annotationAreaToGeoJSON(annotation({
      area: { freeCorner: [2, 1] },
    }))).toBeNull()
    expect(annotationAreaToGeoJSON({
      ...value,
      id: '',
    })).toBeNull()
  })

  it.each([
    ['northwest horizontal', [-5, 2], { west: -5, south: -1, east: -2, north: 2 }],
    ['northeast vertical', [3, 3], { west: -2, south: 1, east: 3, north: 3 }],
    ['southeast horizontal', [5, -2], { west: 2, south: -2, east: 5, north: 1 }],
    ['southwest vertical', [-3, -3], { west: -3, south: -3, east: 2, north: -1 }],
  ])('uses normalized dominant-axis attachment in the %s quadrant', (
    _label,
    freeCorner,
    expectedArea,
  ) => {
    const value = annotation({ area: { freeCorner } })

    expect(annotationAreaBounds(value)).toEqual(expectedArea)
    expect(Math.max(...sharedBoundaryLengths(value.bounds, expectedArea))).toBeGreaterThan(0)
  })

  it.each([
    [[4, 2], { west: 2, south: -1, east: 4, north: 2 }],
    [[-4, -2], { west: -4, south: -2, east: -2, north: 1 }],
  ])('prioritizes horizontal attachment for normalized ties at %j', (
    freeCorner,
    expectedArea,
  ) => {
    expect(annotationAreaBounds(annotation({ area: { freeCorner } }))).toEqual(expectedArea)
  })

  it.each([
    [[4, 0.5], { west: 2, south: -1, east: 4, north: 0.5 }],
    [[-1, 3], { west: -1, south: 1, east: 2, north: 3 }],
  ])('shares a positive edge segment for an inside tangent coordinate %j', (
    freeCorner,
    expectedArea,
  ) => {
    const value = annotation({ area: { freeCorner } })
    const areaBounds = annotationAreaBounds(value)

    expect(areaBounds).toEqual(expectedArea)
    expect(Math.max(...sharedBoundaryLengths(value.bounds, areaBounds))).toBeGreaterThan(0)
  })

  it.each([
    [[5, 1], 2],
    [[-5, -2], 2],
    [[2, 3], 4],
    [[-3, -3], 4],
  ])('shares the complete annotation edge when tangent coordinate %j reaches or passes its span', (
    freeCorner,
    expectedLength,
  ) => {
    const value = annotation({ area: { freeCorner } })
    const areaBounds = annotationAreaBounds(value)

    expect(Math.max(...sharedBoundaryLengths(value.bounds, areaBounds))).toBe(expectedLength)
  })

  it('handles exact centers, edges, and corners without a corner-only rectangle', () => {
    const bounds = annotation().bounds
    for (const freeCorner of [[0, 0], [5, 0], [0, 3]]) {
      const areaBounds = annotationAreaBounds(annotation({ area: { freeCorner } }))
      expect(areaBounds).not.toBeNull()
      expect(Math.max(...sharedBoundaryLengths(bounds, areaBounds))).toBeGreaterThan(0)
    }

    for (const freeCorner of [
      [2, 0], [-2, 0], [0, 1], [0, -1],
      [2, 1], [2, -1], [-2, 1], [-2, -1],
    ]) {
      expect(annotationAreaBounds(annotation({ area: { freeCorner } }))).toBeNull()
    }

    expect(annotationAreaBounds(annotation({
      bounds: { west: 2, south: -1, east: 2, north: 1 },
      area: { freeCorner: [4, 3] },
    }))).toBeNull()
  })

  it.each([
    [
      { west: 160, south: 70, east: 170, north: 80 },
      [-175, 85],
      { west: 170, south: 70, east: 180, north: 85 },
    ],
    [
      { west: -170, south: 70, east: -160, north: 80 },
      [175, 85],
      { west: -180, south: 70, east: -170, north: 85 },
    ],
  ])('selects a world-wrap-aware edge for dateline bounds %#', (
    bounds,
    freeCorner,
    expectedArea,
  ) => {
    const areaBounds = annotationAreaBounds(annotation({ bounds, area: { freeCorner } }))

    expect(areaBounds).toEqual(expectedArea)
    expect(Math.max(...sharedBoundaryLengths(bounds, areaBounds)))
      .toBe(bounds.north - bounds.south)
  })

  it('owns area attachment, free-corner updates, and detachment', () => {
    const value = annotation()
    const freeCorner = [4, 3]
    const attached = attachAnnotationArea(value, freeCorner)
    expect(attached.area).toEqual({ freeCorner: [4, 3] })
    expect(attached.area.freeCorner).not.toBe(freeCorner)

    const movedCorner = setAnnotationAreaFreeCorner(attached, [-4, 3])
    expect(movedCorner.area).toEqual({ freeCorner: [-4, 3] })
    expect(annotationAreaBounds(movedCorner)).toEqual({ west: -4, south: 1, east: 2, north: 3 })
    expect(detachAnnotationArea(movedCorner).area).toBeNull()
    expect(() => setAnnotationAreaFreeCorner(value, [4, 3])).toThrow(/attached area/)

    expect(defaultAnnotationAreaFreeCorner(value.bounds)).toEqual([6, 3])
    expect(attachAnnotationArea(value).area).toEqual({ freeCorner: [6, 3] })
    expect(annotationAreaToGeoJSON(attachAnnotationArea(value))).not.toBeNull()
  })

  it('moves within geographic limits while retaining the independent free corner', () => {
    const value = annotation({
      bounds: { west: 160, south: 70, east: 170, north: 80 },
      area: { freeCorner: [150, 60] },
    })

    const moved = moveAnnotation(value, [50, 50])
    expect(moved.bounds).toEqual({ west: 170, south: 80, east: 180, north: 90 })
    expect(moved.area).toEqual({ freeCorner: [150, 60] })
    expect(moved.area).not.toBe(value.area)
  })

  it('canonicalizes world-wrapped marker positions without throwing during interaction', () => {
    const value = annotation({ area: { freeCorner: [4, 3] } })

    expect(annotationBoundsFromScreenCenter([360, 0], projection)).toEqual({
      west: -12,
      south: -7,
      east: 12,
      north: 7,
    })
    expect(moveAnnotationToNorthwest(value, [359, 2]).bounds).toEqual({
      west: -1,
      south: 0,
      east: 3,
      north: 2,
    })
    expect(setAnnotationAreaFreeCorner(value, [364, 95]).area.freeCorner).toEqual([4, 90])
    expect(setAnnotationAreaFreeCorner(annotation({
      bounds: { west: 160, south: 70, east: 170, north: 80 },
      area: { freeCorner: [175, 85] },
    }), [190, 85]).area.freeCorner).toEqual([180, 85])

    const resized = resizeAnnotation(
      annotation({ bounds: { west: 160, south: 70, east: 170, north: 80 } }),
      'southeast',
      [190, 60],
      projection,
    )
    expect(resized.bounds).toEqual({ west: 150, south: 60, east: 180, north: 80 })
    expect(() => normalizeAnnotation(resized)).not.toThrow()
  })

  it('fails soft for invalid interactive projection results', () => {
    const value = annotation()
    const brokenProjection = {
      project: () => ({ x: Number.NaN, y: 0 }),
      unproject: () => ({ lng: Number.NaN, lat: 0 }),
    }

    expect(annotationBoundsFromScreenCenter([0, 0], brokenProjection)).toBeNull()
    expect(resizeAnnotation(value, 'southeast', [2, -1], brokenProjection)).toEqual(value)
    expect(annotationToGeoJSON({ ...value, bounds: { west: 2, east: -2 } })).toBeNull()
  })

  it('enforces the centralized minimum visible size while resizing', () => {
    const value = annotation({
      bounds: { west: 0, south: 0, east: 20, north: 10 },
      area: { freeCorner: [30, 20] },
    })
    const resized = resizeAnnotation(value, 'northwest', [19, 1], projection)

    expect(MIN_ANNOTATION_WIDTH_PIXELS).toBe(80)
    expect(MIN_ANNOTATION_HEIGHT_PIXELS).toBe(60)
    expect(resized.bounds).toEqual({ west: 12, south: 0, east: 20, north: 6 })
    expect(resized.area).toEqual({ freeCorner: [30, 20] })
  })

  it('builds the standard 240 by 140 screen-pixel creation bounds', () => {
    expect(DEFAULT_ANNOTATION_WIDTH_PIXELS).toBe(240)
    expect(DEFAULT_ANNOTATION_HEIGHT_PIXELS).toBe(140)
    expect(annotationBoundsFromScreenCenter([0, 0], projection)).toEqual({
      west: -12,
      south: -7,
      east: 12,
      north: 7,
    })
  })
})
