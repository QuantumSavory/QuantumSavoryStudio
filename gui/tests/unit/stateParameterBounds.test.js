// @vitest-environment node

import { describe, expect, it } from 'vitest'

import {
  formatStateParameterRange,
  normalizeStateParameter,
  stateParameterValueIsValid,
} from '../../src/utils/stateParameterBounds.js'

const genqoEta = {
  name: 'η',
  type: 'Float64',
  integer: false,
  doc: 'Detector efficiency.',
  min: 0,
  max: 1,
  min_inclusive: false,
  max_inclusive: true,
  good: 0.5,
}

describe('States Zoo parameter bounds', () => {
  it('preserves inclusive flags and rejects a Genqo open endpoint', () => {
    const normalized = normalizeStateParameter(genqoEta)
    expect(normalized).toEqual({
      name: 'η',
      type: 'Float64',
      integer: false,
      doc: 'Detector efficiency.',
      min: 0,
      max: 1,
      minInclusive: false,
      maxInclusive: true,
      good: 0.5,
    })
    expect(formatStateParameterRange(normalized)).toBe('(0, 1]')
    expect(stateParameterValueIsValid(0, normalized)).toBe(false)
    expect(stateParameterValueIsValid(Number.MIN_VALUE, normalized)).toBe(true)
    expect(stateParameterValueIsValid(1, normalized)).toBe(true)
  })

  it('applies closed lower and open upper bounds', () => {
    const upperOpen = {
      name: 'p',
      type: 'Float64',
      integer: false,
      doc: 'Noise probability.',
      min: 0,
      max: 1,
      min_inclusive: true,
      max_inclusive: false,
      good: 0.5,
    }
    const normalized = normalizeStateParameter(upperOpen)
    expect(formatStateParameterRange(normalized)).toBe('[0, 1)')
    expect(stateParameterValueIsValid(0, normalized)).toBe(true)
    expect(stateParameterValueIsValid(1, normalized)).toBe(false)
    expect(stateParameterValueIsValid(0.5, normalized)).toBe(true)
  })

  it('rejects coercible non-number JSON values', () => {
    const normalized = normalizeStateParameter(genqoEta)
    for (const value of ['0.5', true, [0.5], null]) {
      expect(stateParameterValueIsValid(value, normalized)).toBe(false)
    }
  })

  it('requires exact integer values for Int metadata', () => {
    const parity = {
      name: 'm',
      type: 'Int',
      integer: true,
      doc: 'Detector-click parity.',
      min: 0,
      max: 1,
      min_inclusive: true,
      max_inclusive: true,
      good: 0,
    }
    const normalized = normalizeStateParameter(parity)

    expect(stateParameterValueIsValid(0, normalized)).toBe(true)
    expect(stateParameterValueIsValid(1, normalized)).toBe(true)
    for (const value of [
      0.5,
      1.5,
      true,
      '1',
      Number.NaN,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(stateParameterValueIsValid(value, normalized)).toBe(false)
    }
  })

  it('rejects malformed or unsupported parameter metadata', () => {
    expect(() => normalizeStateParameter({ ...genqoEta, type: '' }))
      .toThrow('type must be a nonempty string')
    expect(() => normalizeStateParameter({ ...genqoEta, integer: 'false' }))
      .toThrow('integer must be a Boolean')
    expect(() => normalizeStateParameter({ ...genqoEta, min_inclusive: 'false' }))
      .toThrow('min_inclusive must be a Boolean')
    expect(() => normalizeStateParameter({ ...genqoEta, good: Number.POSITIVE_INFINITY }))
      .toThrow('good must be a finite number')
    expect(() => normalizeStateParameter({
      ...genqoEta,
      type: 'Int',
      integer: true,
      max: Number.MAX_SAFE_INTEGER + 1,
    })).toThrow('max must be a safe integer')
  })

  it('accepts backend-declared concrete floating types without a name allowlist', () => {
    const float32 = normalizeStateParameter({
      ...genqoEta,
      type: 'Float32',
      good: 0.5,
    })

    expect(float32.type).toBe('Float32')
    expect(float32.integer).toBe(false)
    expect(stateParameterValueIsValid(0.25, float32)).toBe(true)
  })
})
