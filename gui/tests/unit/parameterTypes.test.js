import { describe, expect, it } from 'vitest'

import {
  buildConstructorParameterInputOptions,
  buildParameterInputOptions,
  buildVariableInputOptions,
  createNumericExpressionValue,
  inferParameterInputOption,
  isNumericExpressionValue,
  parameterInputIsComplete,
  parameterInputOptionForVariable,
  parseNumericParameterValue,
  parseNumericVectorParameterValue,
  resolveParameterInputOption,
} from '../../src/utils/parameterTypes'

describe('parameter input descriptors', () => {
  it('makes singleton numeric fields Default-first with literal and expression modes', () => {
    expect(buildParameterInputOptions('Float64')).toEqual([
      expect.objectContaining({
        id: 'default',
        label: 'Default',
        inputKind: 'default',
        wireType: null,
        enabled: true,
      }),
      expect.objectContaining({
        id: 'Float64',
        inputKind: 'number',
        wireType: 'Float64',
      }),
      expect.objectContaining({
        id: 'expression:Float64',
        inputKind: 'numeric-expression',
        wireType: 'Float64',
      }),
    ])
  })

  it('uses the exact constructor omission contract to include or exclude Default', () => {
    expect(buildConstructorParameterInputOptions('Float64', { required: false })
      .map(option => option.id)).toEqual([
        'default',
        'Float64',
        'expression:Float64',
      ])
    expect(buildConstructorParameterInputOptions('Float64', { required: true })
      .map(option => option.id)).toEqual(['Float64', 'expression:Float64'])
    expect(() => buildConstructorParameterInputOptions('Float64', {}))
      .toThrow('Boolean required field')
    expect(() => buildConstructorParameterInputOptions('Float64', { required: null }))
      .toThrow('Boolean required field')
  })

  it('never maps a Default Variable onto a required concrete branch', () => {
    const variable = {
      type: 'default',
      selectedType: 'default',
      value: null,
    }
    expect(parameterInputOptionForVariable(
      'Vector{Int64}',
      { required: false },
      variable,
    )?.id).toBe('default')
    expect(parameterInputOptionForVariable(
      'Vector{Int64}',
      { required: true },
      variable,
    )).toBeNull()
  })

  it('expands Function once and keeps unsupported declared members visible', () => {
    const options = buildParameterInputOptions(['Function', 'Example.Unsupported'])
    expect(options.map(option => [option.id, option.label, option.enabled])).toEqual([
      ['default', 'Default', true],
      ['Function', 'Predefined Function', true],
      ['Lambda', 'Custom Function', true],
      ['Example.Unsupported', 'Example.Unsupported', false],
    ])
  })

  it('uses authoritative named-tag metadata instead of parsing Julia type strings', () => {
    expect(buildParameterInputOptions('Anything', {
      kind: 'named_tag_type',
      nullable: true,
    }).map(option => ({
      id: option.id,
      inputKind: option.inputKind,
      wireType: option.wireType,
    }))).toEqual([
      { id: 'default', inputKind: 'default', wireType: null },
      { id: 'Nothing', inputKind: 'intrinsic', wireType: 'Nothing' },
      { id: 'DataType', inputKind: 'named-tag', wireType: 'DataType' },
    ])
  })

  it('adds expression modes only for authoritative Float64 and Int64 types', () => {
    expect(buildParameterInputOptions('Int').map(option => option.id))
      .toEqual(['default', 'Int'])
    expect(buildVariableInputOptions().map(option => option.id))
      .toEqual(expect.arrayContaining(['expression:Float64', 'expression:Int64']))
  })

  it('can explicitly exclude expression modes for numeric literal-only editors', () => {
    expect(buildParameterInputOptions(
      ['Float64', 'Int64'],
      {},
      { numericExpressions: false },
    ).map(option => option.id)).toEqual(['default', 'Float64', 'Int64'])
  })

  it('accepts only the exact durable numeric-expression tag', () => {
    expect(isNumericExpressionValue({
      kind: 'numeric_expression',
      source: 'delay / 2',
    })).toBe(true)
    expect(isNumericExpressionValue({
      kind: 'numeric_expression',
      source: ' ',
    })).toBe(false)
    expect(isNumericExpressionValue({
      kind: 'numeric_expression',
      source: '1',
      result: 1,
    })).toBe(false)
  })

  it('infers numeric input strings and metadata-backed named tags', () => {
    const numericOptions = buildParameterInputOptions(['Int64', 'String'])
    expect(inferParameterInputOption(numericOptions, { value: '42' }).id).toBe('Int64')

    const tagOptions = buildParameterInputOptions('Anything', { kind: 'named_tag_type' })
    expect(inferParameterInputOption(tagOptions, { value: 'QuantumSavory.Tag' }).id)
      .toBe('DataType')
  })

  it('infers omitted branches and reports contradictory explicit branches centrally', () => {
    const options = buildParameterInputOptions([
      'Nothing',
      'QuantumSavory.Wildcard',
      'Int64',
    ])
    expect(resolveParameterInputOption(options, { value: 'Wildcard' })).toMatchObject({
      explicit: false,
      option: { id: 'QuantumSavory.Wildcard' },
      contradictory: false,
    })
    expect(resolveParameterInputOption(options, {
      selectedType: 'Int64',
      value: 'Wildcard',
    })).toMatchObject({
      explicit: true,
      option: { id: 'Int64' },
      expectedOption: { id: 'QuantumSavory.Wildcard' },
      contradictory: true,
    })

    const linkedOption = options.find(option => option.id === 'Int64')
    expect(resolveParameterInputOption(options, {
      selectedType: 'QuantumSavory.Wildcard',
      value: { kind: 'variable', id: 'remote' },
    }, {
      expectedOption: linkedOption,
    })).toMatchObject({
      explicit: true,
      option: { id: 'QuantumSavory.Wildcard' },
      expectedOption: { id: 'Int64' },
      contradictory: true,
    })
  })

  it('checks completeness for every descriptor family and validation errors', () => {
    const option = (type, id, metadata = {}) => (
      buildParameterInputOptions(type, metadata).find(candidate => candidate.id === id)
    )
    const cases = [
      [option('Float64', 'default'), { value: null }, true],
      [option('Float64', 'default'), { value: '' }, false],
      [option('Float64', 'Float64'), { value: '0.25', min: 0, max: 1 }, true],
      [option('Float64', 'Float64'), { value: '2', max: 1 }, false],
      [option('Float64', 'expression:Float64'), {
        value: createNumericExpressionValue('delay / 2'),
      }, true],
      [option('Float64', 'expression:Float64'), { value: null }, false],
      [option('Bool', 'Bool'), { value: false }, true],
      [option('Nothing', 'Nothing'), { value: 'nothing' }, true],
      [option('QuantumSavory.Wildcard', 'QuantumSavory.Wildcard'), {
        value: 'Wildcard',
      }, true],
      [option('String', 'String'), { value: 'name' }, true],
      [option('String', 'String'), { value: '   ' }, false],
      [option('Vector{Int64}', 'Vector{Int64}'), { value: [1, 2] }, true],
      [option('Vector{Int64}', 'Vector{Int64}'), { value: [] }, true],
      [option('Vector{Int64}', 'Vector{Int64}'), { value: [1.5] }, false],
      [option('Vector{Float64}', 'Vector{Float64}'), { value: [0.5] }, true],
      [option('Function', 'Function'), { value: 'identity' }, true],
      [option('Function', 'Lambda'), { value: 'x -> x' }, true],
      [option('Function', 'Lambda'), { value: '' }, false],
      [option('Anything', 'DataType', { kind: 'named_tag_type' }), {
        value: 'QuantumSavory.Tag',
      }, true],
    ]

    cases.forEach(([descriptor, parameter, expected]) => {
      expect(parameterInputIsComplete(descriptor, parameter)).toBe(expected)
    })
    expect(parameterInputIsComplete(
      option('Float64', 'expression:Float64'),
      {
        value: createNumericExpressionValue('1 / 2'),
        error: 'Expression validation is in progress',
      },
    )).toBe(false)
  })
})

