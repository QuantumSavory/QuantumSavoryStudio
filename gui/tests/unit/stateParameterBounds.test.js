// @vitest-environment node

import { describe, expect, it } from 'vitest'

import {
  formatStateParameterRange,
  normalizeStateParameter,
  stateParameterValueIsValid,
} from '../../src/utils/stateParameterBounds.js'

const genqoEta = {
  name: 'η',
  min: 0,
  max: 1,
  min_inclusive: false,
  max_inclusive: true,
  good: 0.5,
}

describe('States Zoo parameter bounds', () => {
  it('preserves inclusive flags and rejects a Genqo open endpoint', () => {
    expect(normalizeStateParameter(genqoEta)).toEqual({
      name: 'η',
      min: 0,
      max: 1,
      minInclusive: false,
      maxInclusive: true,
      good: 0.5,
    })
    expect(formatStateParameterRange(genqoEta)).toBe('(0, 1]')
    expect(stateParameterValueIsValid(0, genqoEta)).toBe(false)
    expect(stateParameterValueIsValid(Number.MIN_VALUE, genqoEta)).toBe(true)
    expect(stateParameterValueIsValid(1, genqoEta)).toBe(true)
  })

  it('applies closed lower and open upper bounds', () => {
    const upperOpen = {
      name: 'p',
      min: 0,
      max: 1,
      min_inclusive: true,
      max_inclusive: false,
      good: 0.5,
    }
    expect(formatStateParameterRange(upperOpen)).toBe('[0, 1)')
    expect(stateParameterValueIsValid(0, upperOpen)).toBe(true)
    expect(stateParameterValueIsValid(1, upperOpen)).toBe(false)
    expect(stateParameterValueIsValid(0.5, upperOpen)).toBe(true)
  })
})
