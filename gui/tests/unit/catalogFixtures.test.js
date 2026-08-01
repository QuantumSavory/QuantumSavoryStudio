import { describe, expect, it } from 'vitest'

import {
  validateConstructorParameterMetadata,
  validateSlotTypeCatalog,
} from '../../src/utils/ApiConnector.js'
import { SLOT_TYPE_CATALOG, constructorField } from '../catalogFixtures.js'

describe('exact runtime catalog fixtures', () => {
  it('stays admissible through the production catalog validators', () => {
    const ordinary = constructorField({ field: 'rounds', type: 'Int64' })
    const namedTag = constructorField({
      field: 'tag',
      type: 'DataType',
      kind: 'named_tag_type',
      nullable: false,
    })
    const nullableNamedTag = constructorField({
      field: 'optional_tag',
      type: ['Nothing', 'DataType'],
      kind: 'named_tag_type',
      nullable: true,
    })

    expect(validateConstructorParameterMetadata(ordinary, 'ordinary')).toEqual(ordinary)
    expect(validateConstructorParameterMetadata(namedTag, 'named_tag')).toEqual(namedTag)
    expect(validateConstructorParameterMetadata(nullableNamedTag, 'nullable_named_tag'))
      .toEqual(nullableNamedTag)
    expect(validateSlotTypeCatalog(SLOT_TYPE_CATALOG)).toEqual(SLOT_TYPE_CATALOG)
  })
})