describe('numeric vector parameter parsing', () => {
  it.each([
    ['Vector{Int64}', '[1, 2]', { valid: true, empty: false, value: [1, 2] }],
    ['Vector{Float64}', [0.25, 1], { valid: true, empty: false, value: [0.25, 1] }],
    ['Vector{Float64}', '[]', { valid: true, empty: false, value: [] }],
    ['Vector{Int64}', '', { valid: true, empty: true, value: null }],
  ])('normalizes %s value %#', (type, rawValue, expected) => {
    expect(parseNumericVectorParameterValue(type, rawValue)).toEqual(expected)
  })

  it.each([
    ['Vector{Int64}', '[1.5]'],
    ['Vector{Float64}', '[null]'],
    ['Vector{Float64}', '["1"]'],
    ['Vector{Float64}', 'not json'],
    ['Vector{String}', '[]'],
  ])('rejects invalid %s value %#', (type, rawValue) => {
    expect(parseNumericVectorParameterValue(type, rawValue)).toEqual({
      valid: false,
      empty: false,
      value: null,
    })
  })
})

describe('numeric parameter parsing', () => {
  it.each([
    ['Float64', null, {}, { valid: true, empty: true, value: null }],
    ['Float64', '', {}, { valid: true, empty: true, value: null }],
    ['Float64', '0.25', {}, { valid: true, empty: false, value: 0.25 }],
    ['Int64', '3', {}, { valid: true, empty: false, value: 3 }],
    ['Float64', '0', { min: 0 }, { valid: true, empty: false, value: 0 }],
    ['Float64', '1', { max: 1 }, { valid: true, empty: false, value: 1 }],
  ])('normalizes valid %s value %#', (type, rawValue, parameter, expected) => {
    expect(parseNumericParameterValue(type, rawValue, parameter)).toEqual(expected)
  })

  it.each([
    ['Int', 1.5, {}],
    ['Int64', '1.5', {}],
    ['Float64', Number.NaN, {}],
    ['Float64', Number.POSITIVE_INFINITY, {}],
    ['Float64', -0.1, { min: 0 }],
    ['Float64', 1.1, { max: 1 }],
  ])('rejects invalid %s value %#', (type, rawValue, parameter) => {
    expect(parseNumericParameterValue(type, rawValue, parameter)).toEqual({
      valid: false,
      empty: false,
      value: null,
    })
  })
})
