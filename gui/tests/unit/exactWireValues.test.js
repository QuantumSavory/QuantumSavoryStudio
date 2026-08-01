import { describe, expect, it, vi } from 'vitest'

import {
  ExactJsonValueError,
  cloneExactJsonValue,
  cloneExactOpaqueJsonValue,
} from '../../src/utils/exactWireValues.js'

describe('exact wire JSON values', () => {
  it('clones finite acyclic JSON without sharing nested identities', () => {
    const shared = { key: true }
    const source = { array: [null, false, 1.5, 'value'], nested: shared, shared }
    const clone = cloneExactJsonValue(source)

    expect(clone).toEqual(source)
    expect(clone).not.toBe(source)
    expect(clone.array).not.toBe(source.array)
    expect(clone.nested).not.toBe(source.nested)
    expect(clone.nested).not.toBe(clone.shared)
  })

  it('preserves an own __proto__ JSON field without changing the clone prototype', () => {
    const source = JSON.parse('{"__proto__":{"polluted":true},"value":1}')
    const clone = cloneExactJsonValue(source)

    expect(Object.getPrototypeOf(clone)).toBe(Object.prototype)
    expect(Object.hasOwn(clone, '__proto__')).toBe(true)
    expect(clone.__proto__).toEqual({ polluted: true })
    expect(clone.__proto__).not.toBe(source.__proto__)
    expect(clone.polluted).toBeUndefined()
  })

  it('rejects every non-JSON runtime shape with a precise pointer', () => {
    const cycle = { nested: {} }
    cycle.nested.parent = cycle
    const accessor = {}
    Object.defineProperty(accessor, 'value', { enumerable: true, get: () => 1 })
    const sparse = Array(1)
    const nonEnumerable = { visible: true }
    Object.defineProperty(nonEnumerable, 'hidden', { value: true })
    const customArray = [1]
    customArray.extra = 2
    const arrayAccessor = [1]
    Object.defineProperty(arrayAccessor, '0', { enumerable: true, get: () => 1 })
    const symbolKey = { value: 1 }
    symbolKey[Symbol('hidden')] = 2

    const cases = [
      [{ value: Number.NaN }, '/value'],
      [{ value: Number.POSITIVE_INFINITY }, '/value'],
      [{ value: undefined }, '/value'],
      [{ value: () => true }, '/value'],
      [{ value: Symbol('value') }, '/value'],
      [{ value: 1n }, '/value'],
      [new Date(), '/'],
      [cycle, '/nested/parent'],
      [accessor, '/value'],
      [sparse, '/0'],
      [nonEnumerable, '/hidden'],
      [customArray, '/'],
      [arrayAccessor, '/0'],
      [symbolKey, '/'],
    ]
    for (const [value, path] of cases) {
      let error
      try {
        cloneExactJsonValue(value)
      } catch (caught) {
        error = caught
      }
      expect(error).toBeInstanceOf(ExactJsonValueError)
      expect(error.path).toBe(path)
    }
  })

  it('does not invoke inherited constructor accessors while reporting a prototype error', () => {
    const constructorGetter = vi.fn(() => Object)
    const prototype = {}
    Object.defineProperty(prototype, 'constructor', { get: constructorGetter })
    const value = Object.create(prototype)

    expect(() => cloneExactJsonValue(value)).toThrow(ExactJsonValueError)
    expect(constructorGetter).not.toHaveBeenCalled()
  })

  it('forbids kind discriminators at every opaque depth', () => {
    expect(() => cloneExactOpaqueJsonValue({ kind: 'variable', id: 'v' }))
      .toThrow(ExactJsonValueError)
    expect(() => cloneExactOpaqueJsonValue({ nested: [{ kind: 'custom' }] }))
      .toThrow(ExactJsonValueError)
    expect(cloneExactJsonValue({ kind: 'variable', id: 'v' }))
      .toEqual({ kind: 'variable', id: 'v' })
  })
})
